import { atom } from "jotai";

export type Network = {
	id: string;
	name: string;
};

export const NETWORKS: Network[] = [
	{
		id: "testnet",
		name: "Testnet",
	},
	{
		id: "naka-testnet",
		name: "Nakamoto Testnet",
	},
	{
		id: "mainnet",
		name: "Mainnet",
	},
];

export const DEFAULT_NETWORK = NETWORKS[2];

export function getNetwork(networkId: string | null) {
	if (typeof networkId !== "string") {
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
	},
);

export const currentNetworkAtom = atom(DEFAULT_NETWORK);

export const networkIdAtom = atom((get) => get(currentNetworkAtom).id);

export const networkNameAtom = atom((get) => get(currentNetworkAtom).name);
