import { Link } from '@tanstack/react-router';
import { formatFeeRate, type LiveRow } from '@/lib/live-commits';
import type { FeeStatus } from '@/lib/mempool-space';
import { formatSats } from '@/lib/miner-economics';
import { cn } from '@/lib/utils';
import { SimpleTooltip } from '../../simple-tooltip';
import { CopyValue } from '../miner-identity';

export function ago(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

const FEE_LABELS: Record<FeeStatus['kind'], string> = {
  next: 'next block',
  marginal: 'marginal',
  later: 'later',
  low: 'too low',
};

const FEE_CLASSES: Record<FeeStatus['kind'], string> = {
  next: 'text-green-600 dark:text-green-500',
  marginal: 'text-amber-600 dark:text-amber-500',
  later: 'text-orange-600 dark:text-orange-500',
  low: 'text-destructive',
};

const FEE_ICONS: Record<FeeStatus['kind'], string> = {
  next: '●',
  marginal: '◌',
  later: '◌',
  low: '×',
};

function FeeBadge({ status }: { status: FeeStatus }) {
  const label =
    status.kind === 'later'
      ? `+${status.blocks} blocks`
      : FEE_LABELS[status.kind];
  return (
    <span className={cn('font-mono text-[10px]', FEE_CLASSES[status.kind])}>
      {FEE_ICONS[status.kind]} {label}
    </span>
  );
}

function Delta({
  value,
  format = formatSats,
}: {
  value: number;
  format?: (value: number) => string;
}) {
  if (Math.abs(value) < 0.005) return null;
  return (
    <span
      className={cn(
        'ml-1 text-[10px]',
        value > 0 ? 'text-green-600 dark:text-green-500' : 'text-destructive'
      )}
    >
      {value > 0 ? '+' : ''}
      {format(value)}
    </span>
  );
}

export function OddsBar({ rows }: { rows: LiveRow[] }) {
  const active = rows.filter((r) => r.odds > 0);
  if (active.length === 0) {
    return (
      <div className="flex h-6 items-center border border-dashed border-border px-2 font-mono text-[10px] text-muted-foreground">
        no live commits for the next block yet
      </div>
    );
  }
  return (
    <div>
      <div className="flex h-6 overflow-hidden border border-border">
        {active.map((r) => (
          <SimpleTooltip
            key={r.miner.publicKey}
            content={`${r.miner.label} · ${(r.odds * 100).toFixed(1)}% est. odds · ${(r.share * 100).toFixed(1)}% of bids`}
          >
            <div
              className="h-full transition-[width] duration-700"
              style={{
                width: `${r.odds * 100}%`,
                backgroundColor: r.miner.color,
              }}
            />
          </SimpleTooltip>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {active.map((r) => (
          <span
            key={r.miner.publicKey}
            className="flex items-center gap-1 font-mono text-[10px] tabular-nums"
          >
            <span
              className="h-2 w-2"
              style={{ backgroundColor: r.miner.color }}
            />
            {r.miner.label}
            <span className="text-muted-foreground">
              {(r.odds * 100).toFixed(1)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

const HEAD = 'px-2 py-1.5 text-left font-normal uppercase tracking-wider';

export function LiveMinersTable({
  rows,
  now,
}: {
  rows: LiveRow[];
  now: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full font-mono text-xs">
        <thead className="border-b border-border text-[10px] text-muted-foreground">
          <tr>
            <th className={HEAD}>miner</th>
            <th className={cn(HEAD, 'text-right')}>bid (sats)</th>
            <th className={cn(HEAD, 'text-right')}>odds</th>
            <th className={cn(HEAD, 'text-right')}>fee rate</th>
            <th className={HEAD}>inclusion</th>
            <th className={cn(HEAD, 'text-right')}>fee</th>
            <th className={cn(HEAD, 'text-right')}>parent</th>
            <th className={cn(HEAD, 'text-right')}>rbf</th>
            <th className={cn(HEAD, 'text-right')}>updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            // Remount on each new version so the row flashes.
            <LiveMinerRow
              key={`${row.miner.publicKey}:${row.pending?.txid}`}
              row={row}
              now={now}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: flat row of conditional cells
function LiveMinerRow({ row, now }: { row: LiveRow; now: number }) {
  const { miner, pending, live } = row;
  const previous = live?.replaced.at(-1);
  return (
    <tr
      className={cn(
        'border-b border-border/50 tabular-nums',
        pending ? 'commit-flash' : 'text-muted-foreground',
        row.stale && 'opacity-60'
      )}
    >
      <td className="px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-6 w-1 shrink-0"
            style={{ backgroundColor: miner.color }}
          />
          <div className="min-w-0">
            <Link
              to="/miners/$publicKey"
              params={{ publicKey: miner.publicKey }}
              className="block truncate leading-4 hover:underline"
            >
              {miner.label}
            </Link>
            <CopyValue value={miner.btcAddress} head={8} tail={6} />
          </div>
        </div>
      </td>
      {pending ? (
        <>
          <td className="px-2 py-1.5 text-right">
            {formatSats(pending.bidSats)}
            {previous ? (
              <Delta value={pending.bidSats - previous.bidSats} />
            ) : null}
          </td>
          <td className="px-2 py-1.5 text-right">
            <SimpleTooltip
              content={`effective bid ${formatSats(Math.round(row.effectiveBid))} (min of bid and 6-block median) · ${(row.share * 100).toFixed(1)}% of raw bids`}
            >
              <span>{row.stale ? '–' : `${(row.odds * 100).toFixed(1)}%`}</span>
            </SimpleTooltip>
          </td>
          <td className="px-2 py-1.5 text-right">
            {formatFeeRate(pending.feeRate)}
            {previous ? (
              <Delta
                value={pending.feeRate - previous.feeRate}
                format={formatFeeRate}
              />
            ) : null}
          </td>
          <td className="px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-x-2">
              {row.fee ? <FeeBadge status={row.fee} /> : null}
              {row.stale ? (
                <SimpleTooltip content="built for a block that's already mined; it can't win the next sortition">
                  <span className="text-[10px] text-destructive">stale</span>
                </SimpleTooltip>
              ) : null}
            </div>
          </td>
          <td className="px-2 py-1.5 text-right text-muted-foreground">
            {formatSats(pending.feeSats)}
          </td>
          <td className="px-2 py-1.5 text-right">
            <SimpleTooltip
              content={
                row.behind
                  ? 'building on an older tenure than the latest sortition winner'
                  : `parent commit ${pending.parentHeight}:${pending.parentVtx}`
              }
            >
              <span
                className={cn(
                  row.behind && 'text-amber-600 dark:text-amber-500'
                )}
              >
                {pending.parentHeight}
              </span>
            </SimpleTooltip>
          </td>
          <td className="px-2 py-1.5 text-right">
            {live?.replaced.length || (
              <span className="text-muted-foreground">0</span>
            )}
          </td>
          <td className="px-2 py-1.5 text-right text-muted-foreground">
            {ago(now - pending.seenAt)}
          </td>
        </>
      ) : (
        <td colSpan={8} className="px-2 py-1.5 text-[10px]">
          no commit in mempool
          {live?.lastConfirmed
            ? ` · last confirmed ${formatSats(live.lastConfirmed.bidSats)} sats in #${live.lastConfirmed.confirmedHeight}`
            : ''}
        </td>
      )}
    </tr>
  );
}
