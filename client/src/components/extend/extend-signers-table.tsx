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
  mostRecentTenureChangeAtom,
  signerLatestResponseFamilyInner,
  sortedLatestResponsesAtom,
} from '@/store/responses-store';
import { signersAtomFamily, totalWeightAtom } from '@/store/signers-store';
import { useAtomValue } from 'jotai';
import { PublicKey } from '../public-key';
import { percentString } from 'slot-watch-common';
import { Countdown } from '../countdown';
import { Timestamp } from '../timestamp';
import { useEntity } from '@/hooks/use-entity';

const ExtendSignersRow = ({ publicKey }: { publicKey: string }) => {
  const totalWeight = useAtomValue(totalWeightAtom);
  const response = useAtomValue(signerLatestResponseFamilyInner(publicKey));
  const signer = useAtomValue(signersAtomFamily(publicKey));
  const name = useEntity(publicKey);
  const mostRecentTenureChange = useAtomValue(mostRecentTenureChangeAtom);
  const tenureExtendTimestamp = React.useMemo(() => {
    const ts = response?.tenureExtendTimestamp ?? null;
    if (
      mostRecentTenureChange &&
      ts &&
      new Date(ts).getTime() < mostRecentTenureChange
    ) {
      return null;
    }
    return ts;
  }, [response?.tenureExtendTimestamp, mostRecentTenureChange]);
  if (!signer) return null;
  return (
    <TableRow>
      <TableCell>
        <PublicKey publicKey={publicKey} />
      </TableCell>
      <TableCell>{name}</TableCell>
      <TableCell>{percentString(signer.weight / totalWeight)}%</TableCell>
      <TableCell>
        {tenureExtendTimestamp
          ? new Date(tenureExtendTimestamp).toLocaleTimeString()
          : null}
      </TableCell>
      <TableCell>
        {tenureExtendTimestamp ? (
          <Countdown date={tenureExtendTimestamp} />
        ) : null}
      </TableCell>
      <TableCell>
        {response?.createdAt ? (
          <Timestamp timestamp={response.createdAt} />
        ) : null}
      </TableCell>
    </TableRow>
  );
};

export const ExtendSignersTable = () => {
  const responses = useAtomValue(sortedLatestResponsesAtom);
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
        {responses.map((response) => (
          <ExtendSignersRow
            key={response.publicKey}
            publicKey={response.publicKey}
          />
        ))}
      </TableBody>
    </Table>
  );
};
