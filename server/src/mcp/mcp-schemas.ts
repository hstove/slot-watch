import { z } from 'zod';

const minerStateSchema = z.union([
  z.object({ status: z.literal('none') }),
  z.object({
    currentMinerPkh: z.string(),
    tenureId: z.string(),
    parentTenureId: z.string(),
    parentTenureLastBlockHeight: z.number(),
  }),
]);

const bitcoinBlockFieldsSchema = z.object({
  bitcoinBlockHeight: z.number(),
  bitcoinBlockHash: z.string(),
  bitcoinBlockTimestamp: z.string(),
});

const bitcoinBlockNullableFieldsSchema = z.object({
  bitcoinBlockHeight: z.number(),
  bitcoinBlockHash: z.string().nullable(),
  bitcoinBlockTimestamp: z.string().nullable(),
});

const bitcoinBlockHeightSchema = z.object({
  bitcoinBlockHeight: z.number(),
});

const bitcoinBlockOptionalFieldsSchema = z.object({
  bitcoinBlockHeight: z.number(),
  bitcoinBlockHash: z.string().nullable().optional(),
  bitcoinBlockTimestamp: z.string().nullable().optional(),
});

const observedAgeSchema = z.object({
  observedAt: z.string(),
  ageSeconds: z.number(),
});

export const getStacksBlockOutputSchema = z.object({
  block: z
    .object({
      blockHash: z.string(),
      blockHeight: z.number(),
      consensusHash: z.string(),
      blockTimestamp: z.string(),
      observedAt: z.string(),
      minerPublicKey: z.string(),
      tenureChangeCause: z.number().nullable(),
      indexBlockHash: z.string().nullable().optional(),
      processedAt: z.string().optional(),
      minerVersion: z.string().nullable(),
    })
    .merge(bitcoinBlockOptionalFieldsSchema),
  responses: z.object({
    accepted: z.boolean().nullable(),
    countAccepted: z.number(),
    countRejected: z.number(),
    signers: z.array(
      z.object({
        signerPublicKey: z.string(),
        weightPercent: z.string(),
        name: z.string(),
        accepted: z.boolean().nullable(),
        version: z.string(),
        latencyMs: z.number().nullable().optional(),
        preCommittedAt: z
          .string()
          .nullable()
          .optional()
          .describe(
            'When this signer broadcast its BlockPreCommit. Null means no explicit pre-commit was seen, which usually indicates an older signer binary rather than a problem.'
          ),
        preCommitLatencyMs: z
          .number()
          .nullable()
          .optional()
          .describe(
            'Time from the BlockProposal to this signer pre-committing'
          ),
        rejectCode: z.number().nullable().optional(),
        validationCode: z.number().nullable().optional(),
        reason: z.string().nullable().optional(),
        reasonDescription: z.string().nullable().optional(),
        reasonLabel: z.string().nullable().optional(),
        rejectReason: z.number().nullable().optional(),
      })
    ),
    rejectRatio: z.number(),
    acceptRatio: z.number(),
  }),
  preCommits: z
    .object({
      countPreCommitted: z
        .number()
        .describe('Signers that broadcast an explicit BlockPreCommit'),
      weightPreCommitted: z
        .number()
        .describe('Stake weight that explicitly pre-committed'),
      preCommitRatio: z
        .number()
        .describe('weightPreCommitted as a fraction of total stake weight'),
      thresholdReached: z
        .boolean()
        .describe(
          'Whether explicit pre-commits reached the 70% weight bar that lets signers proceed to signing. May be false on a healthy block if enough weight runs pre-commit-less binaries, since an acceptance counts as an implicit pre-commit.'
        ),
    })
    .describe(
      'Phase one of the two-phase signer commit. Never the accept/reject verdict — see `responses` for that.'
    ),
});

