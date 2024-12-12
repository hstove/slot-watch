import { atom } from 'jotai';
import {
  type ApiBlockResponseForBlock,
  apiClient,
  type ApiSigner,
} from '@/lib/slots-api';
import { listAtomWithInit } from './store-utils';
import { networkIdAtom } from './network';
import { signersApiAtom, thresholdAtom } from './signers-store';
import * as R from 'remeda';
import type { TypeMerge } from 'slot-watch-common';
import type { O } from 'ts-toolbelt';

export async function fetchRecentSignerResponses(
  networkKey: string,
): Promise<ApiBlockResponseForBlock[]> {
  const response = await apiClient.chunks['signer-latest'][':networkKey'].$get({
    param: { networkKey },
  });
  const data = await response.json();
  return data.responses.map((r) => {
    return {
      tenureExtendTimestamp: r.tenureExtendTimestamp,
      createdAt: r.createdAt,
      networkKey,
      signerSignatureHash: '',
      signerPublicKey: r.signerPublicKey,
      accepted: true,
    };
  });
}

export type SignerLatestResponses = ApiBlockResponseForBlock[];

export type SignerLatestResponse = SignerLatestResponses[number];

export type SignerWithoutResponse = TypeMerge<ApiSigner, SignerLatestResponse>;

export type SignerWithResponse = O.Merge<
  SignerWithoutResponse,
  SignerLatestResponse
>;

export type SortedResponses = (SignerWithResponse | SignerWithoutResponse) & {
  extend: boolean;
};

export const sortedLatestResponsesAtom = atom<SortedResponses[]>((get) => {
  const responses = get(signersLatestResponsesAtom);
  const signers = get(signersApiAtom);
  const threshold = get(thresholdAtom);
  if (!signers) {
    console.warn('Early return: no signers data');
    return [];
  }
  const responsesBySigner = R.groupBy(responses, R.prop('signerPublicKey'));
  const zipped = R.map(signers.signers, (signer) => {
    return {
      ...signer,
      ...(responsesBySigner[signer.publicKey]?.[0] ?? undefined),
    };
  });
  // Sort by tenureExtendTimestamp, nulls last
  const sorted = Array.from(zipped).sort((a, b) => {
    if (!a.tenureExtendTimestamp) return 1;
    if (!b.tenureExtendTimestamp) return -1;
    return (
      new Date(a.tenureExtendTimestamp).getTime() -
      new Date(b.tenureExtendTimestamp).getTime()
    );
  });
  let sum = 0;

  return sorted.map((r) => {
    sum += r.weight ?? 0;
    return {
      ...r,
      extend: sum >= threshold,
    };
  });
});

export const [
  fetchSignersLatestResponsesAtom,
  signerLatestResponseFamily,
  signerLatestResponseFamilyInner,
  signersLatestResponsesAtom,
  setSignerLatestResponsesAtom,
] = listAtomWithInit(
  async (get) => {
    const networkKey = get(networkIdAtom);
    const responses = await fetchRecentSignerResponses(networkKey);
    return responses;
  },
  (r) => r.signerPublicKey,
  undefined,
  'signer-latest-responses',
);

export const whenExtendAtom = atom((get) => {
  const threshold = get(thresholdAtom);
  const responses = get(sortedLatestResponsesAtom);
  const signers = get(signersApiAtom);
  if (!signers) return null;
  // const signerMap = new Map(signers.signers.map((s) => [s.publicKey, s]));
  let sum = 0;
  for (const r of responses) {
    sum += r.weight ?? 0;
    if (sum >= threshold) {
      return r.tenureExtendTimestamp ?? null;
    }
  }
  return null;
});

export const extendBoundsAtom = atom((get) => {
  const sorted = get(sortedLatestResponsesAtom);
  let min: number | null = null;
  let max: number | null = null;
  for (const r of sorted) {
    if (!r.tenureExtendTimestamp) continue;
    if (!min || new Date(r.tenureExtendTimestamp).getTime() < min) {
      min = new Date(r.tenureExtendTimestamp).getTime();
    }
    if (!max || new Date(r.tenureExtendTimestamp).getTime() > max) {
      max = new Date(r.tenureExtendTimestamp).getTime();
    }
  }
  const diff = max && min ? max - min : null;
  return { min, max, diff };
});
