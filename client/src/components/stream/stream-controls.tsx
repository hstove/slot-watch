import React, { useEffect } from "react";
import { Switch } from "../ui/switch";
import {
  isStreamLiveAtom,
  searchChunksAtom,
  searchInputsValidAtom,
  streamEndInputAtom,
  streamStartInputAtom,
} from "@/store/chunks-store";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { Text } from "../text";
import { cn } from "@/lib/utils";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export const StreamControls = () => {
  const isStreamLive = useAtomValue(isStreamLiveAtom);
  const [streamStart, setStreamStart] = useAtom(streamStartInputAtom);
  const [streamEnd, setStreamEnd] = useAtom(streamEndInputAtom);
  const searchInputsValid = useAtomValue(searchInputsValidAtom);
  const searchChunks = useSetAtom(searchChunksAtom);

  const hash = React.useMemo(() => {
    return window.location.hash.length > 1 && !isStreamLive;
  }, [isStreamLive]);

  const search = useAtomCallback(
    React.useCallback((_get, set) => {
      set(searchChunksAtom);
    }, [])
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies(hash): <explanation>
  // biome-ignore lint/correctness/useExhaustiveDependencies(search): <explanation>
  React.useEffect(() => {
    if (hash) {
      search();
    }
  }, []);

  const toggleStreamLive = useAtomCallback(
    React.useCallback((_get, set) => {
      set(isStreamLiveAtom, (prev) => !prev);
    }, [])
  );
  return (
    <div className="w-full flex gap-6 items-center sticky top-10 z-50 bg-background py-3">
      <div className="flex gap-2 items-center">
        <Switch checked={isStreamLive} onCheckedChange={toggleStreamLive} />
        <Text
          variant="small"
          className={cn(!isStreamLive && "text-muted-foreground")}
        >
          Stream Live
        </Text>
      </div>
      <Input
        className="max-w-[250px]"
        value={streamStart}
        onChange={(e) => setStreamStart(e.target.value)}
      />

      <Input
        className="max-w-[250px]"
        value={streamEnd}
        onChange={(e) => setStreamEnd(e.target.value)}
      />

      <Button variant="outline" onClick={search} disabled={!searchInputsValid}>
        Search
      </Button>
    </div>
  );
};
