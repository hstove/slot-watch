import type { ChunkType } from './codec';
import type {
  CoreNodeBlockMessage,
  CoreNodeBurnBlockMessage,
} from './event-stream-types';
import type { Prettify } from './utils';
export type { ModifiedSlot, StackerDBPayload } from './event-stream-types';
import { z } from 'zod';

export const CHUNKS_EVENT = 'chunks';
export const MANY_CHUNKS_EVENT = 'many_chunks';
export const BURN_BLOCKS_EVENT = 'burn_blocks';
export const NEW_BLOCK_EVENT = 'new_block';

export type ChunkEvent = {
  contractId: string;
  slotId: number;
  version: number;
  data: string;
  signature: string;
  createdAt: string;
};

export type ChunkEventParsed = ChunkEvent & {
  publicKey: string;
  // decoded: DecodedChunk | null;
  type: ChunkType;
  entity: string | null;
};

export const BlockResponseRejectCodes = [
  'Validation Failed',
  'The block was rejected due to connectivity issues with the signer.',
  'The block was proposed before and rejected by the signer.',
  'The block was rejected due to no sortition view.',
  'The block was rejected due to a mismatch with expected sortition view.',
  'The block was rejected due to a testing directive.',
] as const;

export const BlockResponseValidationCodes = [
  'Bad Block Hash',
  'Bad Transaction',
  'Invalid Block',
  'Chainstate Error',
  'Unknown Parent',
  'Non Canonical Tenure',
  'No Such Tenure',
] as const;

export type WSBase<Type extends string, T> = {
  networkKey: string;
  type: Type;
  receivedAt: string;
  payload: Prettify<T>;
};

const wsBaseSchema = z.object({
  networkKey: z.string(),
  receivedAt: z.string(),
});

// export type WSChunkEvent = WSBase<typeof CHUNKS_EVENT, ChunkEvent>;

export const chunkEventSchema = z.object({
  contractId: z.string(),
  slotId: z.number(),
  version: z.number(),
  data: z.string(),
  signature: z.string(),
  createdAt: z.string(),
});

export const wsChunkEventSchema = wsBaseSchema.extend({
  type: z.literal(CHUNKS_EVENT),
  payload: chunkEventSchema,
});

export type WSChunkEvent = z.infer<typeof wsChunkEventSchema>;

export type WSNewBlock = WSBase<typeof NEW_BLOCK_EVENT, CoreNodeBlockMessage>;

export type WSBurnBlock = WSBase<
  typeof BURN_BLOCKS_EVENT,
  CoreNodeBurnBlockMessage
>;

export type WSManyChunks = WSBase<typeof MANY_CHUNKS_EVENT, ChunkEvent[]>;

export type WSPayload = WSChunkEvent | WSNewBlock | WSBurnBlock | WSManyChunks;

export function getChunkId(chunk: ChunkEvent): string {
  return `${chunk.slotId}-${chunk.version}-${chunk.contractId}-${chunk.signature}`;
}

export function getPayloadId(payload: WSPayload): string {
  if (payload.type === CHUNKS_EVENT) {
    return getChunkId(payload.payload);
  }
  if (payload.type === MANY_CHUNKS_EVENT) {
    const contractId = payload.payload[0].contractId ?? 'unknown';
    const [addr, name] = contractId.split('.');
    return `${payload.networkKey}-${payload.type}-${addr.slice(0, 4)}...${name}-${payload.receivedAt}`;
  }
  return `${payload.networkKey}-${payload.type}-${payload.receivedAt}`;
}
