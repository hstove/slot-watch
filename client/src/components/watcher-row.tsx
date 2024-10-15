import {
  BURN_BLOCKS_EVENT,
  CHUNKS_EVENT,
  getChunkId,
  getPayloadId,
  MANY_CHUNKS_EVENT,
  NEW_BLOCK_EVENT,
  type ChunkEvent,
  type WSPayload,
} from "slot-watch-common";
import { ChunkRow } from "./chunk-row";
import { TableCell, TableRow } from "./ui/table";
import { useTimestamp } from "@/hooks/use-timestamp";

export const WatcherRow = ({ payload }: { payload: WSPayload }) => {
  const { timestamp } = useTimestamp(payload.receivedAt);
  if (payload.type === CHUNKS_EVENT) {
    return <ChunkRow chunk={payload.payload} />;
  }
  if (payload.type === MANY_CHUNKS_EVENT) {
    return payload.payload.map((chunk) => (
      <ChunkRow key={getChunkId(chunk)} chunk={chunk} />
    ));
  }
  if (payload.type === NEW_BLOCK_EVENT) {
    const blockId = payload.payload.block_hash;
    const hexCode = blockId.slice(2, 8);
    return (
      <TableRow>
        <TableCell colSpan={4}>{timestamp}</TableCell>
        <TableCell>Stacks Block</TableCell>
        <TableCell>
          <span className="mr-2" style={{ color: `#${hexCode}` }}>
            {blockId.slice(2, 10)}
          </span>
          ({payload.payload.block_height})
        </TableCell>
      </TableRow>
    );
  }
  if (payload.type === BURN_BLOCKS_EVENT) {
    return (
      <TableRow>
        <TableCell colSpan={4}>{timestamp}</TableCell>
        <TableCell>Burn Block</TableCell>
        <TableCell>{payload.payload.burn_block_height}</TableCell>
      </TableRow>
    );
  }
  return null;
};
