import React, { useMemo } from 'react';
import { TimeAgo } from '../time-ago';
import {
  decodeChunkMaybe,
  getVersionFromString,
  knownSigners,
  SignerMessageTypePrefix,
  versionFromData,
} from 'slot-watch-common';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { RecentSigner } from 'slot-watch-common';
import type { RecentSignerWithPower } from '@/store/signers';
import { hex } from '@scure/base';
import { SimpleTooltip } from '../simple-tooltip';
import { useToast } from '@/hooks/use-toast';
import { useCopyToClipboard } from 'usehooks-ts';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { Text } from '../text';
import { textVariants } from '@/lib/text-variants';

export const RecentSignerRow = ({ signer }: { signer: RecentSigner }) => {
  const { toast } = useToast();
  const [_, copy] = useCopyToClipboard();

  const versionString = useMemo(() => {
    return versionFromData(signer.data);
  }, [signer.data]);

  const version = useMemo(() => {
    return getVersionFromString(versionString ?? '');
  }, [versionString]);

  return (
    <TableRow>
      <TableCell>{signer.slotId}</TableCell>
      <TableCell>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              className="cursor-pointer"
              onClick={() => {
                copy(signer.publicKey);
                toast({
                  title: 'Copied to clipboard',
                });
              }}
            >
              <code className={textVariants({ variant: 'code' })}>
                {signer.publicKey.slice(0, 8)}
              </code>
            </TooltipTrigger>
            <TooltipContent>
              <p>{signer.publicKey}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
      <TableCell>{knownSigners[signer.publicKey] ?? ''}</TableCell>
      <TableCell>{signer.weightPercentStr}%</TableCell>
      <TableCell>
        {signer.createdAt ? <TimeAgo date={signer.createdAt} /> : ''}
      </TableCell>
      <TableCell>
        <SimpleTooltip content={signer.version}>
          {signer.versionShort}
        </SimpleTooltip>
      </TableCell>
    </TableRow>
  );
};
