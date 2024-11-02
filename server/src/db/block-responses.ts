import type { InferSelectModel } from 'drizzle-orm';
import { blockResponses, type BlockResponseDb } from './schema';
import type { StackerSet } from '../stacks-api';
import { knownSigners } from 'slot-watch-common';

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
    };
    return {
      ...s,
      ...blockSigner,
      weightPercent: s.weight / totalWeight,
      entity: knownSigners[s.signing_key] ?? null,
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
