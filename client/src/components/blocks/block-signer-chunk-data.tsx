import { chunksByIdAtoms } from '@/store/chunks-store';
import { hex } from '@scure/base';
import { useAtomValue } from 'jotai';
import React from 'react';
import {
  BlockResponseRejectCodes,
  BlockResponseValidationCodes,
  decodeChunkMaybe,
  SignerMessageTypePrefix,
} from 'slot-watch-common';
import { DataLabel, DataValue } from '../data-group';

export function BlockSignerChunkDataInner({ chunkId }: { chunkId: string }) {
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

  let validfationReason = '';
  if (typeof decoded.validationCode === 'number') {
    validfationReason =
      BlockResponseValidationCodes[decoded.validationCode] ?? '';
  }

  return (
    <>
      <DataLabel>Reason</DataLabel>
      <DataValue>{BlockResponseRejectCodes[decoded.reasonCode]}</DataValue>

      <DataLabel>Reason Code</DataLabel>
      <DataValue>{decoded.reasonCode}</DataValue>

      {validfationReason ? (
        <>
          <DataLabel>Validation Reason</DataLabel>
          <DataValue>{validfationReason}</DataValue>
        </>
      ) : null}
    </>
  );
}

export function BlockSignerChunkData({ chunkId }: { chunkId: string }) {
  return (
    <React.Suspense fallback={null}>
      <BlockSignerChunkDataInner chunkId={chunkId} />
    </React.Suspense>
  );
}
