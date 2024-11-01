import {
  BURN_BLOCKS_EVENT,
  CHUNKS_EVENT,
  getChunkId,
  getPayloadId,
  MANY_CHUNKS_EVENT,
  NEW_BLOCK_EVENT,
  type ChunkEvent,
  type WSPayload,
} from 'slot-watch-common';
import { ChunkRow } from '../chunk-row';
import { TableCell, TableRow } from '../ui/table';
import { useTimestamp } from '@/hooks/use-timestamp';
import { type PrimitiveAtom, useAtomValue } from 'jotai';
import type { PayloadAtom } from '@/store/chunks-store';
import { StxBlockRow } from './stx-block-row';
import { BurnBlockRow } from './burn-block-row';

export const WatcherRow = ({ payloadAtom }: { payloadAtom: PayloadAtom }) => {
  return (
    <>
      <ChunkRow chunkAtom={payloadAtom} />
      <StxBlockRow payloadAtom={payloadAtom} />
      <BurnBlockRow payloadAtom={payloadAtom} />
    </>
  );
};
