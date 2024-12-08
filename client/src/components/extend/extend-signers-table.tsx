import React from 'react';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  sortedLatestResponsesAtom,
  totalWeightAtom,
} from '@/store/blocks-store';
import { useAtomValue } from 'jotai';
import { PublicKey } from '../public-key';
import { percentString } from 'slot-watch-common';
import Countdown from 'react-countdown';
import { getEntity } from '@/lib/local-signers';
import { TimeAgo } from '../time-ago';

export const ExtendSignersTable = () => {
  const signers = useAtomValue(sortedLatestResponsesAtom);
  const totalWeight = useAtomValue(totalWeightAtom);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Signer</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Weight</TableHead>
          <TableHead>Tenure Extend</TableHead>
          <TableHead>Time Remaining</TableHead>
          <TableHead>Updated at</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {signers.map((signer) => (
          <TableRow key={signer.signing_key}>
            <TableCell>
              <PublicKey publicKey={signer.signing_key} />
            </TableCell>
            <TableCell>{getEntity(signer.signing_key)}</TableCell>
            <TableCell>{percentString(signer.weight / totalWeight)}%</TableCell>
            <TableCell>
              {signer.tenureExtendTimestamp
                ? new Date(signer.tenureExtendTimestamp).toLocaleTimeString()
                : 'N/A'}
            </TableCell>
            <TableCell>
              {signer.tenureExtendTimestamp ? (
                <Countdown date={signer.tenureExtendTimestamp} />
              ) : (
                'N/A'
              )}
            </TableCell>
            <TableCell>
              <TimeAgo date={signer.createdAt} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
