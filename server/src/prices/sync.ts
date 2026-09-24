import { Effect } from 'effect';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/db';
import { hourlyPrices } from '../db/schema';
import { fetchCoinbaseHourlyPrices, PRODUCTS } from './coinbase';

/** Shared by the backfill and the scheduled Worker refresh. */
export function syncHourlyPrices(db: Db, from: Date, to: Date) {
  return Effect.gen(function* () {
    const counts: Record<string, number> = {};
    for (const product of PRODUCTS) {
      const rows = yield* fetchCoinbaseHourlyPrices(product, from, to);
      if (rows.length > 0) {
        yield* Effect.tryPromise({
          try: () =>
            db
              .insert(hourlyPrices)
              .values(rows)
              .onConflictDoUpdate({
                target: [
                  hourlyPrices.source,
                  hourlyPrices.productId,
                  hourlyPrices.hourStart,
                ],
                set: {
                  openPrice: sql`excluded.open_price`,
                  fetchedAt: sql`now()`,
                },
              }),
          catch: (cause) =>
            new Error(`Failed to store ${product} prices: ${String(cause)}`),
        });
      }
      counts[product] = rows.length;
    }
    return counts;
  });
}
