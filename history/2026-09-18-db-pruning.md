# Database pruning and disk bloat (2026-09-18)

## Findings

Supabase Small instance, Postgres 17.4, database 380 GB before work.

| table | total | heap | indexes | rows | notes |
| --- | --- | --- | --- | --- | --- |
| block_responses | 199 GB | 161 GB | 37 GB | 450M | ~95% older than 3 months |
| state_machine_updates | 161 GB | 133 GB | 28 GB | 104M | ~99% older than 3 months; `update_content` json avg 1 KB/row |
| block_proposals | 7.6 GB | | | 7.6M | |
| stacks_blocks | 7.0 GB | | | 7.0M | |
| block_pushes | 3.3 GB | | | 7.8M | |
| block_pre_commits | 2.2 GB | | | 7.6M | |

- Both big tables were ingested at ~470k rows/hour during 2025-07-15..23 (a firehose bug or backfill),
  versus ~8-11k block responses/hour and ~100-300 state machine updates/hour today. Most of the disk
  is that one week plus the following months.
- Rows are uuidv7-keyed on `receivedAt` (heap correlation 0.9999), so "older than N" is a pkey range
  and no `created_at` column or index is needed.
- Unused indexes: `block_responses_network_key_idx` (5 GB, 10 scans ever), `state_machine_updates_network_key_idx`
  (0.8 GB, 2 scans), `state_machine_updates_by_signer_latest_id_network_key_idx` (20 GB, 0 scans; no query filters
  by signer). `network_key` has a single value (`mainnet`).
- Autovacuum: last ran on block_responses in March 2026 and on state_machine_updates in July 2025. The tables are
  insert-only so only the 20% insert scale factor triggers it; 161M earlier deletes on block_responses left
  13.6M dead tuples unvacuumed. state_machine_updates relfrozenxid age was 186M (anti-wraparound vacuum at 200M).
- Stale planner stats (state_machine_updates last analyzed July 2025).

## Why manual pruning kept timing out

1. The postgres role has a 2 minute `statement_timeout` by default on this instance. `set statement_timeout = 0`
   per session for maintenance.
2. Connections to `db.<ref>.supabase.co:5432` are dropped after ~2 minutes with no data flowing (a long
   statement looks idle). The pooler host (`aws-0-us-east-1.pooler.supabase.com:5432`, session mode) does not
   drop them. Either way the server finishes and commits the statement (`client_connection_check_interval=0`),
   so long DDL can be fired detached and polled in `pg_stat_activity`.
3. `DELETE ... WHERE id IN (SELECT id ... ORDER BY id LIMIT n)` re-walks dead index entries at the low end of the
   pkey on every batch (~6 s of skipping plus ~6 s of planning per batch measured). Forward time windows
   (`id >= lo AND id < hi`) avoid it: 39k rows deleted in 360 ms when the disk IO budget was healthy.
4. The Small compute has a 30 minute/day disk IO burst budget. Once spent, the same range delete ran at
   ~2-3k rows/s (IO bound on `DataFileRead`).

## Results

| | before | after |
| --- | --- | --- |
| database | 380 GB | 42 GB |
| block_responses | 199 GB / 450M rows | 21 GB / 53.5M rows (6 months retained) |
| state_machine_updates | 161 GB / 104M rows | 0.6 GB / 413k rows (3 months retained) |

Swap held the exclusive lock for ~1.5 s; the API served the new table immediately and live inserts landed in it.

## What was done

- Rebuilt `block_responses` from the rows newer than 6 months instead of deleting 95% of it: one 20 GB
  index-driven copy plus two index builds is far less IO than 430M deletes + vacuum + repack, and yields a compact
  table with no vacuum debt. Swap script: `server/scripts/sql/swap-block-responses.sql`.
- Wrote `server/scripts/prune-old-rows.ts` (windowed manual prune, resumable) and
  `server/scripts/copy-rows-windowed.ts` (chunked copy) for future one-offs.
- Migration `0010_hesitant_black_cat.sql` (applied 2026-09-18): drops the three unused indexes, adds `prune_state` +
  `prune_old_rows()` + an hourly pg_cron jobs keeping 3 months of `block_responses` and `state_machine_updates`, and lowers autovacuum
  thresholds on both big tables.

## Follow-ups

- The block_responses prune job starts at the 6-month frontier and trims 6 hour-windows per hourly run, so it
  reaches the 3-month cutoff in about two weeks. Run `select prune_old_rows('block_responses', 200)` manually
  to catch up faster. Watch `prune_state` and `cron.job_run_details`.
- Supabase does not shrink the provisioned disk when the database shrinks. Reclaiming the disk allocation (and
  the bill) requires a Postgres version upgrade from the dashboard, which provisions a new instance with a
  smaller disk and involves brief downtime.
