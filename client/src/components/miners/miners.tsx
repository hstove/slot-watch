import { DataTable, SortableHeader } from '../ui/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import type { ApiMinerStat } from '@/lib/slots-api';
import { Route } from '../../routes/miners/index';
import { PublicKey } from '../public-key';
import {
  getVersionFromString,
  percentString,
  getSortableVersion,
  versionSort,
} from 'slot-watch-common';
import { SimpleTooltip } from '../simple-tooltip';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronRightIcon } from '@radix-ui/react-icons';

const BLOCKS_WON_COUNT = 500;

const columns: ColumnDef<ApiMinerStat>[] = [
  {
    header: 'Miner',
    accessorKey: 'publicKey',
    enableSorting: false,
    cell: ({ row }) => {
      return (
        <Link
          to="/miners/$publicKey"
          params={{ publicKey: row.original.publicKey }}
          className="hover:underline"
        >
          <PublicKey publicKey={row.original.publicKey} />
        </Link>
      );
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

function MinerCard({ miner }: { miner: ApiMinerStat }) {
  const pct = percentString(miner.count / BLOCKS_WON_COUNT);
  return (
    <Link
      to="/miners/$publicKey"
      params={{ publicKey: miner.publicKey }}
      className="block border border-border p-4 hover:bg-muted/30 active:bg-muted/50 transition-colors"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          <code className="text-xs font-mono block truncate">
            {miner.publicKey}
          </code>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="text-foreground font-medium">{pct}%</span> blocks
            </span>
            <span>
              BTC{' '}
              <span className="text-foreground">
                {miner.latestBlock.toLocaleString()}
              </span>
            </span>
            <span>{getVersionFromString(miner.version)}</span>
          </div>
        </div>
        <ChevronRightIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
      </div>
    </Link>
  );
}

function MinersMobileList({ miners }: { miners: ApiMinerStat[] }) {
  return (
    <div className="flex flex-col divide-y divide-border border border-border">
      {miners.map((miner) => (
        <MinerCard key={miner.publicKey} miner={miner} />
      ))}
    </div>
  );
}

function MinersDesktopTable({ miners }: { miners: ApiMinerStat[] }) {
  const navigate = useNavigate();
  return (
    <DataTable
      columns={columns}
      data={miners}
      onRowClick={(row) => {
        navigate({
          to: '/miners/$publicKey',
          params: { publicKey: row.publicKey },
        });
      }}
    />
  );
}

export const Miners = () => {
  const { minerStats } = Route.useLoaderData();
  return (
    <div>
      {/* Mobile: card list */}
      <div className="md:hidden">
        <MinersMobileList miners={minerStats.miners} />
      </div>
      {/* Desktop: data table */}
      <div className="hidden md:block">
        <MinersDesktopTable miners={minerStats.miners} />
      </div>
    </div>
  );
};
