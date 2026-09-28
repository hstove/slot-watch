import { Link } from '@tanstack/react-router';
import {
  formatBtc,
  formatCompact,
  formatStx,
  MINER_WINDOWS,
  type MinerWindow,
  percent,
  satsPerStx,
  UNRESOLVED_KEY,
} from '@/lib/miner-economics';
import { type MinerRow, sumRows } from '@/lib/miner-rows';
import { cn } from '@/lib/utils';
import { SimpleTooltip } from '../simple-tooltip';

export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="border-b border-border px-3 py-2.5 last:border-b-0 sm:border-r sm:last:border-r-0 lg:border-b-0">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </div>
      {detail ? (
        <div className="mt-1.5 truncate font-mono text-[10px] text-muted-foreground">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

export function WindowSwitch({
  active,
  network,
}: {
  active: MinerWindow;
  network?: string;
}) {
  return (
    <div className="flex">
      {(Object.keys(MINER_WINDOWS) as MinerWindow[]).map((key) => (
        <Link
          key={key}
          to="/miners"
          search={{ network, window: key }}
          className={cn(
            'border border-border px-2 py-0.5 font-mono text-[10px] uppercase transition-colors hover:bg-muted/30 hover:text-foreground [&+&]:border-l-0',
            key === active
              ? 'bg-muted/40 text-foreground'
              : 'text-muted-foreground'
          )}
        >
          {MINER_WINDOWS[key].label}
        </Link>
      ))}
    </div>
  );
}

export function MinerMetrics({
  rows,
  blocks,
  maturedThroughHeight,
  fromHeight,
}: {
  rows: MinerRow[];
  blocks: number;
  maturedThroughHeight: number;
  fromHeight: number;
}) {
  const totals = sumRows(rows);
  const active = rows.filter((row) => row.commits > 0).length;
  const breakeven = satsPerStx(totals.maturedSpendSats, totals.revenueUstx);
  const maturedBlocks = Math.max(0, maturedThroughHeight - fromHeight + 1);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6">
      <Metric
        label="miners"
        value={String(active)}
        detail={`${rows.filter((r) => r.key === UNRESOLVED_KEY).length ? 'incl. unresolved · ' : ''}committing in window`}
      />
      <Metric
        label="commits"
        value={totals.commits.toLocaleString()}
        detail={`${(totals.commits / Math.max(1, blocks)).toFixed(2)} per block · ${blocks.toLocaleString()} blocks`}
      />
      <Metric
        label="sortitions won"
        value={`${totals.wins.toLocaleString()}`}
        detail={`${percent(totals.wins, blocks)} of blocks produced a tenure`}
      />
      <Metric
        label="btc spent"
        value={formatBtc(totals.spendSats + totals.burnSats)}
        detail={`pox ${formatBtc(totals.spendSats)} · burn ${formatBtc(totals.burnSats)}`}
      />
      <Metric
        label="stx earned"
        value={`${formatCompact(totals.revenueUstx / 1e6)} STX`}
        detail={`matured · ${formatStx(totals.coinbaseUstx)} coinbase · ${formatStx(totals.txFeesUstx)} fees`}
      />
      <Metric
        label="sats / stx"
        value={
          breakeven === null ? '–' : Math.round(breakeven).toLocaleString()
        }
        detail={`break-even over ${maturedBlocks.toLocaleString()} matured blocks`}
      />
    </div>
  );
}

function ShareRow({
  row,
  spendShare,
  winShare,
}: {
  row: MinerRow;
  spendShare: number;
  winShare: number;
}) {
  const delta = (winShare - spendShare) * 100;
  const deltaLabel = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`;
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_3.5rem_2.5rem] items-center gap-x-2 font-mono text-[10px]">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <span
          className="h-1.5 w-1.5 shrink-0"
          style={{ backgroundColor: row.color }}
        />
        <span className="truncate">{row.label}</span>
      </span>
      <span className="flex flex-col gap-px">
        <span className="h-1 w-full bg-muted">
          <span
            className="block h-full opacity-40"
            style={{
              width: `${spendShare * 100}%`,
              backgroundColor: row.color,
            }}
          />
        </span>
        <span className="h-1 w-full bg-muted">
          <span
            className="block h-full"
            style={{ width: `${winShare * 100}%`, backgroundColor: row.color }}
          />
        </span>
      </span>
      <span className="text-right tabular-nums">
        <span className="text-muted-foreground">
          {(spendShare * 100).toFixed(1)}
        </span>
        {' → '}
        {(winShare * 100).toFixed(1)}
      </span>
      <span
        className={cn(
          'text-right tabular-nums',
          delta >= 0 ? 'text-green-600 dark:text-green-500' : 'text-destructive'
        )}
      >
        {deltaLabel}
      </span>
    </div>
  );
}

export function SortitionShare({ rows }: { rows: MinerRow[] }) {
  const winners = rows.filter((row) => row.wins > 0);
  const totalWins = winners.reduce((sum, row) => sum + row.wins, 0);
  const totalSpend = rows.reduce(
    (sum, row) => sum + row.spendSats + row.burnSats,
    0
  );
  if (totalWins === 0) {
    return (
      <div className="font-mono text-[10px] text-muted-foreground">
        no sortition winners in window
      </div>
    );
  }
  return (
    <div>
      <div className="flex h-4 w-full gap-px overflow-hidden bg-muted">
        {winners.map((row) => (
          <SimpleTooltip
            key={row.key}
            content={`${row.label} · ${row.wins} wins · ${percent(row.wins, totalWins)}`}
          >
            <div
              className="h-full min-w-0"
              style={{ flexGrow: row.wins, backgroundColor: row.color }}
            />
          </SimpleTooltip>
        ))}
      </div>
      <div className="mt-2.5 flex justify-between font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        <span>miner</span>
        <span>spend share → win share</span>
      </div>
      <div className="mt-1 space-y-1.5">
        {winners.map((row) => (
          <ShareRow
            key={row.key}
            row={row}
            spendShare={
              totalSpend ? (row.spendSats + row.burnSats) / totalSpend : 0
            }
            winShare={row.wins / totalWins}
          />
        ))}
      </div>
    </div>
  );
}
