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
  type MinerCommitsResponse,
  type MinerEconomicsMinersResponse,
  asNetworkKey,
} from 'slot-watch-common';
import type { O } from 'ts-toolbelt';
import { createQueryKeyStore } from '@lukemorales/query-key-factory';

const slotsApiUrl =
  import.meta.env.VITE_SLOTS_API_URL ?? 'https://api.slotwatch.dev';

export const slotsStreamerUrl =
  import.meta.env.VITE_SLOTS_STREAMER_URL ??
  'https://slot-watch-streamer.fly.dev';

export const apiClient = hc<SlotWatchServer>(slotsApiUrl);

export async function getRecentSigners(
  networkKey: string
): Promise<RecentSignersResponse> {
  const response = await apiClient['signer-recency'][':networkKey'].$get({
    param: { networkKey: asNetworkKey(networkKey) },
  });
  return response.json();
}

export type ApiRecentSigners = RecentSignersResponse;

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

/**
 * Fetches the `{ responses, preCommits }` payload for a block in one
 * round-trip. Both datasets come from the same endpoint because the block
 * detail view always renders them together.
 */
export async function getBlockDataForBlock(
  networkKey: string,
  blockHash: string
): Promise<BlockResponsesResponse> {
  if (!blockHash) return { responses: [], preCommits: [] };
  const response = await apiClient.blocks[':networkKey'][
    ':blockId'
  ].responses.$get({
    param: { networkKey: asNetworkKey(networkKey), blockId: blockHash },
  });
  return await response.json();
}

/**
 * Responses-only view of {@link getBlockDataForBlock}, kept for callers that
 * only care about the signer responses.
 */
export async function getBlockResponsesForBlock(
  networkKey: string,
  blockHash: string
): Promise<BlockResponsesResponse['responses']> {
  const { responses } = await getBlockDataForBlock(networkKey, blockHash);
  return responses;
}

export async function getPreCommitsForBlock(
  networkKey: string,
  blockHash: string
): Promise<BlockResponsesResponse['preCommits']> {
  const { preCommits } = await getBlockDataForBlock(networkKey, blockHash);
  return preCommits;
}

export type ApiBlockResponseForBlock = Omit<
  Awaited<ReturnType<typeof getBlockResponsesForBlock>>[0],
  'signerPublicKey'
> & {
  signerPublicKey: string;
};

export type ApiPreCommitForBlock = Awaited<
  ReturnType<typeof getPreCommitsForBlock>
>[0];

function mergeBlockData(
  proposal: ApiBlockProposal,
  stacksBlock: ApiStacksBlock | null
): ApiBlockForBurnBlock {
  const blockTimestamp = stacksBlock?.blockTimestamp ?? proposal.blockTimestamp;
  if (proposal && stacksBlock) {
    return {
      blockHash: proposal.signerSignatureHash,
      blockHeight: proposal.chainLength,
      minerPublicKey: proposal.minerPublicKey,
      txCount: proposal.txCount ?? 0,
      tenureChangeCause: proposal.tenureChangeCause,
      consensusHash: proposal.consensusHash,
      burnBlockHeight: stacksBlock.burnBlockHeight,
      networkKey: proposal.networkKey,
      proposedAt: proposal.createdAt,
      processedAt: stacksBlock.processedAt,
      burnBlockHash: stacksBlock.burnBlockHash,
      readCount: stacksBlock.readCount,
      readLength: stacksBlock.readLength,
      runtime: stacksBlock.runtime,
      writeCount: stacksBlock.writeCount,
      writeLength: stacksBlock.writeLength,
      blockTimestamp,
      indexBlockHash: stacksBlock.indexBlockHash,
      burnBlockTimestamp: stacksBlock.burnBlockTimestamp,
      serverVersion: proposal.serverVersion,
      serverVersionShort: proposal.serverVersionShort,
      txFees: stacksBlock.txFees,
    } satisfies AllInfoBlock;
  }
  return {
    blockHash: proposal.signerSignatureHash,
    blockHeight: proposal.chainLength,
    minerPublicKey: proposal.minerPublicKey,
    txCount: proposal.txCount ?? 0,
    tenureChangeCause: proposal.tenureChangeCause,
    consensusHash: proposal.consensusHash,
    burnBlockHeight: proposal.burnBlockHeight ?? 0,
    networkKey: proposal.networkKey,
    proposedAt: proposal.createdAt,
    blockTimestamp,
    serverVersion: proposal.serverVersion,
    serverVersionShort: proposal.serverVersionShort,
    txFees: proposal.txFees,
  } satisfies ProposalOnlyBlock;
}

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

// biome-ignore lint/style/useConsistentTypeDefinitions: ignored using `--suppress`
type StacksBlockBase = {
  blockTimestamp: string;
  blockHash: string;
  blockHeight: number;
  tenureChangeCause: number | null;
  txCount: number;
  burnBlockHeight: number;
  networkKey: string;
  consensusHash: string;
  txFees: number;
};

