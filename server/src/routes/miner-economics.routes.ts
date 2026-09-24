import { Hono } from 'hono';
import { Schema } from 'effect';
import { and, asc, between, desc, eq, isNotNull, max, sql } from 'drizzle-orm';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { timeout } from 'hono/timeout';
import {
  type MinerCommit,
  MinerCommitsResponseSchema,
  MinerEconomicsMinersResponseSchema,
  MinerEconomicsResponseSchema,
  NetworkKeyParamSchema,
} from 'slot-watch-common';
import {
  burnBlocks,
  minerRewards,
  minerSpends,
  stacksBlocks,
} from '../db/schema';
import type { ServerType } from '../server-context';
import { getCreatedAt } from '../utils';

/** Four weeks of Bitcoin blocks. */
const MAX_SPAN = 4032;
/** One week of Bitcoin blocks; the commits route returns a row per commit. */
const MAX_COMMITS_SPAN = 1008;

const HeightRangeQuerySchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    fromHeight: Schema.NumberFromString.check(Schema.isInt()),
    toHeight: Schema.NumberFromString.check(Schema.isInt()),
  }).annotate({ identifier: 'MinerEconomicsQuery' })
);

const minerEconomicsResponse = Schema.toStandardSchemaV1(
  MinerEconomicsResponseSchema
);
const minerEconomicsMinersResponse = Schema.toStandardSchemaV1(
  MinerEconomicsMinersResponseSchema
);
const minerCommitsResponse = Schema.toStandardSchemaV1(
  MinerCommitsResponseSchema
);

