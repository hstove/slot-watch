import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ChunkEvent } from "@/lib/types";
import { useMemo, useState } from "react";
import { hex } from "@scure/base";
import { ChunkLabel } from "./chunk-label";
import { ChunkBlock } from "./chunk-block";
import { ChunkData } from "./chunk-data";

export const ChunkRow = ({ chunk }: { chunk: ChunkEvent }) => {
  const [expandData, setExpandData] = useState(false);
  const [addr, name] = chunk.contractId.split(".");
  const dateTimeString = useMemo(() => {
    const date = new Date(chunk.createdAt);
    let str = date.toLocaleTimeString("en-US", {
      hour12: false,
    });
    const millis = date.getMilliseconds();
    // left pad with 0s
    str += `.${millis.toString().padStart(3, "0")}`;
    return str;
  }, [chunk.createdAt]);
  return (
    <TableRow>
      <TableCell>{dateTimeString}</TableCell>
      <TableCell>{chunk.slotId}</TableCell>
      <TableCell>{chunk.version}</TableCell>
      <TableCell>
        {addr.slice(0, 4)}...{name}
      </TableCell>
      <TableCell>
        <ChunkLabel data={chunk.data} />
      </TableCell>
      <TableCell>
        <ChunkBlock chunk={chunk} />
      </TableCell>
      <TableCell className="flex justify-end">
        <ChunkData data={chunk.data} />
      </TableCell>
    </TableRow>
  );
};
