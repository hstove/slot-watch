import { ModeToggle } from "@/components/theme-toggle";
import { useWebSocket } from "@/hooks/use-websocket";
import { useCallback, useMemo } from "react";
import { ReadyState } from "react-use-websocket";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { SimpleTooltip } from "./simple-tooltip";
import { NetworkPicker } from "./network-picker";

const connectionStatusVariants = cva(
  "text-sm text-muted-foreground h-4 w-4 rounded-full",
  {
    variants: {
      readyState: {
        [ReadyState.CONNECTING]: "text-yellow-500 bg-yellow-500",
        [ReadyState.OPEN]: "text-green-500 bg-green-500",
        [ReadyState.CLOSING]: "text-red-500 bg-red-500",
        [ReadyState.CLOSED]: "text-red-500 bg-red-500",
        [ReadyState.UNINSTANTIATED]: "text-red-500 bg-red-500",
      },
    },
    defaultVariants: {
      readyState: ReadyState.UNINSTANTIATED,
    },
  }
);

const connectionStatus = {
  [ReadyState.CONNECTING]: "Connecting",
  [ReadyState.OPEN]: "Connected",
  [ReadyState.CLOSING]: "Closing",
  [ReadyState.CLOSED]: "Closed",
  [ReadyState.UNINSTANTIATED]: "Uninstantiated",
} as const;

export const Header = () => {
  const { readyState } = useWebSocket();
  return (
    <header className="flex items-center justify-between sticky top-0 z-50 bg-background py-3">
      <h1 className="text-2xl font-bold">Slot watch</h1>
      <div className="flex gap-5">
        <NetworkPicker />
        <SimpleTooltip content={`${connectionStatus[readyState]} to server`}>
          <div className={cn(connectionStatusVariants({ readyState }))} />
        </SimpleTooltip>
        <ModeToggle />
      </div>
    </header>
  );
};
