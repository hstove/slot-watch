import { hc } from 'hono/client';
import type { SlotWatchServer } from 'slot-watch-api';

export const apiClient = hc<SlotWatchServer>('https://slot-watch.fly.dev');

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
