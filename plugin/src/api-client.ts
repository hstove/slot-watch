import { hc } from 'hono/client';
import type { SlotWatchServer } from 'slot-watch-api';
import {
  type ApiBlockProposal,
  type ApiStacksBlock,
  strip0x,
  type TypeMerge,
  type BurnBlocksResponse,
  type SignersResponse,
  type RecentSignersResponse,
  type BlockResponsesResponse,
  asNetworkKey,
} from 'slot-watch-common';
import type { O } from 'ts-toolbelt';
import {
  mergeBlockData,
  type ApiBlockForBurnBlock,
  type ProcessedStacksBlock,
} from 'slot-watch-common/stacks-blocks';

export const DEFAULT_SLOT_WATCH_API_URL = 'https://api.slotwatch.dev';

export const makeApiClient = (url: string = DEFAULT_SLOT_WATCH_API_URL) => {
  return hc<SlotWatchServer>(url);
};

const apiClient = makeApiClient();

export async function getRecentSigners(
  networkKey: string
): Promise<RecentSignersResponse> {
  const response = await apiClient['signer-recency'][':networkKey'].$get({
    param: { networkKey: asNetworkKey(networkKey) },
  });
  return response.json();
}

export async function getBurnBlocks(
  networkKey: string
): Promise<BurnBlocksResponse> {
  const response = await apiClient['burn-blocks'][':networkKey'].$get({
    param: { networkKey: asNetworkKey(networkKey) },
  });
  if (response.ok) {
    return response.json();
  }
  throw new Error('Failed to fetch burn blocks');
}

export async function getBtcBlock(networkKey: string, heightOrHash: string) {
  const response = await apiClient['burn-blocks'][':networkKey'][
    ':heightOrHash'
  ].$get({
    param: { networkKey: asNetworkKey(networkKey), heightOrHash },
  });
  return response.json();
}

export async function getBlockResponsesForBlock(
  networkKey: string,
  blockHash: string
): Promise<BlockResponsesResponse['responses']> {
  if (!blockHash) return [];
  const response = await apiClient.blocks[':networkKey'][
    ':blockId'
  ].responses.$get({
    param: { networkKey: asNetworkKey(networkKey), blockId: blockHash },
  });
  const data = await response.json();
  return data.responses;
}

export type ApiBlockResponseForBlock = Omit<
  Awaited<ReturnType<typeof getBlockResponsesForBlock>>[0],
  'signerPublicKey'
> & {
  signerPublicKey: string;
};

async function getBlocksForBurnBlock(
  networkKey: string,
  consensusHash: string
): Promise<ApiBlockForBurnBlock[]> {
  const response = await apiClient['burn-blocks'][':networkKey'][
    ':consensusHash'
  ].blocks.$get({
    param: {
      networkKey: asNetworkKey(networkKey),
      consensusHash: strip0x(consensusHash),
    },
  });
  const data = await response.json();

  return data.blocks.map(({ proposal, stacksBlock }) =>
    mergeBlockData(proposal, stacksBlock)
  );
}

export async function getSigners(networkKey: string): Promise<SignersResponse> {
  const response = await apiClient.signers[':networkKey'].$get({
    param: { networkKey: asNetworkKey(networkKey) },
  });
  return await response.json();
}

export async function getTenureChanges(
  networkKey: string
): Promise<ProcessedStacksBlock[]> {
  const response = await apiClient['tenure-changes'][':networkKey'].$get({
    param: { networkKey: asNetworkKey(networkKey) },
    query: {
      cause: undefined,
    },
  });
  const { tenureChanges } = await response.json();
  return tenureChanges.map((stacksBlock) => {
    return {
      ...stacksBlock,
      processedAt: stacksBlock.processedAt,
      blockTimestamp: stacksBlock.blockTimestamp,
      // serverVersion: stacksBlock.serverVersion,
      // serverVersionShort: getVersionFromString(stacksBlock.serverVersion),
    } satisfies ProcessedStacksBlock;
  });
}

export async function getMinerStats(networkKey: string) {
  const response = await apiClient[':networkKey'].miners.$get({
    param: { networkKey: asNetworkKey(networkKey) },
  });
  return (await response.json()).minerStats;
}

export async function getMinerDetail(networkKey: string, publicKey: string) {
  const response = await apiClient[':networkKey'].miners[':publicKey'].$get({
    param: { networkKey: asNetworkKey(networkKey), publicKey },
  });
  if (!response.ok) {
    throw new Error('Miner not found');
  }
  return response.json();
}
