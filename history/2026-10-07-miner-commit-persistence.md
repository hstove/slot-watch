# Persisting miner commit activity (RBFs, first-seen, fee context)

Status: implemented with **Option B** (Durable Object), deployed 2026-10-07.
Migration `0014_miner_commit_txs` is applied. The logger backfill ran
2026-10-07 (`server/scripts/backfill-miner-commits.ts`, see below).

## As built

- `server/src/miner-commits/`: `MinerCommitsWatcher` DO holds
  `wss://mempool.space/api/v1/ws` (`blocks`, `mempool-blocks`,
  `track-addresses`). Events become ops in a durable outbox (the DO's SQLite
  storage); a writer fiber drains them to Postgres in order and acks only
  after commit. Every op is an idempotent upsert, so restarts replay safely.
  Undecodable or repeatedly failing ops go to a dead-letter table.
- Network work runs as durable jobs with backoff: `ReconcileBlock` (90s
  after each block: RBF tree + `/cached` for missed versions, rewrites chain
  links/positions) and `FetchSortition` (Hiro `/v3/sortitions`). On connect,
  recent blocks never reconciled get jobs too, which covers deploy gaps.
- Restart path: a 15s alarm (alarms survive deploys) plus the `*/5` cron ping.
  On reconnect it re-seeds pending commits with mempool.space first-seen times;
  existing rows keep their WebSocket timestamps.
- Fee snapshots are compact: next block median, fee range [7], vsize (needed
  to tell whether the min is a real threshold), second block min. Every 30s
  and at each block (the ladder the block was mined against).
- `bitcoin_blocks` stores `sortition_miner_pk_hash160` rather than a winning
  txid: the sortition API doesn't return the txid.
- `first_seen_source`: `ws` (ms precision), `mempool_space` (seconds), or null.


## Goal

`server/scripts/log-miner-commits.ts` has been running since 2026-09-28 and has
been the main data source for miner-behavior analysis. It only lives in a JSONL
file on one machine. Persist the useful parts server-side so they survive,
can be queried and joined with `miner_spends` / `burn_blocks` / `miner_rewards`,
and keep accumulating without a laptop or tmux session.

What the log gives us today (the long session file, ~8 days, as of 2026-10-07):

| event | count | worth persisting? |
| --- | --- | --- |
| `commit_new` / `commit_seed` | 6,322 | yes: every commit version, first-seen time |
| `commit_rbf` | 3,398 | yes: the replacement chain. 37% change `parentHeight` (re-targeting after a new tenure), 0.3% change the bid; the rest are fee bumps |
| `commit_confirmed` | 6,300 | yes, but mostly redundant with `miner_spends`. Adds fee, vsize, rbf count, chain duration |
| `commit_dropped` | 0 | yes, as a status (rare) |
| `block` | 1,249 | `pendingAtBlock` can be derived from first-seen times. Fee context is worth keeping per block |
| `block_result` | 1,249 | no. Redundant with `miner_spends` / `burn_blocks`. Its `winner` is captured 20s after the block, before `winning_txid` is set, so 1,066 of 1,249 show no winner |
| `fee_snapshot` | 24,118 | partly: projected-mempool fee ladder over time. Per-miner odds can be derived |

Chains confirmed with 0 RBFs: 3,790. With 1: 1,850. With 2+: 594 (max 7).

## Findings that shape the design

All checked against `leather.mempool.space` on 2026-10-07:

1. **`GET /api/v1/tx/:txid/rbf` returns the full replacement tree** for a
   confirmed tx. Each version has `txid`, `fee`, `vsize`, `rate`, a first-seen
   `time` (unix seconds), `interval`, `fullRbf` and `mined`. **It is kept for
   about 24h after mining**: present at 18h, gone at 24h and older.
2. **`GET /api/v1/tx/:txid/cached` returns the full replaced tx** (vin/vout), so
   `parseBlockCommit` can recover bid, parent height/vtx and modulus for replaced
   versions. Plain `/api/tx/:txid` returns 404 for them.
3. **First-seen time for a tx that was never replaced is lost after it confirms.**
   `/api/v1/transaction-times` returns `0` and `/rbf` returns null. We need to
   look while it is pending. That's 60% of commits.
4. **`GET /api/v1/blocks/:height` returns mined-block fee stats for any height**
   (`extras.feeRange` [min, p10, p25, p50, p75, p90, max], `medianFee`,
   `totalFees`, pool name, header `timestamp`), 15 blocks per call. So per-block
   fee context is cheap to backfill.
