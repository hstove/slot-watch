import { DataTable, SortableHeader } from '@/components/ui/data-table';
import { DataLabel, DataValue } from '@/components/data-group';
import { PublicKey } from '@/components/public-key';
import { Timestamp } from '@/components/timestamp';
import { textStyles } from '@/lib/text-variants';
import { SimpleTooltip } from '@/components/simple-tooltip';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronRightIcon } from '@radix-ui/react-icons';
import { truncateMiddle } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import type { MinerVersionHistory, MinerRecentBlock } from 'slot-watch-common';
import type { ApiMinerDetail } from '@/lib/slots-api';

interface MinerDetailProps {
  minerDetail: ApiMinerDetail;
}

const versionHistoryColumns: ColumnDef<MinerVersionHistory>[] = [
  {
    header: 'Version',
    accessorKey: 'versionShort',
    enableSorting: false,
    cell: ({ row }) => (
      <SimpleTooltip content={row.original.version}>
        <span>{row.original.versionShort || row.original.version}</span>
      </SimpleTooltip>
    ),
  },
  {
    header: 'First Seen',
    accessorKey: 'firstSeen',
    enableSorting: false,
    cell: ({ row }) => (
      <Timestamp timestamp={row.original.firstSeen} showMillis={false} />
    ),
  },
  {
    header: 'Last Seen',
    accessorKey: 'lastSeen',
    enableSorting: false,
    cell: ({ row }) => (
      <Timestamp timestamp={row.original.lastSeen} showMillis={false} />
    ),
  },
  {
    header: 'Blocks',
    accessorKey: 'blockCount',
    enableSorting: false,
    cell: ({ row }) => row.original.blockCount.toLocaleString(),
  },
];

const recentBlocksColumns: ColumnDef<MinerRecentBlock>[] = [
  {
    header: ({ column }) => (
      <SortableHeader column={column}>BTC</SortableHeader>
    ),
    accessorKey: 'burnBlockHeight',
    sortDescFirst: true,
    cell: ({ row }) => row.original.burnBlockHeight.toLocaleString(),
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>STX</SortableHeader>
    ),
    accessorKey: 'chainLength',
    sortDescFirst: true,
    cell: ({ row }) => row.original.chainLength.toLocaleString(),
  },
  {
    header: 'Hash',
    accessorKey: 'signerSignatureHash',
    enableSorting: false,
    cell: ({ row }) => (
      <Link
        to="/stx-blocks/$blockHash"
        params={{ blockHash: row.original.signerSignatureHash }}
        className="hover:underline"
      >
        <PublicKey publicKey={row.original.signerSignatureHash} />
      </Link>
    ),
  },
  {
    header: ({ column }) => (
      <SortableHeader column={column}>Time</SortableHeader>
    ),
    accessorKey: 'blockTimestamp',
    sortDescFirst: true,
    cell: ({ row }) => (
      <Timestamp timestamp={row.original.blockTimestamp} showMillis={false} />
    ),
  },
  {
    header: 'TXs',
    accessorKey: 'txCount',
    enableSorting: false,
    cell: ({ row }) => row.original.txCount,
  },
];

function RecentBlockCard({ block }: { block: MinerRecentBlock }) {
  return (
    <Link
      to="/stx-blocks/$blockHash"
      params={{ blockHash: block.signerSignatureHash }}
      className="block border-b border-border p-3 hover:bg-muted/30 active:bg-muted/50 transition-colors last:border-b-0"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex gap-3 text-xs">
            <span>
              BTC{' '}
              <span className="text-foreground font-medium">
                {block.burnBlockHeight.toLocaleString()}
              </span>
            </span>
            <span>
              STX{' '}
              <span className="text-foreground font-medium">
                {block.chainLength.toLocaleString()}
              </span>
            </span>
            <span>{block.txCount} txs</span>
          </div>
          <code className="text-xs font-mono text-muted-foreground block">
            {truncateMiddle(block.signerSignatureHash, 12, 10)}
          </code>
        </div>
        <ChevronRightIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </div>
    </Link>
  );
}

function VersionHistoryCard({ version }: { version: MinerVersionHistory }) {
  return (
    <div className="border-b border-border p-3 last:border-b-0">
      <div className="flex justify-between items-start gap-2">
        <div className="space-y-1">
          <div className="font-mono text-sm">
            {version.versionShort || version.version}
          </div>
          <div className="text-xs text-muted-foreground">
            {version.blockCount.toLocaleString()} blocks
          </div>
        </div>
        <div className="text-xs text-muted-foreground text-right">
          <Timestamp timestamp={version.firstSeen} showMillis={false} />
        </div>
      </div>
    </div>
  );
}

