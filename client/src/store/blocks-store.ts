import { getBtcBlock, queries } from '@/lib/slots-api';
import { type Atom, atom } from 'jotai';
import { atomFamily, loadable } from 'jotai/utils';
import { networkIdAtom } from './network';
import { type ApiBurnBlock, percentString } from 'slot-watch-common';
import * as R from 'remeda';
import { signersApiAtom } from './signers-store';
import { listAtomFamilyWithInit } from './store-utils';
import {
  blockResponsesForBlockQueryAtomFamily,
  miniResponsesForBlockFamily,
  setSignerLatestResponsesAtom,
  tenureChangesWriterAtom,
} from './responses-store';
import { ZERO_COST, type BlockCost } from '@/lib/costs';
import { atomWithSuspenseQuery } from 'jotai-tanstack-query';

const allBurnBlocksAtom = atom<ApiBurnBlock[]>([]);

export const maxBurnBlockConsensusHashAtom = atom((get) => {
  const all = get(allBurnBlocksAtom);
  return all[0]?.consensusHash ?? '';
});

export const sortedBurnBlocksAtom = atom((get) => {
  const burnBlocks = get(allBurnBlocksAtom);
  return burnBlocks.sort((a, b) => b.burnBlockHeight - a.burnBlockHeight);
});

export const burnBlocksAtomFamily = atomFamily((_burnBlockHash: string) =>
  atom<ApiBurnBlock>()
);

export const setAllBurnBlocksAtom = atom(
  null,
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async (_get, set, burnBlocks: ApiBurnBlock[]) => {
    for (const burnBlock of burnBlocks) {
      set(burnBlocksAtomFamily(burnBlock.burnBlockHash), burnBlock);
    }
    set(allBurnBlocksAtom, burnBlocks);
  }
);

const mergeBurnBlocks = (
  existing: ApiBurnBlock[],
  incoming: ApiBurnBlock[]
) => {
  const merged = new Map<string, ApiBurnBlock>();
  for (const block of [...existing, ...incoming]) {
    merged.set(block.burnBlockHash, block);
  }
  return Array.from(merged.values()).sort(
    (a, b) => b.burnBlockHeight - a.burnBlockHeight
  );
};

export const loadMoreBurnBlocksAtom = atom(null, async (get, set) => {
  const networkKey = get(networkIdAtom);
  const burnBlocks = get(sortedBurnBlocksAtom);
  const minHeight = burnBlocks.at(-1)?.burnBlockHeight;
  if (!minHeight) return;

  const burnBlocksToFetch = 2;
  const heights = Array.from({ length: burnBlocksToFetch }, (_value, index) => {
    return minHeight - (index + 1);
  }).filter((height) => height > 0);
  if (heights.length === 0) return;

  const responses = await Promise.all(
    heights.map((height) => getBtcBlock(networkKey, height.toString()))
  );
  const newBlocks = responses
    .map((response) => response.btcBlock)
    .filter((block) => block !== null);
  if (newBlocks.length > 0) {
    set(setAllBurnBlocksAtom, mergeBurnBlocks(burnBlocks, newBlocks));
  }
});

export const insertBurnBlockAtom = atom(
  null,
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  async (get, set, burnBlock: ApiBurnBlock) => {
    const existing = get(burnBlocksAtomFamily(burnBlock.burnBlockHash));
    set(burnBlocksAtomFamily(burnBlock.burnBlockHash), {
      ...existing,
      ...burnBlock,
    });
    const burnBlocks = get(allBurnBlocksAtom);
    const existingIndex = burnBlocks.findIndex(
      (b) => b.burnBlockHash === burnBlock.burnBlockHash
    );
    if (existingIndex === -1) {
      set(allBurnBlocksAtom, (blocks) => {
        return [burnBlock, ...blocks];
      });
    } else {
      burnBlocks[existingIndex] = burnBlock;
      set(allBurnBlocksAtom, burnBlocks);
    }
  }
);

