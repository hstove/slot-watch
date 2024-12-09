import {
  getHealthBlocks,
  type HealthBlockBlock,
  type HealthBlockSigner,
  type HealthBlocksResponse,
  apiClient,
  type ApiBurnBlock,
  type ApiBlockForBurnBlock,
  getBlocksForBurnBlock,
  getBlockResponsesForBlock,
  type ApiBlockResponseForBlock,
} from '@/lib/slots-api';
import { atom, type Setter, type Getter } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { dequal } from 'dequal/lite';
import { locationStore, networkIdAtom } from './network';
import { ConsensusBlockResponse, getConsensusBlock } from 'slot-watch-common';
import { atomWithQuery } from 'jotai-tanstack-query';
import { atomEffect } from 'jotai-effect';

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

export const allBurnBlocksAtom = atom<ApiBurnBlock[]>([]);

export const burnBlocksAtomFamily = atomFamily((_burnBlockHash: string) =>
  atom<ApiBurnBlock>(),
);

export const setAllBurnBlocksAtom = atom(
  null,
  async (_get, set, burnBlocks: ApiBurnBlock[]) => {
    for (const burnBlock of burnBlocks) {
      set(burnBlocksAtomFamily(burnBlock.burnBlockHash), burnBlock);
    }
    set(allBurnBlocksAtom, burnBlocks);
  },
);

export const insertBurnBlockAtom = atom(
  null,
  async (_get, set, burnBlock: ApiBurnBlock) => {
    set(burnBlocksAtomFamily(burnBlock.burnBlockHash), burnBlock);
    set(allBurnBlocksAtom, (blocks) => {
      return [burnBlock, ...blocks];
    });
  },
);

export const blockResponsesForBlockAtomFamily = atomFamily(
  (_arg: { signerKey: string; blockHash: string }) =>
    atom<ApiBlockResponseForBlock>(),
  dequal,
);

export const fetchBlockResponsesForBlockAtom = atom(
  null,
  async (get, set, blockHash: string) => {
    const networkKey = get(networkIdAtom);
    const responses = await getBlockResponsesForBlock(networkKey, blockHash);
    for (const response of responses.responses) {
      if (!response.signerPublicKey) continue;
      set(
        blockResponsesForBlockAtomFamily({
          blockHash,
          signerKey: response.signerPublicKey,
        }),
        response,
      );
    }
  },
);

type SetAtom<Args extends unknown[], Result> = <A extends Args>(
  ...args: A
) => Result;

type Read<Value, SetSelf = never> = (
  get: Getter,
  options?: {
    readonly signal: AbortSignal;
    readonly setSelf: SetSelf;
  },
) => Value;

function listAtomWithInit<T, K>(
  // initFn: (get: Getter) => Promise<T[]>,
  initFn: Read<Promise<T[]>, SetAtom<[T[] | T], void>>,
  keyFn: (item: T) => K,
) {
  const initAtom = atom<Promise<T[]>, [T[] | T], void>(
    async (get, options) => {
      const data = await initFn(get, options);
      options.setSelf(data);
      return data;
    },
    (_get, set, listOrItem: T[] | T) => {
      if (Array.isArray(listOrItem)) {
        set(listAtomInner, listOrItem);
        for (const item of listOrItem) {
          set(itemAtomFamilyInner(keyFn(item)), item);
        }
      } else {
        set(itemAtomFamilyInner(keyFn(listOrItem)), listOrItem);
        set(listAtomInner, (list) => {
          return [listOrItem, ...list];
        });
      }
    },
  );
  const listAtomInner = atom<T[]>([]);
  const itemAtomFamilyInner = atomFamily((_params: K) => atom<T>(), dequal);
  const itemAtomFamily = atomFamily(
    (params: K) =>
      atom<T>((get) => {
        const inner = get(itemAtomFamilyInner(params));
        if (typeof inner === 'undefined') {
          throw new Error('Item not found');
        }
        return inner;
      }),
    dequal,
  );
  const listAtom = atom(async (get) => {
    // prefetch
    await get(initAtom);
    return get(listAtomInner);
  });
  return [listAtom, itemAtomFamily] as const;
}

