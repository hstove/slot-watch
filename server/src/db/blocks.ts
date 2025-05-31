import { getCreatedAt } from '../utils';
import type { BurnBlockDb, StacksBlockDb } from './schema';
import type { ApiBurnBlock, ApiStacksBlock } from 'slot-watch-common';

export function serializeBurnBlock(block: BurnBlockDb): ApiBurnBlock {
  const createdAt = getCreatedAt(block.id);
  return {
    ...block,
    createdAt: createdAt.toISOString(),
  };
}

export function serializeStacksBlock(block: StacksBlockDb): ApiStacksBlock {
  const createdAt = getCreatedAt(block.id);
  return {
    ...block,
    burnBlockTimestamp: block.burnBlockTimestamp.toISOString(),
    blockTimestamp: (block.blockTimestamp ?? new Date()).toISOString(),
    processedAt: createdAt.toISOString(),
    consensusHash: block.consensusHash ?? '',
    indexBlockHash: block.indexBlockHash ?? '',
  };
}
