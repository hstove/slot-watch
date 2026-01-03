import { Schema } from 'effect';
import type { StateMachineUpdateMinerStateInactive } from './codec/state-machine';

// RecentSigner schema
export const RecentSignerSchema = Schema.Struct({
  publicKey: Schema.String,
  createdAt: Schema.NullOr(Schema.String),
  data: Schema.NullOr(Schema.String),
  weight: Schema.Number,
  slotId: Schema.Number,
  versionShort: Schema.String,
  version: Schema.String,
  weightPercent: Schema.Number,
  weightPercentStr: Schema.String,
  name: Schema.NullOr(Schema.String),
  degradation10: Schema.Number,
  degradation25: Schema.Number,
  degradation50: Schema.Number,
  blockHeight: Schema.optional(Schema.Number),
});
export interface RecentSigner
  extends Schema.Schema.Type<typeof RecentSignerSchema> {}

// RecentSignersResponse schema
export const RecentSignersResponseSchema = Schema.Struct({
  networkKey: Schema.String,
  rewardCycle: Schema.Number,
  totalWeight: Schema.Number,
  signers: Schema.mutable(Schema.Array(RecentSignerSchema)),
});
export interface RecentSignersResponse
  extends Schema.Schema.Type<typeof RecentSignersResponseSchema> {}

// TimelineChunk schema - others field requires special handling
const TimelineChunkOtherSchema = Schema.Struct({
  createdAt: Schema.String,
  diffSeconds: Schema.Number,
});

export const TimelineChunkSchema = Schema.Struct({
  slotId: Schema.Number,
  version: Schema.Number,
  contractId: Schema.String,
  signature: Schema.String,
  data: Schema.String,
  createdAt: Schema.String,
  publicKey: Schema.NullOr(Schema.String),
  entity: Schema.NullOr(Schema.String),
  others: Schema.Record({
    key: Schema.String,
    value: Schema.NullOr(TimelineChunkOtherSchema),
  }),
});
export interface TimelineChunk
  extends Schema.Schema.Type<typeof TimelineChunkSchema> {}

// TimelineResponse schema
export const TimelineResponseSchema = Schema.Struct({
  chunks: Schema.mutable(Schema.Array(TimelineChunkSchema)),
});
export interface TimelineResponse
  extends Schema.Schema.Type<typeof TimelineResponseSchema> {}

// Pagination schema - coerces number from string query params
export const PaginationSchema = Schema.Struct({
  offset: Schema.optional(Schema.NumberFromString),
});
export interface Pagination
  extends Schema.Schema.Type<typeof PaginationSchema> {}

// BlockResponseApi schema
export const BlockResponseApiSchema = Schema.Struct({
  signerSignatureHash: Schema.String,
  slotId: Schema.Number,
  createdAt: Schema.String,
  networkKey: Schema.String,
  chunkId: Schema.NullOr(Schema.String),
  signerPublicKey: Schema.String,
  accepted: Schema.Boolean,
  tenureExtendTimestamp: Schema.NullOr(Schema.String),
  version: Schema.optional(Schema.String),
  rejectCode: Schema.optional(Schema.Number),
  validationCode: Schema.optional(Schema.Number),
  reason: Schema.optional(Schema.String),
  rejectReason: Schema.optional(Schema.Number),
  latencyMs: Schema.optional(Schema.Number),
  id: Schema.String,
  blockHeight: Schema.optional(Schema.Number),
});
export interface BlockResponseApi
  extends Schema.Schema.Type<typeof BlockResponseApiSchema> {}

// MiniBlockResponseApi schema
export const MiniBlockResponseApiSchema = Schema.Struct({
  signerSignatureHash: Schema.String,
  signerPublicKey: Schema.String,
  accepted: Schema.Boolean,
  tenureExtendTimestamp: Schema.NullOr(Schema.String),
  blockHeight: Schema.optional(Schema.Number),
});
export interface MiniBlockResponseApi
  extends Schema.Schema.Type<typeof MiniBlockResponseApiSchema> {}

// ApiBurnBlock schema
export const ApiBurnBlockSchema = Schema.Struct({
  networkKey: Schema.String,
  burnBlockHeight: Schema.Number,
  burnBlockHash: Schema.String,
  createdAt: Schema.String,
  consensusHash: Schema.String,
});
export interface ApiBurnBlock
  extends Schema.Schema.Type<typeof ApiBurnBlockSchema> {}

