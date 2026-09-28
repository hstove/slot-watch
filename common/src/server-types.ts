import { Schema } from 'effect';
import type { StateMachineUpdateMinerStateInactive } from './codec/state-machine';
import { NetworkKeySchema } from './networks';
import { MINER_ANIMAL_KEYS, MINER_COLOR_KEYS } from './miner-names';

/** Deterministic miner nickname, derived from the miner's public key. See `miner-names.ts`. */
const MinerIdentityFields = {
  minerLabel: Schema.NullOr(Schema.String),
  minerColor: Schema.NullOr(Schema.Literals(MINER_COLOR_KEYS)),
  minerAnimal: Schema.NullOr(Schema.Literals(MINER_ANIMAL_KEYS)),
};

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
  signerManager: Schema.NullOr(Schema.String),
  degradation10: Schema.Number,
  degradation25: Schema.Number,
  degradation50: Schema.Number,
  blockHeight: Schema.optional(Schema.Number),
});
export interface RecentSigner
  extends Schema.Schema.Type<typeof RecentSignerSchema> {}

// RecentSignersResponse schema
export const RecentSignersResponseSchema = Schema.Struct({
  networkKey: NetworkKeySchema,
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
  others: Schema.Record(Schema.String, Schema.NullOr(TimelineChunkOtherSchema)),
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
  networkKey: NetworkKeySchema,
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

// ApiBlockPreCommit schema
export const ApiBlockPreCommitSchema = Schema.Struct({
  id: Schema.String,
  createdAt: Schema.String,
  signerSignatureHash: Schema.String,
  signerPublicKey: Schema.String,
  slotId: Schema.Number,
  networkKey: NetworkKeySchema,
  latencyMs: Schema.optional(Schema.Number),
  blockHeight: Schema.optional(Schema.Number),
});
export interface ApiBlockPreCommit
  extends Schema.Schema.Type<typeof ApiBlockPreCommitSchema> {}

// MiniBlockPreCommitApi schema - slim payload for SSE
export const MiniBlockPreCommitApiSchema = Schema.Struct({
  signerSignatureHash: Schema.String,
  signerPublicKey: Schema.String,
  blockHeight: Schema.optional(Schema.Number),
});
export interface MiniBlockPreCommitApi
  extends Schema.Schema.Type<typeof MiniBlockPreCommitApiSchema> {}

// ApiBurnBlock schema
export const ApiBurnBlockSchema = Schema.Struct({
  networkKey: NetworkKeySchema,
  burnBlockHeight: Schema.Number,
  burnBlockHash: Schema.String,
  createdAt: Schema.String,
  consensusHash: Schema.String,
  /** Total miner PoX spend in satoshis. 0 for historical rows ingested before this field existed. */
  poxSpendSats: Schema.Number,
  /** Satoshis sent to the burn address by miners. 0 for historical rows ingested before this field existed. */
  burnAmountSats: Schema.Number,
  /** Bitcoin txid of the block commit that won this block's sortition; joins to miner spends. Null if none or unresolved. */
  winningTxid: Schema.NullOr(Schema.String),
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
  networkKey: NetworkKeySchema,
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
  networkKey: NetworkKeySchema,
  chunkId: Schema.NullOr(Schema.String),
  minerPublicKey: Schema.String,
  ...MinerIdentityFields,
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

export const ApiStateMachineMinerStateSchema = Schema.Union([
  StateMachineUpdateMinerStateInactiveSchema,
  StateMachineUpdateMinerStateActiveSchema,
]);
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
  networkKey: NetworkKeySchema,
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
}).annotate({ identifier: 'SignerLatency' });
export interface SignerLatency
  extends Schema.Schema.Type<typeof SignerLatencySchema> {}

// SignerLatenciesResponse schema
export const SignerLatenciesResponseSchema = Schema.Struct({
  latencies: Schema.mutable(Schema.Array(SignerLatencySchema)),
}).annotate({ identifier: 'SignerLatenciesResponse' });
export interface SignerLatenciesResponse
  extends Schema.Schema.Type<typeof SignerLatenciesResponseSchema> {}

// PoxInfo schema
export const PoxInfoSchema = Schema.Struct({
  firstBurnchainBlockHeight: Schema.Number,
  rewardCycleLength: Schema.Number,
  rewardCycleId: Schema.Number,
}).annotate({ identifier: 'PoxInfo' });
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
  signerManager: Schema.NullOr(Schema.String),
  label: Schema.String,
}).annotate({ identifier: 'StackerSetSigner' });
export interface ApiStackerSetSigner
  extends Schema.Schema.Type<typeof StackerSetSignerSchema> {}