export const getRecentStacksBlocksOutputSchema = z.object({
  limit: z.number(),
  proposals: z.array(
    z
      .object({
        blockHash: z.string(),
        indexBlockHash: z.string(),
        consensusHash: z.string(),
        blockHeight: z.number(),
        blockTimestamp: z.string(),
        observedAt: z.string(),
        minerPublicKey: z.string(),
        serverVersionShort: z.string().nullable(),
        accepted: z.boolean(),
        stacksBlockHash: z.string().nullable(),
        stacksBlockHeight: z.number().nullable(),
        processedAt: z.string().nullable(),
      })
      .merge(bitcoinBlockNullableFieldsSchema)
  ),
});

export const getRecentBitcoinBlocksOutputSchema = z.object({
  limit: z.number(),
  blocks: z.array(
    z.object({
      bitcoinBlockHash: z.string(),
      bitcoinBlockHeight: z.number(),
      consensusHash: z.string(),
      stacksBlockCount: z.number(),
      observedAt: z.string(),
    })
  ),
});

const ingestionStacksBlockSchema = z
  .object({
    blockHash: z.string(),
    indexBlockHash: z.string(),
    blockHeight: z.number(),
    consensusHash: z.string(),
    blockTimestamp: z.string(),
  })
  .merge(bitcoinBlockFieldsSchema)
  .merge(observedAgeSchema);

const ingestionBlockProposalSchema = z
  .object({
    blockHash: z.string(),
    indexBlockHash: z.string(),
    blockHeight: z.number(),
    consensusHash: z.string(),
    blockTimestamp: z.string(),
    minerPublicKey: z.string(),
    serverVersionShort: z.string().nullable(),
  })
  .merge(bitcoinBlockHeightSchema)
  .merge(observedAgeSchema);

const ingestionBlockResponseSchema = z
  .object({
    blockHash: z.string(),
    signerPublicKey: z.string(),
    accepted: z.boolean(),
    rejectReason: z.number().nullable(),
    reason: z.string().nullable(),
    latencyMs: z.number().nullable(),
    blockHeight: z.number().nullable(),
  })
  .merge(observedAgeSchema);

const ingestionBlockPushSchema = z
  .object({
    blockHash: z.string(),
    blockHeight: z.number(),
    minerPublicKey: z.string(),
  })
  .merge(observedAgeSchema);

const ingestionBitcoinBlockSchema = z
  .object({
    bitcoinBlockHash: z.string(),
    bitcoinBlockHeight: z.number(),
    consensusHash: z.string(),
  })
  .merge(observedAgeSchema);

const ingestionStateMachineSchema = z
  .object({
    signerPublicKey: z.string(),
    consensusHash: z.string(),
    bitcoinBlockHeight: z.number(),
    activeSignerProtocolVersion: z.number(),
    localSignerProtocolVersion: z.number(),
    miner: minerStateSchema,
  })
  .merge(observedAgeSchema);

export const getStacksIngestionStatusOutputSchema = z.object({
  now: z.string(),
  latest: z.object({
    stacksBlock: ingestionStacksBlockSchema.nullable(),
    blockProposal: ingestionBlockProposalSchema.nullable(),
    blockResponse: ingestionBlockResponseSchema.nullable(),
    blockPush: ingestionBlockPushSchema.nullable(),
    bitcoinBlock: ingestionBitcoinBlockSchema.nullable(),
    stateMachineUpdate: ingestionStateMachineSchema.nullable(),
  }),
});

const blockHealthItemSchema = z
  .object({
    blockHash: z.string(),
    indexBlockHash: z.string(),
    consensusHash: z.string(),
    blockHeight: z.number(),
    blockTimestamp: z.string(),
    observedAt: z.string(),
    minerPublicKey: z.string(),
    accepted: z.boolean().nullable(),
    acceptRatio: z.number(),
    rejectRatio: z.number(),
    pendingRatio: z.number(),
    countAccepted: z.number(),
    countRejected: z.number(),
    countPending: z.number(),
    pushedAt: z.string().nullable(),
    pushedAfterSeconds: z.number().nullable(),
    ageSeconds: z.number(),
  })
  .merge(bitcoinBlockHeightSchema);

