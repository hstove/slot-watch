import {
  getHealthBlocks,
  type HealthBlockBlock,
  type HealthBlockSigner,
  apiClient,
  type ApiBurnBlock,
  getBlocksForBurnBlock,
  getBlockResponsesForBlock,
} from '@/lib/slots-api';
import { atom, type Setter, type Getter } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { dequal } from 'dequal/lite';
import { locationStore, networkIdAtom } from './network';
import { getConsensusBlock, percentString } from 'slot-watch-common';
import * as R from 'remeda';
import { signersApiAtom, totalWeightAtom } from './signers-store';
import { listAtomFamilyWithInit } from './store-utils';

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

export type SignerLatestResponse = SignerLatestResponses['responses'][number];

export const allBurnBlocksAtom = atom<ApiBurnBlock[]>([]);

export const sortedBurnBlocksAtom = atom((get) => {
  const burnBlocks = get(allBurnBlocksAtom);
  return burnBlocks.sort((a, b) => a.burnBlockHeight - b.burnBlockHeight);
});

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
  async (get, set, burnBlock: ApiBurnBlock) => {
    const existing = get(burnBlocksAtomFamily(burnBlock.burnBlockHash));
    set(burnBlocksAtomFamily(burnBlock.burnBlockHash), {
      ...existing,
      ...burnBlock,
    });
    const burnBlocks = get(allBurnBlocksAtom);
    const existingIndex = burnBlocks.findIndex(
      (b) => b.burnBlockHash === burnBlock.burnBlockHash,
    );
    if (existingIndex === -1) {
      set(allBurnBlocksAtom, (blocks) => {
        return [burnBlock, ...blocks];
      });
    } else {
      burnBlocks[existingIndex] = burnBlock;
      set(allBurnBlocksAtom, burnBlocks);
    }
  },
);

export const blockTenureCostsAtom = atomFamily((burnBlockHeight: number) =>
  atom(async (get) => {
    const stacksBlocks = await get(
      sortedStacksBlocksForBurnBlockAtom(burnBlockHeight),
    );
    const cost = {
      readCount: 0,
      readLength: 0,
      writeCount: 0,
      writeLength: 0,
      runtime: 0,
    };
    for (const block of stacksBlocks) {
      if (typeof block.readCount !== 'number') continue;
      cost.readCount += block.readCount;
      cost.readLength += block.readLength;
      cost.writeCount += block.writeCount;
      cost.writeLength += block.writeLength;
      cost.runtime += block.runtime;
      if (block.tenureChangeCause) {
        break;
      }
    }
    return cost;
  }),
);

export const maxProcessedStacksHeightAtom = atom(0);

export const [
  stacksBlocksForBurnBlockAtom,
  stacksBlocksFamily,
  __stacksBlocksFamilyInner,
  __stacksBlocksForBurnBlockFamilyInner,
  setStacksBlocksForBurnBlockFamily,
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
    // we might need to insert a burn block if we missed it
    if (block.burnBlockHash && block.burnBlockHeight) {
      const burnBlock = get(burnBlocksAtomFamily(block.burnBlockHash));
      if (!burnBlock) {
        set(insertBurnBlockAtom, {
          burnBlockHeight: block.burnBlockHeight,
          burnBlockHash: block.burnBlockHash,
          networkKey: get(networkIdAtom),
          createdAt: block.processedAt ?? new Date().toISOString(),
        });
      }
      const burnBlocks = get(allBurnBlocksAtom);
      const existingIndex = burnBlocks.findIndex(
        (b) => b.burnBlockHash === block.burnBlockHash,
      );
      if (existingIndex === -1) {
        set(insertBurnBlockAtom, {
          burnBlockHeight: block.burnBlockHeight,
          burnBlockHash: block.burnBlockHash,
          networkKey: get(networkIdAtom),
          createdAt: block.processedAt ?? new Date().toISOString(),
        });
      }
    }
  },
  'stacks-blocks-for-burn',
);

export const sortedStacksBlocksForBurnBlockAtom = atomFamily(
  (burnBlockHeight: number) =>
    atom(async (get) => {
      const list = await get(stacksBlocksForBurnBlockAtom(burnBlockHeight));
      return R.pipe(
        list,
        R.uniqueBy((b) => b.blockHash),
        R.sortBy(
          [R.prop('blockHeight'), 'desc'],
          [(b) => new Date(b.blockTimestamp).getTime(), 'desc'],
        ),
      );
    }),
);

export const responseOutcomeForBlockAtomFamily = atomFamily(
  (blockHash: string) =>
    atom(async (get) => {
      const responses = get(responsesForBlockFamilyInner(blockHash));
      const signers = get(signersApiAtom);
      if (responses.length === 0 || !signers) {
        return undefined;
      }
      let weightAccept = 0;
      let weightReject = 0;
      const responsesBySigner = R.pipe(
        responses,
        R.groupBy((r) => r.signerPublicKey ?? undefined),
      );
      const threshold = Math.ceil(signers.totalWeight * 0.7);
      for (const signer of signers.signers) {
        const response = responsesBySigner[signer.publicKey]?.[0];
        if (!response) continue;
        if (response.accepted) {
          weightAccept += signer.weight;
        } else {
          weightReject += signer.weight;
        }
      }
      const accepted =
        weightAccept >= threshold
          ? true
          : weightReject >= signers.totalWeight - threshold
            ? false
            : null;
      const percentAccept = weightAccept / signers.totalWeight;
      const percentReject = weightReject / signers.totalWeight;
      const displayPercent = accepted === false ? percentReject : percentAccept;
      return {
        weightAccept,
        weightReject,
        accepted,
        percentAccept,
        percentReject,
        displayPercent: percentString(displayPercent, 100),
      };
    }),
);

export const [
  responsesForBlockAtomFamily,
  _responseForBlockFamily,
  responseForBlockFamily,
  responsesForBlockFamilyInner,
  setResponseForBlockFamily,
] = listAtomFamilyWithInit(
  async (blockHash: string, get) => {
    const networkKey = get(networkIdAtom);
    const responses = await getBlockResponsesForBlock(networkKey, blockHash);
    return responses;
  },
  (response) => {
    return {
      blockHash: response.signerSignatureHash,
      signerPublicKey: response.signerPublicKey,
    };
  },
  undefined,
  'responses-for-block',
);
