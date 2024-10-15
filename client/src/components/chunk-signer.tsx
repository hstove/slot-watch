import { hex } from "@scure/base";
import { useMemo } from "react";
import {
  recoverChunkPublicKey,
  type ChunkEvent,
  knownSigners,
} from "slot-watch-common";
import { useCopyToClipboard } from "usehooks-ts";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

export const ChunkSigner = ({ chunk }: { chunk: ChunkEvent }) => {
  const { toast } = useToast();
  const pubKey = useMemo(() => {
    const data = hex.decode(chunk.data);
    const pubKey = recoverChunkPublicKey({
      data,
      slotId: chunk.slotId,
      version: chunk.version,
      signature: hex.decode(chunk.signature),
    });
    return pubKey.toHex();
  }, [chunk]);
  const hexCode = pubKey.slice(0, 6);
  const [_, copy] = useCopyToClipboard();
  const name = knownSigners[pubKey];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          onClick={() => {
            copy(pubKey);
            toast({
              title: "Copied to clipboard",
            });
          }}
        >
          <span style={{ color: `#${hexCode}` }}>
            {name ?? pubKey.slice(0, 8)}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{pubKey}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
