import {
  AuthType,
  deserializeTransaction,
  PayloadType,
  type TenureChangeCause,
} from '@stacks/transactions';
import { coreNodeBlockMessageSchema } from 'slot-watch-common';
import type { StacksBlockDb } from '../db/schema';

export function convertBlock(
  block: unknown
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
