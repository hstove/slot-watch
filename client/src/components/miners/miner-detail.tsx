import { DataTable } from '@/components/ui/data-table';
import { Timestamp } from '@/components/timestamp';
import { SimpleTooltip } from '@/components/simple-tooltip';
import type { ColumnDef } from '@tanstack/react-table';
import type { MinerVersionHistory } from 'slot-watch-common';
import type { ApiMinerDetail } from '@/lib/slots-api';
import { getBtcAddress, getStacksAddress } from 'slot-watch-common';
import { Metric } from './miner-overview';
import { CopyValue } from './miner-identity';
import {
  MinerEconomicsPanel,
  type MinerEconomicsData,
} from './miner-economics-panel';

interface MinerDetailProps {
  minerDetail: ApiMinerDetail;
  economics: MinerEconomicsData | null;
  networkKey: string;
}

function safeAddress(fn: () => string) {
  try {
    return fn();
  } catch {
    return null;
  }
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/50 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 last:border-b-0">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <CopyValue
        value={value}
        head={value.length}
        tail={0}
        wrap
        className="text-xs leading-4 text-foreground sm:text-right"
      />
    </div>
  );
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

export function MinerDetail({
  minerDetail,
  economics,
  networkKey,
}: MinerDetailProps) {
  const { miner } = minerDetail;
  const stxAddress = safeAddress(() =>
    getStacksAddress(miner.publicKey, networkKey)
  );
  const btcAddress = safeAddress(() => getBtcAddress(miner.publicKey));

  return (
    <div className="flex flex-col gap-2">
      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h1 className="font-mono text-sm font-medium">miner</h1>
          <span className="font-mono text-[10px] text-muted-foreground">
            {miner.currentVersion ?? 'unknown version'}
          </span>
        </div>
        <div className="grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="border-b border-border px-3 py-2 md:border-r md:border-b-0">
            <IdentityRow label="public key" value={miner.publicKey} />
            {stxAddress ? (
              <IdentityRow label="stx address" value={stxAddress} />
            ) : null}
            {btcAddress ? (
              <IdentityRow label="btc address" value={btcAddress} />
            ) : null}
          </div>
          <div className="grid grid-cols-2">
            <Metric
              label="last 500"
              value={`${miner.stats.last500.percentage.toFixed(1)}%`}
              detail={`${miner.stats.last500.blocksWon} tenures won`}
            />
            <Metric label="version" value={miner.currentVersionShort ?? '–'} />
          </div>
        </div>
      </section>

      {economics ? (
        <MinerEconomicsPanel
          data={economics}
          publicKey={miner.publicKey}
          networkKey={networkKey}
        />
      ) : null}

      {/* Version History */}
      {miner.versionHistory.length > 0 && (
        <section className="border border-border bg-card">
          <div className="border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            version history
          </div>
          {/* Mobile: card list */}
          <div className="md:hidden">
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
        </section>
      )}
    </div>
  );
}
