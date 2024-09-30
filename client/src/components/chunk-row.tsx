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
import { useState } from "react";
import { hex } from "@scure/base";
import { ChunkData } from "./chunk-data";
import { ChunkBlock } from "./chunk-block";

export const ChunkRow = ({ chunk }: { chunk: ChunkEvent }) => {
  const [expandData, setExpandData] = useState(false);
  const [addr, name] = chunk.contractId.split(".");
  return (
    <TableRow>
      <TableCell>
        {new Date(chunk.createdAt).toLocaleTimeString("en-US", {
          hour12: false,
        })}
        .{new Date(chunk.createdAt).getMilliseconds()}
      </TableCell>
      <TableCell>{chunk.slotId}</TableCell>
      <TableCell>{chunk.version}</TableCell>
      <TableCell>
        {addr.slice(0, 4)}...{name}
      </TableCell>
      <TableCell>
        <ChunkData data={chunk.data} />
      </TableCell>
      <TableCell>
        <ChunkBlock chunk={chunk} />
      </TableCell>
      <TableCell className="w-[100px] md:w-[300px]">
        {expandData ? (
          <div
            className="text-wrap text-xs break-all cursor-pointer"
            onClick={() => setExpandData(!expandData)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setExpandData(!expandData);
              }
            }}
          >
            {chunk.data}
          </div>
        ) : (
          <button type="button" onClick={() => setExpandData(!expandData)}>
            Show Data
          </button>
        )}
        {/* <button type="button" onClick={() => setExpandData(!expandData)}>
					{expandData ? "Hide" : "Show"}
				</button>
				{expandData && ( */}
      </TableCell>
    </TableRow>
  );
};
