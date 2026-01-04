import { atom } from 'jotai';
import { atomWithLocation } from 'jotai-location';

// biome-ignore lint/style/useConsistentTypeDefinitions: ignored using `--suppress`
export type Network = {
  id: string;
  name: string;
};

export const NETWORKS = [
  {
    id: 'mainnet',
    name: 'Mainnet',
  },
  {
    id: 'testnet',
    name: 'Testnet',
  },
];

const DEFAULT_NETWORK = {
  id: 'mainnet',
  name: 'Mainnet',
};

function getNetwork(networkId: string | null) {
  if (typeof networkId !== 'string') {
    return DEFAULT_NETWORK;
  }
  return (
    NETWORKS.find((network) => network.id === networkId) || {
      id: networkId,
      name: networkId,
    }
  );
}

export const networkAtom = atom<Network, [string | null], void>(
  (get) => get(currentNetworkAtom),
  (_get, set, networkId) => {
    set(currentNetworkAtom, getNetwork(networkId));
  }
);

const currentNetworkAtom = atom(DEFAULT_NETWORK);

export const networkIdAtom = atom((get) => get(currentNetworkAtom).id);