// ApiStacksBlock schema
export const ApiStacksBlockSchema = Schema.Struct({
  blockTimestamp: Schema.String,
  blockHash: Schema.String,
  blockHeight: Schema.Number,
  tenureChangeCause: Schema.NullOr(Schema.Number),
  txCount: Schema.Number,
  burnBlockHeight: Schema.Number,
  networkKey: Schema.String,
  processedAt: Schema.String,
  burnBlockHash: Schema.String,
  readCount: Schema.Number,
  readLength: Schema.Number,
  runtime: Schema.Number,
  writeCount: Schema.Number,
  writeLength: Schema.Number,
  indexBlockHash: Schema.String,
  burnBlockTimestamp: Schema.String,
  consensusHash: Schema.String,
  txFees: Schema.Number,
});
export interface ApiStacksBlock
  extends Schema.Schema.Type<typeof ApiStacksBlockSchema> {}

// ApiBlockProposal schema
export const ApiBlockProposalSchema = Schema.Struct({
  signerSignatureHash: Schema.String,
  chainLength: Schema.Number,
  createdAt: Schema.String,
  networkKey: Schema.String,
  chunkId: Schema.NullOr(Schema.String),
  minerPublicKey: Schema.String,
  consensusHash: Schema.String,
  tenureChangeCause: Schema.NullOr(Schema.Number),
  txCount: Schema.Number,
  burnBlockHeight: Schema.Number,
  serverVersion: Schema.NullOr(Schema.String),
  blockTimestamp: Schema.String,
  serverVersionShort: Schema.NullOr(Schema.String),
  txFees: Schema.Number,
});
export interface ApiBlockProposal
  extends Schema.Schema.Type<typeof ApiBlockProposalSchema> {}

// ApiStateMachineMinerState - union type
const StateMachineUpdateMinerStateInactiveSchema = Schema.Struct({
  variant: Schema.Literal(0),
});

const StateMachineUpdateMinerStateActiveSchema = Schema.Struct({
  variant: Schema.Literal(1),
  tenureId: Schema.String,
  parentTenureId: Schema.String,
  parentTenureLastBlock: Schema.String,
  parentTenureLastBlockHeight: Schema.Number,
  currentMinerPkh: Schema.String,
});

export const ApiStateMachineMinerStateSchema = Schema.Union(
  StateMachineUpdateMinerStateInactiveSchema,
  StateMachineUpdateMinerStateActiveSchema
);
export type ApiStateMachineMinerState =
  | StateMachineUpdateMinerStateInactive
  | {
      variant: 1;
      tenureId: string;
      parentTenureId: string;
      parentTenureLastBlock: string;
      parentTenureLastBlockHeight: number;
      currentMinerPkh: string;
    };

// ApiStateMachineUpdate schema
export const ApiStateMachineUpdateSchema = Schema.Struct({
  burnBlock: Schema.String,
  burnBlockHeight: Schema.Number,
  minerState: ApiStateMachineMinerStateSchema,
  activeSignerProtocolVersion: Schema.Number,
  localSignerProtocolVersion: Schema.Number,
  signerPublicKey: Schema.String,
  networkKey: Schema.String,
  chunkId: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  replayTxs: Schema.NullOr(Schema.mutable(Schema.Array(Schema.String))),
});
export interface ApiStateMachineUpdate
  extends Schema.Schema.Type<typeof ApiStateMachineUpdateSchema> {}

// SignerLatency schema
export const SignerLatencySchema = Schema.Struct({
  signerSignatureHash: Schema.String,
  latencyMs: Schema.Number,
}).annotations({ identifier: 'SignerLatency' });
export interface SignerLatency
  extends Schema.Schema.Type<typeof SignerLatencySchema> {}

// SignerLatenciesResponse schema
export const SignerLatenciesResponseSchema = Schema.Struct({
  latencies: Schema.mutable(Schema.Array(SignerLatencySchema)),
}).annotations({ identifier: 'SignerLatenciesResponse' });
export interface SignerLatenciesResponse
  extends Schema.Schema.Type<typeof SignerLatenciesResponseSchema> {}

// PoxInfo schema
export const PoxInfoSchema = Schema.Struct({
  firstBurnchainBlockHeight: Schema.Number,
  rewardCycleLength: Schema.Number,
  rewardCycleId: Schema.Number,
}).annotations({ identifier: 'PoxInfo' });
export interface PoxInfo extends Schema.Schema.Type<typeof PoxInfoSchema> {}

