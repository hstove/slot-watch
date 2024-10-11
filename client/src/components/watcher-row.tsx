import {
  CHUNKS_EVENT,
  getChunkId,
  getPayloadId,
  MANY_CHUNKS_EVENT,
  type ChunkEvent,
  type WSPayload,
} from "slot-watch-common";
import { ChunkRow } from "./chunk-row";

export const WatcherRow = ({ payload }: { payload: WSPayload }) => {
  if (payload.type === CHUNKS_EVENT) {
    return <ChunkRow chunk={payload.payload} />;
  }
  if (payload.type === MANY_CHUNKS_EVENT) {
    return payload.payload.map((chunk) => (
      <ChunkRow key={getChunkId(chunk)} chunk={chunk} />
    ));
  }
  return null;
};
