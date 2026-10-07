# Miner economics in `/metrics`

Status: implemented and deployed 2026-10-07, all three steps of "Order of
work" (`bitcoin_blocks` and `miner_commit_txs` had landed).

## As built

- Queries: `server/src/db/miner-economics.ts`. The `/miners` route now uses
  the same `minerSpendTotals` / `minerRevenueTotals` subqueries. The spend one
  also carries commit tx fees from `miner_commit_txs`.
- Math: `server/src/metrics-miners-calc.ts` (tests in
  `server/tests/metrics-miners-calc.test.ts`). Gauges and warmup:
  `server/src/metrics-miners.ts`, called from `warmupMetrics` in its own
  try/catch. The snapshot is KV-cached for 5 minutes (~1.5s uncached).
- Differences from the sketch below:
  - `slot_watch_miner_cost_usd` has a `basis` label. Matured profit needs
    the cost of the matured window's heights, not the live window's.
  - Reward-address aliases: one miner funds commits from a different key than
    the one rewards are paid to (`SP1HYS…` spends, `SP28K1…` is paid). Matured
    revenue is re-keyed by matching coinbase rows (they go to the tenure
    winner) to the winning commit's address. The per-miner route still shows
    them as two rows.
  - Reward rows: each tenure has two rows. One is the winner's coinbase. The
    other is the *previous* tenure's miner's streamed tx fees. Grouping by
    `miner_address` attributes them correctly, but matured fees are shifted by
    one tenure at the window edges.
  - Extra gauges: `slot_watch_miner_btc_tx_fees_missing_commits` (cost is
    unset when > 0) and `slot_watch_expected_coinbase_per_win_ustx`.
  - The expected basis ignores the latest STX-USD open if it is more than 3h
    old.
  - The null-miner rate uses `bitcoin_blocks.was_sortition` directly. Heights
    without a known outcome are excluded from both sides.
- First results (2026-10-07, 7d): expected fees track matured fees within a
  few percent. But the mode base coinbase (1000 STX) is ~25–30% below the
  realized coinbase per win (~1311 STX, from accumulated coinbases after
  ~15–19% null sortitions). So expected profit reads negative for every miner
  while matured profit is mostly positive. Consider switching the base to
  the realized matured coinbase per win.

## Goal

Extend the Prometheus endpoint (`server/src/metrics.ts`, `GET /metrics`) with
per-miner economics, so Grafana/alerting can show who is winning and whether
mining is profitable:

- blocks won per miner over the last 24h (and 7d)
- win rate per miner
- null-miner win rate (network-level)
- fees earned per miner
- USD-denominated profitability over a window: realized (matured coinbases) and
  expected (recent wins at the current coinbase)

## Labels and windows

- `miner_address` (STX address, the stable key used by `miner_spends` /
  `miner_rewards`) and `miner_name` (the deterministic nickname from
  `getMinerIdentity`, so dashboards are readable). Unresolved commits go under
  `miner_address=""`.
- `window`: `24h` and `7d`, selected by burn-block observed time
  (`uuid7_ms(burn_blocks.id)`), matching the "last 24 hours" framing. The
  existing gauges use `last_n_blocks`; burn blocks vary too much in timing for
  "24h" to be a fixed count.
- `basis` on revenue/profit gauges: `matured` or `expected` (see below).
- Only miners with a commit in the last 7d get series. That's ~20 miners × 2
  windows × ~10 gauges, a few hundred series. Call `reset()` each warmup so
  departed miners disappear, as the signer gauges already do.

## Gauges

| name | labels | definition |
| --- | --- | --- |
| `slot_watch_miner_commits` | miner, window | confirmed commits (`miner_spends` rows) |
| `slot_watch_miner_blocks_won` | miner, window | commits whose txid = `burn_blocks.winning_txid` |
| `slot_watch_miner_win_rate` | miner, window | blocks won / commits (per-attempt success) |
| `slot_watch_miner_block_share` | miner, window | blocks won / burn blocks in window (share of all sortitions, null ones included) |
| `slot_watch_null_miner_win_rate` | window | burn blocks with ≥1 commit and `was_sortition = false` / burn blocks with ≥1 commit |
| `slot_watch_burn_blocks` | window | denominator for the above, for sanity |
| `slot_watch_miner_spend_sats` | miner, window | `spend_sats + burn_sats` |
| `slot_watch_miner_btc_tx_fees_sats` | miner, window | commit tx fees (needs `miner_commit_txs.fee_sats`) |
| `slot_watch_miner_tx_fees_earned_ustx` | miner, window, basis | Stacks tx fees earned (see below) |
| `slot_watch_miner_coinbase_ustx` | miner, window, basis | coinbase earned |
| `slot_watch_miner_revenue_usd` | miner, window, basis | (coinbase + fees) × STX-USD |
| `slot_watch_miner_cost_usd` | miner, window | (spend + burn + BTC tx fees) × BTC-USD |
| `slot_watch_miner_profit_usd` | miner, window, basis | revenue − cost |
| `slot_watch_miner_margin` | miner, window, basis | profit / revenue |
| `slot_watch_miner_economics_window_heights` | window, basis, edge=`from`\|`to` | burn heights each window actually covers |

