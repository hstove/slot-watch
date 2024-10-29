import {
  getPayloadId,
  type WSPayload,
  type ChunkEvent,
} from "slot-watch-common";
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
import { useChunksWatcher, useWebSocket } from "@/hooks/use-websocket";
import { WatcherRow } from "./watcher-row";
import { useInView } from "react-intersection-observer";
import useResizeObserver from "@react-hook/resize-observer";
import { Button } from "./ui/button";
import { CheckIcon, Cross2Icon } from "@radix-ui/react-icons";
import { useAtomValue } from "jotai";
import { networkIdAtom } from "@/store/network";
import {
  currentNetworkChunksStore,
  splitNetworkChunksStore,
} from "@/store/chunks-store";

type BurnBlockEvent = {
  burn_block_height: number;
};

const WatcherTable = () => {
  const currentNetworkKey = useAtomValue(networkIdAtom);
  const chunks = useAtomValue(splitNetworkChunksStore(currentNetworkKey));

  return (
    <>
      {chunks.map((chunk) => (
        // <WatcherRow key={getPayloadId(chunk)} payload={chunk} />
        <WatcherRow key={chunk.toString()} payloadAtom={chunk} />
        // <WatcherRow payloadAtom={chunk} />
      ))}
    </>
  );
};

export const WatcherWaiting = () => {
  const currentNetworkKey = useAtomValue(networkIdAtom);
  const chunks = useAtomValue(splitNetworkChunksStore(currentNetworkKey));

  if (chunks.length === 0) {
    return (
      <div className="w-full flex p-10 items-center justify-center">
        <div className="max-w-[500px]">
          <span className="text-lg">Waiting for new data...</span>
        </div>
      </div>
    );
  }

  return null;
};

export const Watcher = () => {
  useChunksWatcher();
  const [keepScrolled, setKeepScrolled] = useState(true);
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
  // biome-ignore lint/correctness/useExhaustiveDependencies(containerHeight):
  useEffect(() => {
    if (keepScrolled) {
      endOfTableRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [containerHeight, endOfTableRef, setLastHeight, keepScrolled]);

  return (
    <>
      <div className="flex-1 flex flex-col w-full pb-10">
        <Table ref={containerRef}>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Slot</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Block</TableHead>
              <TableHead>Signer</TableHead>
              <TableHead className="text-right">{""}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <WatcherTable />
            <TableRow ref={endOfTableRef} />
            <TableRow ref={visibleRef} />
          </TableBody>
        </Table>
        <WatcherWaiting />
      </div>
      <div className="sticky bottom-0 w-full flex justify-end p-4 bg-background bg-opacity-50">
        <Button
          onClick={() => setKeepScrolled(!keepScrolled)}
          variant={"outline"}
        >
          {keepScrolled ? <CheckIcon /> : <Cross2Icon />}
          <span className="ml-2">Keep Scrolled</span>
        </Button>
      </div>
    </>
  );
};
