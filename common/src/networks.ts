const TESTNET_BURN_ADDRESS = 'ST000000000000000000002AMW42H';
const MAINNET_BURN_ADDRESS = 'SP000000000000000000002Q6VF78';

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
