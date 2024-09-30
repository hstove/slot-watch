import type { ChunkEvent } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChunkRow } from "./chunk-row";
import { useWebSocket } from "@/hooks/use-websocket";

const wsUrl = "wss://slot-watch.fly.dev/watch";

type BurnBlockEvent = {
  burn_block_height: number;
};

export const Watcher = () => {
  const [_chunks, setChunks] = useState<ChunkEvent[]>([]);
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const containerRef = useRef<HTMLTableElement>(null!);
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const endOfTableRef = useRef<HTMLTableRowElement>(null!);

  const scrollToBottom = useCallback(() => {
    endOfTableRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const isScrolledToBottom = useCallback(() => {
    const { scrollTop, scrollHeight, clientHeight } =
      // biome-ignore lint/style/noNonNullAssertion: <explanation>
      document.querySelector("html")!;
    // Allow for a small buffer (1px) to account for potential rounding errors
    return scrollHeight - scrollTop - clientHeight <= 1;
  }, []);

  const handleNewMessage = useCallback(() => {
    const isScrolled = isScrolledToBottom();
    if (isScrolled) {
      setTimeout(() => {
        scrollToBottom();
      }, 200);
    }
  }, [isScrolledToBottom, scrollToBottom]);

  const chunks = useWebSocket(handleNewMessage);

  return (
    <Table ref={containerRef}>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Slot</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Contract</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Block</TableHead>
          <TableHead className="text-right">{""}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {chunks.map((chunk) => (
          <ChunkRow
            key={`${chunk.slotId}-${chunk.version}-${chunk.contractId}`}
            chunk={chunk}
          />
        ))}
        <TableRow ref={endOfTableRef} />
      </TableBody>
    </Table>
  );
};
