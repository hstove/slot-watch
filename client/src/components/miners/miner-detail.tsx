import { DataTable } from '@/components/ui/data-table';
import { Timestamp } from '@/components/timestamp';
import { SimpleTooltip } from '@/components/simple-tooltip';
import { cn } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import type { MinerVersionHistory } from 'slot-watch-common';
import type { ApiMinerDetail } from '@/lib/slots-api';
import { getStacksAddress, minerDisplay } from 'slot-watch-common';
import { Metric } from './miner-overview';
import { CopyValue, MinerNameTag } from './miner-identity';
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

/**
 * Reward addresses beyond the commit-derived `stxAddress`: `coinbase` are the
 * addresses signing this miner's coinbase txs (`miner_rewards.miner_address`),
 * and `recipients` are where those rewards were paid, when different.
 */
function rewardIdentities(
  economics: MinerEconomicsData | null,
  stxAddress: string | null
) {
  if (!(economics && stxAddress)) return { coinbase: [], recipients: [] };
  const miners = [
    ...economics.economics.miners,
    ...(economics.matured?.miners ?? []),
  ].filter((m) => m.minerAddress === stxAddress);
  const coinbase = new Set(miners.flatMap((m) => m.rewardAddresses));
  const recipients = new Set(
    // Absent until the server change is deployed.
    miners.flatMap((m) => m.rewardRecipients ?? [])
  );
  for (const address of [stxAddress, ...coinbase]) recipients.delete(address);
  coinbase.delete(stxAddress);
  return { coinbase: [...coinbase], recipients: [...recipients] };
}

function IdentityRow({
  label,
  hint,
  value,
}: {
  label: string;
  hint?: string;
  value: string;
}) {
  const labelEl = (
    <span
      className={cn(
        'shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground',
        hint && 'cursor-help underline decoration-dotted underline-offset-2'
      )}
    >
      {label}
    </span>
  );
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/50 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 last:border-b-0">
      {hint ? <SimpleTooltip content={hint}>{labelEl}</SimpleTooltip> : labelEl}
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
    header: 'Tenures',
    accessorKey: 'tenureCount',
    enableSorting: false,
    cell: ({ row }) => row.original.tenureCount.toLocaleString(),
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
            {version.tenureCount.toLocaleString()} tenures
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
  const identity = minerDisplay(miner);
  const commitKey = miner.commitPublicKey ?? miner.publicKey;
  const stxAddress =
    miner.minerAddress ??
    safeAddress(() => getStacksAddress(commitKey, networkKey));
  const signingKeys = miner.signingPublicKeys.filter((k) => k !== commitKey);
  const rewards = rewardIdentities(economics, stxAddress);
  const multiKey = signingKeys.length > 0 || rewards.coinbase.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h1 className="font-mono text-sm font-medium">
            {identity ? <MinerNameTag identity={identity} /> : 'miner'}
          </h1>
          <span className="font-mono text-[10px] text-muted-foreground">
            {miner.currentVersion ?? 'unknown version'}
          </span>
        </div>
        <div className="grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="border-b border-border px-3 py-2 md:border-r md:border-b-0">
            <IdentityRow
              label={signingKeys.length > 0 ? 'commit key' : 'public key'}
              hint="Bitcoin key funding this miner's block commits"
              value={commitKey}
            />
            {signingKeys.map((key) => (
              <IdentityRow
                key={key}
                label="signing key"
                hint="Mining key signing this miner's block proposals"
                value={key}
              />
            ))}
            {stxAddress ? (
              <IdentityRow
                label={multiKey ? 'commit stx address' : 'stx address'}
                hint="STX address of the commit key. Slot Watch identifies miners by this address."
                value={stxAddress}
              />
            ) : null}
            {rewards.coinbase.map((address) => (
              <IdentityRow
                key={address}
                label="coinbase address"
                hint="Sender of this miner's coinbase transactions (a different key than the commit key)"
                value={address}
              />
            ))}
            {rewards.recipients.map((address) => (
              <IdentityRow
                key={address}
                label="reward recipient"
                hint="Where this miner's block rewards are paid (the coinbase's alternate recipient)"
                value={address}
              />
            ))}
            {miner.btcAddress ? (
              <IdentityRow label="btc address" value={miner.btcAddress} />
            ) : null}
          </div>
          <div className="grid grid-cols-2">
            <Metric
              label="last 500"
              value={`${miner.stats.last500.percentage.toFixed(1)}%`}
              detail={`${miner.stats.last500.tenuresWon} tenures won`}
            />
            <Metric label="version" value={miner.currentVersionShort ?? '–'} />
          </div>
        </div>
      </section>

      {economics ? (
        <MinerEconomicsPanel
          data={economics}
          publicKey={miner.publicKey}
          minerAddress={stxAddress}
          networkKey={networkKey}
        />
      ) : null}

      {/* Version History */}
      {miner.versionHistory.length > 0 && (
        <section className="border border-border bg-card">
          <div className="border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            version history · last 500 tenures
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
