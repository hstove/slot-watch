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

export async function getHealthBlocks(networkKey: string) {
  console.log(`Fetching health blocks for ${networkKey}`);
  const response = await apiClient.health['recent-blocks'][':networkKey'].$get({
    param: { networkKey },
  });
  return response.json();
}

export async function getRecentSigners(networkKey: string) {
  const response = await apiClient['signer-recency'][':networkKey'].$get({
    param: { networkKey },
  });
  return response.json();
}
