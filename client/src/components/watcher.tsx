import { getPayloadId, type ChunkEvent } from "slot-watch-common";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { WatcherRow } from "./watcher-row";
import { useInView } from "react-intersection-observer";
const wsUrl = "wss://slot-watch.fly.dev/watch";
import useResizeObserver from "@react-hook/resize-observer";
import { useChunksStore } from "@/store";

type BurnBlockEvent = {
  burn_block_height: number;
};

export const Watcher = () => {
  const chunks = useChunksStore((state) => state.chunks);
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const containerRef = useRef<HTMLTableElement>(null!);
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const endOfTableRef = useRef<HTMLTableRowElement>(null!);
  const { ref: visibleRef, inView } = useInView({
    threshold: 0,
  });
  const [containerHeight, setContainerHeight] = useState(0);
  const [wasInView, setWasInView] = useState(false);
  const [lastHeight, setLastHeight] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useLayoutEffect(() => {
    setContainerHeight(containerRef.current.clientHeight);
  }, [containerRef.current]);

  useResizeObserver(containerRef, (entry) => {
    setContainerHeight(entry.contentRect.height);
  });

  useEffect(() => {
    const sameHeight = containerHeight === lastHeight;
    if (inView && sameHeight) {
      setWasInView(true);
    } else if (!inView && sameHeight) {
      setWasInView(false);
    }
  }, [inView, containerHeight, lastHeight]);

  // biome-ignore lint/correctness/useExhaustiveDependencies(endOfTableRef):
  // biome-ignore lint/correctness/useExhaustiveDependencies(setLastHeight):
  // biome-ignore lint/correctness/useExhaustiveDependencies(inView):
  useEffect(() => {
    // console.log("Height changed", containerHeight, inView, wasInView);
    if (wasInView) {
      endOfTableRef.current?.scrollIntoView({ behavior: "instant" });
    }
    setLastHeight(containerHeight);
  }, [containerHeight, endOfTableRef, setLastHeight, wasInView]);

  useWebSocket({
    networkKey: "testnet",
  });

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
          <WatcherRow key={getPayloadId(chunk)} payload={chunk} />
        ))}
        {/* <TableRow>
          <TableCell colSpan={4}>17:56:12.363</TableCell>
          <TableCell>New Burn Block</TableCell>
          <TableCell>51002</TableCell>
        </TableRow> */}
        <TableRow ref={endOfTableRef} />
        <TableRow ref={visibleRef} />
      </TableBody>
    </Table>
  );
};
