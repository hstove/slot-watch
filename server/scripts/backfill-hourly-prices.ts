/**
 * Backfill hourly BTC-USD and STX-USD candle opens from Coinbase.
 *
 * From the repo root:
 *   bun run --cwd server --env-file=../.env.local scripts/backfill-hourly-prices.ts
 *   bun run --cwd server --env-file=../.env.local scripts/backfill-hourly-prices.ts --from 2026-03-24
 *
 * Defaults to the six calendar months ending at the current completed UTC hour.
 * Re-running any range is safe: the source/product/hour key is upserted.
 */
import { parseArgs } from 'node:util';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Effect } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import * as schema from '../src/db/schema';
import { startOfHour, HOUR_MS } from '../src/prices/coinbase';
import { syncHourlyPrices } from '../src/prices/sync';

const { values: args } = parseArgs({
  options: {
    from: { type: 'string' },
    to: { type: 'string' },
  },
});

const to = args.to ? new Date(args.to) : startOfHour(new Date());
const sixMonthsAgo = new Date(to);
sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);
const from = args.from ? new Date(args.from) : startOfHour(sixMonthsAgo);
if (
  !(Number.isFinite(from.getTime()) && Number.isFinite(to.getTime())) ||
  from.getTime() % HOUR_MS !== 0 ||
  to.getTime() % HOUR_MS !== 0 ||
  from >= to ||
  to > startOfHour(new Date())
)
  throw new Error('Expected an hourly UTC range ending no later than now');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  keepAlive: true,
});
await client.connect();
const db = drizzle(client, { schema });

console.log(
  `Backfilling hourly prices: ${from.toISOString()} to ${to.toISOString()}`
);
try {
  for (
    let start = from.getTime();
    start < to.getTime();
    start += 300 * HOUR_MS
  ) {
    const end = Math.min(start + 300 * HOUR_MS, to.getTime());
    const counts = await Effect.runPromise(
      syncHourlyPrices(db, new Date(start), new Date(end)).pipe(
        Effect.provide(FetchHttpClient.layer)
      )
    );
    const hours = (end - start) / HOUR_MS;
    console.log(
      `${new Date(start).toISOString()}–${new Date(end).toISOString()}: ` +
        `BTC-USD ${counts['BTC-USD']}/${hours}, STX-USD ${counts['STX-USD']}/${hours}`
    );
  }
} finally {
  await client.end();
}
