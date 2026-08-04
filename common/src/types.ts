import type { ChunkType } from './codec';
import type {
  CoreNodeBlockMessage,
  CoreNodeBurnBlockMessage,
} from './event-stream-types';
import type {
  ApiBlockProposal,
  ApiBurnBlock,
  ApiStacksBlock,
  ApiStateMachineUpdate,
  BlockResponseApi,
  MiniBlockPreCommitApi,
  MiniBlockResponseApi,
} from './server-types';
import type { Prettify } from './utils';
export type { ModifiedSlot, StackerDBPayload } from './event-stream-types';
import { z } from 'zod';

export const CHUNKS_EVENT = 'chunks';
export const MANY_CHUNKS_EVENT = 'many_chunks';
export const BURN_BLOCKS_EVENT = 'burn_blocks';
export const NEW_BLOCK_EVENT = 'new_block';
export const BLOCK_RESPONSE_EVENT = 'block_response';
export const NEW_BLOCK_V2_EVENT = 'new_block_v2';
export const BURN_BLOCK_V2_EVENT = 'burn_block_v2';
export const BLOCK_PROPOSAL_EVENT = 'block_proposal';
export const STATE_MACHINE_UPDATE_EVENT = 'state_machine_update';
export const MINI_BLOCK_RESPONSES_EVENT = 'mini_block_responses';
export const BLOCK_PRE_COMMITS_EVENT = 'block_pre_commits';

// biome-ignore lint/style/useConsistentTypeDefinitions: ignored using `--suppress`
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

export const BlockResponseRejectReasons = {
  /// The block was rejected due to validation issues
  0: {
    label: 'ValidationFailed',
    description: 'The block was rejected due to validation issues',
  },
  /// The block was rejected due to connectivity issues with the signer
  1: {
    label: 'ConnectivityIssues',
    description:
      'The block was rejected due to connectivity issues with the signer',
  },
  /// The block was rejected in a prior round
  2: {
    label: 'RejectedInPriorRound',
    description: 'The block was rejected in a prior round',
  },
  /// The block was rejected due to no sortition view
  3: {
    label: 'NoSortitionView',
    description: 'The block was rejected due to no sortition view',
  },
  /// The block was rejected due to a mismatch with expected sortition view
  4: {
    label: 'SortitionViewMismatch',
    description:
      'The block was rejected due to a mismatch with expected sortition view',
  },
  /// The block was rejected due to a testing directive
  5: {
    label: 'TestingDirective',
    description: 'The block was rejected due to a testing directive',
  },
  /// The block attempted to reorg the previous tenure but was not allowed
  6: {
    label: 'ReorgNotAllowed',
    description:
      'The block attempted to reorg the previous tenure but was not allowed',
  },
  /// The bitvec field does not match what is expected
  7: {
    label: 'InvalidBitvec',
    description: 'The bitvec field does not match what is expected',
  },
  /// The miner's pubkey hash does not match the winning pubkey hash
  8: {
    label: 'PubkeyHashMismatch',
    description:
      "The miner's pubkey hash does not match the winning pubkey hash",
  },
  /// The miner has been marked as invalid
  9: {
    label: 'InvalidMiner',
    description: 'The miner has been marked as invalid',
  },
  /// Miner is last sortition winner, when the current sortition winner is
  /// still valid
  10: { label: 'NotLatestSortitionWinner', description: 'still valid' },
  /// The block does not confirm the expected parent block
  11: {
    label: 'InvalidParentBlock',
    description: 'The block does not confirm the expected parent block',
  },
  /// The block contains a block found tenure change, but we've already seen
  /// a block found
  12: {
    label: 'DuplicateBlockFound',
    description:
      'The block contains a block found tenure change, but we have already seen a block found',
  },
  /// The block attempted a tenure extend but the burn view has not changed
  /// and not enough time has passed for a time-based tenure extend
  13: {
    label: 'InvalidTenureExtend',
    description:
      'The block attempted a tenure extend but the burn view has not changed and not enough time has passed for a time-based tenure extend',
  },
  /// Unknown reject code, for forward compatibility
  254: {
    label: 'Unknown',
    description: 'Unknown reject code, for forward compatibility',
  },
  /// The block was approved, no rejection details needed
  255: {
    label: 'NotRejected',
    description: 'The block was approved, no rejection details needed',
  },
} as const;

export type RejectReasonPrefix = keyof typeof BlockResponseRejectReasons;

// biome-ignore lint/style/useConsistentTypeDefinitions: ignored using `--suppress`
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

export type WSBlockResponse = WSBase<
  typeof BLOCK_RESPONSE_EVENT,
  BlockResponseApi
>;

export type WSNewBlockV2 = WSBase<typeof NEW_BLOCK_V2_EVENT, ApiStacksBlock>;

export type WSBurnBlockV2 = WSBase<typeof BURN_BLOCK_V2_EVENT, ApiBurnBlock>;

export type WSBlockProposal = WSBase<
  typeof BLOCK_PROPOSAL_EVENT,
  ApiBlockProposal
>;

export type WSStateMachineUpdate = WSBase<
  typeof STATE_MACHINE_UPDATE_EVENT,
  ApiStateMachineUpdate
>;

export type WSMiniBlockResponses = WSBase<
  typeof MINI_BLOCK_RESPONSES_EVENT,
  MiniBlockResponseApi[]
>;

export type WSBlockPreCommits = WSBase<
  typeof BLOCK_PRE_COMMITS_EVENT,
  MiniBlockPreCommitApi[]
>;

export type WSPayload =
  // | WSChunkEvent
  // | WSNewBlock
  // | WSBurnBlock
  // | WSManyChunks
  | WSBlockProposal
  // | WSBlockResponse
  | WSNewBlockV2
  | WSBurnBlockV2
  | WSStateMachineUpdate
  | WSMiniBlockResponses
  | WSBlockPreCommits;

export function getChunkId(chunk: ChunkEvent): string {
  return `${chunk.slotId}-${chunk.version}-${chunk.contractId}-${chunk.signature}`;
}
