import {
  type BlockPreCommitDb,
  type BlockResponseDb,
  stacksBlocks,
  blockResponses,
} from './schema';
import type { Db } from './db';
import {
  getLatestStackerSet,
  getPoxInfo,
  type StackerSet,
} from '../stacks-api';
import { knownSigners, type BlockResponseApi } from 'slot-watch-common';
import { Schema, Either } from 'effect';

// Local schema definition to avoid cross-package type issues
const BlockResponseApiSchema = Schema.Struct({
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
import { logger } from '../logger';
import { parse, stringify } from 'superjson';
import { env } from 'cloudflare:workers';
import { getCreatedAt } from '../utils';
import { desc, eq, and, sql } from 'drizzle-orm';
import Cloudflare from 'cloudflare';
import * as R from 'remeda';

const cloudflare = new Cloudflare({
  apiToken: env.KV_API_TOKEN,
});

/**
 * Dedupes pre-commits to the first one seen per signer (mirroring the
 * first-response-wins rule) and tallies their stake weight. Pre-commits from
 * keys outside the stacker set are ignored, as responses are.
 */
function tallyPreCommits(
  stackerSet: StackerSet,
  preCommits: BlockPreCommitDb[]
) {
  const preCommitsBySigner = new Map<string, BlockPreCommitDb>();
  let weightPreCommitted = 0;
  for (const preCommit of preCommits) {
    const signer = stackerSet.signersByKey.get(preCommit.signerPublicKey);
    if (!signer || preCommitsBySigner.has(preCommit.signerPublicKey)) {
      continue;
    }
    preCommitsBySigner.set(preCommit.signerPublicKey, preCommit);
    weightPreCommitted += signer.weight;
  }
  return { preCommitsBySigner, weightPreCommitted };
}

export function mapSignerDataToResponses({
  stackerSet,
  responses,
  preCommits,
}: {
  stackerSet: StackerSet;
  responses: BlockResponseDb[];
  /**
   * Optional — when omitted, no pre-commit fields are added and the output is
   * byte-identical to the pre-#8 shape. Pre-commits are an intermediate signal
   * only: they never affect the accept/reject verdict below.
   */
  preCommits?: BlockPreCommitDb[];
}) {
  const blockSigners: Record<
    string,
    BlockResponseDb & { accepted: boolean | null }
  > = {};
  const { preCommitsBySigner, weightPreCommitted } = tallyPreCommits(
    stackerSet,
    preCommits ?? []
  );
  const alreadyCounted = new Set<string>();
  let weightAccept = 0;
  let weightReject = 0;
  let countAccepted = 0;
  let countRejected = 0;
  const { totalWeight } = stackerSet;
  for (const response of responses) {
    const signer = stackerSet.signersByKey.get(response.signerPublicKey ?? '');
    if (!(signer && response.signerPublicKey)) {
      continue;
    }
    const { weight } = signer;
    if (alreadyCounted.has(response.signerPublicKey)) {
      continue;
    }
    blockSigners[response.signerPublicKey] = {
      ...signer,
      ...response,
      accepted: response.accepted,
    };
    alreadyCounted.add(response.signerPublicKey);
    if (response.accepted) {
      weightAccept += weight;
      countAccepted++;
    } else {
      weightReject += weight;
      countRejected++;
    }
  }
  const signersArr = stackerSet.signers.map((s) => {
    const blockSignerBase = blockSigners[s.signing_key];
    const blockSigner = blockSignerBase || {
      accepted: null,
      createdAt: null,
      tenureExtendTimestamp: null,
    };
    const createdAt = blockSignerBase ? getCreatedAt(blockSignerBase.id) : null;
    const preCommit = preCommitsBySigner.get(s.signing_key);
    return {
      ...s,
      ...blockSigner,
      createdAt,
      weightPercent: s.weight / totalWeight,
      entity: knownSigners[s.signing_key] ?? null,
      tenureExtendTimestamp: blockSigner.tenureExtendTimestamp
        ? blockSigner.tenureExtendTimestamp.toISOString()
        : null,
      ...(preCommits
        ? {
            preCommittedAt: preCommit
              ? getCreatedAt(preCommit.id).toISOString()
              : null,
            preCommitLatencyMs: preCommit?.latencyMs ?? null,
          }
        : {}),
    };
  });
  const rejectRatio = weightReject / totalWeight;
  const acceptRatio = weightAccept / totalWeight;
  const accepted =
    // biome-ignore lint/style/noNestedTernary: ignored using `--suppress`
    acceptRatio >= 0.7 ? true : rejectRatio >= 0.3 ? false : null;
  return {
    signers: signersArr,
    weightAccept,
    weightReject,
    totalWeight,
    rejectRatio,
    acceptRatio,
    accepted,
    countAccepted,
    countRejected,
    weightPreCommitted,
    preCommitRatio: weightPreCommitted / totalWeight,
    countPreCommitted: preCommitsBySigner.size,
  };
}

export async function getLatestResponses(networkKey: string) {
  const poxInfo = await getPoxInfo.get(networkKey);
  const { signers, totalWeight } = await getLatestStackerSet(networkKey);
  const signerKeys = signers.map((s) => s.signing_key);
  const responses = await getCachedLatestBlockResponses(networkKey, signerKeys);

  const responsesByKey = new Map<string, (typeof responses)[number]>();
  for (const r of responses) {
    if (!r.signerPublicKey) continue;
    responsesByKey.set(r.signerPublicKey, r);
  }

  const fullResponses = signers
    .map((signer) => {
      const response = responsesByKey.get(signer.signing_key);
      if (!response) return null;

      return {
        ...signer,
        ...response,
      };
    })
    .filter((s) => s !== null);

  return {
    responses: fullResponses,
    totalWeight,
    signers,
    poxInfo,
  };
}

function latestBlockResponseLookupKey({
  signerPublicKey,
  networkKey,
}: {
  signerPublicKey: string;
  networkKey: string;
}) {
  return `latest-block-response:${signerPublicKey}-${networkKey}`;
}

const decodeBlockResponse = Schema.decodeUnknownEither(BlockResponseApiSchema);

function parseBlockResponse(result: string): BlockResponseApi | null {
  const parsed = parse(result);
  const result2 = decodeBlockResponse(parsed);
  if (Either.isLeft(result2)) {
    return null;
  }
  return result2.right;
}

export async function setLatestBlockResponses(
  blockResponses: BlockResponseApi[]
) {
  const responses = R.uniqueBy(blockResponses, (r) => r.signerPublicKey);
  await cloudflare.kv.namespaces.bulkUpdate(env.KV_NAMESPACE_ID, {
    account_id: env.CF_KV_ACCOUNT_ID,
    body: responses.map((r) => {
      return {
        key: latestBlockResponseLookupKey({
          signerPublicKey: r.signerPublicKey,
          networkKey: r.networkKey,
        }),
        value: stringify(r),
      };
    }),
  });
}

async function getCachedLatestBlockResponses(
  networkKey: string,
  signerPublicKeys: string[]
) {
  const keys = signerPublicKeys.map((signerPublicKey) =>
    latestBlockResponseLookupKey({ signerPublicKey, networkKey })
  );
  const results = await Promise.all(keys.map((key) => env.CACHE.get(key)));
  // const results = await redisClient.mGet(keys);
  logger.debug(
    {
      topic: 'block-response',
      resultsLength: results.length,
      keysLength: keys.length,
      networkKey,
    },
    'getting latest block responses'
  );
  const blockResponses = results
    .map((result) => (result ? parseBlockResponse(result) : null))
    .filter((r) => r !== null);
  return blockResponses;
}

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function getSignerLatencies(networkKey: string, db: Db) {
  const latestBlockHashes = db
    .$with('latest_block_hashes')
    .as(
      db
        .select({ signerSignatureHash: stacksBlocks.blockHash })
        .from(stacksBlocks)
        .where(eq(stacksBlocks.networkKey, networkKey))
        .orderBy(desc(stacksBlocks.blockHeight))
        .limit(1)
    );

  const latestResponses = db
    .with(latestBlockHashes)
    .select({
      signerSignatureHash: blockResponses.signerSignatureHash,
      latencyMs: sql`avg(${blockResponses.latencyMs})`,
    })
    .from(blockResponses)
    .leftJoin(
      latestBlockHashes,
      and(
        eq(
          blockResponses.signerSignatureHash,
          latestBlockHashes.signerSignatureHash
        ),
        eq(blockResponses.networkKey, networkKey)
      )
    )
    .groupBy(blockResponses.signerSignatureHash);

  return latestResponses;
}
