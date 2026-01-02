import { DataTable, SortableHeader } from '../ui/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import type { ApiMinerStat } from '@/lib/slots-api';
import { Route } from '../../routes/miners';
import { PublicKey } from '../public-key';
import {
  getVersionFromString,
  percentString,
  getSortableVersion,
  versionSort,
} from 'slot-watch-common';
import { SimpleTooltip } from '../simple-tooltip';

const BLOCKS_WON_COUNT = 500;

const columns: ColumnDef<ApiMinerStat>[] = [
  {
    header: 'Miner',
    accessorKey: 'publicKey',
    enableSorting: false,
    cell: ({ row }) => {
      return <PublicKey publicKey={row.original.publicKey} />;
    },
  },
  {
    accessorKey: 'count',
    sortDescFirst: true,
    header: ({ column }) => {
      return (
        <SortableHeader column={column}>
          Blocks won (last {BLOCKS_WON_COUNT})
        </SortableHeader>
      );
    },
    cell: ({ row }) => {
      const pct = percentString(row.original.count / BLOCKS_WON_COUNT);
      return <div>{pct}%</div>;
    },
  },
  {
    accessorKey: 'latestBlock',
    sortDescFirst: true,
    header: ({ column }) => {
      return (
        <SortableHeader column={column}>Last tenure (BTC Block)</SortableHeader>
      );
    },
    cell: ({ row }) => {
      return <span>{row.original.latestBlock}</span>;
    },
  },
  {
    id: 'versionCmp',
    accessorFn: (row) => {
      return getSortableVersion(row.version);
    },
    sortingFn: (a, b) => {
      const aVersion = getSortableVersion(a.original.version);
      const bVersion = getSortableVersion(b.original.version);
      return versionSort(aVersion, bVersion);
    },
    header: ({ column }) => {
      return <SortableHeader column={column}>Version</SortableHeader>;
    },
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
