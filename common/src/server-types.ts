import { z } from 'zod';

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
  chunkId: z.number(),
  signerPublicKey: z.string(),
  accepted: z.boolean(),
  tenureExtendTimestamp: z.union([z.null(), z.string()]),
  version: z.string().optional(),
  rejectCode: z.number().optional(),
  validationCode: z.number().optional(),
  reason: z.string().optional(),
});

export type BlockResponseApi = z.infer<typeof blockResponseApiSchema>;
