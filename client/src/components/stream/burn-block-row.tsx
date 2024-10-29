import React from "react";
import { BURN_BLOCKS_EVENT } from "slot-watch-common";
import { useAtomValue } from "jotai";
import type { PayloadAtom } from "@/store/chunks-store";
import { TableCell, TableRow } from "../ui/table";
import { Timestamp } from "../timestamp";

export const BurnBlockRow = ({ payloadAtom }: { payloadAtom: PayloadAtom }) => {
  const payload = useAtomValue(payloadAtom);
  if (payload.type !== BURN_BLOCKS_EVENT) return null;

  return (
    <TableRow>
      <TableCell colSpan={3} className="font-mono text-xs">
        {/* {timestamp} */}
        <Timestamp timestamp={payload.receivedAt} />
      </TableCell>
      <TableCell>Burn Block</TableCell>
      <TableCell>{payload.payload.burn_block_height}</TableCell>
    </TableRow>
  );
};
