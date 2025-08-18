import {
  BURN_BLOCK_V2_EVENT,
  coreNodeBlockMessageSchema,
  coreNodeBurnBlockMessageSchema,
  NEW_BLOCK_V2_EVENT,
  type WSBurnBlock,
  type WSBurnBlockV2,
  type WSNewBlockV2,
} from 'slot-watch-common';
import { burnBlocks, stacksBlocks, type StacksBlockDb } from '../db/schema';
import {
  AuthType,
  deserializeTransaction,
  PayloadType,
  type TenureChangeCause,
} from '@stacks/transactions';
import type { Db as DbType } from '../db/db';
// import { publishWsEvent } from '../redis';
import type { NewBlockJob } from '../worker/types';
import {
  fetchRecentMinerStats,
  recentBlocksHealthCache,
} from '../db/block-proposals';
import { getCreatedAt } from '../utils';
import type { InferInsertModel } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { log } from '../logger';
import { Effect } from 'effect';
import { Db, DbServiceTag, Streamer } from '../effect/tags';
import { runWithServerRuntime, ServerRuntime } from '../effect/runtime';
import { serializeBurnBlock } from '../db/blocks';
import { warmCache } from '../stacks-api';

export function convertBlock(
  block: unknown,
): Omit<StacksBlockDb, 'id' | 'networkKey'> {
  const parsed = coreNodeBlockMessageSchema.parse(block);
  const cost = {
    readCount: 0,
    readLength: 0,
    runtime: 0,
    writeCount: 0,
    writeLength: 0,
  };
  let tenureChangeCause: TenureChangeCause | null = null;
  let txFees = 0n;
  for (const tx of parsed.transactions) {
    cost.readCount += tx.execution_cost.read_count;
    cost.readLength += tx.execution_cost.read_length;
    cost.runtime += tx.execution_cost.runtime;
    cost.writeCount += tx.execution_cost.write_count;
    cost.writeLength += tx.execution_cost.write_length;
    if (tenureChangeCause === null) {
      const txFull = deserializeTransaction(tx.raw_tx);
      if (txFull.payload.payloadType === PayloadType.TenureChange) {
        tenureChangeCause = txFull.payload.cause;
      }
      if (txFull.auth.authType === AuthType.Standard) {
        txFees += txFull.auth.spendingCondition.fee;
      } else {
        txFees += txFull.auth.sponsorSpendingCondition.fee;
      }
    }
  }
  return {
    blockHash: parsed.block_hash,
    blockHeight: parsed.block_height,
    burnBlockHeight: parsed.burn_block_height,
    burnBlockHash: parsed.burn_block_hash,
    blockTimestamp: parsed.block_time
      ? new Date(parsed.block_time * 1000)
      : new Date(),
    burnBlockTimestamp: new Date(parsed.burn_block_time * 1000),
    indexBlockHash: parsed.index_block_hash,
    tenureChangeCause,
    txCount: parsed.transactions.length,
    consensusHash: parsed.consensus_hash,
    txFees: Number(txFees),
    ...cost,
  };
}

export const handleStacksBlockEvent = (job: NewBlockJob) =>
  Effect.gen(function* () {
    const block = job.payload;
    const id = uuidv7({ msecs: new Date(job.receivedAt).getTime() });
    const db = yield* Db;
    const streamer = yield* Streamer;
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
    ]);
  });

export const handleBurnBlockEvent = (payload: WSBurnBlockV2) =>
  Effect.gen(function* () {
    // const burnBlock = coreNodeBurnBlockMessageSchema.parse(payload.payload);
    const id = uuidv7({ msecs: new Date(payload.receivedAt).getTime() });
    const dbBurnBlock = {
      id,
      burnBlockHeight: payload.payload.burnBlockHeight,
      burnBlockHash: payload.payload.burnBlockHash,
      networkKey: payload.networkKey,
      consensusHash: payload.payload.consensusHash,
      createdAt: new Date(payload.receivedAt),
    };
    const db = yield* Db;
    const streamer = yield* Streamer;
    yield* Effect.all([
      db.withDb((db) => db.insert(burnBlocks).values(dbBurnBlock)),
      streamer.publish({
        type: BURN_BLOCK_V2_EVENT,
        receivedAt: new Date().toISOString(),
        networkKey: payload.networkKey,
        payload: serializeBurnBlock(dbBurnBlock),
      }),
      db.withDb((db) => warmCache(payload.networkKey, db)),
    ]);
  });