// SignersResponse schema
export const SignersResponseSchema = PoxInfoSchema.pipe(
  Schema.fieldsAssign({
    signers: Schema.mutable(Schema.Array(StackerSetSignerSchema)),
    totalWeight: Schema.Number,
  })
).annotate({ identifier: 'SignersResponse' });
export interface SignersResponse
  extends Schema.Schema.Type<typeof SignersResponseSchema> {}

// StxCommittedItem schema
export const StxCommittedItemSchema = Schema.Struct({
  signer: Schema.String,
  stx: Schema.String,
}).annotate({ identifier: 'StxCommittedItem' });

// StackedNextCycleResponse schema
export const StackedNextCycleResponseSchema = Schema.Struct({
  stxCommitted: Schema.mutable(Schema.Array(StxCommittedItemSchema)),
}).annotate({ identifier: 'StackedNextCycleResponse' });
export interface StackedNextCycleResponse
  extends Schema.Schema.Type<typeof StackedNextCycleResponseSchema> {}

// API Response schemas for OpenAPI documentation
export const BurnBlocksResponseSchema = Schema.Struct({
  burnBlocks: Schema.mutable(Schema.Array(ApiBurnBlockSchema)),
}).annotate({ identifier: 'BurnBlocksResponse' });
export interface BurnBlocksResponse
  extends Schema.Schema.Type<typeof BurnBlocksResponseSchema> {}

export const TenureChangesResponseSchema = Schema.Struct({
  tenureChanges: Schema.mutable(Schema.Array(ApiStacksBlockSchema)),
}).annotate({ identifier: 'TenureChangesResponse' });
export interface TenureChangesResponse
  extends Schema.Schema.Type<typeof TenureChangesResponseSchema> {}

export const BlockResponsesResponseSchema = Schema.Struct({
  responses: Schema.mutable(Schema.Array(BlockResponseApiSchema)),
  preCommits: Schema.mutable(Schema.Array(ApiBlockPreCommitSchema)),
}).annotate({ identifier: 'BlockResponsesResponse' });
export interface BlockResponsesResponse
  extends Schema.Schema.Type<typeof BlockResponsesResponseSchema> {}

export const BlockProposalWithResponsesSchema = Schema.Struct({
  blockProposal: ApiBlockProposalSchema,
  responses: Schema.mutable(Schema.Array(BlockResponseApiSchema)),
}).annotate({ identifier: 'BlockProposalWithResponses' });
export interface BlockProposalWithResponses
  extends Schema.Schema.Type<typeof BlockProposalWithResponsesSchema> {}

export const StxBlockResponseSchema = Schema.Struct({
  stacksBlock: Schema.NullOr(ApiStacksBlockSchema),
  proposal: ApiBlockProposalSchema,
}).annotate({ identifier: 'StxBlockResponse' });
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
}).annotate({ identifier: 'SignerDashboardItem' });
export interface SignerDashboardItem
  extends Schema.Schema.Type<typeof SignerDashboardItemSchema> {}

// SignersDashboardResponse schema
export const SignersDashboardResponseSchema = Schema.mutable(
  Schema.Array(SignerDashboardItemSchema)
).annotate({ identifier: 'SignersDashboardResponse' });
export interface SignersDashboardResponse
  extends Schema.Schema.Type<typeof SignersDashboardResponseSchema> {}

// StateMachinesResponse schema
export const StateMachinesResponseSchema = Schema.Struct({
  latestStateMachineUpdates: Schema.mutable(
    Schema.Array(ApiStateMachineUpdateSchema)
  ),
}).annotate({ identifier: 'StateMachinesResponse' });
export interface StateMachinesResponse
  extends Schema.Schema.Type<typeof StateMachinesResponseSchema> {}

// StateMachineUpdatesResponse schema (paginated)
export const StateMachineUpdatesResponseSchema = Schema.Struct({
  lastId: Schema.optional(Schema.String),
  next: Schema.String,
  stateMachines: Schema.mutable(Schema.Array(ApiStateMachineUpdateSchema)),
}).annotate({ identifier: 'StateMachineUpdatesResponse' });
export interface StateMachineUpdatesResponse
  extends Schema.Schema.Type<typeof StateMachineUpdatesResponseSchema> {}

// MinerSummary schema (for list view)
export const MinerSummarySchema = Schema.Struct({
  publicKey: Schema.String,
  ...MinerIdentityFields,
  count: Schema.Number,
  latestBlock: Schema.Number,
  version: Schema.String,
}).annotate({ identifier: 'MinerSummary' });
export interface MinerSummary
  extends Schema.Schema.Type<typeof MinerSummarySchema> {}

