import { Hono } from 'hono';
import { Schema } from 'effect';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { timeout } from 'hono/timeout';
import { hourlyPrices } from '../db/schema';
import { COINBASE_SOURCE, HOUR_MS } from '../prices/coinbase';
import type { ServerType } from '../server-context';

const MAX_HOURS = 31 * 24;
const QuerySchema = Schema.toStandardSchemaV1(
  Schema.Struct({ from: Schema.String, to: Schema.String }).annotate({
    identifier: 'HourlyPricesQuery',
  })
);
const ResponseSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    source: Schema.String,
    from: Schema.String,
    to: Schema.String,
    prices: Schema.mutable(
      Schema.Array(
        Schema.Struct({
          productId: Schema.String,
          hourStart: Schema.String,
          openPrice: Schema.String,
        })
      )
    ),
  }).annotate({ identifier: 'HourlyPricesResponse' })
);

function parseHour(value: string): Date | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) &&
    date.toISOString() === value &&
    date.getTime() % HOUR_MS === 0
    ? date
    : null;
}

export const pricesRoutes = new Hono<ServerType>().use('*', timeout(5000)).get(
  '/prices/hourly',
  describeRoute({
    summary: 'Get hourly market prices',
    description: `BTC-USD and STX-USD hourly candle opens. UTC \`from\` is inclusive and \`to\` is exclusive, both in ISO format with milliseconds and aligned to the hour. At most ${MAX_HOURS} hours per request. Missing source candles are omitted, never filled. Divide BTC-USD by STX-USD at the same hour for STX per BTC.`,
    tags: ['Market Prices'],
    responses: {
      200: {
        description: 'Stored hourly candle opens',
        content: { 'application/json': { schema: resolver(ResponseSchema) } },
      },
      400: { description: 'Invalid hourly range' },
    },
  }),
  validator('query', QuerySchema),
  async (c) => {
    const { from, to } = c.req.valid('query');
    const start = parseHour(from);
    const end = parseHour(to);
    if (
      !(start && end) ||
      end <= start ||
      end.getTime() - start.getTime() > MAX_HOURS * HOUR_MS
    ) {
      return c.json(
        { error: `Use an aligned UTC range of 1–${MAX_HOURS} hours` },
        400
      );
    }
    const rows = await c
      .get('db')
      .select({
        productId: hourlyPrices.productId,
        hourStart: hourlyPrices.hourStart,
        openPrice: hourlyPrices.openPrice,
      })
      .from(hourlyPrices)
      .where(
        and(
          eq(hourlyPrices.source, COINBASE_SOURCE),
          inArray(hourlyPrices.productId, ['BTC-USD', 'STX-USD']),
          gte(hourlyPrices.hourStart, start),
          lt(hourlyPrices.hourStart, end)
        )
      )
      .orderBy(asc(hourlyPrices.hourStart), asc(hourlyPrices.productId));
    return c.json({
      source: COINBASE_SOURCE,
      from,
      to,
      prices: rows.map((row) => ({
        ...row,
        hourStart: row.hourStart.toISOString(),
      })),
    });
  }
);
