import { hc } from 'hono/client';
import type { SlotWatchServer } from 'slot-watch-api';

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

export async function getBlockResponsesForBlock(
  networkKey: string,
  blockHash: string,
) {
  const response = await apiClient.blocks[':networkKey'][
    ':blockId'
  ].responses.$get({
    param: { networkKey, blockId: blockHash },
  });
  return response.json();
}
export type ApiBlockResponseForBlock = Awaited<
  ReturnType<typeof getBlockResponsesForBlock>
>['responses'][0];

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
    return {
      blockHash: proposal.signerSignatureHash,
      blockHeight: proposal.chainLength,
      minerPublicKey: proposal.minerPublicKey,
      txCount: proposal.txCount ?? 0,
      tenureChangeCause: proposal.tenureChangeCause,
      consensusHash: proposal.consensusHash,
      burnBlockHeight: proposal.burnBlockHeight,
      networkKey: proposal.networkKey,
      proposedAt: proposal.createdAt,
      processedAt: stacksBlock?.createdAt,
      burnBlockHash: stacksBlock?.burnBlockHash,
      timestamp: stacksBlock?.blockTimestamp ?? undefined,
      readCount: stacksBlock?.readCount,
      readLength: stacksBlock?.readLength,
      runtime: stacksBlock?.runtime,
      writeCount: stacksBlock?.writeCount,
      writeLength: stacksBlock?.writeLength,
    } satisfies ApiBlockForBurnBlock;
  });
}

export type ApiBlockForBurnBlock = {
  blockHash: string;
  blockHeight: number;
  minerPublicKey: string | null;
  txCount: number;
  tenureChangeCause: number | null;
  consensusHash: string | null;
  burnBlockHeight: number | null;
  networkKey: string;
  proposedAt?: string;
  processedAt?: string;
  burnBlockHash?: string;
  timestamp?: string;
  readCount?: number;
  readLength?: number;
  runtime?: number;
  writeCount?: number;
  writeLength?: number;
};

export async function getSigners(networkKey: string) {
  const response = await apiClient.signers[':networkKey'].$get({
    param: { networkKey },
  });
  return response.json();
}

export type ApiSigners = Awaited<ReturnType<typeof getSigners>>;
export type ApiSigner = ApiSigners['signers'][0];
