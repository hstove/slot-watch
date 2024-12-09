import type { BurnBlockDb, StacksBlockDb } from './schema';

export function serializeBurnBlock(block: BurnBlockDb) {
  return {
    ...block,
    createdAt: block.createdAt.toISOString(),
  };
}

export function serializeStacksBlock(block: StacksBlockDb) {
  return {
    ...block,
    createdAt: block.createdAt.toISOString(),
    burnBlockTimestamp: block.burnBlockTimestamp.toISOString(),
    blockTimestamp: block.blockTimestamp?.toISOString() ?? null,
  };
}