// StackerSetSigner schema
export const StackerSetSignerSchema = Schema.Struct({
  signing_key: Schema.String,
  weight: Schema.Number,
  stacked_amt: Schema.String,
  publicKey: Schema.String,
  weightPercent: Schema.Number,
  weightPercentStr: Schema.String,
  name: Schema.NullOr(Schema.String),
  label: Schema.String,
}).annotations({ identifier: 'StackerSetSigner' });
export interface ApiStackerSetSigner
  extends Schema.Schema.Type<typeof StackerSetSignerSchema> {}

// SignersResponse schema
export const SignersResponseSchema = Schema.extend(
  PoxInfoSchema,
  Schema.Struct({
    signers: Schema.mutable(Schema.Array(StackerSetSignerSchema)),
    totalWeight: Schema.Number,
  })
).annotations({ identifier: 'SignersResponse' });
export interface SignersResponse
  extends Schema.Schema.Type<typeof SignersResponseSchema> {}

// StxCommittedItem schema
export const StxCommittedItemSchema = Schema.Struct({
  signer: Schema.String,
  stx: Schema.String,
}).annotations({ identifier: 'StxCommittedItem' });

// StackedNextCycleResponse schema
export const StackedNextCycleResponseSchema = Schema.Struct({
  stxCommitted: Schema.mutable(Schema.Array(StxCommittedItemSchema)),
}).annotations({ identifier: 'StackedNextCycleResponse' });
export interface StackedNextCycleResponse
  extends Schema.Schema.Type<typeof StackedNextCycleResponseSchema> {}

// API Response schemas for OpenAPI documentation
export const BurnBlocksResponseSchema = Schema.Struct({
  burnBlocks: Schema.mutable(Schema.Array(ApiBurnBlockSchema)),
}).annotations({ identifier: 'BurnBlocksResponse' });
export interface BurnBlocksResponse
  extends Schema.Schema.Type<typeof BurnBlocksResponseSchema> {}

export const TenureChangesResponseSchema = Schema.Struct({
  tenureChanges: Schema.mutable(Schema.Array(ApiStacksBlockSchema)),
}).annotations({ identifier: 'TenureChangesResponse' });
export interface TenureChangesResponse
  extends Schema.Schema.Type<typeof TenureChangesResponseSchema> {}

export const BlockResponsesResponseSchema = Schema.Struct({
  responses: Schema.mutable(Schema.Array(BlockResponseApiSchema)),
}).annotations({ identifier: 'BlockResponsesResponse' });
export interface BlockResponsesResponse
  extends Schema.Schema.Type<typeof BlockResponsesResponseSchema> {}

export const BlockProposalWithResponsesSchema = Schema.Struct({
  blockProposal: ApiBlockProposalSchema,
  responses: Schema.mutable(Schema.Array(BlockResponseApiSchema)),
}).annotations({ identifier: 'BlockProposalWithResponses' });
export interface BlockProposalWithResponses
  extends Schema.Schema.Type<typeof BlockProposalWithResponsesSchema> {}

export const StxBlockResponseSchema = Schema.Struct({
  stacksBlock: ApiStacksBlockSchema,
  proposal: ApiBlockProposalSchema,
}).annotations({ identifier: 'StxBlockResponse' });
export interface StxBlockResponse
  extends Schema.Schema.Type<typeof StxBlockResponseSchema> {}

// SignerDashboardItem schema for signers-dashboard response
export const SignerDashboardItemSchema = Schema.Struct({
  publicKey: Schema.String,
  weight: Schema.Number,
  weightPercent: Schema.Number,
  weightPercentStr: Schema.String,
  name: Schema.NullOr(Schema.String),
  stackedAmount: Schema.String,
  stackedAmountStx: Schema.Number,
  label: Schema.String,
}).annotations({ identifier: 'SignerDashboardItem' });
export interface SignerDashboardItem
  extends Schema.Schema.Type<typeof SignerDashboardItemSchema> {}

// SignersDashboardResponse schema
export const SignersDashboardResponseSchema = Schema.mutable(
  Schema.Array(SignerDashboardItemSchema)
).annotations({ identifier: 'SignersDashboardResponse' });
export interface SignersDashboardResponse
  extends Schema.Schema.Type<typeof SignersDashboardResponseSchema> {}

// StateMachinesResponse schema
export const StateMachinesResponseSchema = Schema.Struct({
  latestStateMachineUpdates: Schema.mutable(
    Schema.Array(ApiStateMachineUpdateSchema)
  ),
}).annotations({ identifier: 'StateMachinesResponse' });
export interface StateMachinesResponse
  extends Schema.Schema.Type<typeof StateMachinesResponseSchema> {}