type ReadOuter<Value, OKey, SetSelf = never> = (
  outerKey: OKey,
  get: Getter,
  options?: {
    readonly signal: AbortSignal;
    readonly setSelf: SetSelf;
  },
) => Value;

export function listAtomFamilyWithInit<OKey, T, K>(
  initFn: ReadOuter<Promise<T[]>, OKey, SetAtom<[OKey, T[] | T], void>>,
  keyFn: (item: T) => K,
  onItemSet?: (get: Getter, set: Setter, item: T) => void,
) {
  const initAtom = atomFamily(
    (outerKey: OKey) =>
      atom<Promise<T[]>, [OKey, T[] | T], void>(
        async (get, options) => {
          const data = await initFn(outerKey, get, options);
          options.setSelf(outerKey, data);
          return data;
        },
        (get, set, outerKey: OKey, listOrItem: T[] | T) => {
          if (Array.isArray(listOrItem)) {
            set(listAtomFamilyInner(outerKey), listOrItem);
            for (const item of listOrItem) {
              set(itemAtomFamilyInner(keyFn(item)), item);
              onItemSet?.(get, set, item);
            }
          } else {
            set(itemAtomFamilyInner(keyFn(listOrItem)), listOrItem);
            const existingList = get(listAtomFamilyInner(outerKey));
            const existingIndex = existingList.findIndex(
              (item) => keyFn(item) === keyFn(listOrItem),
            );
            if (existingIndex !== -1) {
              existingList.splice(existingIndex, 1, listOrItem);
              set(listAtomFamilyInner(outerKey), existingList);
              console.log('Updated existing', keyFn(listOrItem), outerKey);
            } else {
              set(listAtomFamilyInner(outerKey), (list) => {
                return [listOrItem, ...list];
              });
              console.log('Added new', keyFn(listOrItem), outerKey);
            }

            onItemSet?.(get, set, listOrItem);
          }
        },
      ),
    dequal,
  );
  const listAtomFamilyInner = atomFamily(
    (_outerKey: OKey) => atom<T[]>([]),
    dequal,
  );
  const itemAtomFamilyInner = atomFamily((_params: K) => atom<T>(), dequal);
  const itemAtomFamily = atomFamily(
    (params: K) =>
      atom<T>((get) => {
        const inner = get(itemAtomFamilyInner(params));
        if (typeof inner === 'undefined') {
          throw new Error('Item not found');
        }
        return inner;
      }),
    dequal,
  );
  const listAtom = atomFamily((outerKey: OKey) => {
    return atom(
      async (get) => {
        await get(initAtom(outerKey));
        return get(listAtomFamilyInner(outerKey));
      },
      (_get, set, outerKey: OKey, listOrItem: T[] | T) => {
        set(initAtom(outerKey), outerKey, listOrItem);
      },
    );
  });
  return [listAtom, itemAtomFamily, itemAtomFamilyInner] as const;
}

export const maxProcessedStacksHeightAtom = atom(0);

export const [
  stacksBlocksForBurnBlockAtom,
  stacksBlocksFamily,
  __stacksBlocksFamilyInner,
] = listAtomFamilyWithInit(
  async (burnBlockHeight: number, get) => {
    const networkKey = get(networkIdAtom);
    const blocks = await getBlocksForBurnBlock(networkKey, burnBlockHeight);
    return blocks;
  },
  (block) => {
    return block.blockHash;
  },
  (get, set, block) => {
    const maxProcessed = get(maxProcessedStacksHeightAtom);
    if (block.blockHeight > maxProcessed && block.processedAt) {
      set(maxProcessedStacksHeightAtom, block.blockHeight);
    }
  },
);