function RecentBlocksDesktop({ blocks }: { blocks: MinerRecentBlock[] }) {
  const navigate = useNavigate();
  return (
    <DataTable
      columns={recentBlocksColumns}
      data={blocks}
      onRowClick={(row) => {
        navigate({
          to: '/stx-blocks/$blockHash',
          params: { blockHash: row.signerSignatureHash },
        });
      }}
    />
  );
}

export function MinerDetail({ minerDetail }: MinerDetailProps) {
  const { miner, recentBlocks } = minerDetail;

  return (
    <div className="flex flex-col gap-6">
      <h1 className={textStyles('h1', 'pb-0 mb-0')}>Miner</h1>

      {/* Miner Identity - stacked on mobile */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 md:grid md:gap-3 md:grid-cols-[minmax(160px,min-content)_1fr] md:items-center">
          <DataLabel>Public Key</DataLabel>
          <DataValue>
            <code className="text-xs font-mono break-all">
              {miner.publicKey}
            </code>
          </DataValue>

          <DataLabel>Current Version</DataLabel>
          <DataValue>
            {miner.currentVersionShort || miner.currentVersion || 'Unknown'}
          </DataValue>
        </div>
      </div>

      {/* Performance Statistics */}
      <div className="space-y-3">
        <h2 className={textStyles('h3')}>Performance</h2>
        {/* Mobile: compact grid */}
        <div className="grid grid-cols-2 gap-3 md:hidden">
          <div className="border border-border p-3">
            <div className="text-xs text-muted-foreground">Last 500</div>
            <div className="text-lg font-medium">
              {miner.stats.last500.percentage.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">
              {miner.stats.last500.blocksWon} blocks
            </div>
          </div>
          <div className="border border-border p-3">
            <div className="text-xs text-muted-foreground">All Time</div>
            <div className="text-lg font-medium">
              {miner.stats.allTime.blocksWon.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">blocks</div>
          </div>
        </div>
        {/* Desktop: standard grid */}
        <div className="hidden md:grid gap-3 grid-cols-[minmax(160px,min-content)_1fr] items-center">
          <DataLabel>Blocks Won (last 500)</DataLabel>
          <DataValue>
            {miner.stats.last500.blocksWon.toLocaleString()} (
            {miner.stats.last500.percentage.toFixed(1)}%)
          </DataValue>

          <DataLabel>Blocks Won (all time)</DataLabel>
          <DataValue>
            {miner.stats.allTime.blocksWon.toLocaleString()}
          </DataValue>

          {miner.stats.allTime.firstSeen && (
            <>
              <DataLabel>First Seen</DataLabel>
              <DataValue>
                <Timestamp
                  timestamp={miner.stats.allTime.firstSeen}
                  showMillis={false}
                />
              </DataValue>
            </>
          )}
        </div>
        {/* Mobile: first seen */}
        {miner.stats.allTime.firstSeen && (
          <div className="md:hidden text-xs text-muted-foreground">
            First seen:{' '}
            <Timestamp
              timestamp={miner.stats.allTime.firstSeen}
              showMillis={false}
            />
          </div>
        )}
      </div>

      {/* Version History */}
      {miner.versionHistory.length > 0 && (
        <div className="space-y-3">
          <h2 className={textStyles('h3')}>Version History</h2>
          {/* Mobile: card list */}
          <div className="md:hidden border border-border">
            {miner.versionHistory.map((v) => (
              <VersionHistoryCard key={v.version} version={v} />
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden md:block">
            <DataTable
              columns={versionHistoryColumns}
              data={miner.versionHistory}
            />
          </div>
        </div>
      )}

      {/* Recent Blocks */}
      {recentBlocks.length > 0 && (
        <div className="space-y-3">
          <h2 className={textStyles('h3')}>Recent Blocks</h2>
          {/* Mobile: card list */}
          <div className="md:hidden border border-border">
            {recentBlocks.map((block) => (
              <RecentBlockCard key={block.signerSignatureHash} block={block} />
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden md:block">
            <RecentBlocksDesktop blocks={recentBlocks} />
          </div>
        </div>
      )}

      {recentBlocks.length === 0 && miner.stats.allTime.blocksWon === 0 && (
        <div className="text-sm text-muted-foreground">
          No blocks found for this miner.
        </div>
      )}
    </div>
  );
}
