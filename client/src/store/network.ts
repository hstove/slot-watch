import { atom } from 'jotai';
import { allPayloadsAtom } from './chunks-store';
import { atomWithLocation } from 'jotai-location';

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

export const DEFAULT_NETWORK = {
  id: 'mainnet',
  name: 'Mainnet',
};

export function getNetwork(networkId: string | null) {
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

export const locationStore = atomWithLocation();

export const networkAtom = atom<Network, [string | null], void>(
  (get) => get(currentNetworkAtom),
  (_get, set, networkId) => {
    set(allPayloadsAtom, []);
    set(currentNetworkAtom, getNetwork(networkId));
  },
);

export const currentNetworkAtom = atom(DEFAULT_NETWORK);

export const networkIdAtom = atom((get) => get(currentNetworkAtom).id);

export const networkNameAtom = atom((get) => get(currentNetworkAtom).name);