// StateMachineUpdatesResponse schema (paginated)
export const StateMachineUpdatesResponseSchema = Schema.Struct({
  lastId: Schema.optional(Schema.String),
  next: Schema.String,
  stateMachines: Schema.mutable(Schema.Array(ApiStateMachineUpdateSchema)),
}).annotations({ identifier: 'StateMachineUpdatesResponse' });
export interface StateMachineUpdatesResponse
  extends Schema.Schema.Type<typeof StateMachineUpdatesResponseSchema> {}

// MinerSummary schema (for list view)
export const MinerSummarySchema = Schema.Struct({
  publicKey: Schema.String,
  count: Schema.Number,
  latestBlock: Schema.Number,
  version: Schema.String,
}).annotations({ identifier: 'MinerSummary' });
export interface MinerSummary
  extends Schema.Schema.Type<typeof MinerSummarySchema> {}

// MinersResponse schema
export const MinersResponseSchema = Schema.Struct({
  minerStats: Schema.Struct({
    miners: Schema.mutable(Schema.Array(MinerSummarySchema)),
  }),
}).annotations({ identifier: 'MinersResponse' });
export interface MinersResponse
  extends Schema.Schema.Type<typeof MinersResponseSchema> {}

// BurnBlockBlocksResponse schema (blocks in a burn block/tenure)
export const BurnBlockBlocksResponseSchema = Schema.Struct({
  blocks: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        proposal: ApiBlockProposalSchema,
        stacksBlock: Schema.NullOr(ApiStacksBlockSchema),
      })
    )
  ),
}).annotations({ identifier: 'BurnBlockBlocksResponse' });
export interface BurnBlockBlocksResponse
  extends Schema.Schema.Type<typeof BurnBlockBlocksResponseSchema> {}

// Single burn block response
export const BurnBlockResponseSchema = Schema.Struct({
  btcBlock: Schema.NullOr(ApiBurnBlockSchema),
}).annotations({ identifier: 'BurnBlockResponse' });
export interface BurnBlockResponse
  extends Schema.Schema.Type<typeof BurnBlockResponseSchema> {}

// Miner version history entry
export const MinerVersionHistorySchema = Schema.Struct({
  version: Schema.String,
  versionShort: Schema.NullOr(Schema.String),
  firstSeen: Schema.String,
  lastSeen: Schema.String,
  blockCount: Schema.Number,
}).annotations({ identifier: 'MinerVersionHistory' });
export interface MinerVersionHistory
  extends Schema.Schema.Type<typeof MinerVersionHistorySchema> {}

// Miner recent block entry
export const MinerRecentBlockSchema = Schema.Struct({
  burnBlockHeight: Schema.Number,
  chainLength: Schema.Number,
  signerSignatureHash: Schema.String,
  blockTimestamp: Schema.String,
  serverVersion: Schema.NullOr(Schema.String),
  serverVersionShort: Schema.NullOr(Schema.String),
  txCount: Schema.Number,
}).annotations({ identifier: 'MinerRecentBlock' });
export interface MinerRecentBlock
  extends Schema.Schema.Type<typeof MinerRecentBlockSchema> {}

// Miner stats for different time windows
export const MinerWindowStatsSchema = Schema.Struct({
  blocksWon: Schema.Number,
  percentage: Schema.Number,
}).annotations({ identifier: 'MinerWindowStats' });
export interface MinerWindowStats
  extends Schema.Schema.Type<typeof MinerWindowStatsSchema> {}

// Full miner detail response
export const MinerDetailResponseSchema = Schema.Struct({
  miner: Schema.Struct({
    publicKey: Schema.String,
    stats: Schema.Struct({
      last500: MinerWindowStatsSchema,
      allTime: Schema.Struct({
        blocksWon: Schema.Number,
        firstSeen: Schema.NullOr(Schema.String),
      }),
    }),
    currentVersion: Schema.NullOr(Schema.String),
    currentVersionShort: Schema.NullOr(Schema.String),
    versionHistory: Schema.mutable(Schema.Array(MinerVersionHistorySchema)),
  }),
  recentBlocks: Schema.mutable(Schema.Array(MinerRecentBlockSchema)),
}).annotations({ identifier: 'MinerDetailResponse' });
export interface MinerDetailResponse
  extends Schema.Schema.Type<typeof MinerDetailResponseSchema> {}
