import type { PayloadAtom } from "@/store/chunks-store";
import { useAtomValue } from "jotai";
import React from "react";
import { NEW_BLOCK_EVENT } from "slot-watch-common";
import { TableRow } from "../ui/table";
import { Timestamp } from "../timestamp";
import { TableCell } from "../ui/table";

export const StxBlockRow = ({ payloadAtom }: { payloadAtom: PayloadAtom }) => {
  const payload = useAtomValue(payloadAtom);
  if (payload.type !== NEW_BLOCK_EVENT) return null;
  const blockId = payload.payload.burn_block_hash;
  const hexCode = blockId.slice(2, 8);

  return (
    <TableRow>
      <TableCell colSpan={3} className="font-mono text-xs">
        <Timestamp timestamp={payload.receivedAt} />
      </TableCell>
      <TableCell>Stacks Block</TableCell>
      <TableCell>
        <span className="mr-2" style={{ color: `#${hexCode}` }}>
          {blockId.slice(2, 10)}
        </span>
        ({payload.payload.burn_block_height})
      </TableCell>
    </TableRow>
  );
};
