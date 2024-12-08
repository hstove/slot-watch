import {
  getHealthBlocks,
  type HealthBlockBlock,
  type HealthBlockSigner,
  type HealthBlocksResponse,
  apiClient,
} from '@/lib/slots-api';
import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { dequal } from 'dequal';
import { locationStore, networkIdAtom } from './network';
import { ConsensusBlockResponse, getConsensusBlock } from 'slot-watch-common';

export const blockHashesAtom = atom<string[]>([]);

export const blockPushesAtoms = atomFamily(
  (_signerSignatureHash: string) => atom<HealthBlockBlock | null>(null),
  dequal,
);

export const blockSignersAtoms = atomFamily(
  (_signerSignatureHash: string) => atom<HealthBlockSigner[]>([]),
  dequal,
);

export const fetchBlockParamsAtom = atom((get) => {
  const loc = get(locationStore);
  const from = loc.searchParams?.get('from') ?? undefined;
  const to = loc.searchParams?.get('to') ?? undefined;
  return { from, to };
});

export const fetchBlocksAtom = atom<null, [], void>(null, async (get, set) => {
  const networkKey = get(networkIdAtom);
  const { from, to } = get(fetchBlockParamsAtom);
  const { blocks } = await getHealthBlocks(networkKey, from, to);

  for (const block of blocks) {
    const { signers, ...rest } = block;
    set(blockPushesAtoms(block.signerSignatureHash), rest);
    set(blockSignersAtoms(block.signerSignatureHash), signers);
  }
  set(
    blockHashesAtom,
    blocks.map((b) => b.signerSignatureHash),
  );
});

export const consensusBlockAtoms = atomFamily((consensusHash: string) =>
  atom(async (get) => {
    const networkKey = get(networkIdAtom);
    return getConsensusBlock(networkKey, consensusHash);
  }),
);

export async function fetchRecentSignerResponses(networkKey: string) {
  const response = await apiClient.chunks['signer-latest'][':networkKey'].$get({
    param: { networkKey },
  });
  return response.json();
}

export type SignerLatestResponses = Awaited<
  ReturnType<typeof fetchRecentSignerResponses>
>;

export const signerLatestResponsesMapAtom = atom<
  Map<string, SignerLatestResponses['responses'][number]>
>(new Map());

export const sortedLatestResponsesAtom = atom((get) => {
  const responses = get(signerLatestResponsesMapAtom);
  // Sort by tenureExtendTimestamp, nulls last
  return Array.from(responses.values()).sort((a, b) => {
    if (!a.tenureExtendTimestamp) return 1;
    if (!b.tenureExtendTimestamp) return -1;
    return (
      new Date(a.tenureExtendTimestamp).getTime() -
      new Date(b.tenureExtendTimestamp).getTime()
    );
  });
});

export const totalWeightAtom = atom(0);
export const thresholdAtom = atom((get) => {
  const totalWeight = get(totalWeightAtom);
  return Math.ceil(totalWeight * 0.7);
});

export const whenExtendAtom = atom((get) => {
  const threshold = get(thresholdAtom);
  const responses = get(sortedLatestResponsesAtom);
  let sum = 0;
  for (const r of responses) {
    sum += r.weight;
    if (sum >= threshold) {
      return r.tenureExtendTimestamp;
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

export const allSignerLatestResponsesAtom = atom(null, async (get, set) => {
  const networkKey = get(networkIdAtom);
  const responses = await fetchRecentSignerResponses(networkKey);
  set(
    signerLatestResponsesMapAtom,
    new Map(responses.responses.map((r) => [r.signerPublicKey, r])),
  );
  set(totalWeightAtom, responses.totalWeight);
});
