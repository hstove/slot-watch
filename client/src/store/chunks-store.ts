import { atom, type PrimitiveAtom } from "jotai";
import { atomFamily, splitAtom } from "jotai/utils";
import {
	BURN_BLOCKS_EVENT,
	type ChunkEvent,
	type ChunkEventParsed,
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
import { format } from "date-fns";
import { atomWithHash } from "jotai-location";

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
	(get, set, payload) => {
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
		const isLive = get(isStreamLiveAtom);
		if (isLive) {
			set(allPayloadsAtom, (payloads) => [...payloads, ...events]);
		}
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

export const isStreamLiveAtom = atomWithHash("live", true);

export const streamStartAtom = atom<number | null>((get) => {
	const streamStartInput = get(streamStartInputAtom);
	const date = Date.parse(streamStartInput);
	if (Number.isNaN(date)) {
		return null;
	}
	return date;
});
export const streamEndAtom = atom<number | null>((get) => {
	const streamEndInput = get(streamEndInputAtom);
	const date = Date.parse(streamEndInput);
	if (Number.isNaN(date)) {
		return null;
	}
	return date;
});

const now = new Date().getTime();

export const streamStartInputAtom = atomWithHash(
	"start",
	new Date(now - 1000 * 60 * 5).toLocaleString(),
);
export const streamEndInputAtom = atomWithHash(
	"end",
	new Date().toLocaleString(),
);

export const searchInputsValidAtom = atom((get) => {
	const start = get(streamStartAtom);
	const end = get(streamEndAtom);
	return start && end;
});

export async function getChunksByTime(
	networkId: string,
	start: number,
	end: number,
) {
	const res = await fetch(
		`https://slot-watch.fly.dev/chunks/${networkId}/${start}/${end}`,
	);
	const data = (await res.json()) as { chunks: ChunkEventParsed[] };
	return data.chunks;
}

const isSearchingAtom = atom(false);

export const searchChunksAtom = atom<null, [], void>(null, async (get, set) => {
	const networkId = get(networkIdAtom);
	const start = get(streamStartAtom);
	const end = get(streamEndAtom);
	const isSearching = get(isSearchingAtom);
	if (!start || !end || isSearching) {
		return;
	}
	console.log("Searching chunks", { start, end });
	set(allPayloadsAtom, []);
	set(isSearchingAtom, true);
	const chunksResponse = await getChunksByTime(networkId, start, end);
	const chunks: WSChunkEvent[] = chunksResponse.map((chunk) => {
		return {
			type: CHUNKS_EVENT,
			payload: chunk,
			networkKey: networkId,
			receivedAt: chunk.createdAt,
		};
	});
	set(allPayloadsAtom, chunks);
	set(isSearchingAtom, false);
});