5. **Node RPC `GET /v3/sortitions/burn_height/:h`** (via `api.hiro.so`) gives
   `was_sortition`, `burn_header_timestamp` and the winner. This tells apart
   "the null miner won / no sortition" from "a winner hasn't produced its first
   block yet". `burn_blocks.winning_txid IS NULL` can't do that today (e.g. 970300:
   2 commits, `was_sortition: false`).

## Getting the data on Workers (no long-running thread)

### Option A: minute cron poll plus post-confirmation reconciliation (recommended)

Add a `* * * * *` cron next to the existing `*/5` one and dispatch on
`controller.cron`. Each run is short, stateless and idempotent.

**Poll (every minute): pending commits**

1. Tracked miners = distinct `miner_btc_address` from `miner_spends` in the last
   12 burn blocks. This is one indexed query and the same rule the logger uses.
2. `GET /api/address/:addr/txs/mempool` for each (~10-15 requests). Parse with
   `parseBlockCommit`. Upsert unseen txids as `pending`.
3. Batch `GET /api/v1/transaction-times?txId[]=…` for newly seen txids to get
   mempool.space's exact first-seen time, not our 1-minute poll time.
4. `GET /api/v1/fees/mempool-blocks` (1 request) and store one fee snapshot row.
   Optional, phase 2.

**Reconcile (same tick): newly confirmed burn blocks**

For burn blocks from the last ~20h whose commits aren't reconciled yet
(`miner_spends` txids with no `reconciled_at` in the new table):

1. `GET /api/v1/tx/:txid/rbf` per confirmed commit. For every replaced version
   we don't have, `GET /api/v1/tx/:txid/cached` and parse it. This catches
   replacements faster than the 1-minute poll and corrects any `pending` rows to
   `replaced` / `confirmed`.
2. `GET /api/tx/:txid` for the confirmed version's fee/vsize if we never saw it
   pending.
3. `GET /api/v1/blocks/:height` for block fee stats and `/v3/sortitions/burn_height/:h`
   for the sortition outcome.
