import {
  type WSNewBlockV2,
  BURN_BLOCK_V2_EVENT,
  NEW_BLOCK_V2_EVENT,
  type WSBurnBlockV2,
  type MaturedMinerReward,
  type CoreNodeBurnBlockMessage,
} from 'slot-watch-common';
import {
  burnBlocks,
  minerRewards,
  minerSpends,
  stacksBlocks,
} from '../db/schema';
import { fetchTxSenderPublicKey, minerAddressFromPublicKey } from '../bitcoin';
import { recentBlocksHealthCache } from '../db/block-proposals';
import { and, eq, inArray, isNull, type InferInsertModel } from 'drizzle-orm';
import { TenureChangeCause } from '@stacks/transactions';
import { v7 as uuidv7 } from 'uuid';
import { Effect } from 'effect';
import { serializeBurnBlock } from '../db/serializers';
import { warmCache } from '../stacks-api';
import { DbService } from '../effect/layers/db';
import { StreamerService } from '../effect/layers/streamer';
import { log } from '../logger';

/**
 * Persist matured miner rewards from a new_block event, attributing each
 * reward back to the tenure that earned it via the earning block's index
 * block hash.
 */
const storeMinerRewards = (job: WSNewBlockV2, rewards: MaturedMinerReward[]) =>
  Effect.gen(function* () {
    if (rewards.length === 0) return;
    const db = yield* DbService;
    const indexHashes = [
      ...new Set(rewards.map((r) => r.from_index_consensus_hash)),
    ];
    const earnedBlocks = yield* db.withDb((db) =>
      db
        .select({
          indexBlockHash: stacksBlocks.indexBlockHash,
          consensusHash: stacksBlocks.consensusHash,
          burnBlockHeight: stacksBlocks.burnBlockHeight,
        })
        .from(stacksBlocks)
        .where(
          and(
            eq(stacksBlocks.networkKey, job.networkKey),
            inArray(stacksBlocks.indexBlockHash, indexHashes)
          )
        )
    );
    const earnedByIndexHash = new Map(
      earnedBlocks.map((b) => [b.indexBlockHash, b])
    );
    const msecs = new Date(job.receivedAt).getTime();
    // The node splits one tenure's reward into two entries with the same
    // (from_index, recipient): coinbase + anchored fees, and streamed-produced
    // fees. Sum them so the unique key holds one complete row.
    const rows = new Map<string, InferInsertModel<typeof minerRewards>>();
    for (const reward of rewards) {
      const key = `${reward.from_index_consensus_hash}:${reward.recipient}`;
      const existing = rows.get(key);
      if (existing) {
        existing.coinbaseUstx += Number(reward.coinbase_amount);
        existing.txFeesAnchoredUstx += Number(reward.tx_fees_anchored);
        existing.txFeesStreamedConfirmedUstx += Number(
          reward.tx_fees_streamed_confirmed
        );
        existing.txFeesStreamedProducedUstx += Number(
          reward.tx_fees_streamed_produced
        );
        continue;
      }
      const earned = earnedByIndexHash.get(reward.from_index_consensus_hash);
      rows.set(key, {
        id: uuidv7({ msecs }),
        networkKey: job.networkKey,
        recipient: reward.recipient,
        minerAddress: reward.miner_address,
        coinbaseUstx: Number(reward.coinbase_amount),
        txFeesAnchoredUstx: Number(reward.tx_fees_anchored),
        txFeesStreamedConfirmedUstx: Number(reward.tx_fees_streamed_confirmed),
        txFeesStreamedProducedUstx: Number(reward.tx_fees_streamed_produced),
        fromStacksBlockHash: reward.from_stacks_block_hash,
        fromIndexBlockHash: reward.from_index_consensus_hash,
        maturedBlockHeight: job.payload.blockHeight,
        maturedBurnBlockHeight: job.payload.burnBlockHeight,
        earnedConsensusHash: earned?.consensusHash ?? null,
        earnedBurnBlockHeight: earned?.burnBlockHeight ?? null,
      });
    }
    yield* db.withDb((db) =>
      db
        .insert(minerRewards)
        .values([...rows.values()])
        .onConflictDoNothing()
    );
  }).pipe(
    Effect.catchAll((err) =>
      Effect.sync(() =>
        log
          .withMetadata({ topic: 'miner-rewards', networkKey: job.networkKey })
          .error(`Failed to store miner rewards: ${err}`)
      )
    )
  );

/**
 * Record which block commit won the sortition once the tenure's first block
 * arrives. Tenure extends keep the previous winner, so only BlockFound counts.
 */
const storeWinningTxid = (job: WSNewBlockV2, minerTxid: string | undefined) =>
  Effect.gen(function* () {
    if (
      !minerTxid ||
      job.payload.tenureChangeCause !== TenureChangeCause.BlockFound
    )
      return;
    const db = yield* DbService;
    yield* db.withDb((db) =>
      db
        .update(burnBlocks)
        .set({ winningTxid: minerTxid })
        .where(
          and(
            eq(burnBlocks.networkKey, job.networkKey),
            eq(burnBlocks.consensusHash, job.payload.consensusHash),
            isNull(burnBlocks.winningTxid)
          )
        )
    );
  }).pipe(
    Effect.catchAll((e) =>
      Effect.sync(() => log.withError(e).error('Failed to store winning txid'))
    )
  );

