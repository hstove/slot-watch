import { type BlockResponseDb, stacksBlocks, blockResponses } from './schema';
import { db } from './db';
import {
  getLatestStackerSet,
  getPoxInfo,
  getStackerSet,
  type StackerSet,
} from '../stacks-api';
import {
  knownSigners,
  blockResponseApiSchema,
  type BlockResponseApi,
} from 'slot-watch-common';
import { logger } from '../logger';
// import { redisClient } from '../redis';
import { parse, stringify } from 'superjson';
import { env } from 'cloudflare:workers';
import { getCreatedAt } from '../utils';
import { desc, eq, and, sql } from 'drizzle-orm';

export function mapSignerDataToResponses({
  stackerSet,
  responses,
}: { stackerSet: StackerSet; responses: BlockResponseDb[] }) {
  const blockSigners: Record<
    string,
    BlockResponseDb & { accepted: boolean | null }
  > = {};
  const alreadyCounted = new Set<string>();
  let weightAccept = 0;
  let weightReject = 0;
  let countAccepted = 0;
  let countRejected = 0;
  const { totalWeight } = stackerSet;
  for (const response of responses) {
    const signer = stackerSet.signersByKey.get(response.signerPublicKey ?? '');
    if (!signer || !response.signerPublicKey) {
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
    return {
      ...s,
      ...blockSigner,
      createdAt,
      weightPercent: s.weight / totalWeight,
      entity: knownSigners[s.signing_key] ?? null,
      tenureExtendTimestamp: blockSigner.tenureExtendTimestamp
        ? blockSigner.tenureExtendTimestamp.toISOString()
        : null,
    };
  });
  const rejectRatio = weightReject / totalWeight;
  const acceptRatio = weightAccept / totalWeight;
  const accepted =
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
  };
}

export async function getLatestResponses(networkKey: string) {
  const poxInfo = await getPoxInfo.get(networkKey);
  const { signers, signersByKey, totalWeight } =
    await getLatestStackerSet(networkKey);
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

export function serializeBlockResponse(
  response: BlockResponseDb,
): BlockResponseApi {
  const createdAt = getCreatedAt(response.id);
  return {
    ...response,
    tenureExtendTimestamp: response.tenureExtendTimestamp
      ? response.tenureExtendTimestamp.toISOString()
      : null,
    createdAt: createdAt.toISOString(),
    signerPublicKey: response.signerPublicKey ?? '',
    accepted: response.accepted ?? true,
    version: response.version ?? undefined,
    reason: response.reason ?? undefined,
    validationCode: response.validationCode ?? undefined,
    rejectCode: response.rejectCode ?? undefined,
    rejectReason: response.rejectReason ?? undefined,
    latencyMs: response.latencyMs ?? undefined,
  };
}

export function latestBlockResponseLookupKey({
  signerPublicKey,
  networkKey,
}: { signerPublicKey: string; networkKey: string }) {
  return `latest-block-response:${signerPublicKey}-${networkKey}`;
}

function parseBlockResponse(result: string) {
  const parseResult = blockResponseApiSchema.safeParse(parse(result));
  if (!parseResult.success) {
    return null;
  }
  return parseResult.data;
}

export async function getLatestBlockResponse(
  signerPublicKey: string,
  networkKey: string,
) {
  const key = latestBlockResponseLookupKey({ signerPublicKey, networkKey });
  const result = await env.CACHE.get(key);
  // const result = await redisClient.get(key);
  logger.debug(
    {
      topic: 'block-response',
      key,
      hasResult: result !== null,
    },
    'getting latest block response',
  );
  if (result === null) return null;
  return parseBlockResponse(result);
}

export async function setLatestBlockResponse(blockResponse: BlockResponseApi) {
  if (!blockResponse.signerPublicKey) return;
  const key = latestBlockResponseLookupKey({
    signerPublicKey: blockResponse.signerPublicKey,
    networkKey: blockResponse.networkKey,
  });
  logger.debug(
    {
      topic: 'block-response',
      key,
      networkKey: blockResponse.networkKey,
      signerPublicKey: blockResponse.signerPublicKey,
    },
    'setting latest block response',
  );
  await env.CACHE.put(key, stringify(blockResponse));
  // await redisClient.set(key, stringify(blockResponse));
}

export async function getCachedLatestBlockResponses(
  networkKey: string,
  signerPublicKeys: string[],
) {
  const keys = signerPublicKeys.map((signerPublicKey) =>
    latestBlockResponseLookupKey({ signerPublicKey, networkKey }),
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
    'getting latest block responses',
  );
  const blockResponses = results
    .map((result) => (result ? parseBlockResponse(result) : null))
    .filter((r) => r !== null);
  return blockResponses;
}

export async function getSignerLatencies(networkKey: string) {
  const latestBlockHashes = db
    .$with('latest_block_hashes')
    .as(
      db
        .select({ signerSignatureHash: stacksBlocks.blockHash })
        .from(stacksBlocks)
        .where(eq(stacksBlocks.networkKey, networkKey))
        .orderBy(desc(stacksBlocks.blockHeight))
        .limit(1),
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
          latestBlockHashes.signerSignatureHash,
        ),
        eq(blockResponses.networkKey, networkKey),
      ),
    )
    .groupBy(blockResponses.signerSignatureHash);

  return latestResponses;
}
