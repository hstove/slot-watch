import { z } from 'zod';
import type {
  StateMachineUpdate,
  StateMachineUpdateMinerStateInactive,
} from './codec/state-machine';
import type { SuperJSON } from './utils';

export type RecentSigner = {
  publicKey: string;
  createdAt: string | null;
  data: string | null;
  weight: number;
  slotId: number;
  versionShort: string;
  version: string;
  weightPercent: number;
  weightPercentStr: string;
  name: string | null;
  degradation10: number;
  degradation25: number;
  degradation50: number;
};

export type RecentSignersResponse = {
  networkKey: string;
  rewardCycle: number;
  totalWeight: number;
  signers: RecentSigner[];
};

export type TimelineChunk = {
  slotId: number;
  version: number;
  contractId: string;
  signature: string;
  data: string;
  createdAt: string;
  publicKey: string | null;
  entity: string | null;
  others: Record<
    string,
    null | {
      createdAt: string;
      diffSeconds: number;
    }
  >;
};

export type TimelineResponse = {
  chunks: TimelineChunk[];
};

export const paginationSchema = z.object({
  offset: z.coerce.number().optional(),
});

export const blockResponseApiSchema = z.object({
  signerSignatureHash: z.string(),
  slotId: z.number(),
  createdAt: z.string(),
  networkKey: z.string(),
  chunkId: z.string().nullable(),
  signerPublicKey: z.string(),
  accepted: z.boolean(),
  tenureExtendTimestamp: z.union([z.null(), z.string()]),
  version: z.string().optional(),
  rejectCode: z.number().optional(),
  validationCode: z.number().optional(),
  reason: z.string().optional(),
  rejectReason: z.number().optional(),
  latencyMs: z.number().optional(),
  id: z.string(),
  blockHeight: z.number().optional(),
});

export type BlockResponseApi = z.infer<typeof blockResponseApiSchema>;

export const miniBlockResponseApiSchema = z.object({
  signerSignatureHash: z.string(),
  signerPublicKey: z.string(),
  accepted: z.boolean(),
  tenureExtendTimestamp: z.union([z.null(), z.string()]),
});

export type MiniBlockResponseApi = z.infer<typeof miniBlockResponseApiSchema>;

export const apiBurnBlockSchema = z.object({
  // id: z.number(),
  networkKey: z.string(),
  burnBlockHeight: z.number(),
  burnBlockHash: z.string(),
  createdAt: z.string(),
  consensusHash: z.string(),
});

export type ApiBurnBlock = z.infer<typeof apiBurnBlockSchema>;

export const apiStacksBlockSchema = z.object({
  blockTimestamp: z.string(),
  blockHash: z.string(),
  blockHeight: z.number(),
  tenureChangeCause: z.number().nullable(),
  txCount: z.number(),
  burnBlockHeight: z.number(),
  networkKey: z.string(),
  processedAt: z.string(),
  burnBlockHash: z.string(),
  readCount: z.number(),
  readLength: z.number(),
  runtime: z.number(),
  writeCount: z.number(),
  writeLength: z.number(),
  indexBlockHash: z.string(),
  burnBlockTimestamp: z.string(),
  consensusHash: z.string(),
  txFees: z.number(),
});

export type ApiStacksBlock = z.infer<typeof apiStacksBlockSchema>;

export const apiBlockProposalSchema = z.object({
  signerSignatureHash: z.string(),
  chainLength: z.number(),
  createdAt: z.string(),
  networkKey: z.string(),
  chunkId: z.string().nullable(),
  minerPublicKey: z.string(),
  consensusHash: z.string(),
  tenureChangeCause: z.number().nullable(),
  txCount: z.number(),
  burnBlockHeight: z.number(),
  serverVersion: z.string().nullable(),
  blockTimestamp: z.string(),
  serverVersionShort: z.string().nullable(),
  txFees: z.number(),
});

export type ApiBlockProposal = z.infer<typeof apiBlockProposalSchema>;

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

export type ApiStateMachineUpdate = {
  burnBlock: string;
  burnBlockHeight: number;
  minerState: ApiStateMachineMinerState;
  activeSignerProtocolVersion: number;
  localSignerProtocolVersion: number;
  signerPublicKey: string;
  networkKey: string;
  chunkId: string | null;
  createdAt: string;
  replayTxs: string[] | null;
};