export const blockTenureCostsAtom = atomFamily((consensusHash: string) =>
  atom((get) => {
    const stacksBlocks = get(
      loadable(sortedStacksBlocksForBurnBlockAtom(consensusHash))
    );
    const cost = {
      readCount: 0,
      readLength: 0,
      writeCount: 0,
      writeLength: 0,
      runtime: 0,
    };
    if (stacksBlocks.state !== 'hasData') return cost;
    for (const block of stacksBlocks.data) {
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
  })
);

export const cumulativeBlockCostsAtom = atomFamily<
  string,
  Atom<
    Map<
      string,
      {
        new: BlockCost;
        cumulative: BlockCost;
      }
    >
  >
>((consensusHash: string) => {
  return atom((get) => {
    const stacksBlocks = get(
      loadable(sortedStacksBlocksForBurnBlockAtom(consensusHash))
    );
    if (stacksBlocks.state !== 'hasData') return new Map();
    const blocks = R.reverse(stacksBlocks.data);
    let cumCost: BlockCost = {
      ...ZERO_COST,
    };
    const blockCost = new Map<
      string,
      {
        new: BlockCost;
        cumulative: BlockCost;
      }
    >();
    for (const block of blocks) {
      let newCost: BlockCost = { ...ZERO_COST };
      if (typeof block.readCount === 'number') {
        cumCost.readCount += block.readCount;
        cumCost.readLength += block.readLength;
        cumCost.writeCount += block.writeCount;
        cumCost.writeLength += block.writeLength;
        cumCost.runtime += block.runtime;
        newCost = {
          runtime: block.runtime,
          readCount: block.readCount,
          readLength: block.readLength,
          writeCount: block.writeCount,
          writeLength: block.writeLength,
        };
      }
      if (block.tenureChangeCause !== null) {
        cumCost = {
          ...ZERO_COST,
        };
      }
      blockCost.set(block.blockHash, {
        new: newCost,
        cumulative: {
          ...cumCost,
        },
      });
    }

    return blockCost;
  });
});

export const maxProcessedStacksHeightAtom = atom(0);
const maxProposedAtAtom = atom(0);

/**
 * Tracks the consensus hash of the burn block that most recently received a new stacks block.
 * Used to auto-expand burn blocks when they receive new activity.
 */
export const recentlyActiveBurnBlockAtom = atom<string | null>(null);

const stacksBlocksForBurnBlockQueryAtomFamily = atomFamily(
  (consensusHash: string) => {
    return atomWithSuspenseQuery((get) => ({
      ...queries.stacksBlocks.forBurnBlock(get(networkIdAtom), consensusHash),
    }));
  }
);

export const [
  stacksBlocksForBurnBlockAtom,
  stacksBlocksFamily,
  __stacksBlocksFamilyInner,
  ,
  setStacksBlocksForBurnBlockFamily,
] = listAtomFamilyWithInit(
  async (consensusHash: string, get) => {
    const blocks = await get(
      stacksBlocksForBurnBlockQueryAtomFamily(consensusHash)
    );
    return blocks.data;
  },
  (block) => {
    return block.blockHash;
  },
  (get, set, block) => {
    const maxProcessed = get(maxProcessedStacksHeightAtom);
    const maxProposed = get(maxProposedAtAtom);
    if (block.blockHeight > maxProcessed && block.processedAt) {
      set(maxProcessedStacksHeightAtom, block.blockHeight);
    }
    const proposedAt = new Date(block.blockTimestamp).getTime();
    if (proposedAt && proposedAt > maxProposed) {
      set(maxProposedAtAtom, proposedAt);
    }
    if (
      block.tenureChangeCause !== null &&
      typeof block.proposedAt !== 'string'
    ) {
      set(tenureChangesWriterAtom, block);
    }
    // Mark this burn block as recently active (for auto-expansion)
    if (block.consensusHash) {
      set(recentlyActiveBurnBlockAtom, block.consensusHash);
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
          consensusHash: block.consensusHash,
          poxSpendSats: 0,
        });
      }
      const burnBlocks = get(allBurnBlocksAtom);
      const existingIndex = burnBlocks.findIndex(
        (b) => b.burnBlockHash === block.burnBlockHash
      );
      if (existingIndex === -1) {
        set(insertBurnBlockAtom, {
          burnBlockHeight: block.burnBlockHeight,
          burnBlockHash: block.burnBlockHash,
          networkKey: get(networkIdAtom),
          createdAt: block.processedAt ?? new Date().toISOString(),
          consensusHash: block.consensusHash,
          poxSpendSats: 0,
        });
      }
    }
  },
  'stacks-blocks-for-burn'
);

export const sortedStacksBlocksForBurnBlockAtom = atomFamily(
  (consensusHash: string) =>
    atom(async (get) => {
      // const list = get(loadable(stacksBlocksForBurnBlockAtom(consensusHash)));
      const list = await get(stacksBlocksForBurnBlockAtom(consensusHash));
      // if (list.state !== 'hasData') return [];
      return R.pipe(
        // list.data,
        list,
        R.uniqueBy((b) => b.blockHash),
        R.sortBy(
          [R.prop('blockHeight'), 'desc'],
          [(b) => new Date(b.blockTimestamp).getTime(), 'desc']
        )
      );
    })
);

export const responseOutcomeForBlockAtomFamily = atomFamily(
  (blockHash: string) =>
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ignored using `--suppress`
    atom((get) => {
      const responses = get(miniResponsesForBlockFamily(blockHash));
      const signers = get(signersApiAtom);
      if (responses.length === 0 || !signers) {
        return undefined;
      }
      let weightAccept = 0;
      let weightReject = 0;
      const responsesBySigner = R.pipe(
        responses,
        R.groupBy((r) => r.signerPublicKey ?? undefined)
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
          : // biome-ignore lint/style/noNestedTernary: ignored using `--suppress`
            weightReject >= signers.totalWeight - threshold
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
        displayPercent: percentString(displayPercent, 1000),
        acceptPercentString: percentString(percentAccept, 1000),
        rejectPercentString: percentString(percentReject, 1000),
      };
    })
);

// The listAtomFamilyWithInit returns the following pattern:
// [listAtom, itemAtomFamily, itemAtomFamilyInner, listAtomFamilyInner, writerAtom]
export const [
  responsesForBlockAtomFamily,
  ,
  // This is the "listAtom" (an atomFamily)
  // itemAtomFamily (unused externally)
  responseForBlockFamily,
  ,
  // itemAtomFamilyInner
  // listAtomFamilyInner
  // writerAtom
  ,
] = listAtomFamilyWithInit(
  async (blockHash: string, get) => {
    const responses = await get(
      blockResponsesForBlockQueryAtomFamily(blockHash)
    );
    return responses.data;
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
  'responses-for-block'
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
