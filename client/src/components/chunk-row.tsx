import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ChunkEvent } from "slot-watch-common";
import { useMemo, useState } from "react";
import { hex } from "@scure/base";
import { ChunkLabel } from "./chunk-label";
import { ChunkBlock } from "./chunk-block";
import { ChunkData } from "./chunk-data";
import { useTimestamp } from "@/hooks/use-timestamp";

export const ChunkRow = ({ chunk }: { chunk: ChunkEvent }) => {
  const [addr, name] = chunk.contractId.split(".");
  const { timestamp } = useTimestamp(chunk.createdAt);
  return (
    <TableRow>
      <TableCell>{timestamp}</TableCell>
      <TableCell>{chunk.slotId}</TableCell>
      <TableCell>{chunk.version}</TableCell>
      <TableCell>
        {addr.slice(0, 4)}...{name}
      </TableCell>
      <TableCell>
        <ChunkLabel data={chunk.data} />
      </TableCell>
      <TableCell>
        <ChunkBlock chunkData={chunk.data} />
      </TableCell>
      <TableCell className="flex justify-end">
        <ChunkData data={chunk.data} />
      </TableCell>
    </TableRow>
  );
};
