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
  type SortedResponses,
} from '@/store/responses-store';
import { totalWeightAtom } from '@/store/signers-store';
import { useAtomValue } from 'jotai';
import { PublicKey } from '../public-key';
import { percentString } from 'slot-watch-common';
import { Countdown } from '../countdown';
import { Timestamp } from '../timestamp';
import { useEntity } from '@/hooks/use-entity';

const ExtendSignersRow = ({ response }: { response: SortedResponses }) => {
  const totalWeight = useAtomValue(totalWeightAtom);
  const tenureExtendTimestamp = response.tenureExtendTimestamp ?? null;
  const name = useEntity(response.signing_key);
  return (
    <TableRow key={response.signing_key}>
      <TableCell>
        <PublicKey publicKey={response.signing_key} />
      </TableCell>
      <TableCell>{name}</TableCell>
      <TableCell>{percentString(response.weight / totalWeight)}%</TableCell>
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
        {response.createdAt ? (
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
            key={response.signerPublicKey}
            response={response}
          />
        ))}
      </TableBody>
    </Table>
  );
};
