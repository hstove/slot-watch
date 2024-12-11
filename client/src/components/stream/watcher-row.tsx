
import { ChunkRow } from '../chunk-row';
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
