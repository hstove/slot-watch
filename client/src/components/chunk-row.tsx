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
import { ChunkSigner } from "./chunk-signer";

export const ChunkRow = ({ chunk }: { chunk: ChunkEvent }) => {
  const [addr, name] = chunk.contractId.split(".");
  const { timestamp } = useTimestamp(chunk.createdAt);
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{timestamp}</TableCell>
      <TableCell className="font-mono text-xs">{chunk.slotId}</TableCell>
      <TableCell className="font-mono text-xs">{chunk.version}</TableCell>
      {/* <TableCell>{name}</TableCell> */}
      <TableCell>
        <ChunkLabel data={chunk.data} />
      </TableCell>
      <TableCell>
        <ChunkBlock chunkData={chunk.data} />
      </TableCell>
      <TableCell>
        <ChunkSigner chunk={chunk} />
      </TableCell>
      <TableCell className="flex justify-end">
        <ChunkData data={chunk.data} />
      </TableCell>
    </TableRow>
  );
};