export const handleStacksBlockEvent = (
  job: WSNewBlockV2,
  maturedMinerRewards: MaturedMinerReward[] = [],
  minerTxid?: string
) =>
  Effect.gen(function* () {
    const block = job.payload;
    const id = uuidv7({ msecs: new Date(job.receivedAt).getTime() });
    const db = yield* DbService;
    const streamer = yield* StreamerService;
    const dbBlock = {
      ...block,
      id,
      blockTimestamp: block.blockTimestamp
        ? new Date(block.blockTimestamp)
        : new Date(),
      burnBlockTimestamp: block.burnBlockTimestamp
        ? new Date(block.burnBlockTimestamp)
        : new Date(),
      consensusHash: block.consensusHash ?? '',
      indexBlockHash: block.indexBlockHash ?? '',
    } satisfies InferInsertModel<typeof stacksBlocks>;

    yield* Effect.all([
      streamer.publish({
        type: NEW_BLOCK_V2_EVENT,
        networkKey: job.networkKey,
        receivedAt: job.receivedAt,
        payload: {
          ...dbBlock,
          processedAt: job.receivedAt,
          blockTimestamp: dbBlock.blockTimestamp.toISOString(),
          burnBlockTimestamp: dbBlock.burnBlockTimestamp.toISOString(),
        },
      }),
      db.withDb((db) => db.insert(stacksBlocks).values(dbBlock)),
      db.withDb((db) => recentBlocksHealthCache.warmIfNeeded(db)),
      storeMinerRewards(job, maturedMinerRewards),
      storeWinningTxid(job, minerTxid),
    ]);
  });

/**
 * Persist one row per block commit in a burn block. The miner is resolved from
 * the commit's Bitcoin input key; a failed lookup leaves it null rather than
 * failing the burn block, and the backfill script repairs nulls.
 */
const storeMinerSpends = (
  payload: WSBurnBlockV2,
  poxTransactions: CoreNodeBurnBlockMessage['pox_transactions']
) =>
  Effect.gen(function* () {
    if (poxTransactions.length === 0) return;
    const db = yield* DbService;
    const { networkKey } = payload;
    const rows = yield* Effect.promise(() =>
      Promise.all(
        poxTransactions.map(async (tx, i) => {
          const txid = tx.txid.startsWith('0x') ? tx.txid.slice(2) : tx.txid;
          const publicKey = await fetchTxSenderPublicKey(txid);
          return {
            id: uuidv7({ msecs: new Date(payload.receivedAt).getTime() + i }),
            networkKey,
            burnBlockHeight: payload.payload.burnBlockHeight,
            burnBlockHash: payload.payload.burnBlockHash,
            consensusHash: payload.payload.consensusHash,
            txid,
            spendSats: tx.reward_recipients.reduce((sum, r) => sum + r.amt, 0),
            burnSats: 0,
            recipientCount: tx.reward_recipients.length,
            minerPublicKey: publicKey,
            minerAddress: publicKey
              ? minerAddressFromPublicKey(publicKey, networkKey)
              : null,
          } satisfies InferInsertModel<typeof minerSpends>;
        })
      )
    );
    yield* db.withDb((db) =>
      db.insert(minerSpends).values(rows).onConflictDoNothing()
    );
  }).pipe(
    Effect.catchAll((e) =>
      Effect.sync(() => log.withError(e).error('Failed to store miner spends'))
    )
  );

export const handleBurnBlockEvent = (
  payload: WSBurnBlockV2,
  poxTransactions: CoreNodeBurnBlockMessage['pox_transactions'] = []
) =>
  Effect.gen(function* () {
    // const burnBlock = coreNodeBurnBlockMessageSchema.parse(payload.payload);
    const id = uuidv7({ msecs: new Date(payload.receivedAt).getTime() });
    const dbBurnBlock = {
      id,
      burnBlockHeight: payload.payload.burnBlockHeight,
      burnBlockHash: payload.payload.burnBlockHash,
      networkKey: payload.networkKey,
      consensusHash: payload.payload.consensusHash,
      poxSpendSats: payload.payload.poxSpendSats,
      burnAmountSats: payload.payload.burnAmountSats,
      winningTxid: null,
      createdAt: new Date(payload.receivedAt),
    };
    const db = yield* DbService;
    const streamer = yield* StreamerService;
    yield* Effect.all([
      db.withDb((db) => db.insert(burnBlocks).values(dbBurnBlock)),
      streamer.publish({
        type: BURN_BLOCK_V2_EVENT,
        receivedAt: new Date().toISOString(),
        networkKey: payload.networkKey,
        payload: serializeBurnBlock(dbBurnBlock),
      }),
      storeMinerSpends(payload, poxTransactions),
      db.withDb((db) => warmCache(payload.networkKey, db)),
    ]);
  });
