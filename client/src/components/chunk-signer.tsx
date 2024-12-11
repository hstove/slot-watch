import { hex } from '@scure/base';
import { useMemo } from 'react';
import { recoverChunkPublicKey, type ChunkEvent } from 'slot-watch-common';
import { useCopyToClipboard } from 'usehooks-ts';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { colord, extend } from 'colord';
import harmoniesPlugin from 'colord/plugins/harmonies';

import { useEntity } from '@/hooks/use-entity';

extend([harmoniesPlugin]);

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
  const name = useEntity(pubKey);
  const hexCode = pubKey.slice(0, 6);
  const background = useMemo(() => {
    const text = colord(`#${hexCode}`);
    // return text.invert().alpha(0.5).toHex();
    return text.harmonies('rectangle')[2].lighten(0.7).toHex();
  }, [hexCode]);
  const [_, copy] = useCopyToClipboard();
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          onClick={() => {
            copy(pubKey);
            toast({
              title: 'Copied to clipboard',
            });
          }}
        >
          <div
            className="px-1 rounded-md"
            style={{ backgroundColor: background }}
          >
            <span className="" style={{ color: `#${hexCode}` }}>
              {name ?? pubKey.slice(0, 8)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{pubKey}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
