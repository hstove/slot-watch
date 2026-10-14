import { differenceInSeconds, parseISO } from 'date-fns';
import type { RecentSignerWithLatestResponse } from '@/store/signers-store';
import { SimpleTooltip } from '../simple-tooltip';
import { DataLabel, DataValue } from '../data-group';
import { PublicKey } from '../public-key';
import { Timestamp } from '../timestamp';
import React from 'react';

function colorForTimeAgo(timeAgo: string | null) {
  if (timeAgo === null) return '#dc2626';
  const date = parseISO(timeAgo);
  const diff = differenceInSeconds(new Date(), date);
  if (diff <= 10 * 60) return '#16a34a';
  if (diff <= 60 * 60) return '#d97706';
  return '#dc2626';
}

export const SignerBarItem = ({
  signer,
}: {
  signer: RecentSignerWithLatestResponse;
}) => {
  const color = colorForTimeAgo(signer.createdAt);
  return (
    <SimpleTooltip
      content={
        <div className="grid gap-0 grid-cols-[minmax(100px,min-content)_1fr] items-center">
          {signer.name ? (
            <>
              <DataLabel>Entity</DataLabel>
              <DataValue>{signer.name}</DataValue>
            </>
          ) : null}
          <DataLabel>Public Key</DataLabel>
          <DataValue>
            <PublicKey publicKey={signer.publicKey} />
          </DataValue>
          {signer.signerManagers.map((signerManager) => (
            <React.Fragment key={signerManager}>
              <DataLabel>Signer Manager</DataLabel>
              <DataValue>
                <PublicKey publicKey={signerManager} />
              </DataValue>
            </React.Fragment>
          ))}
          <DataLabel>Weight</DataLabel>
          <DataValue>{signer.weightPercentStr}</DataValue>
          <DataLabel>Version</DataLabel>
          <DataValue>{signer.versionShort}</DataValue>
          {signer.createdAt ? (
            <>
              <DataLabel>Last Seen</DataLabel>
              <DataValue>
                <Timestamp timestamp={signer.createdAt} />
              </DataValue>
            </>
          ) : null}
          {signer.blockHeight ? (
            <>
              <DataLabel>Block Height</DataLabel>
              <DataValue>{signer.blockHeight}</DataValue>
            </>
          ) : null}
        </div>
      }
    >
      <div
        className="h-full cursor-help"
        style={{
          flexBasis: 0,
          flexGrow: signer.weight,
          minWidth: 2,
          backgroundColor: color,
        }}
      />
    </SimpleTooltip>
  );
};
