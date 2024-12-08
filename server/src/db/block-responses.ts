import type { InferSelectModel } from 'drizzle-orm';
import { blockResponses, type BlockResponseDb } from './schema';
import { getPoxInfo, getStackerSet, type StackerSet } from '../stacks-api';
import { knownSigners } from 'slot-watch-common';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { logger } from '../logger';

// export type BlockResponseDb = InferSelectModel<typeof blockResponses>;

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
  const query = sql`
    with latest_responses as (
      select
        max(id) as response_id
        , signer_public_key
      from block_responses r
      where
        r.network_key = ${networkKey}
        and r.signer_public_key in ${signerKeys}
      group by r.signer_public_key
    )

    select
      r.id
      , r.signer_public_key
      , r.tenure_extend_timestamp
      , r.created_at
    from block_responses r
    join latest_responses l
      on l.response_id = r.id
    `;

  const responses = await db.execute<{
    id: number;
    signer_public_key: string;
    tenure_extend_timestamp: string | null;
    created_at: string;
  }>(query);

  const responsesByKey = new Map<string, (typeof responses)[number]>();
  for (const r of responses) {
    responsesByKey.set(r.signer_public_key, r);
  }

  const fullResponses = signers
    .map((signer) => {
      const response = responsesByKey.get(signer.signing_key);
      if (!response) return null;

      return {
        ...signer,
        tenureExtendTimestamp: response.tenure_extend_timestamp
          ? new Date(response.tenure_extend_timestamp).toISOString()
          : null,
        signerPublicKey: response.signer_public_key,
        createdAt: new Date(response.created_at).toISOString(),
      };
    })
    .filter((s) => s !== null);

  return {
    responses: fullResponses,
    totalWeight,
    signers,
  };
}
