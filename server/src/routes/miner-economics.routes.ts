import { Hono } from 'hono';
import { Schema } from 'effect';
import { and, asc, between, eq, isNotNull, max, sql } from 'drizzle-orm';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { timeout } from 'hono/timeout';
import { MinerEconomicsResponseSchema } from 'slot-watch-common';
import { burnBlocks, minerRewards, stacksBlocks } from '../db/schema';
import type { ServerType } from '../server-context';
import { getCreatedAt } from '../utils';

/** Four weeks of Bitcoin blocks. */
const MAX_SPAN = 4032;

const NetworkKeyParamSchema = Schema.standardSchemaV1(
  Schema.Struct({
    networkKey: Schema.String,
  }).annotations({ identifier: 'NetworkKeyParam' })
);

const HeightRangeQuerySchema = Schema.standardSchemaV1(
  Schema.Struct({
    fromHeight: Schema.NumberFromString.pipe(Schema.int()),
    toHeight: Schema.NumberFromString.pipe(Schema.int()),
  }).annotations({ identifier: 'MinerEconomicsQuery' })
);

const minerEconomicsResponse = Schema.standardSchemaV1(
  MinerEconomicsResponseSchema
);

export const minerEconomicsRoutes = new Hono<ServerType>()
  .use('*', timeout(5000))
  .get(
    '/miner-economics/:networkKey',
    describeRoute({
      summary: 'Get miner economics by burn block',
      description: `Miner BTC spend and matured STX revenue per Bitcoin block, ascending by height. Both \`fromHeight\` and \`toHeight\` are required and inclusive; reject spans where \`toHeight - fromHeight > ${MAX_SPAN}\` (four weeks). Callers find the tip with \`GET /burn-blocks/:networkKey\` (first row) and page backwards in height ranges.

Total miner BTC spend for a block is \`poxSpendSats + burnAmountSats\`. Total miner revenue is \`coinbaseUstx + txFeesUstx\`, in micro-STX.

Caveats:
- \`poxSpendSats\` and \`burnAmountSats\` are 0 for rows ingested before those columns existed and not covered by the backfill (mainnet before roughly 2026-07-01).
- \`miner_rewards\` coverage on mainnet starts at burn height 956012.
- The node emits two reward entries per recipient. Ingest and backfill already sum them, so this endpoint does not.
- Rewards mature about 100 tenures after they are earned. Blocks above \`maturedThroughHeight\` have null revenue because they are still maturing; blocks at or below it with null revenue earned nothing (no sortition winner).`,
      tags: ['Miner Economics'],
      responses: {
        200: {
          description: 'Per-burn-block miner spend and revenue',
          content: {
            'application/json': { schema: resolver(minerEconomicsResponse) },
          },
        },
        400: { description: 'Invalid height range' },
      },
    }),
    validator('param', NetworkKeyParamSchema),
    validator('query', HeightRangeQuerySchema),
    async (c) => {
      const { networkKey } = c.req.valid('param');
      const { fromHeight, toHeight } = c.req.valid('query');
      if (toHeight < fromHeight) {
        return c.json({ error: 'toHeight must be >= fromHeight' }, 400);
      }
      if (toHeight - fromHeight > MAX_SPAN) {
        return c.json({ error: `Height span may not exceed ${MAX_SPAN}` }, 400);
      }

      const db = c.get('db');
      const rewards = db
        .select({
          networkKey: minerRewards.networkKey,
          earnedBurnBlockHeight: minerRewards.earnedBurnBlockHeight,
          coinbaseUstx: sql<number>`sum(${minerRewards.coinbaseUstx})`.as(
            'coinbase_ustx'
          ),
          txFeesUstx:
            sql<number>`sum(${minerRewards.txFeesAnchoredUstx} + ${minerRewards.txFeesStreamedConfirmedUstx} + ${minerRewards.txFeesStreamedProducedUstx})`.as(
              'tx_fees_ustx'
            ),
          recipients: sql<number>`count(distinct ${minerRewards.recipient})`.as(
            'recipients'
          ),
        })
        .from(minerRewards)
        .where(
          and(
            eq(minerRewards.networkKey, networkKey),
            between(minerRewards.earnedBurnBlockHeight, fromHeight, toHeight)
          )
        )
        .groupBy(minerRewards.networkKey, minerRewards.earnedBurnBlockHeight)
        .as('rewards');

      const [rows, [matured]] = await Promise.all([
        db
          .select({
            id: burnBlocks.id,
            burnBlockHeight: burnBlocks.burnBlockHeight,
            burnBlockHash: burnBlocks.burnBlockHash,
            consensusHash: burnBlocks.consensusHash,
            poxSpendSats: burnBlocks.poxSpendSats,
            burnAmountSats: burnBlocks.burnAmountSats,
            stacksBlockCount: sql<number>`count(${stacksBlocks.id})`,
            coinbaseUstx: rewards.coinbaseUstx,
            txFeesUstx: rewards.txFeesUstx,
            recipients: rewards.recipients,
          })
          .from(burnBlocks)
          .leftJoin(
            rewards,
            and(
              eq(rewards.networkKey, burnBlocks.networkKey),
              eq(rewards.earnedBurnBlockHeight, burnBlocks.burnBlockHeight)
            )
          )
          .leftJoin(
            stacksBlocks,
            and(
              eq(stacksBlocks.consensusHash, burnBlocks.consensusHash),
              eq(stacksBlocks.networkKey, burnBlocks.networkKey)
            )
          )
          .where(
            and(
              eq(burnBlocks.networkKey, networkKey),
              between(burnBlocks.burnBlockHeight, fromHeight, toHeight)
            )
          )
          .groupBy(
            burnBlocks.id,
            rewards.coinbaseUstx,
            rewards.txFeesUstx,
            rewards.recipients
          )
          .orderBy(asc(burnBlocks.burnBlockHeight)),
        db
          .select({ height: max(minerRewards.earnedBurnBlockHeight) })
          .from(minerRewards)
          .where(
            and(
              eq(minerRewards.networkKey, networkKey),
              isNotNull(minerRewards.earnedBurnBlockHeight)
            )
          ),
      ]);

      return c.json({
        maturedThroughHeight: Number(matured?.height ?? 0),
        blocks: rows.map((row) => ({
          burnBlockHeight: row.burnBlockHeight,
          burnBlockHash: row.burnBlockHash,
          consensusHash: row.consensusHash,
          observedAt: getCreatedAt(row.id).toISOString(),
          stacksBlockCount: Number(row.stacksBlockCount),
          poxSpendSats: row.poxSpendSats,
          burnAmountSats: row.burnAmountSats,
          revenue:
            row.recipients === null
              ? null
              : {
                  coinbaseUstx: Number(row.coinbaseUstx),
                  txFeesUstx: Number(row.txFeesUstx),
                  recipients: Number(row.recipients),
                },
        })),
      });
    }
  );
