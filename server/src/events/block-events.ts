import {
  coreNodeBlockMessageSchema,
  coreNodeBurnBlockMessageSchema,
  NEW_BLOCK_V2_EVENT,
  type ApiStacksBlock,
  type WSBurnBlock,
  type WSNewBlock,
  type WSNewBlockV2,
} from 'slot-watch-common';
import { burnBlocks, stacksBlocks, type StacksBlockDb } from '../db/schema';
import {
  deserializeTransaction,
  PayloadType,
  type TenureChangeCause,
} from '@stacks/transactions';
import { db } from '../db/db';
import { redisClient } from '../redis';
import type { NewBlockJob } from '../worker/types';

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
    }
  }
  return {
    blockHash: parsed.block_hash,
    blockHeight: parsed.block_height,
    burnBlockHeight: parsed.burn_block_height,
    burnBlockHash: parsed.burn_block_hash,
    createdAt: new Date(),
    blockTimestamp: parsed.block_time
      ? new Date(parsed.block_time * 1000)
      : null,
    burnBlockTimestamp: new Date(parsed.burn_block_time * 1000),
    indexBlockHash: parsed.index_block_hash,
    tenureChangeCause,
    txCount: parsed.transactions.length,
    consensusHash: parsed.consensus_hash,
    ...cost,
  };
}

export async function handleStacksBlockEvent(job: NewBlockJob) {
  const block = job.payload;
  // const _block = convertBlock(payload.payload);
  await db.insert(stacksBlocks).values({
    ...block,
    // createdAt: new Date(block.receivedAt),
    // networkKey: payload.networkKey,
    // createdAt: new Date(payload.receivedAt),
  });
  const wsPayload = {
    ...block,
    processedAt: new Date(block.receivedAt).toISOString(),
    consensusHash: block.consensusHash ?? '',
    indexBlockHash: block.indexBlockHash ?? '',
    networkKey: block.networkKey,
    blockTimestamp: block.blockTimestamp?.toISOString() ?? block.receivedAt,
    burnBlockTimestamp: block.burnBlockTimestamp.toISOString(),
  } satisfies ApiStacksBlock;
  // await redisClient.publish(
  //   payload.networkKey,
  //   JSON.stringify({
  //     type: NEW_BLOCK_V2_EVENT,
  //     networkKey: payload.networkKey,
  //     receivedAt: payload.receivedAt,
  //     payload: wsPayload,
  //   } satisfies WSNewBlockV2),
  // );
}

export async function handleBurnBlockEvent(payload: WSBurnBlock) {
  const burnBlock = coreNodeBurnBlockMessageSchema.parse(payload.payload);
  await db.insert(burnBlocks).values({
    burnBlockHeight: burnBlock.burn_block_height,
    burnBlockHash: burnBlock.burn_block_hash,
    networkKey: payload.networkKey,
    consensusHash: burnBlock.consensus_hash,
    createdAt: new Date(payload.receivedAt),
  });
}
