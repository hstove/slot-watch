import { atom } from "jotai";
import { atomFamily } from "jotai/utils";
import type { WSPayload } from "slot-watch-common";
import { networkIdAtom } from "./network";

export const chunksFamilyStore = atomFamily((_networkId: string) =>
	atom<WSPayload[]>([]),
);

export const allChunksStore = atom<null, [WSPayload], void>(
	null,
	(_get, set, payload) => {
		const networkId = payload.networkKey;
		set(chunksFamilyStore(networkId), (chunks) => [...chunks, payload]);
	},
);

export const currentNetworkChunksStore = atom((get) => {
	const networkId = get(networkIdAtom);
	return get(chunksFamilyStore(networkId));
});
