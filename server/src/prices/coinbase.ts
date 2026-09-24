import { Effect, Schedule, Schema } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/unstable/http';

export const HOUR_MS = 3_600_000;
export const COINBASE_SOURCE = 'coinbase';
export const PRODUCTS = ['BTC-USD', 'STX-USD'] as const;
export type PriceProduct = (typeof PRODUCTS)[number];

const CandlesResponse = Schema.Struct({
  candles: Schema.Array(
    Schema.Struct({ start: Schema.String, open: Schema.String })
  ),
});
const DECIMAL_PRICE = /^(?:0|[1-9]\d*)(?:\.\d{1,10})?$/;

function parseCandle(
  candle: { readonly start: string; readonly open: string },
  product: PriceProduct,
  from: Date,
  to: Date
): readonly [number, string] | null {
  const startSeconds = Number(candle.start);
  const hour = startSeconds * 1000;
  if (!Number.isSafeInteger(startSeconds) || hour % HOUR_MS !== 0)
    throw new Error(`Invalid ${product} candle start: ${candle.start}`);
  if (hour < from.getTime() || hour >= to.getTime()) return null;
  if (!DECIMAL_PRICE.test(candle.open) || Number(candle.open) <= 0)
    throw new Error(`Invalid ${product} candle open: ${candle.open}`);
  return [hour, candle.open];
}

export function completedHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
}

/** Fetch one range of completed hourly candle opens (at most 300 hours). */
export function fetchCoinbaseHourlyPrices(
  product: PriceProduct,
  from: Date,
  to: Date
) {
  return Effect.gen(function* () {
    const hours = (to.getTime() - from.getTime()) / HOUR_MS;
    if (
      !Number.isInteger(hours) ||
      hours < 1 ||
      hours > 300 ||
      from.getTime() % HOUR_MS !== 0 ||
      to.getTime() % HOUR_MS !== 0 ||
      to > completedHour(new Date())
    ) {
      return yield* Effect.fail(new Error('Invalid completed candle range'));
    }

    const url = new URL(
      `https://api.coinbase.com/api/v3/brokerage/market/products/${product}/candles`
    );
    url.search = new URLSearchParams({
      start: String(from.getTime() / 1000),
      end: String(to.getTime() / 1000),
      granularity: 'ONE_HOUR',
      limit: '350',
    }).toString();

    const response = yield* HttpClient.get(url).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.timeout('15 seconds'),
      Effect.retry({ schedule: Schedule.exponential('1 second'), times: 3 })
    );
    const body =
      yield* HttpClientResponse.schemaBodyJson(CandlesResponse)(response);
    return yield* Effect.try({
      try: () => {
        const prices = new Map<number, string>();
        for (const candle of body.candles) {
          const parsed = parseCandle(candle, product, from, to);
          if (parsed) prices.set(...parsed);
        }
        return [...prices].map(([hour, openPrice]) => ({
          source: COINBASE_SOURCE,
          productId: product,
          hourStart: new Date(hour),
          openPrice,
        }));
      },
      catch: (cause) =>
        cause instanceof Error ? cause : new Error(String(cause)),
    });
  });
}
