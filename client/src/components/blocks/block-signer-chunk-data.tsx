import { chunksByIdAtoms } from '@/store/chunks-store';
import { hex } from '@scure/base';
import { useAtomValue } from 'jotai';
import React from 'react';
import {
  BlockResponseRejectCodes,
  decodeChunkMaybe,
  SignerMessageTypePrefix,
} from 'slot-watch-common';
import { DataLabel, DataValue } from '../data-group';

export function BlockSignerChunkDataInner({ chunkId }: { chunkId: number }) {
  const chunk = useAtomValue(chunksByIdAtoms(chunkId));
  const decoded = decodeChunkMaybe(hex.decode(chunk.data));
  if (!decoded) {
    return null;
  }
  if (decoded.typeId !== SignerMessageTypePrefix.BlockResponse) {
    return null;
  }
  if (decoded.accepted !== false) {
    return null;
  }

  return (
    <>
      <DataLabel>Reason</DataLabel>
      <DataValue>{BlockResponseRejectCodes[decoded.reasonCode]}</DataValue>

      <DataLabel>Reason Code</DataLabel>
      <DataValue>{decoded.reasonCode}</DataValue>
    </>
  );
}

export function BlockSignerChunkData({ chunkId }: { chunkId: number }) {
  return (
    <React.Suspense fallback={null}>
      <BlockSignerChunkDataInner chunkId={chunkId} />
    </React.Suspense>
  );
}