// MinersResponse schema
export const MinersResponseSchema = Schema.Struct({
  minerStats: Schema.Struct({
    miners: Schema.mutable(Schema.Array(MinerSummarySchema)),
  }),
}).annotate({ identifier: 'MinersResponse' });
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
}).annotate({ identifier: 'BurnBlockBlocksResponse' });
export interface BurnBlockBlocksResponse
  extends Schema.Schema.Type<typeof BurnBlockBlocksResponseSchema> {}

// Single burn block response
export const BurnBlockResponseSchema = Schema.Struct({
  btcBlock: Schema.NullOr(ApiBurnBlockSchema),
}).annotate({ identifier: 'BurnBlockResponse' });
export interface BurnBlockResponse
  extends Schema.Schema.Type<typeof BurnBlockResponseSchema> {}

// Miner economics for a single burn block
export const MinerEconomicsBlockSchema = Schema.Struct({
  burnBlockHeight: Schema.Number,
  burnBlockHash: Schema.String,
  consensusHash: Schema.String,
  /** ISO timestamp derived from the uuidv7 row id. */
  observedAt: Schema.String,
  /** Stacks blocks joined on consensus hash. */
  stacksBlockCount: Schema.Number,
  /** Total miner PoX spend in satoshis. 0 for historical rows ingested before this field existed. */
  poxSpendSats: Schema.Number,
  /** Satoshis sent to the burn address by miners. 0 for historical rows ingested before this field existed. */
  burnAmountSats: Schema.Number,
  /** USD at the hourly open for the time Slot Watch observed this burn block.
   * Decimal strings preserve PostgreSQL numeric precision. Missing candles
   * and immature or absent revenue remain null. */
  valuation: Schema.Struct({
    source: Schema.String,
    hourStart: Schema.String,
    btcUsdOpen: Schema.NullOr(Schema.String),
    stxUsdOpen: Schema.NullOr(Schema.String),
    spendUsd: Schema.NullOr(Schema.String),
    revenueUsd: Schema.NullOr(Schema.String),
  }),
  /** Matured miner rewards earned by this burn block. Null when no reward rows exist. */
  revenue: Schema.NullOr(
    Schema.Struct({
      coinbaseUstx: Schema.Number,
      /** Anchored + streamed confirmed + streamed produced fees. */
      txFeesUstx: Schema.Number,
      recipients: Schema.Number,
    })
  ),
}).annotate({ identifier: 'MinerEconomicsBlock' });
export interface MinerEconomicsBlock
  extends Schema.Schema.Type<typeof MinerEconomicsBlockSchema> {}

export const MinerEconomicsResponseSchema = Schema.Struct({
  /** Highest burn height with any matured reward row. Blocks at or below this
   * height with a null revenue earned nothing; blocks above it are still maturing. */
  maturedThroughHeight: Schema.Number,
  blocks: Schema.mutable(Schema.Array(MinerEconomicsBlockSchema)),
}).annotate({ identifier: 'MinerEconomicsResponse' });
export interface MinerEconomicsResponse
  extends Schema.Schema.Type<typeof MinerEconomicsResponseSchema> {}

// Per-miner spend and revenue over a burn height range
export const MinerEconomicsMinerSchema = Schema.Struct({
  /** STX address derived from the miner's key. Null groups commits whose sender is unresolved. */
  minerAddress: Schema.NullOr(Schema.String),
  minerPublicKey: Schema.NullOr(Schema.String),
  ...MinerIdentityFields,
  /** Block commits mined in the range. */
  commits: Schema.Number,
  /** Commits that won their sortition (matched to a Stacks block's miner txid). */
  wins: Schema.Number,
  /** Satoshis paid to PoX recipients across all commits. */
  spendSats: Schema.Number,
  /** Satoshis sent to the burn address across all commits (burn-only commits happen when no reward set is active). Total BTC spend is spendSats + burnSats. */
  burnSats: Schema.Number,
  /** Matured rewards earned by tenures in the range, in micro-STX. */
  coinbaseUstx: Schema.Number,
  txFeesUstx: Schema.Number,
  rewardRows: Schema.Number,
  /** Sum of each commit's spend valued at its burn block's observed hour.
   * Null if any commit lacks a matching block or BTC candle. */
  spendUsd: Schema.NullOr(Schema.String),
  /** Sum of each matured reward valued at its earning block's observed hour.
   * Null if any reward lacks an earning block or STX candle, or no rewards exist. */
  revenueUsd: Schema.NullOr(Schema.String),
  /** Subtotal for rows with a known hourly price, even if coverage is incomplete. */
  pricedSpendUsd: Schema.NullOr(Schema.String),
  pricedRevenueUsd: Schema.NullOr(Schema.String),
  spendPriceMissing: Schema.Number,
  revenuePriceMissing: Schema.Number,
}).annotate({ identifier: 'MinerEconomicsMiner' });
export interface MinerEconomicsMiner
  extends Schema.Schema.Type<typeof MinerEconomicsMinerSchema> {}

