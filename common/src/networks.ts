import { Schema } from 'effect';

const TESTNET_BURN_ADDRESS = 'ST000000000000000000002AMW42H';
const MAINNET_BURN_ADDRESS = 'SP000000000000000000002Q6VF78';

/** The only network Slot Watch currently stores. */
export const NETWORK_KEY_MAINNET = 'mainnet' as const;

export const NetworkKeySchema = Schema.Literal(NETWORK_KEY_MAINNET).annotate({
  identifier: 'NetworkKey',
  description:
    'Stacks network. Slot Watch currently stores only mainnet; other values are rejected.',
});
export type NetworkKey = Schema.Schema.Type<typeof NetworkKeySchema>;

export const NetworkKeyParamSchema = Schema.Struct({
  networkKey: NetworkKeySchema,
}).annotate({ identifier: 'NetworkKeyParam' });

/** Assert a path value as the public API network key. */
export function asNetworkKey(value: string): NetworkKey {
  return value as NetworkKey;
}

export const networkKeyToMainnet: Record<string, boolean> = {
  testnet: false,
  'naka-testnet': false,
};

export function isMainnet(networkKey: string) {
  return networkKeyToMainnet[networkKey] ?? true;
}

export function getBurnAddress(networkKey: string) {
  return isMainnet(networkKey) ? MAINNET_BURN_ADDRESS : TESTNET_BURN_ADDRESS;
}

export function getApiUrl(networkKey: string) {
  switch (networkKey) {
    case 'testnet':
      return 'https://api.testnet.hiro.so';
    case 'naka-testnet':
      // return 'https://api.nakamoto.testnet.hiro.so';
      return 'https://naka.heynky.dev';
    default:
      return 'https://api.hiro.so';
  }
}

export function stacksExplorerNetworkKey(networkKey: string) {
  return isMainnet(networkKey) ? 'mainnet' : 'testnet';
}

export function getStacksExplorerUrl(path: string, networkKey: string) {
  return `https://explorer.hiro.so${path}?chain=${stacksExplorerNetworkKey(networkKey)}`;
}
