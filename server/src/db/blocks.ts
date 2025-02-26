import type { BurnBlockDb, StacksBlockDb } from './schema';
import type { ApiBurnBlock, ApiStacksBlock } from 'slot-watch-common';

export function serializeBurnBlock(block: BurnBlockDb): ApiBurnBlock {
  return {
    ...block,
    createdAt: block.createdAt.toISOString(),
  };
}

export function serializeStacksBlock(
  block: Omit<StacksBlockDb, 'id'>,
): ApiStacksBlock {
  return {
    ...block,
    // createdAt: block.createdAt.toISOString(),
    burnBlockTimestamp: block.burnBlockTimestamp.toISOString(),
    blockTimestamp: (block.blockTimestamp ?? new Date()).toISOString(),
    processedAt: block.createdAt.toISOString(),
    consensusHash: block.consensusHash ?? '',
    indexBlockHash: block.indexBlockHash ?? '',
  };
}
