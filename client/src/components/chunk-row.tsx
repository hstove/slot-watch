import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CHUNKS_EVENT, type ChunkEvent } from 'slot-watch-common';
import { hex } from '@scure/base';
import { ChunkLabel } from './chunk-label';
import { ChunkBlock } from './chunk-block';
import { ChunkData } from './chunk-data';
import { useTimestamp } from '@/hooks/use-timestamp';
import { ChunkSigner } from './chunk-signer';
import type { PayloadAtom } from '@/store/chunks-store';
import { useAtomValue } from 'jotai';
import { Timestamp } from './timestamp';

export const ChunkRow = ({ chunkAtom }: { chunkAtom: PayloadAtom }) => {
  const payload = useAtomValue(chunkAtom);
  if (payload.type !== CHUNKS_EVENT) return null;

  const chunk = payload.payload;
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        <Timestamp timestamp={chunk.createdAt} />
      </TableCell>
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
