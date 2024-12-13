import {
  chunkTypeName,
  SignerMessageTypePrefix,
  BlockResponseRejectCodes,
  BlockResponseValidationCodes,
  decodeChunkMaybe,
} from 'slot-watch-common';
import { memo } from 'react';
import { hex } from '@scure/base';
import { SimpleTooltip } from './simple-tooltip';

function RejectedLabel({ data }: { data: string }) {
  try {
    const decoded = decodeChunkMaybe(hex.decode(data));
    if (!decoded) {
      return null;
    }
    if (decoded.typeId !== SignerMessageTypePrefix.BlockResponse) {
      return null;
    }
    if (decoded.accepted === true) return null;
    const { reasonCode, validationCode } = decoded;
    const hasValidationCode = typeof validationCode === 'number';
    const reason = BlockResponseRejectCodes[reasonCode] ?? '';
    let validfationReason = 'Unknown';
    if (hasValidationCode) {
      validfationReason = BlockResponseValidationCodes[validationCode] ?? '';
    }
    return (
      <span className="ml-2">
        (<ValidationError code={reasonCode} message={reason} />
        {hasValidationCode ? (
          <>
            {' - '}
            <ValidationError
              code={validationCode}
              message={validfationReason}
            />
          </>
        ) : null}
        )
      </span>
    );
  } catch {
    console.error('Failed to decode chunk in RejectedLabel', data);
    return null;
  }
}

function ValidationError({ code, message }: { code: number; message: string }) {
  return <SimpleTooltip content={<span>{message}</span>}>{code}</SimpleTooltip>;
}

function ChunkLabelOuter({ data }: { data: string }) {
  const bytes = hex.decode(data);
  const label = chunkTypeName(bytes);
  if (bytes[0] === SignerMessageTypePrefix.BlockResponse) {
    const accepted = bytes[1] === 0;
    return (
      <>
        <span className={accepted ? 'text-green-500' : 'text-red-500'}>
          {label}
        </span>
        <RejectedLabel data={data} />
      </>
    );
  }
  return <span>{label}</span>;
}

export const ChunkLabel = memo(ChunkLabelOuter);