export const getRecentBlockHealthOutputSchema = z.object({
  window: z.object({
    limit: z.number(),
    blockCount: z.number(),
    resolvedCount: z.number().optional(),
    pendingCount: z.number().optional(),
  }),
  ratios: z.object({
    accepted: z.number(),
    rejected: z.number(),
    pending: z.number(),
  }),
  averages: z.object({
    acceptRatio: z.number(),
    rejectRatio: z.number(),
    pendingRatio: z.number(),
    timeToPushedSeconds: z.number(),
  }),
  oldestPending: z
    .object({
      blockHash: z.string(),
      ageSeconds: z.number(),
    })
    .nullable()
    .optional(),
  blocks: z.array(blockHealthItemSchema).optional(),
});

export const getSignerHealthOutputSchema = z.object({
  window: z.object({
    limit: z.number(),
    blockCount: z.number(),
    top: z.number().optional(),
  }),
  weightDegradedRatio: z.number(),
  signers: z.array(
    z.object({
      signerPublicKey: z.string(),
      name: z.string().nullable(),
      weightPercent: z.number(),
      participationRate: z.number(),
      degradationRate: z.number(),
      signedCount: z.number(),
      missedCount: z.number(),
      acceptedCount: z.number(),
      rejectedCount: z.number(),
      degradedCount: z.number(),
      preCommitRate: z
        .number()
        .optional()
        .describe(
          'Fraction of the window this signer explicitly pre-committed to. Low values usually mean an older signer binary, not degradation.'
        ),
    })
  ),
});

const latestSignerResponseSchema = z.object({
  signerPublicKey: z.string(),
  name: z.string().nullable(),
  weightPercent: z.number(),
  blockHash: z.string(),
  blockHeight: z.number().nullable(),
  accepted: z.boolean().nullable(),
  latencyMs: z.number().nullable(),
  version: z.string().nullable(),
  observedAt: z.string().nullable(),
  ageSeconds: z.number().nullable(),
});

const missingSignerResponseSchema = z.object({
  signerPublicKey: z.string(),
  name: z.string().nullable(),
  weightPercent: z.number(),
  missing: z.literal(true),
});

export const getLatestSignerResponsesOutputSchema = z.object({
  filter: z.enum(['all', 'accepted', 'rejected', 'missing']),
  counts: z.object({
    totalSigners: z.number(),
    responses: z.number(),
    missing: z.number(),
  }),
  responses: z.array(
    z.union([latestSignerResponseSchema, missingSignerResponseSchema])
  ),
});

const stateMachineItemSchema = z.object({
  signerPublicKey: z.string(),
  consensusHash: z.string(),
  bitcoinBlockHeight: z.number(),
  activeSignerProtocolVersion: z.number(),
  localSignerProtocolVersion: z.number(),
  miner: minerStateSchema,
  observedAt: z.string(),
  ageSeconds: z.number(),
});

export const getLatestStateMachinesOutputSchema = z.object({
  count: z.number(),
  stateMachines: z.array(stateMachineItemSchema),
});

const tenureBlockSchema = z
  .object({
    blockHash: z.string(),
    indexBlockHash: z.string(),
    blockHeight: z.number(),
    blockTimestamp: z.string(),
    observedAt: z.string(),
    minerPublicKey: z.string(),
    accepted: z.boolean(),
    stacksBlockHash: z.string().nullable(),
    stacksBlockHeight: z.number().nullable(),
  })
  .merge(bitcoinBlockHeightSchema);

export const getTenureBlocksOutputSchema = z.object({
  consensusHash: z.string(),
  bitcoinBlockHeight: z.number(),
  bitcoinBlockHash: z.string(),
  blocks: z.array(tenureBlockSchema),
});

export const getTenureOutputSchema = z.object({
  tenure: z.object({
    bitcoinBlockHash: z.string(),
    bitcoinBlockHeight: z.number(),
    bitcoinBlockTimestamp: z.number(),
    consensusHash: z.string(),
    sortitionId: z.string(),
    parentSortitionId: z.string(),
    wasSortition: z.boolean(),
    minerPkHash160: z.string().nullable(),
    stacksParentConsensusHash: z.string().nullable(),
    lastSortitionConsensusHash: z.string().nullable(),
    committedBlockHash: z.string().nullable(),
    vrfSeed: z.string().nullable(),
  }),
});
