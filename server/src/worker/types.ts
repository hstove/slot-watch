import type {
  BURN_BLOCKS_EVENT,
  StackerDBPayload,
  ChunkEvent,
  WSNewBlock,
  CoreNodeBlockMessage,
  NEW_BLOCK_EVENT,
  CoreNodeBurnBlockMessage,
  WSBurnBlock,
  MANY_CHUNKS_EVENT,
  WSManyChunks,
  WSPayload,
  CHUNKS_EVENT,
} from 'slot-watch-common';
import type { StacksBlockDb } from '../db/schema';

export const QUEUE_NAME = 'worker';

export type WorkerJobBase<Type extends string, Payload> = {
  receivedAt: string;
  networkKey: string;
  type: Type;
  payload: Payload;
};

export type StackerDbChunkJob = WorkerJobBase<
  typeof MANY_CHUNKS_EVENT,
  StackerDBPayload
>;

export type BurnBlockJob = WorkerJobBase<
  typeof BURN_BLOCKS_EVENT,
  CoreNodeBurnBlockMessage
>;

export type NewBlockJob = WorkerJobBase<
  typeof NEW_BLOCK_EVENT,
  {
    networkKey: string;
    receivedAt: string;
    blockTimestamp: string | null;
    burnBlockTimestamp: string | null;
  } & Omit<
    StacksBlockDb,
    'id' | 'networkKey' | 'blockTimestamp' | 'burnBlockTimestamp'
  >
>;

export type WorkerJob = StackerDbChunkJob | BurnBlockJob | NewBlockJob;
