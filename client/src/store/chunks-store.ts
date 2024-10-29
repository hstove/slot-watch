import { atom, type PrimitiveAtom } from "jotai";
import { atomFamily, splitAtom } from "jotai/utils";
import {
	BURN_BLOCKS_EVENT,
	type ChunkEvent,
	CHUNKS_EVENT,
	type CoreNodeBlockMessage,
	type CoreNodeBurnBlockMessage,
	getPayloadId,
	MANY_CHUNKS_EVENT,
	NEW_BLOCK_EVENT,
	type WSBurnBlock,
	type WSChunkEvent,
	type WSNewBlock,
	type WSPayload,
} from "slot-watch-common";
import { networkIdAtom } from "./network";

export const chunksFamilyStore = atomFamily((_networkId: string) =>
	atom<WSPayload[]>([]),
);

export const allChunksStore = atom<null, [WSPayload], void>(
	null,
	(_get, set, payload) => {
		const networkId = payload.networkKey;
		set(chunksFamilyStore(networkId), (chunks) => {
			return [...chunks.slice(0, 1000), payload];
		});
	},
);

export type Payload = WSChunkEvent | WSNewBlock | WSBurnBlock;

export type PayloadAtom = PrimitiveAtom<Payload>;

// export const allPayloadsFamilyStore = atomFamily((_networkId: string) => {
// 	return atom<Payload[]>([]);
// });

export const allPayloadsAtom = atom<Payload[]>([]);

export const allPayloadsAtomsAtom = splitAtom(allPayloadsAtom, (payload) =>
	getPayloadId(payload),
);

// When network changes, clear all payloads
export const clearAllPayloadsAtom = atom(null, (get, set) => {
	get(networkIdAtom);
	console.log("Resetting all payloads");
	set(allPayloadsAtom, []);
});

export const allPayloadsSetterAtom = atom<null, [WSPayload], void>(
	null,
	(_get, set, payload) => {
		let events: Payload[];
		if (payload.type === CHUNKS_EVENT) {
			events = [payload];
		} else if (payload.type === NEW_BLOCK_EVENT) {
			events = [payload];
		} else if (payload.type === BURN_BLOCKS_EVENT) {
			events = [payload];
		} else if (payload.type === MANY_CHUNKS_EVENT) {
			const chunkEvents: WSChunkEvent[] = payload.payload.map((chunk) => {
				return {
					type: CHUNKS_EVENT,
					payload: chunk,
					networkKey: payload.networkKey,
					receivedAt: payload.receivedAt,
				};
			});
			events = [...chunkEvents];
		}
		set(allPayloadsAtom, (payloads) => [...payloads, ...events]);
		// const networkId = payload.networkKey;
		// set(allPayloadsFamilyStore(networkId), (payloads) => [
		// 	...payloads,
		// 	...events,
		// ]);
	},
);

export const currentNetworkChunksStore = atom((get) => {
	const networkId = get(networkIdAtom);
	return get(chunksFamilyStore(networkId));
});

export const splitNetworkChunksStore = atomFamily((networkId: string) =>
	splitAtom(chunksFamilyStore(networkId), (chunk) => getPayloadId(chunk)),
);

// export const splitNetworkPayloadsStore = atomFamily((networkId: string) =>
// 	splitAtom(allPayloadsFamilyStore(networkId), (payload) =>
// 		getPayloadId(payload),
// 	),
// );
