import React, { memo } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { blockPushesAtoms, blockSignersAtoms } from '@/store/blocks-store';
import type { HealthBlockSigner } from '@/lib/slots-api';
import { colord } from 'colord';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { textStyles, textVariants } from '@/lib/text-variants';
import { differenceInSeconds } from 'date-fns';
import { PublicKey } from '../public-key';
import { useEntity } from '@/hooks/use-entity';
import { TimeAgo } from '../time-ago';
import { getBtcAddress, percentString } from 'slot-watch-common';
import { DataLabel, DataValue } from '../data-group';
import { BlockSignerChunkData } from './block-signer-chunk-data';

const okColor = colord('#22c55e');
const badColor = colord('#ef4444');

export function BlockSigner({
  signer,
  proposedAt,
  totalWeight,
}: {
  signer: HealthBlockSigner;
  proposedAt: string;
  totalWeight: number;
}) {
  const color = React.useMemo(() => {
    switch (signer.accepted) {
      case true:
        return okColor;
      case false:
        return badColor;
      default:
        return colord('#b0b0b0');
    }
  }, [signer.accepted]);

  const borderColor = React.useMemo(() => {
    return color.darken(0.5).toHex();
  }, [color]);

  const secondsAgo = React.useMemo(() => {
    if (signer.createdAt) {
      return differenceInSeconds(signer.createdAt, proposedAt);
    }
    return null;
  }, [proposedAt, signer.createdAt]);

  const name = useEntity(signer.signing_key);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          key={signer.signing_key}
          type="button"
          className="h-full border-r border-background last:border-none box-border"
          style={{
            flexGrow: signer.weight + totalWeight * 0.01,
            backgroundColor: color.toHex(),
            borderColor: borderColor,
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-0 grid-cols-[minmax(100px,min-content)_1fr] items-center">
          <DataLabel>Public Key</DataLabel>
          <DataValue>
            <PublicKey publicKey={signer.signing_key} />
          </DataValue>

          {!name ? null : (
            <>
              <DataLabel>Name</DataLabel>
              <DataValue>{name}</DataValue>
            </>
          )}

          {signer.createdAt ? (
            <>
              <DataLabel>Responded</DataLabel>
              <DataValue>
                <TimeAgo date={signer.createdAt} />
                {secondsAgo ? ` (${secondsAgo}s)` : ''}
              </DataValue>
            </>
          ) : null}

          <DataLabel>Weight</DataLabel>
          <DataValue>{percentString(signer.weightPercent)}%</DataValue>

          <DataLabel>Response</DataLabel>
          <DataValue>
            {signer.accepted
              ? 'Accepted'
              : signer.accepted === false
                ? 'Rejected'
                : 'none'}
          </DataValue>

          <DataLabel>Tenure Extend</DataLabel>
          <DataValue>
            {signer.tenureExtendTimestamp
              ? new Date(signer.tenureExtendTimestamp).toLocaleString()
              : 'N/A'}
          </DataValue>

          {'chunkId' in signer && signer.chunkId ? (
            <BlockSignerChunkData chunkId={signer.chunkId} />
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function BlockSigners({
  signerSignatureHash,
  proposedAt,
}: {
  signerSignatureHash: string;
  proposedAt: string;
}) {
  const [blockSigners] = useAtom(blockSignersAtoms(signerSignatureHash));
  const block = useAtomValue(blockPushesAtoms(signerSignatureHash));
  if (!block) {
    return null;
  }

  return (
    <div className="w-full rounded-md h-10 border border-border flex overflow-hidden">
      {blockSigners.map((s) => {
        return (
          <BlockSigner
            signer={s}
            key={s.signing_key}
            proposedAt={proposedAt}
            totalWeight={block.totalWeight}
          />
        );
      })}
    </div>
  );
}
