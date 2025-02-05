import type { BurnBlockDb, StacksBlockDb } from './schema';
import type { ApiBurnBlock } from 'slot-watch-common';

export function serializeBurnBlock(block: BurnBlockDb): ApiBurnBlock {
  return {
    ...block,
    createdAt: block.createdAt.toISOString(),
  };
}

export function serializeStacksBlock(block: Omit<StacksBlockDb, 'id'>) {
  return {
    ...block,
    createdAt: block.createdAt.toISOString(),
    burnBlockTimestamp: block.burnBlockTimestamp.toISOString(),
    blockTimestamp: block.blockTimestamp?.toISOString() ?? null,
    processedAt: block.createdAt.toISOString(),
  };
}
