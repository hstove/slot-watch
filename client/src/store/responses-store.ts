import { atom } from 'jotai';
import {
  type ApiBlockResponseForBlock,
  apiClient,
  type ApiSigner,
  getBlockResponsesForBlock,
  getTenureChanges,
  type ProcessedStacksBlock,
  queries,
} from '@/lib/slots-api';
import { listAtomFamilyWithInit, listAtomWithInit } from './store-utils';
import { networkIdAtom } from './network';
import { signersApiAtom, thresholdAtom } from './signers-store';
import * as R from 'remeda';
import type { MiniBlockResponseApi, TypeMerge } from 'slot-watch-common';
import type { O } from 'ts-toolbelt';
import { atomFamily } from 'jotai/utils';
import { atomWithSuspenseQuery } from 'jotai-tanstack-query';

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

export type SortedResponse = SignerWithoutResponse | SignerWithResponse;

export const sortedLatestResponsesAtom = atom((get) => {
  const responses = get(signersLatestResponsesAtom);
  const signers = get(signersApiAtom);
  const threshold = get(thresholdAtom);
  const mostRecentTenureChange = get(mostRecentTenureChangeAtom);
  const recentTenureChange = mostRecentTenureChange
    ? new Date(mostRecentTenureChange).getTime()
    : null;
  if (!signers) {
    console.warn('Early return: no signers data');
    return [];
  }
  const responsesBySigner = R.groupBy(responses, R.prop('signerPublicKey'));
  const zipped = R.map(signers.signers, (signer) => {
    const [response] = responsesBySigner[signer.publicKey] ?? [];
    if (response) {
      if (response.tenureExtendTimestamp && recentTenureChange) {
        if (
          new Date(response.tenureExtendTimestamp).getTime() <
          recentTenureChange
        ) {
          return {
            ...signer,
            ...response,
            tenureExtendTimestamp: null,
          };
        }
      }
      return {
        ...signer,
        ...response,
      };
    }
    return signer;
  }) as SortedResponse[];
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
    } satisfies SortedResponse & { extend: boolean };
  });
});

export const latestResponseTimeForSignerFamily = atomFamily(
  (_signerPublicKey: string) => {
    return atom<number>();
  },
);

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
  (_get, set, response) => {
    set(
      latestResponseTimeForSignerFamily(response.signerPublicKey),
      new Date(response.createdAt).getTime(),
    );
  },
  'signer-latest-responses',
);

export const whenExtendAtom = atom((get) => {
  const threshold = get(thresholdAtom);
  const responses = get(sortedLatestResponsesAtom);
  const signers = get(signersApiAtom);
  const mostRecentTenureChange = get(mostRecentTenureChangeAtom);
  if (!signers) return null;
  // const signerMap = new Map(signers.signers.map((s) => [s.publicKey, s]));
  let sum = 0;
  for (const r of responses) {
    if (r.tenureExtendTimestamp && mostRecentTenureChange) {
      if (
        new Date(r.tenureExtendTimestamp).getTime() <
        new Date(mostRecentTenureChange).getTime()
      ) {
        continue;
      }
    }
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

export const [
  tenureChangesAtom,
  _tenureChangesFamily,
  _tenureChangesFamilyInner,
  _tenureChangesAtomInner,
  tenureChangesWriterAtom,
] = listAtomWithInit<ProcessedStacksBlock, string>(
  async (get) => {
    const networkKey = get(networkIdAtom);
    const changes = await getTenureChanges(networkKey);
    return changes;
    // return changes.tenureChanges.map((stacksBlock) => {
    //   return {
    //     ...stacksBlock,
    //     processedAt: stacksBlock.createdAt,
    //     blockTimestamp: stacksBlock.blockTimestamp ?? stacksBlock.createdAt,
    //   } satisfies ProcessedStacksBlock;
    // });
  },
  (r) => r.blockHash,
  undefined,
  'tenure-changes',
);

export const mostRecentTenureChangeAtom = atom((get) => {
  const [tenureChange] = get(_tenureChangesAtomInner);
  if (tenureChange) {
    return new Date(tenureChange.blockTimestamp).getTime();
  }
  return null;
});

export const blockResponsesForBlockQueryAtomFamily = atomFamily(
  (blockHash: string) => {
    return atomWithSuspenseQuery((get) => ({
      ...queries.blockResponses.forStacksBlock(get(networkIdAtom), blockHash),
    }));
  },
);

export const [
  miniResponsesAtomFamilyWithLoader,
  __miniResponseAtomFamily,
  __miniResponseNullableAtomFamily,
  miniResponsesForBlockFamily,
  setMiniResponsesAtom,
] = listAtomFamilyWithInit(
  async (signerSignatureHash: string, get) => {
    // const networkKey = get(networkIdAtom);
    const responses = await get(
      blockResponsesForBlockQueryAtomFamily(signerSignatureHash),
    );
    return responses.data as MiniBlockResponseApi[];
  },
  (r) => ({
    blockHash: r.signerSignatureHash,
    signerPublicKey: r.signerPublicKey,
  }),
  (_get, set, response) => {
    set(signerLatestResponseFamilyInner(response.signerPublicKey), (latest) => {
      if (!latest) return latest;
      return {
        ...latest,
        createdAt: new Date().toISOString(),
      };
    });
    set(
      latestResponseTimeForSignerFamily(response.signerPublicKey),
      Date.now(),
    );
  },
  'mini-block-responses',
);
