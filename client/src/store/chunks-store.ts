import { atom, type PrimitiveAtom } from 'jotai';
import { atomFamily, splitAtom } from 'jotai/utils';
import {
  BURN_BLOCKS_EVENT,
  CHUNKS_EVENT,
  getPayloadId,
  MANY_CHUNKS_EVENT,
  NEW_BLOCK_EVENT,
  type WSBurnBlock,
  type WSChunkEvent,
  type WSNewBlock,
  type WSPayload,
} from 'slot-watch-common';
import { networkIdAtom } from './network';
import { atomWithHash } from 'jotai-location';
import { getChunkById, getChunksByTime } from '@/lib/slots-api';

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
  console.log('Resetting all payloads');
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

export const isStreamLiveAtom = atomWithHash('live', true);

export const streamStartAtom = atomWithHash<string | null>('start', null);
export const streamEndAtom = atomWithHash<string | null>('end', null);

const now = new Date().getTime();

const defaultStart = new Date(now - 1000 * 60 * 5).toLocaleString();
// export const streamStartInputAtom = atomWithHash("start", defaultStart);
export const streamStartInputAtom = atom(defaultStart);

const defaultEnd = new Date(now).toLocaleString();
export const streamEndInputAtom = atom(defaultEnd);

export function isValidDateString(dateString: string) {
  const date = Date.parse(dateString);
  if (Number.isNaN(date)) return false;
  return true;
}

export const searchInputsValidAtom = atom((get) => {
  const startString = get(streamStartInputAtom);
  const endString = get(streamEndInputAtom);
  return isValidDateString(startString) && isValidDateString(endString);
});

const isSearchingAtom = atom(false);

export const searchChunksAtom = atom<null, [], void>(null, async (get, set) => {
  const networkId = get(networkIdAtom);
  // const startString = get(streamStartInputAtom);
  // const endString = get(streamEndInputAtom);
  const isSearching = get(isSearchingAtom);
  const start = get(streamStartAtom);
  const end = get(streamEndAtom);
  if (!start || !end || isSearching) {
    console.log('Not searching', { start, end, isSearching });
    return;
  }
  // const start = Date.parse(startString);
  // const end = Date.parse(endString);
  console.log('Searching chunks', { start, end });
  // set(streamStartAtom, start.toString());
  // set(streamEndAtom, end.toString());
  set(allPayloadsAtom, []);
  set(isSearchingAtom, true);
  const chunksResponse = await getChunksByTime(networkId, start, end);

  const chunks: WSChunkEvent[] = chunksResponse.chunks.map((chunk) => {
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

export const chunksByIdAtoms = atomFamily((id: string) =>
  atom(async () => {
    const chunk = await getChunkById(id);
    return chunk;
  }),
);