export const MinerEconomicsMinersResponseSchema = Schema.Struct({
  fromHeight: Schema.Number,
  toHeight: Schema.Number,
  maturedThroughHeight: Schema.Number,
  miners: Schema.mutable(Schema.Array(MinerEconomicsMinerSchema)),
}).annotate({ identifier: 'MinerEconomicsMinersResponse' });
export interface MinerEconomicsMinersResponse
  extends Schema.Schema.Type<typeof MinerEconomicsMinersResponseSchema> {}

// Per-burn-block commits for a height range
export const MinerCommitSchema = Schema.Struct({
  txid: Schema.String,
  /** Null while the Bitcoin sender is unresolved. */
  minerAddress: Schema.NullOr(Schema.String),
  minerPublicKey: Schema.NullOr(Schema.String),
  ...MinerIdentityFields,
  /** Bitcoin address the commit's first input spent from. Null if unresolved. */
  btcAddress: Schema.NullOr(Schema.String),
  spendSats: Schema.Number,
  burnSats: Schema.Number,
  /** Index of the commit tx within its Bitcoin block. 0 if unresolved. */
  vtxindex: Schema.Number,
}).annotate({ identifier: 'MinerCommit' });
export interface MinerCommit
  extends Schema.Schema.Type<typeof MinerCommitSchema> {}

export const MinerCommitsBlockSchema = Schema.Struct({
  burnBlockHeight: Schema.Number,
  burnBlockHash: Schema.String,
  consensusHash: Schema.String,
  /** Commit txid that won the sortition. Null if none or not yet resolved. */
  winningTxid: Schema.NullOr(Schema.String),
  commits: Schema.mutable(Schema.Array(MinerCommitSchema)),
}).annotate({ identifier: 'MinerCommitsBlock' });
export interface MinerCommitsBlock
  extends Schema.Schema.Type<typeof MinerCommitsBlockSchema> {}

export const MinerCommitsResponseSchema = Schema.Struct({
  fromHeight: Schema.Number,
  toHeight: Schema.Number,
  blocks: Schema.mutable(Schema.Array(MinerCommitsBlockSchema)),
}).annotate({ identifier: 'MinerCommitsResponse' });
export interface MinerCommitsResponse
  extends Schema.Schema.Type<typeof MinerCommitsResponseSchema> {}

// Miner version history entry
export const MinerVersionHistorySchema = Schema.Struct({
  version: Schema.String,
  versionShort: Schema.NullOr(Schema.String),
  firstSeen: Schema.String,
  lastSeen: Schema.String,
  tenureCount: Schema.Number,
}).annotate({ identifier: 'MinerVersionHistory' });
export interface MinerVersionHistory
  extends Schema.Schema.Type<typeof MinerVersionHistorySchema> {}

// Miner stats for different time windows
export const MinerWindowStatsSchema = Schema.Struct({
  tenuresWon: Schema.Number,
  percentage: Schema.Number,
}).annotate({ identifier: 'MinerWindowStats' });
export interface MinerWindowStats
  extends Schema.Schema.Type<typeof MinerWindowStatsSchema> {}

// Full miner detail response
export const MinerDetailResponseSchema = Schema.Struct({
  miner: Schema.Struct({
    publicKey: Schema.String,
    ...MinerIdentityFields,
    /** Address of the miner's latest block commit input. */
    btcAddress: Schema.NullOr(Schema.String),
    stats: Schema.Struct({
      last500: MinerWindowStatsSchema,
    }),
    currentVersion: Schema.NullOr(Schema.String),
    currentVersionShort: Schema.NullOr(Schema.String),
    versionHistory: Schema.mutable(Schema.Array(MinerVersionHistorySchema)),
  }),
}).annotate({ identifier: 'MinerDetailResponse' });
export interface MinerDetailResponse
  extends Schema.Schema.Type<typeof MinerDetailResponseSchema> {}
