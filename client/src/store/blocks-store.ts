import {
  getHealthBlocks,
  type HealthBlockBlock,
  type HealthBlockSigner,
  apiClient,
  type ApiBurnBlock,
  getBlocksForBurnBlock,
  getBlockResponsesForBlock,
  type ApiBlockResponseForBlock,
  type ApiSigners,
} from '@/lib/slots-api';
import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { dequal } from 'dequal/lite';
import { locationStore, networkIdAtom } from './network';
import { getConsensusBlock, percentString } from 'slot-watch-common';
import * as R from 'remeda';
import { signersApiAtom } from './signers-store';
import { listAtomFamilyWithInit } from './store-utils';
import {
  setSignerLatestResponsesAtom,
  tenureChangesWriterAtom,
} from './responses-store';

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

export const maxBurnBlockHeightAtom = atom((get) => {
  const all = get(allBurnBlocksAtom);
  return all.reduce((max, b) => Math.max(max, b.burnBlockHeight), 0);
});

export const sortedBurnBlocksAtom = atom((get) => {
  const burnBlocks = get(allBurnBlocksAtom);
  return burnBlocks.sort((a, b) => b.burnBlockHeight - a.burnBlockHeight);
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
    if (
      block.tenureChangeCause !== null &&
      typeof block.consensusHash === 'undefined'
    ) {
      set(tenureChangesWriterAtom, block);
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
        acceptPercentString: percentString(percentAccept, 100),
        rejectPercentString: percentString(percentReject, 100),
      };
    }),
);

// The listAtomFamilyWithInit returns the following pattern:
// [listAtom, itemAtomFamily, itemAtomFamilyInner, listAtomFamilyInner, writerAtom]
export const [
  responsesForBlockAtomFamily, // This is the "listAtom" (an atomFamily)
  _responseForBlockFamily, // itemAtomFamily (unused externally)
  responseForBlockFamily, // itemAtomFamilyInner
  responsesForBlockFamilyInner, // listAtomFamilyInner
  setResponseForBlockFamily, // writerAtom
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
  (_get, set, response) => {
    set(setSignerLatestResponsesAtom, response);
  },
  'responses-for-block',
);

// Helper for removing all responses for a given blockHash from the family
export function removeResponsesForBlock(blockHash: string) {
  responsesForBlockAtomFamily.remove(blockHash);
}

export const activeBlockHashAtom = atom<string>();

export const activeBlockAtom = atom((get) => {
  const activeHash = get(activeBlockHashAtom);
  if (!activeHash) return null;
  return get(stacksBlocksFamily(activeHash));
});

export const blockResponsesChartDataAtom = atomFamily((blockHash: string) => {
  return atom(async (get) => {
    const responses = await get(responsesForBlockAtomFamily(blockHash));
    const signers = get(signersApiAtom);
    if (!signers) return null;
    const sorted = R.sortBy(responses, [
      (r) => new Date(r.createdAt).getTime(),
      'asc',
    ]);
    const signersByPk = R.groupBy(signers.signers, (s) => s.publicKey);
    let accumAccepted = 0;
    let accumRejected = 0;
    const data = sorted.map((r) => {
      const signer = signersByPk[r.signerPublicKey]?.[0];
      if (!signer) throw new Error('Signer not found');
      if (r.accepted) {
        accumAccepted += signer.weightPercent;
      } else {
        accumRejected += signer.weightPercent;
      }
      return {
        accepted: accumAccepted,
        rejected: accumRejected,
        createdAt: new Date(r.createdAt).getTime(),
      };
    });
    return data;
  });
});
