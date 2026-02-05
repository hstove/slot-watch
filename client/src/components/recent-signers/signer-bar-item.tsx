import { colord, extend } from 'colord';
import { differenceInSeconds, parseISO } from 'date-fns';
import mixPlugin from 'colord/plugins/mix';
import type { RecentSignerWithLatestResponse } from '@/store/signers-store';
import { SimpleTooltip } from '../simple-tooltip';
import { DataLabel, DataValue } from '../data-group';
import { PublicKey } from '../public-key';
import { Timestamp } from '../timestamp';
import React from 'react';

extend([mixPlugin]);

const okColor = colord('#15803d');
const badColor = colord('#b91c1c');

function colorForTimeAgo(timeAgo: string | null) {
  if (timeAgo === null) return badColor.toHex();
  const date = parseISO(timeAgo);
  const diff = differenceInSeconds(new Date(), date);
  const maxDiff = 60 * 60; // 1 hour
  const ratio = Math.min(diff / maxDiff, 1);
  return okColor.mix(badColor, ratio).toHex();
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
          flexGrow: signer.weight + signer.totalWeight * 0.01,
          backgroundColor: color,
        }}
      />
    </SimpleTooltip>
  );
};
