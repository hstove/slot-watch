import { DataTable } from '../ui/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import type { ApiMinerStat } from '@/lib/slots-api';
import { Route } from '../../routes/miners';
import { PublicKey } from '../public-key';
import { getVersionFromString, percentString } from 'slot-watch-common';
import { SimpleTooltip } from '../simple-tooltip';
import { Text } from '../text';

const columns: ColumnDef<ApiMinerStat>[] = [
  {
    header: 'Miner',
    accessorKey: 'publicKey',
    cell: ({ row }) => {
      return <PublicKey publicKey={row.original.publicKey} />;
    },
  },
  {
    header: 'Blocks won (last 1000)',
    accessorKey: 'blocksWon',
    accessorFn: (row) => {
      return percentString(row.count / 1000);
    },
    cell: ({ row }) => {
      const pct = percentString(row.original.count / 1000);
      return <div>{pct}%</div>;
    },
  },
  {
    header: 'Last tenure (BTC Block)',
    accessorKey: 'latestBlock',
    cell: ({ row }) => {
      return <span>{row.original.latestBlock}</span>;
    },
  },
  {
    header: 'Version',
    accessorKey: 'version',
    cell: ({ row }) => {
      return (
        <SimpleTooltip content={row.original.version}>
          <span>{getVersionFromString(row.original.version)}</span>
        </SimpleTooltip>
      );
    },
  },
];
export const Miners = () => {
  const { minerStats } = Route.useLoaderData();
  return (
    <div>
      <DataTable columns={columns} data={minerStats.miners} />
    </div>
  );
};