4. Mark chains whose last version left the mempool without confirming (poll
   stopped seeing it, and it's not in any RBF tree) as `dropped`.

Budget: ~15-20 subrequests per minute normally, ~30 in a minute with a new
block. That's well under Worker limits and light on leather. Reuse
`ESPLORA_HOSTS` order (leather, then mempool.space). Back off on 429 by skipping
the tick; the next one picks up.

What it **captures**: every commit version (including sub-minute RBFs, through
the tree), exact first-seen times, fee/vsize/rate, bid/parent/modulus per
version, confirmed/replaced/dropped status, mined-block fee stats, sortition
outcome, and the fee ladder at 1-minute resolution.

What it **loses** compared with the logger: the projected-mempool view at the
exact instant of each event (we have the nearest-minute snapshot), and pending
chains during a cron outage that are then dropped. Confirmed chains survive
outages of up to ~20h through reconciliation.

### Option B: Durable Object holding the mempool WebSocket

A DO opens the same `wss://mempool.space/api/v1/ws` subscription as the logger
and writes events through Hyperdrive. An alarm every ~30s reconnects it and
keeps it alive. This gives full logger fidelity.

Downsides: outbound WebSockets don't hibernate, so the DO is resident 24/7.
At 128 MB that's ~330k GB-s/month: inside the Workers Paid allowance if nothing
else uses DOs, but not free. We'd also need a DO binding and a DO class
migration in `alchemy.run.ts`. **Every deploy restarts it**, and we deploy to
prod to test server changes, so we'd still need Option A's reconciliation to
fill the gaps. It's more moving parts for marginal extra fidelity.

### Option C: run the logger elsewhere and POST to an ingest route

Run the existing script as a second Fly process next to the streamer, posting
batches to a new `POST /miner-commits/ingest` route guarded by `OBSERVER_TOKEN`.
It needs the least new logic, but it's another long-running service to operate,
and it has the same gap problem on restart.

### Cost (estimated 2026-10-07)

**Durable Object (B):** one DO, resident 24/7 at the billed 128 MB is ~0.125 ×
2.63M s ≈ **329k GB-s/month**, against 400k included on Workers Paid. The
account's only other DOs are the Alchemy state stores, which are active only
during deploys, so this costs **$0**. Without the allowance it would be ~$4.10/month.
Requests: the logger's subscription measured 89 messages / 408 KB per 2 minutes
(~1.95M messages/month). At the 20:1 WebSocket ratio that's ~100k request
units, plus ~88k alarm invocations at 30s, all inside the 1M included. Even
billed 1:1 it would be ~$0.16/month.

**Per-minute fee snapshots:** 525,600 rows/year. Compact columns are ~125 B/row
including the pk index, ≈ **66 MB/year ≈ $0.01/month** per retained year on
Supabase ($0.125/GB-month; the DB is already far past the 8 GB included).
Storing the full 8-block projected ladder as jsonb is ~1.2 KB/row (the logger's
snapshots average 1.8 KB of JSON without the per-miner part), ≈ **630 MB/year ≈
$0.08/month**, or ~$0.02/month at 90-day retention. The cron is planned anyway,
so the snapshot only adds one subrequest and one insert per minute. The
~44k cron invocations a month are a rounding error against the 10M requests
included. The 30s resolution would double these numbers.

Neither cost should decide anything. B's real cost is operational: restarts on
every deploy.

**Recommendation:** start with A. Add B later only if sub-minute
projected-mempool snapshots turn out to matter. Keep the logger running for a
couple of days after A ships and diff the two as validation (see below).

## What to store (schema sketch, migration TBD)

### `miner_commit_txs`: one row per commit tx version, including replaced ones

| column | notes |
| --- | --- |
| `id` text pk | uuidv7 from first-seen time, matching the other tables |
| `network_key` | |
| `txid` | unique with `network_key` |
| `chain_input` | `txid:vout` of the first input; the RBF chain key |
| `replaces_txid` / `replaced_by_txid` | linear chain links (commit chains don't branch in practice) |
| `chain_position` | 0-based position in the chain |
| `miner_btc_address`, `miner_public_key`, `miner_address` | same derivation as `miner_spends` |
| `bid_sats`, `fee_sats`, `vsize` (real), `fee_rate` (real) | |
| `parent_height`, `parent_vtx`, `burn_modulus` | from the OP_RETURN, as in `parseBlockCommit` |
| `first_seen_at` timestamptz null | mempool.space first-seen, or logger `seenAt` for the backfill |
| `first_seen_source` | `mempool_space` \| `poll` \| `logger` \| null (seeded / unknown) |
| `status` | `pending` \| `confirmed` \| `replaced` \| `dropped` |
| `left_mempool_at` timestamptz null | replaced/dropped/confirmed time where known |
| `confirmed_height` int null | joins to `miner_spends` by `txid` for confirmed rows |
| `full_rbf` bool null | |
| `reconciled_at` timestamptz null | set when the RBF tree for a confirmed chain was pulled |

Indexes: `(network_key, txid)` unique, `(network_key, chain_input)`,
`(network_key, confirmed_height)`, `(network_key, miner_address, id)`.

Volume: ~1,200 rows/day. No pruning needed for years.

### `bitcoin_blocks`: per burn block, data from outside the event stream

Keyed `(network_key, burn_block_hash)` with `burn_block_height`. Columns:
`header_timestamp`, `was_sortition`, `sortition_winner_txid`,
`median_fee_rate`, `fee_range` (real[7]), `total_fees_sats`, `tx_count`,
`weight`, `pool_name`, `fetched_at`.

This is a separate table so `burn_blocks` stays purely event-sourced. It also
covers the "true Bitcoin block timestamp" the hourly-prices plan deferred, and
the null-miner signal the metrics plan needs.

### `mempool_fee_snapshots` (phase 2, optional)

One row per minute: `observed_at`, `tip_height`, next-block `min/p10/median`,
`next_block_vsize`, `projected_blocks`, recommended fees, `vbytes_per_second`.
~1,440 rows/day. Prune after 90 days, or downsample.

### Derived, not stored

- RBF count and chain duration: count/min/max over `chain_input`.
- Pending at block H: the latest chain version with `first_seen_at` before
  block H's observed time (`uuid7_ms(burn_blocks.id)`) and not confirmed before H.
- Missed: pending at H with a valid modulus but not in H.
- Stale / behind: `burn_modulus` vs height, `parent_height` vs the latest winner.
- Fee overpay: `fee_rate` vs `bitcoin_blocks.fee_range[0]`.
- Per-miner odds: from `miner_spends` bids, as the client already does.

All of these become plain SQL. If any turns out to be hot, add a view.

## Backfill from the logger files

Run a one-off script, `server/scripts/backfill-miner-commits.ts`, locally with
`bun --env-file=.env.local` after the migration exists:

1. Stream `tmp/miner-commits/2026-09-28T17-11-06-976Z.jsonl`, then the long
   session file from just after the first file's last `t` (the same merge rule
   as `combined.jsonl`). Never load either file whole (177 MB and growing).
2. Build chains keyed by `commit.input`. `commit_new`: position 0 with
   `first_seen_at = seenAt`, source `logger`. `commit_rbf`: link
   `previous → commit`. `commit_seed`: `first_seen_at = null`, because the tx
   was broadcast before we watched. `commit_confirmed` sets `confirmed_height`
   / status. `commit_dropped` sets status.
3. Resolve `miner_public_key` / `miner_address` by joining confirmed txids to
   `miner_spends`. For chains that never confirmed, use the logger's
   `publicKey`/`stxAddress` for the same `btcAddress`.
4. Upsert with `ON CONFLICT (network_key, txid) DO NOTHING`, so overlap with
   the cron (last ~24h) keeps the cron's mempool.space timestamps.
5. Block stats: `/api/v1/blocks/:h` for 969025..now (~90 requests at 15
   blocks/call). Sortitions: ~1,300 single requests, throttled to ~2/s.
6. Optional, if phase 2 exists: `fee_snapshot` rows into
   `mempool_fee_snapshots` (24k rows; drop the per-miner part).
7. Record the 15 `ws_close` gaps in the script's output so analysis knows the
   coverage holes. Don't store them in the DB.

As run (2026-10-07):

- The cutoff is the watcher's first fee snapshot (14:06Z). Chains first seen
  after it, or already in the DB, are the watcher's. The overlap was diffed
  instead: 16/16 logger versions were in the DB, with 0 link mismatches and
  `first_seen_at` within 0.8s median (5.6s max; the watcher was earlier).
- 10,234 versions in 6,654 chains, all confirmed (`miner_spends` had every
  one). 10,222 have a logger `first_seen_at`.
- 81 chains have a version *after* the confirmed one: a late RBF that the
  block beat (sometimes by ~30 min, when the block's template had the older
  version). They are stored like the watcher does it: linked after the
  confirmed row, with status `replaced`. Query them with
  `status = 'confirmed' and replaced_by_txid is not null`.
- No `commit_dropped` events exist in the log, so nothing is `dropped`.
- Block stats and sortitions for 969026..970351. `observed_at` comes from the
  logger's `block` events. 25.5k snapshots.
- Coverage holes: 2026-09-28 22:47–23:06Z (the laptop session ended) and 15
  ~3s reconnects.

Pre-logger history can't be recovered: mempool.space's RBF cache only goes back
~24h. Coverage starts 2026-09-28 17:11Z.

## Code changes

- Move `parseBlockCommit`, `isStaleCommit`, `feeStatus` and the Esplora types
  from `client/src/lib/mempool-space.ts` to `common`. The logger currently
  imports the client file by relative path; point it, the client and the server
  at common.
- New `server/src/mempool/`: a fetch client using `ESPLORA_HOSTS` order with
  timeouts, plus `pollPendingCommits` and `reconcileConfirmedCommits` as Effect
  programs.
- `server.ts` `scheduled`: dispatch on `controller.cron`. Prices stay on `*/5`;
  the new job runs on `* * * * *`. Wrap each job separately so a mempool
  failure can't break the price refresh (and vice versa). Add the cron in
  `alchemy.run.ts`.
- Schema in `schema.ts`, then `drizzle-kit generate`. **You run the migration.**
- Later: `GET /miner-economics/:net/commit-txs?fromHeight&toHeight` (capped
  like the commits route), an MCP tool, and live-page/miner-detail UI.

## Rollout and validation

1. Write the schema and generate the migration; you review and apply it.
2. Deploy the cron. Watch Worker logs for `topic: miner-commits` and the
   subrequest counts.
3. Leave the logger running about 48h. Diff it against the DB for that window:
   the same set of txids, chain links, `first_seen_at` within ~2s, and status.
   Any txid only the logger has points to a poll/reconcile gap.
4. Run the backfill. Stop the logger once the diff is clean.

## Open questions

- Do we want the projected-mempool snapshot (phase 2) now, or are mined-block
  fee stats enough?
- Track commits for miners outside the last-12-block set? New miners show up in
  the tracked set only after their first confirmed commit. The logger has the
  same limitation.
- Set `burn_blocks.winning_txid` from the sortition API when the tenure never
  produces a block? It's more correct, but it changes the meaning of an
  existing column.
