import {
  CHUNKS_EVENT,
  type ChunkEvent,
  type WSPayload,
} from "slot-watch-common";
import { ChunkRow } from "./chunk-row";

export const WatcherRow = ({ payload }: { payload: WSPayload }) => {
  let chunk: ChunkEvent | null = null;
  if ("type" in payload && payload.type === CHUNKS_EVENT) {
    chunk = payload.payload;
  }
  if (!chunk) {
    return null;
  }

  <ChunkRow
    key={`${chunk.slotId}-${chunk.version}-${chunk.contractId}`}
    chunk={chunk}
  />;
};
