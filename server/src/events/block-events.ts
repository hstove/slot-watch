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
import { db } from '../db/db';
// import { publishWsEvent } from '../redis';
import type { NewBlockJob } from '../worker/types';
import { fetchRecentMinerStats } from '../db/block-proposals';
import { getCreatedAt } from '../utils';

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

export async function handleStacksBlockEvent(job: NewBlockJob) {
  const block = job.payload;
  const dbBlock = {
    ...block,
    createdAt: new Date(block.receivedAt),
    blockTimestamp: block.blockTimestamp
      ? new Date(block.blockTimestamp)
      : new Date(),
    burnBlockTimestamp: block.burnBlockTimestamp
      ? new Date(block.burnBlockTimestamp)
      : new Date(),
    consensusHash: block.consensusHash ?? '',
    indexBlockHash: block.indexBlockHash ?? '',
  };
  // const _block = convertBlock(payload.payload);
  await db.insert(stacksBlocks).values(dbBlock).onConflictDoNothing();
  // .onConflictDoUpdate({
  //   target: [stacksBlocks.blockHash, stacksBlocks.networkKey],
  //   set: {
  //     ...dbBlock,
  //   },
  // });
  // await publishWsEvent({
  //   type: NEW_BLOCK_V2_EVENT,
  //   networkKey: block.networkKey,
  //   receivedAt: block.receivedAt,
  //   payload: {
  //     ...dbBlock,
  //     processedAt: block.receivedAt,
  //     blockTimestamp: dbBlock.blockTimestamp.toISOString(),
  //     burnBlockTimestamp: dbBlock.burnBlockTimestamp.toISOString(),
  //   },
  // } satisfies WSNewBlockV2);
  await fetchRecentMinerStats(block.networkKey);
}

export async function handleBurnBlockEvent(payload: WSBurnBlock) {
  const burnBlock = coreNodeBurnBlockMessageSchema.parse(payload.payload);
  const dbBurnBlock = {
    burnBlockHeight: burnBlock.burn_block_height,
    burnBlockHash: burnBlock.burn_block_hash,
    networkKey: payload.networkKey,
    consensusHash: burnBlock.consensus_hash,
    createdAt: new Date(payload.receivedAt),
  };
  await db.insert(burnBlocks).values(dbBurnBlock);
  // await publishWsEvent({
  //   type: BURN_BLOCK_V2_EVENT,
  //   networkKey: payload.networkKey,
  //   receivedAt: payload.receivedAt,
  //   payload: {
  //     ...dbBurnBlock,
  //     createdAt: dbBurnBlock.createdAt.toISOString(),
  //   },
  // } satisfies WSBurnBlockV2);
}