function validateRange(
  fromHeight: number,
  toHeight: number,
  maxSpan = MAX_SPAN
): string | null {
  if (toHeight < fromHeight) return 'toHeight must be >= fromHeight';
  if (toHeight - fromHeight > maxSpan)
    return `Height span may not exceed ${maxSpan}`;
  return null;
}

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
    validator('param', Schema.toStandardSchemaV1(NetworkKeyParamSchema)),
    validator('query', HeightRangeQuerySchema),
    async (c) => {
      const { networkKey } = c.req.valid('param');
      const { fromHeight, toHeight } = c.req.valid('query');
      const rangeError = validateRange(fromHeight, toHeight);
      if (rangeError) return c.json({ error: rangeError }, 400);

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

      // burn_blocks can hold two rows for one height after a Bitcoin fork. Keep
      // the row with the most Stacks blocks, then the latest id. The count is a
      // correlated subquery so the (consensus_hash, network_key) index is used;
      // joining stacks_blocks and grouping makes Postgres seq scan the table.
      const stacksBlockCount = sql<number>`(select count(*) from ${stacksBlocks} sb where sb.consensus_hash = "burn_blocks".consensus_hash and sb.network_key = "burn_blocks".network_key)`;
      const deduped = db
        .selectDistinctOn([burnBlocks.burnBlockHeight], {
          id: burnBlocks.id,
          burnBlockHeight: burnBlocks.burnBlockHeight,
          burnBlockHash: burnBlocks.burnBlockHash,
          consensusHash: burnBlocks.consensusHash,
          poxSpendSats: burnBlocks.poxSpendSats,
          burnAmountSats: burnBlocks.burnAmountSats,
          stacksBlockCount: stacksBlockCount.as('stacks_block_count'),
        })
        .from(burnBlocks)
        .where(
          and(
            eq(burnBlocks.networkKey, networkKey),
            between(burnBlocks.burnBlockHeight, fromHeight, toHeight)
          )
        )
        .orderBy(
          asc(burnBlocks.burnBlockHeight),
          desc(stacksBlockCount),
          desc(burnBlocks.id)
        )
        .as('deduped');

      const [rows, [matured]] = await Promise.all([
        db
          .select({
            id: deduped.id,
            burnBlockHeight: deduped.burnBlockHeight,
            burnBlockHash: deduped.burnBlockHash,
            consensusHash: deduped.consensusHash,
            poxSpendSats: deduped.poxSpendSats,
            burnAmountSats: deduped.burnAmountSats,
            stacksBlockCount: deduped.stacksBlockCount,
            coinbaseUstx: rewards.coinbaseUstx,
            txFeesUstx: rewards.txFeesUstx,
            recipients: rewards.recipients,
          })
          .from(deduped)
          .leftJoin(
            rewards,
            and(
              eq(rewards.networkKey, networkKey),
              eq(rewards.earnedBurnBlockHeight, deduped.burnBlockHeight)
            )
          )
          .orderBy(asc(deduped.burnBlockHeight)),
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
  )
  .get(
    '/miner-economics/:networkKey/miners',
    describeRoute({
      summary: 'Get per-miner spend and revenue',
      description: `Aggregates each miner's block commits (\`miner_spends\`, by the burn height the commit was mined in) and matured rewards (\`miner_rewards\`, by the burn height the tenure was earned in) over an inclusive height range of at most ${MAX_SPAN} blocks. Miners are keyed by the STX address derived from the key that funds their commits, which is the same key that signs their block proposals and receives their rewards.

A commit counts as a win when its burn block's \`winningTxid\` matches it. Rewards mature about 100 tenures after they are earned, so ranges ending above \`maturedThroughHeight\` under-report revenue. A row with a null \`minerAddress\` holds commits whose Bitcoin sender has not been resolved yet.`,
      tags: ['Miner Economics'],
      responses: {
        200: {
          description: 'Per-miner totals',
          content: {
            'application/json': {
              schema: resolver(minerEconomicsMinersResponse),
            },
          },
        },
        400: { description: 'Invalid height range' },
      },
    }),
    validator('param', Schema.toStandardSchemaV1(NetworkKeyParamSchema)),
    validator('query', HeightRangeQuerySchema),
    async (c) => {
      const { networkKey } = c.req.valid('param');
      const { fromHeight, toHeight } = c.req.valid('query');
      const rangeError = validateRange(fromHeight, toHeight);
      if (rangeError) return c.json({ error: rangeError }, 400);

      const db = c.get('db');
      const won = sql<boolean>`exists (select 1 from ${burnBlocks} bb where bb.network_key = ${minerSpends.networkKey} and bb.burn_block_hash = ${minerSpends.burnBlockHash} and bb.winning_txid = ${minerSpends.txid})`;
      // Postgres can't hash a full join on `is not distinct from`, so group
      // unresolved miners under '' and join on equality.
      const spend = db
        .select({
          minerKey: sql<string>`coalesce(${minerSpends.minerAddress}, '')`.as(
            'spend_miner_key'
          ),
          minerPublicKey: sql<
            string | null
          >`max(${minerSpends.minerPublicKey})`.as('miner_public_key'),
          commits: sql<number>`count(*)`.as('commits'),
          wins: sql<number>`count(*) filter (where ${won})`.as('wins'),
          spendSats: sql<number>`sum(${minerSpends.spendSats})`.as(
            'spend_sats'
          ),
          burnSats: sql<number>`sum(${minerSpends.burnSats})`.as('burn_sats'),
        })
        .from(minerSpends)
        .where(
          and(
            eq(minerSpends.networkKey, networkKey),
            between(minerSpends.burnBlockHeight, fromHeight, toHeight)
          )
        )
        .groupBy(sql`coalesce(${minerSpends.minerAddress}, '')`)
        .as('spend');
      const revenue = db
        .select({
          minerKey: sql<string>`coalesce(${minerRewards.minerAddress}, '')`.as(
            'revenue_miner_key'
          ),
          coinbaseUstx: sql<number>`sum(${minerRewards.coinbaseUstx})`.as(
            'coinbase_ustx'
          ),
          txFeesUstx:
            sql<number>`sum(${minerRewards.txFeesAnchoredUstx} + ${minerRewards.txFeesStreamedConfirmedUstx} + ${minerRewards.txFeesStreamedProducedUstx})`.as(
              'tx_fees_ustx'
            ),
          rewardRows: sql<number>`count(*)`.as('reward_rows'),
        })
        .from(minerRewards)
        .where(
          and(
            eq(minerRewards.networkKey, networkKey),
            between(minerRewards.earnedBurnBlockHeight, fromHeight, toHeight)
          )
        )
        .groupBy(sql`coalesce(${minerRewards.minerAddress}, '')`)
        .as('revenue');

      const [rows, [matured]] = await Promise.all([
        db
          .select({
            minerAddress: sql<
              string | null
            >`nullif(coalesce(${spend.minerKey}, ${revenue.minerKey}), '')`,
            minerPublicKey: spend.minerPublicKey,
            commits: spend.commits,
            wins: spend.wins,
            spendSats: spend.spendSats,
            burnSats: spend.burnSats,
            coinbaseUstx: revenue.coinbaseUstx,
            txFeesUstx: revenue.txFeesUstx,
            rewardRows: revenue.rewardRows,
          })
          .from(spend)
          .fullJoin(revenue, eq(spend.minerKey, revenue.minerKey))
          .orderBy(desc(spend.spendSats)),
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
        fromHeight,
        toHeight,
        maturedThroughHeight: Number(matured?.height ?? 0),
        miners: rows.map((row) => ({
          minerAddress: row.minerAddress,
          minerPublicKey: row.minerPublicKey ?? null,
          commits: Number(row.commits ?? 0),
          wins: Number(row.wins ?? 0),
          spendSats: Number(row.spendSats ?? 0),
          burnSats: Number(row.burnSats ?? 0),
          coinbaseUstx: Number(row.coinbaseUstx ?? 0),
          txFeesUstx: Number(row.txFeesUstx ?? 0),
          rewardRows: Number(row.rewardRows ?? 0),
        })),
      });
    }
  )
  .get(
    '/miner-economics/:networkKey/commits',
    describeRoute({
      summary: 'Get block commits per burn block',
      description: `Every block commit mined in an inclusive burn height range of at most ${MAX_COMMITS_SPAN} blocks, grouped by burn block and ascending by height. Each block carries its \`winningTxid\` so callers can mark the winning commit. Burn blocks without commits are included with an empty list. A commit with a null \`minerAddress\` has not had its Bitcoin sender resolved yet.`,
      tags: ['Miner Economics'],
      responses: {
        200: {
          description: 'Commits grouped by burn block',
          content: {
            'application/json': { schema: resolver(minerCommitsResponse) },
          },
        },
        400: { description: 'Invalid height range' },
      },
    }),
    validator('param', Schema.toStandardSchemaV1(NetworkKeyParamSchema)),
    validator('query', HeightRangeQuerySchema),
    async (c) => {
      const { networkKey } = c.req.valid('param');
      const { fromHeight, toHeight } = c.req.valid('query');
      const rangeError = validateRange(fromHeight, toHeight, MAX_COMMITS_SPAN);
      if (rangeError) return c.json({ error: rangeError }, 400);

      const db = c.get('db');
      const [blocks, commits] = await Promise.all([
        db
          .select({
            id: burnBlocks.id,
            burnBlockHeight: burnBlocks.burnBlockHeight,
            burnBlockHash: burnBlocks.burnBlockHash,
            consensusHash: burnBlocks.consensusHash,
            winningTxid: burnBlocks.winningTxid,
          })
          .from(burnBlocks)
          .where(
            and(
              eq(burnBlocks.networkKey, networkKey),
              between(burnBlocks.burnBlockHeight, fromHeight, toHeight)
            )
          )
          .orderBy(asc(burnBlocks.burnBlockHeight), asc(burnBlocks.id)),
        db
          .select({
            burnBlockHash: minerSpends.burnBlockHash,
            txid: minerSpends.txid,
            minerAddress: minerSpends.minerAddress,
            minerPublicKey: minerSpends.minerPublicKey,
            spendSats: minerSpends.spendSats,
            burnSats: minerSpends.burnSats,
          })
          .from(minerSpends)
          .where(
            and(
              eq(minerSpends.networkKey, networkKey),
              between(minerSpends.burnBlockHeight, fromHeight, toHeight)
            )
          )
          .orderBy(desc(minerSpends.spendSats)),
      ]);

      const byHash = new Map<string, MinerCommit[]>();
      for (const row of commits) {
        const list = byHash.get(row.burnBlockHash) ?? [];
        list.push({
          txid: row.txid,
          minerAddress: row.minerAddress,
          minerPublicKey: row.minerPublicKey,
          spendSats: Number(row.spendSats),
          burnSats: Number(row.burnSats),
        });
        byHash.set(row.burnBlockHash, list);
      }
      // Forked heights keep the later-observed row, matching the ingest order.
      const byHeight = new Map<number, (typeof blocks)[number]>();
      for (const block of blocks) byHeight.set(block.burnBlockHeight, block);

      return c.json({
        fromHeight,
        toHeight,
        blocks: [...byHeight.values()].map((block) => ({
          burnBlockHeight: block.burnBlockHeight,
          burnBlockHash: block.burnBlockHash,
          consensusHash: block.consensusHash,
          winningTxid: block.winningTxid,
          commits: byHash.get(block.burnBlockHash) ?? [],
        })),
      });
    }
  );