## Definitions that need care

**Win rate vs share.** "Win rate" is ambiguous. Export both: per-commit
success, and share of all blocks. Pick the one dashboards should lead with
later.

**Null miner.** `burn_blocks.winning_txid IS NULL` mixes three cases:

1. No sortition (the null miner won, or every commit was stale/invalid).
2. A sortition winner that never produced a tenure.
3. A winner whose first block hasn't arrived yet.

The node's `/v3/sortitions/burn_height/:h` `was_sortition` separates (1). The
commit-persistence plan stores it in `bitcoin_blocks`. Until then, the
interim proxy is `winning_txid IS NULL` for heights at least 2 below the tip,
labeled as such. To split "null miner won" from "all commits invalid", check
whether any commit had a valid `burn_modulus` (also from that plan).

**Fees earned.**

- `basis="expected"`: sum `stacks_blocks.tx_fees` over the tenures the miner
  won in the window (join by `consensus_hash`). Available immediately.
- `basis="matured"`: `miner_rewards` tx-fee fields for tenures earned in the
  window. It's authoritative but only exists ~100 tenures after the fact.

Compare the two once to check the expected estimate (fee-split rules, streamed
fees).

**Coinbase.**

- `basis="matured"`: `miner_rewards.coinbase_ustx`, attributed to the earning
  tenure, as in the per-miner route. For a recent window it's empty, so the
  matured gauges use the latest *fully matured* window instead: tenures earned
  in `[maturedThrough − span, maturedThrough]`. Expose those heights through
  `..._window_heights` so nobody mistakes it for the last 24h.
- `basis="expected"`: wins in the window × current base coinbase. Derive the
  base from recent matured rewards (the minimum/mode of `coinbase_ustx`),
  rather than hard-coding the emission schedule. Coinbases accumulated from
  missed sortitions make individual rewards larger, so this is conservative.

**USD.** Follow `2026-09-23-hourly-market-prices.md`. Spend is valued at the
BTC-USD open for the burn block's observed hour. Matured revenue uses the
STX-USD open at the earning block's observed hour. Expected revenue uses the
latest STX-USD open, since it isn't paid yet. If any priced row lacks a price,
leave the USD gauge unset rather than under-report (the same rule as
`completeUsd`). Cost should include BTC commit tx fees once
`miner_commit_txs` exists. Until then, note in the help text that cost
excludes tx fees.

## Implementation sketch

- Extract the spend/revenue subqueries from
  `routes/miner-economics.routes.ts` (`/miners`) into a shared
  `server/src/db/miner-economics.ts`, so the route and the metrics use the
  same SQL.
- `server/src/metrics-miners-calc.ts`: pure functions from query rows to gauge
  values, with unit tests, like `metrics-precommit-calc.ts`.
- `warmMinerMetrics(db)` called from `warmupMetrics`, inside its own
  try/catch. A failing miner query must not fail `/metrics`; the warmup has
  taken the Worker down with a 1101 before.
- Cache the query results with the `cache.ts` helpers (~5 min TTL). Scrapes
  are frequent and the 7d aggregates touch ~1k burn blocks / ~7k spends.
- Height bounds: resolve window start heights from `burn_blocks` by observed
  time first, then filter `miner_spends`/`miner_rewards` by height so the
  existing height indexes are used.

## Order of work

1. Commits, blocks won, win rate/share, spend sats, expected fees (data we
   already have).
2. USD cost/revenue/profit with the matured and expected bases.
3. Null-miner rate and BTC tx fees in cost, once `bitcoin_blocks` /
   `miner_commit_txs` land.
