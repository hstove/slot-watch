import React from 'react';
import { useAtomValue } from 'jotai';
import {
  extendBoundsAtom,
  signerLatestResponseFamilyInner,
  sortedLatestResponsesAtom,
} from '@/store/responses-store';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DataLabel, DataValue } from '../data-group';
import { PublicKey } from '../public-key';
import { useEntity } from '@/hooks/use-entity';
import { Countdown } from '../countdown';
import { Text } from '../text';
import { colord } from 'colord';
import {
  signersApiAtom,
  signersAtomFamily,
  totalWeightAtom,
} from '@/store/signers-store';

const minColor = colord('#15803d');
const maxColor = colord('#0f766e');
const naColor = colord('#52525b');

function ExtendSigner({ signerPublicKey }: { signerPublicKey: string }) {
  const totalWeight = useAtomValue(totalWeightAtom);
  const name = useEntity(signerPublicKey);
  const bounds = useAtomValue(extendBoundsAtom);
  const response = useAtomValue(
    signerLatestResponseFamilyInner(signerPublicKey),
  );
  const signer = useAtomValue(signersAtomFamily(signerPublicKey));
  const color = React.useMemo(() => {
    const ts = response?.tenureExtendTimestamp ?? undefined;
    if (typeof ts === 'undefined') return naColor.toHex();
    if (!ts || !bounds.min) return naColor.toHex();
    if (!bounds.diff) return minColor.toHex();
    const diff = (new Date(ts).getTime() - bounds.min) / bounds.diff;
    if (Number.isNaN(diff)) return minColor.toHex();
    return minColor.mix(maxColor, diff).toHex();
  }, [bounds.diff, bounds.min, response?.tenureExtendTimestamp]);

  if (!signer) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-full box-border transition-colors"
          style={{
            flexGrow: signer.weight + totalWeight * 0.01,
            backgroundColor: color,
            // borderColor: borderColor,
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-0 grid-cols-[minmax(100px,min-content)_1fr] items-center">
          {name ? (
            <>
              <DataLabel>Entity</DataLabel>
              <DataValue>{name}</DataValue>
            </>
          ) : null}

          <DataLabel>Public Key</DataLabel>
          <DataValue>
            <PublicKey publicKey={signer.signing_key} />
          </DataValue>

          <DataLabel>Weight</DataLabel>
          <DataValue>{signer.weight}</DataValue>

          <DataLabel>Tenure Extend</DataLabel>
          <DataValue>
            {typeof response === 'undefined'
              ? null
              : response?.tenureExtendTimestamp
                ? new Date(response.tenureExtendTimestamp).toLocaleString()
                : 'N/A'}
          </DataValue>

          {response?.tenureExtendTimestamp ? (
            <>
              <DataLabel>Time Remaining</DataLabel>
              <DataValue>
                <Text variant={'small'}>
                  <Countdown date={response.tenureExtendTimestamp} />
                </Text>
              </DataValue>
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ExtendSigners() {
  const responses = useAtomValue(sortedLatestResponsesAtom);
  const signers = useAtomValue(signersApiAtom);

  return (
    <div className="w-full rounded-md h-10 border border-border flex overflow-hidden gap-[2px]">
      {responses.map((r) => (
        <ExtendSigner key={r.signing_key} signerPublicKey={r.signing_key} />
      ))}
    </div>
  );
}
