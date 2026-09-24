# Hourly market prices for miner economics

## Decision

Store one hourly candle **open** per source, product, and UTC hour in
`hourly_prices`. Fetch from Coinbase first, for `BTC-USD` and `STX-USD`.
The candle's `hour_start` is its time key; `fetched_at` records when we
ingested it. Keep prices as decimal strings through ingestion and in PostgreSQL
`numeric(24, 10)`, so USD arithmetic need not pass through JavaScript floats.
The primary key `(source, product_id, hour_start)` supports both a time-range
read for one product and an exact hour join. A database check rejects
non-hourly keys and nonpositive prices. There is no `network_key`: a market
price applies to every Stacks network.

For a given hour, `BTC-USD / STX-USD` yields **STX per BTC**; the inverse yields
BTC per STX. Derive these only when both USD candles exist for the same source
and hour. There is no third stored cross-rate to get out of sync, and no
assumption that the source offers a direct BTC/STX book.

Use the existing UUIDv7 `burn_blocks.id` as the valuation time key. It is
minted from the `/new_burn_block` event's `receivedAt`, including for burn
blocks with no Stacks blocks, so no new block timestamp column is necessary
for an observation-time valuation. The existing database `uuid7_ms(id)`
function extracts the millisecond epoch for SQL joins, and `getCreatedAt(id)`
already exposes it as `observedAt` in the economics API. This is the time
Slot Watch observed the Bitcoin block, not the Bitcoin header timestamp or
the exact time its commits were mined. Near an hour/day boundary, a delayed
event can use the next period's price. State this basis in the USD API; if
that error proves material, add a true Bitcoin block timestamp then.

## Valuation semantics

For network spend, take each burn block's `(pox_spend_sats +
burn_amount_sats) / 100000000 * BTC-USD open` for its observed UTC hour. For
per-miner spend, use `(miner_spends.spend_sats + miner_spends.burn_sats)`
with the observation hour of its matching burn block, not the spend row's own
UUID. Sum the **per-block** USD values for an observed UTC day; multiplying
daily BTC totals by one daily price gives a different result.

For earned revenue, the existing `miner_rewards` rows hold actual Coinbase and
fee amounts in micro-STX and link back to the tenure that earned them. Use
`(coinbase_ustx + all three tx-fee fields) / 1000000 * STX-USD open` at the
earning burn block's observed hour. Attribute the result to the earning day,
even though the reward arrives about 100 tenures later. A separate maturity-time
view can join `matured_burn_block_height` to the selected burn block and use
its observed-hour price, clearly labeled as maturity valuation. Neither
valuation implies when a miner sold STX. Pending rewards remain pending in
realized-reward reports; an expected reward estimate, if introduced, must be
labeled separately.

Join the price on
`date_trunc('hour', to_timestamp(uuid7_ms(burn_blocks.id) / 1000.0), 'UTC')`
with a chosen source and product ID. Join rewards to the earning burn block by
`(network_key, earned_consensus_hash)` when populated, rather than height
alone across Bitcoin forks. Retain native satoshi and micro-STX amounts as
the source of truth. The first reporting queries can do these joins and
aggregations at read time; no per-block USD columns or summary table are
needed at hourly price volume. A materialized daily summary can be added if
measured query cost later warrants it.

Missing prices or unresolved reward attribution yield a missing USD valuation
and a coverage count. Do not silently use a nearby candle or zero. In
particular, a mature but rewardless block and a not-yet-matured block already
have different meanings in the economics API and must remain distinct.

## Ingestion

Migration `0011_cooing_thaddeus_ross` created the price table in production.
`server/src/prices/coinbase.ts` fetches Coinbase's public Advanced Trade
`ONE_HOUR` candles with Effect HTTP. It requests up to 300 hours at a time
(under the documented 350-bucket maximum), validates positive decimal opens
and aligned start times, and excludes buckets outside the requested completed
hour range. The live endpoint returned the end-boundary bucket in a spot
check, so filtering by the returned start is necessary.

The backfill script and the API Worker's scheduled handler share the same
upsert path. The Worker runs at minute 10 UTC each hour and re-fetches the
previous six completed hours. Failures are logged by the scheduled handler
and leave public request/event-observer handling independent. Re-running the
backfill repairs any historical interval; max-hour alone would miss interior
gaps.

The six-month backfill covered 2026-03-24 04:00 through 2026-09-24 04:00
UTC (exclusive), storing 4,411 of 4,416 possible hours for each product.
Both Coinbase Advanced Trade and Exchange return no candles for
2026-05-08 02:00–06:00 UTC for either product. Those five hours are left
missing, rather than filled with invented prices.

## Next API step

Add a price range API and then USD fields to the economics API with the
selected valuation basis, source, hour, and coverage/null semantics in the
response. Preserve the existing native-unit fields. The hourly table is in
production, but prices are not yet returned by a Slot Watch API route.

## Bondai history page as a consumer

Bondai's `getHistory` currently fetches 14 days of Slot Watch economics,
Coinbase daily BTC-USD and STX-USD candles, current Coinbase spot tickers,
and current PoX data from Hiro. It groups blocks by their `observedAt` UTC
day, averages the daily **close** candle values it receives, and multiplies
each day's aggregate satoshis and micro-STX by those daily averages. The
planned Slot Watch price range API can replace both historical candle calls;
Bondai can still group blocks and prices by day. Hourly **opens** change the
daily price and USD totals, so this is a deliberate valuation change rather
than an exact data-source substitution. Per-block USD values from Slot Watch
would further remove Bondai's price join and valuation arithmetic while
keeping its PoX-specific APY projection and presentation logic.

Bondai's current spot ticker and Hiro PoX calls serve separate live inputs and
are outside this historical-price plan.

Coinbase references: [public Advanced Trade candles](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/public/get-public-product-candles),
[Exchange historical candle caveats](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles),
[Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
