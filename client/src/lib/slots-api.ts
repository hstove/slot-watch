import { hc } from 'hono/client';
import type { SlotWatchServer } from 'slot-watch-api';
import type { TypeMerge } from 'slot-watch-common';
import type { O } from 'ts-toolbelt';

export const slotsApiUrl =
  import.meta.env.VITE_SLOTS_API_URL ?? 'https://slot-watch.fly.dev';

export const slotsWsUrl = slotsApiUrl.replace(/(http)(s)?\:\/\//, 'ws$2://');

export const apiClient = hc<SlotWatchServer>(slotsApiUrl);

export type HealthBlocksResponse = Awaited<
  ReturnType<typeof getHealthBlocks>
>['blocks'];

export type HealthBlockBlock = Omit<HealthBlocksResponse[0], 'signers'>;

export type HealthBlockSigner = HealthBlocksResponse[0]['signers'][0];

export async function getHealthBlocks(
  networkKey: string,
  from?: string,
  to?: string,
) {
  console.log(`Fetching health blocks for ${networkKey}`);
  const response = await apiClient.health['recent-blocks'][':networkKey'].$get({
    param: { networkKey },
    query: {
      from,
      to,
    },
  });
  return response.json();
}

export async function getRecentSigners(networkKey: string) {
  const response = await apiClient['signer-recency'][':networkKey'].$get({
    param: { networkKey },
  });
  return response.json();
}

export async function getChunksByTime(
  networkId: string,
  start: string,
  end: string,
) {
  const response = await apiClient.chunks[':networkKey'][':from'][':to'].$get({
    param: {
      networkKey: networkId,
      from: start,
      to: end,
    },
  });
  return response.json();
}

export async function getChunkById(id: number) {
  const response = await apiClient.chunks.id[':id'].$get({
    param: { id: id.toString() },
  });
  return response.json();
}

export async function getBurnBlocks(networkKey: string) {
  const response = await apiClient['burn-blocks'][':networkKey'].$get({
    param: { networkKey },
  });
  return response.json();
}

export type ApiBurnBlock = Omit<
  Awaited<ReturnType<typeof getBurnBlocks>>['burnBlocks'][0],
  'id'
>;

export async function getBtcBlock(networkKey: string, heightOrHash: string) {
  const response = await apiClient['burn-blocks'][':networkKey'][
    ':heightOrHash'
  ].$get({
    param: { networkKey, heightOrHash },
  });
  return response.json();
}

export async function getBlockResponsesForBlock(
  networkKey: string,
  blockHash: string,
) {
  const response = await apiClient.blocks[':networkKey'][
    ':blockId'
  ].responses.$get({
    param: { networkKey, blockId: blockHash },
  });
  const data = await response.json();
  return data.responses.map((r) => {
    const { chunkId, slotId, ...rest } = r;
    return rest;
  });
}
export type ApiBlockResponseForBlock = Omit<
  Awaited<ReturnType<typeof getBlockResponsesForBlock>>[0],
  'signerPublicKey'
> & {
  signerPublicKey: string;
};

export async function getBlocksForBurnBlock(
  networkKey: string,
  burnBlockHeight: number,
): Promise<ApiBlockForBurnBlock[]> {
  const response = await apiClient['burn-blocks'][':networkKey'][
    ':burnBlockHeight'
  ].blocks.$get({
    param: { networkKey, burnBlockHeight: burnBlockHeight.toString() },
  });
  const data = await response.json();

  return data.blocks.map(({ proposal, stacksBlock }) => {
    const blockTimestamp = stacksBlock?.blockTimestamp ?? proposal.createdAt;
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
        processedAt: stacksBlock.createdAt,
        burnBlockHash: stacksBlock.burnBlockHash,
        readCount: stacksBlock.readCount,
        readLength: stacksBlock.readLength,
        runtime: stacksBlock.runtime,
        writeCount: stacksBlock.writeCount,
        writeLength: stacksBlock.writeLength,
        blockTimestamp,
        indexBlockHash: stacksBlock.indexBlockHash,
        burnBlockTimestamp: stacksBlock.burnBlockTimestamp,
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
    } satisfies ProposalOnlyBlock;
  });
}

type StacksBlockBase = {
  blockTimestamp: string;
  blockHash: string;
  blockHeight: number;
  tenureChangeCause: number | null;
  txCount: number;
  burnBlockHeight: number;
  networkKey: string;
};

interface _ProposalOnlyBlock extends StacksBlockBase {
  consensusHash: string | null;
  minerPublicKey: string | null;
  proposedAt: string;
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

// export type ApiBlockForBurnBlock = {
//   blockHash: string;
//   blockHeight: number;
//   minerPublicKey: string | null;
//   txCount: number;
//   tenureChangeCause: number | null;
//   consensusHash: string | null;
//   burnBlockHeight: number | null;
//   networkKey: string;
//   proposedAt?: string;
//   processedAt?: string;
//   burnBlockHash?: string;
//   blockTimestamp?: string;
//   readCount?: number;
//   readLength?: number;
//   runtime?: number;
//   writeCount?: number;
//   writeLength?: number;
//   timestamp: string;
// };

export async function getSigners(networkKey: string) {
  const response = await apiClient.signers[':networkKey'].$get({
    param: { networkKey },
  });
  return response.json();
}

export type ApiSigners = Awaited<ReturnType<typeof getSigners>>;
export type ApiSigner = ApiSigners['signers'][0];

export async function getTenureChanges(networkKey: string) {
  const response = await apiClient['tenure-changes'][':networkKey'].$get({
    param: { networkKey },
    query: {
      cause: undefined,
    },
  });
  const { tenureChanges } = await response.json();
  return tenureChanges.map((stacksBlock) => {
    return {
      ...stacksBlock,
      processedAt: stacksBlock.createdAt,
      blockTimestamp: stacksBlock.blockTimestamp ?? stacksBlock.createdAt,
    } satisfies ProcessedStacksBlock;
  });
}
