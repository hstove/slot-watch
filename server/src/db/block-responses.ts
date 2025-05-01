import type { BlockResponseDb } from './schema';
import { getPoxInfo, getStackerSet, type StackerSet } from '../stacks-api';
import {
  knownSigners,
  blockResponseApiSchema,
  type BlockResponseApi,
} from 'slot-watch-common';
import { logger } from '../logger';
import { redisClient } from '../redis';
import { parse, stringify } from 'superjson';

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
    const blockSigner = blockSigners[s.signing_key] || {
      accepted: null,
      createdAt: null,
      tenureExtendTimestamp: null,
    };
    return {
      ...s,
      ...blockSigner,
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
  const cycle = poxInfo.rewardCycleId;
  const { signers, signersByKey, totalWeight } = await getStackerSet(
    networkKey,
    cycle,
  );
  const signerKeys = signers.map((s) => s.signing_key);
  const responses = await getCachedLatestBlockResponses(networkKey, signerKeys);
  // const query = sql`
  //   with latest_responses as (
  //     select
  //       max(id) as response_id
  //       , signer_public_key
  //     from block_responses r
  //     where
  //       r.network_key = ${networkKey}
  //       and r.signer_public_key in ${signerKeys}
  //     group by r.signer_public_key
  //   )

  //   select
  //     r.id
  //     , r.signer_public_key
  //     , r.tenure_extend_timestamp
  //     , r.created_at
  //   from block_responses r
  //   join latest_responses l
  //     on l.response_id = r.id
  //   `;

  // const responses = await db.execute<{
  //   id: number;
  //   signer_public_key: string;
  //   tenure_extend_timestamp: string | null;
  //   created_at: string;
  // }>(query);

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
  return {
    ...response,
    tenureExtendTimestamp: response.tenureExtendTimestamp
      ? response.tenureExtendTimestamp.toISOString()
      : null,
    createdAt: response.createdAt.toISOString(),
    signerPublicKey: response.signerPublicKey ?? '',
    accepted: response.accepted ?? true,
    chunkId: response.chunkId ?? 0,
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
  const result = await redisClient.get(key);
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
  await redisClient.set(key, stringify(blockResponse));
}

export async function getCachedLatestBlockResponses(
  networkKey: string,
  signerPublicKeys: string[],
) {
  const keys = signerPublicKeys.map((signerPublicKey) =>
    latestBlockResponseLookupKey({ signerPublicKey, networkKey }),
  );
  const results = await redisClient.mGet(keys);
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