interface _ProposalOnlyBlock extends StacksBlockBase {
  minerPublicKey: string | null;
  proposedAt: string;
  serverVersion: string | null;
  serverVersionShort: string | null;
}

interface _ProcessedStacksBlock extends StacksBlockBase {
  processedAt: string;
  burnBlockHash: string;
  readCount: number;
  readLength: number;
  runtime: number;
  writeCount: number;
  writeLength: number;
  indexBlockHash: string | null;
  burnBlockTimestamp: string;
}

export type ProposalOnlyBlock = TypeMerge<
  _ProposalOnlyBlock,
  _ProcessedStacksBlock
>;
export type ProcessedStacksBlock = TypeMerge<
  _ProcessedStacksBlock,
  _ProposalOnlyBlock
>;
export type AllInfoBlock = O.Merge<ProposalOnlyBlock, ProcessedStacksBlock>;

export type ApiBlockForBurnBlock =
  | ProposalOnlyBlock
  | ProcessedStacksBlock
  | AllInfoBlock;

export async function getSigners(networkKey: string): Promise<SignersResponse> {
  const response = await apiClient.signers[':networkKey'].$get({
    param: { networkKey: asNetworkKey(networkKey) },
  });
  return await response.json();
}

export type ApiSigners = SignersResponse;
export type ApiSigner = ApiSigners['signers'][0];

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

export type ApiMinerStats = Awaited<ReturnType<typeof getMinerStats>>;
export type ApiMinerStat = ApiMinerStats['miners'][0];

export async function getMinerEconomicsMiners(
  networkKey: string,
  fromHeight: number,
  toHeight: number
): Promise<MinerEconomicsMinersResponse> {
  const response = await apiClient['miner-economics'][
    ':networkKey'
  ].miners.$get({
    param: { networkKey: asNetworkKey(networkKey) },
    query: { fromHeight: String(fromHeight), toHeight: String(toHeight) },
  });
  if (!response.ok) throw new Error('Failed to fetch miner economics');
  return response.json();
}

export async function getMinerCommits(
  networkKey: string,
  fromHeight: number,
  toHeight: number
): Promise<MinerCommitsResponse> {
  const response = await apiClient['miner-economics'][
    ':networkKey'
  ].commits.$get({
    param: { networkKey: asNetworkKey(networkKey) },
    query: { fromHeight: String(fromHeight), toHeight: String(toHeight) },
  });
  if (!response.ok) throw new Error('Failed to fetch miner commits');
  return response.json();
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

export type ApiMinerDetail = Awaited<ReturnType<typeof getMinerDetail>>;

export async function getStateMachineUpdates(networkKey: string) {
  const response = await apiClient[':networkKey']['state-machines'].$get({
    param: { networkKey: asNetworkKey(networkKey) },
  });
  const data = await response.json();
  return data;
}

export async function getStateMachineHistory(
  networkKey: string,
  cursor?: string
) {
  const response = await apiClient[':networkKey']['state-machine-updates'].$get(
    {
      param: { networkKey: asNetworkKey(networkKey) },
      query: cursor ? { cursor } : {},
    }
  );
  const data = await response.json();
  return data;
}

export const queries = createQueryKeyStore({
  stacksBlocks: {
    forBurnBlock: (networkKey: string, consensusHash: string) => ({
      queryKey: [networkKey, consensusHash],
      queryFn: () => getBlocksForBurnBlock(networkKey, consensusHash),
    }),
  },
  blockResponses: {
    forStacksBlock: (networkKey: string, blockHash: string) => ({
      queryKey: [networkKey, blockHash],
      queryFn: () => getBlockResponsesForBlock(networkKey, blockHash),
    }),
    // Responses + pre-commits in a single request, for consumers that need both.
    dataForStacksBlock: (networkKey: string, blockHash: string) => ({
      queryKey: [networkKey, blockHash],
      queryFn: () => getBlockDataForBlock(networkKey, blockHash),
    }),
  },
  preCommits: {
    forStacksBlock: (networkKey: string, blockHash: string) => ({
      queryKey: [networkKey, blockHash],
      queryFn: () => getPreCommitsForBlock(networkKey, blockHash),
    }),
  },
});

export async function getStacksBlock(
  networkKey: string,
  blockHash: string
): Promise<ApiBlockForBurnBlock> {
  const response = await apiClient.blocks[':networkKey']['stx-blocks'][
    ':blockHash'
  ].$get({
    param: { networkKey: asNetworkKey(networkKey), blockHash },
  });
  const data = await response.json();
  if ('error' in data) {
    throw new Error(data.error);
  }
  return mergeBlockData(data.proposal, data.stacksBlock);
}
