import React from 'react';
import { useAtomValue } from 'jotai';
import {
  type SignerLatestResponses,
  sortedLatestResponsesAtom,
  totalWeightAtom,
} from '@/store/blocks-store';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DataLabel, DataValue } from '../data-group';
import { PublicKey } from '../public-key';
import { useEntity } from '@/hooks/use-entity';
import Countdown from 'react-countdown';
import { Text } from '../text';

function ExtendSigner({
  signer,
}: { signer: SignerLatestResponses['responses'][number] }) {
  const totalWeight = useAtomValue(totalWeightAtom);
  const name = useEntity(signer.signing_key);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-full border-r border-r-white border-background last:border-none box-border"
          style={{
            flexGrow: signer.weight + totalWeight * 0.01,
            // backgroundColor: color.toHex(),
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
            {signer.tenureExtendTimestamp
              ? new Date(signer.tenureExtendTimestamp).toLocaleString()
              : 'N/A'}
          </DataValue>

          {signer.tenureExtendTimestamp ? (
            <>
              <DataLabel>Time Remaining</DataLabel>
              <DataValue>
                <Countdown
                  date={signer.tenureExtendTimestamp}
                  renderer={({ hours, minutes, seconds, completed }) => {
                    if (completed) {
                      return (
                        <Text variant={'small'} className="text-green-500">
                          Ready!
                        </Text>
                      );
                    }
                    return (
                      <Text variant={'small'}>
                        {hours.toFixed(0).padStart(2, '0')}:
                        {minutes.toFixed(0).padStart(2, '0')}:
                        {seconds.toFixed(0).padStart(2, '0')}
                      </Text>
                    );
                  }}
                />
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

  return (
    <div className="w-full rounded-md h-10 border border-border flex overflow-hidden">
      {responses.map((r) => (
        <ExtendSigner key={r.signerPublicKey} signer={r} />
      ))}
    </div>
  );
}
