import React from 'react';
import { ArrowDownIcon, ArrowUpIcon } from '@radix-ui/react-icons';
import {
  formatBtc,
  formatSats,
  formatStx,
  formatUsd,
  grossMarginPercent,
  type MinerWindow,
  percent,
} from '@/lib/miner-economics';
import type { MinerRow } from '@/lib/miner-rows';
import { cn } from '@/lib/utils';
import { SimpleTooltip } from '../simple-tooltip';
import { MinerIdentity, MinerSwatch } from './miner-identity';

type SortKey =
  | 'spend'
  | 'commits'
  | 'wins'
  | 'winRate'
  | 'avgCommit'
  | 'revenue'
  | 'margin'
  | 'satsPerStx'
  | 'latestBlock';

const sorters: Record<SortKey, (row: MinerRow) => number> = {
  spend: (r) => r.spendSats + r.burnSats,
  commits: (r) => r.commits,
  wins: (r) => r.wins,
  winRate: (r) => (r.commits ? r.wins / r.commits : -1),
  avgCommit: (r) => (r.commits ? (r.spendSats + r.burnSats) / r.commits : -1),
  revenue: (r) => r.revenueUstx,
  margin: (r) =>
    grossMarginPercent(r.maturedSpendUsd, r.maturedRevenueUsd) ?? -999_999,
  satsPerStx: (r) => r.satsPerStx ?? -1,
  latestBlock: (r) => r.latestBlock ?? -1,
};

const gridClassName =
  'grid grid-cols-[minmax(0,1.5fr)_3.5rem_5rem_6rem_6.5rem_9rem_8.5rem_7rem_5rem_7rem] items-center gap-x-3 px-3';

function Header({
  label,
  sortKey,
  active,
  desc,
  onSort,
  className,
  hint,
}: {
  label: string;
  sortKey?: SortKey;
  active: SortKey;
  desc: boolean;
  onSort: (key: SortKey) => void;
  className?: string;
  hint?: string;
}) {
  const isActive = sortKey === active;
  let icon: React.ReactNode = null;
  if (isActive) {
    icon = desc ? (
      <ArrowDownIcon className="h-3 w-3" />
    ) : (
      <ArrowUpIcon className="h-3 w-3" />
    );
  }
  const content = (
    <span className="inline-flex items-center gap-1">
      {label}
      {icon}
    </span>
  );
  const inner = sortKey ? (
    <button
      type="button"
      className={cn(
        'font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground',
        isActive && 'text-foreground'
      )}
      onClick={() => onSort(sortKey)}
    >
      {content}
    </button>
  ) : (
    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {content}
    </span>
  );
  return (
    <div className={className}>
      {hint ? <SimpleTooltip content={hint}>{inner}</SimpleTooltip> : inner}
    </div>
  );
}

function Num({
  children,
  sub,
  className,
  muted,
}: {
  children: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <div className={cn('text-right', className)}>
      <div
        className={cn(
          'font-mono text-xs tabular-nums leading-4',
          muted && 'text-muted-foreground'
        )}
      >
        {children}
      </div>
      {sub ? (
        <div className="font-mono text-[10px] leading-3 text-muted-foreground tabular-nums">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function WinRateBar({ row, maxShare }: { row: MinerRow; maxShare: number }) {
  const rate = row.commits ? row.wins / row.commits : 0;
  return (
    <div className="text-right">
      <div className="font-mono text-xs tabular-nums leading-4">
        {row.commits ? percent(row.wins, row.commits) : '–'}
      </div>
      <div className="mt-0.5 flex h-1 w-full justify-end bg-muted">
        <div
          className="h-full"
          style={{
            width: `${maxShare ? (rate / maxShare) * 100 : 0}%`,
            backgroundColor: row.color,
          }}
        />
      </div>
    </div>
  );
}

function RevenueCell({ row }: { row: MinerRow }) {
  let sub: string | undefined;
  if (row.hasMaturedActivity) {
    sub = row.maturedRevenuePriceMissing
      ? `${formatUsd(row.maturedPricedRevenueUsd, true)} · ${row.maturedRevenuePriceMissing} unpriced`
      : `${formatUsd(row.maturedRevenueUsd, true)} USD`;
  }
  return (
    <Num muted={row.revenueUstx === 0} sub={sub}>
      {row.revenueUstx ? formatStx(row.revenueUstx) : '–'}
    </Num>
  );
}

function MarginCell({ row }: { row: MinerRow }) {
  const margin = grossMarginPercent(row.maturedSpendUsd, row.maturedRevenueUsd);
  const net =
    row.maturedSpendUsd !== null && row.maturedRevenueUsd !== null
      ? row.maturedRevenueUsd - row.maturedSpendUsd
      : null;
  const missing = row.maturedSpendPriceMissing + row.maturedRevenuePriceMissing;
  let sub: string | undefined;
  if (missing) sub = `${missing} unpriced`;
  else if (net !== null) sub = `${formatUsd(net, true)} net`;
  let color: string | undefined;
  if (margin !== null)
    color =
      margin >= 0 ? 'text-green-600 dark:text-green-500' : 'text-destructive';
  return (
    <Num muted={margin === null} className={color} sub={sub}>
      {margin === null ? '–' : `${margin.toFixed(1)}%`}
    </Num>
  );
}

function DesktopRow({
  row,
  totalWins,
  maxRate,
  blocks,
  networkKey,
  windowKey,
}: {
  row: MinerRow;
  totalWins: number;
  maxRate: number;
  blocks: number;
  networkKey: string;
  windowKey: MinerWindow;
}) {
  const spend = row.spendSats + row.burnSats;
  const commitsSub =
    row.commits && blocks
      ? `${percent(row.commits, blocks, 0)} of blocks`
      : undefined;
  let spendSub: string | undefined;
  if (row.pricedSpendUsd !== null) {
    spendSub = `${formatUsd(row.pricedSpendUsd, true)}${row.spendPriceMissing ? ` · ${row.spendPriceMissing} unpriced` : ' USD'}`;
  } else if (row.commits) {
    spendSub = `${formatSats(Math.round(spend / row.commits))} / commit`;
  }
  return (
    <div
      className={cn(
        gridClassName,
        'group h-12 border-b border-border last:border-b-0 hover:bg-muted/30'
      )}
    >
      <MinerIdentity
        miner={row}
        networkKey={networkKey}
        windowKey={windowKey}
      />
      <div className="font-mono text-xs text-muted-foreground">
        {row.shortVersion ? (
          <SimpleTooltip content={row.version}>
            <span>{row.shortVersion}</span>
          </SimpleTooltip>
        ) : (
          '–'
        )}
      </div>
      <Num sub={commitsSub}>{row.commits.toLocaleString()}</Num>
      <Num
        sub={totalWins ? `${percent(row.wins, totalWins)} share` : undefined}
      >
        {row.wins.toLocaleString()}
      </Num>
      <WinRateBar row={row} maxShare={maxRate} />
      <Num sub={spendSub}>{formatBtc(spend)}</Num>
      <RevenueCell row={row} />
      <MarginCell row={row} />
      <Num muted={row.satsPerStx === null}>
        {row.satsPerStx === null
          ? '–'
          : Math.round(row.satsPerStx).toLocaleString()}
      </Num>
      <Num
        muted={row.latestBlock === null}
        sub={row.recentWins ? `${row.recentWins}/500 recent` : undefined}
      >
        {row.latestBlock?.toLocaleString() ?? '–'}
      </Num>
    </div>
  );
}

function MobileCard({
  row,
  totalWins,
  networkKey,
  windowKey,
}: {
  row: MinerRow;
  totalWins: number;
  networkKey: string;
  windowKey: MinerWindow;
}) {
  const spend = row.spendSats + row.burnSats;
  const margin = grossMarginPercent(row.maturedSpendUsd, row.maturedRevenueUsd);
  const marginMissing =
    row.maturedSpendPriceMissing + row.maturedRevenuePriceMissing;
  let marginLabel = '–';
  if (margin !== null) marginLabel = `${margin.toFixed(1)}%`;
  else if (marginMissing) marginLabel = '– unpriced';
  const cells: [string, string][] = [
    ['commits', row.commits.toLocaleString()],
    [
      'wins',
      `${row.wins.toLocaleString()} · ${percent(row.wins, row.commits)}`,
    ],
    ['share', totalWins ? percent(row.wins, totalWins) : '–'],
    ['btc spent', formatBtc(spend)],
    [
      'usd spend',
      row.pricedSpendUsd === null
        ? '–'
        : `${formatUsd(row.pricedSpendUsd, true)}${row.spendPriceMissing ? ' partial' : ''}`,
    ],
    ['stx earned', row.revenueUstx ? formatStx(row.revenueUstx) : '–'],
    ['usd margin', marginLabel],
    [
      'sats / stx',
      row.satsPerStx === null
        ? '–'
        : Math.round(row.satsPerStx).toLocaleString(),
    ],
  ];
  return (
    <div className="border-b border-border p-3 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <MinerIdentity
          miner={row}
          networkKey={networkKey}
          windowKey={windowKey}
        />
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {row.shortVersion ?? ''}
          {row.latestBlock ? ` · ${row.latestBlock.toLocaleString()}` : ''}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5">
        {cells.map(([label, value]) => (
          <div key={label}>
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
            <div className="font-mono text-xs tabular-nums">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MinersTable({
  rows,
  maturedThroughHeight,
  fromHeight,
  blocks,
  networkKey,
  windowKey,
}: {
  rows: MinerRow[];
  maturedThroughHeight: number;
  fromHeight: number;
  blocks: number;
  networkKey: string;
  windowKey: MinerWindow;
}) {
  const [sortKey, setSortKey] = React.useState<SortKey>('spend');
  const [desc, setDesc] = React.useState(true);
  const onSort = (key: SortKey) => {
    if (key === sortKey) setDesc((d) => !d);
    else {
      setSortKey(key);
      setDesc(true);
    }
  };
  const sorted = React.useMemo(() => {
    const fn = sorters[sortKey];
    return [...rows].sort((a, b) => (desc ? fn(b) - fn(a) : fn(a) - fn(b)));
  }, [rows, sortKey, desc]);
  const totalWins = rows.reduce((sum, row) => sum + row.wins, 0);
  const maxRate = Math.max(
    0,
    ...rows.map((row) => (row.commits ? row.wins / row.commits : 0))
  );
  const headerProps = { active: sortKey, desc, onSort };
  const maturedLabel =
    maturedThroughHeight >= fromHeight
      ? `matured through ${maturedThroughHeight.toLocaleString()}`
      : 'no matured rewards in window yet';

  return (
    <section className="border border-border bg-card">
      <div className="hidden md:block">
        <div
          className={cn(
            gridClassName,
            'h-8 border-b border-border bg-muted/30'
          )}
        >
          <Header label="miner" {...headerProps} />
          <Header label="version" {...headerProps} />
          <Header
            label="commits"
            sortKey="commits"
            className="text-right"
            {...headerProps}
          />
          <Header
            label="wins"
            sortKey="wins"
            className="text-right"
            {...headerProps}
          />
          <Header
            label="win rate"
            sortKey="winRate"
            className="text-right"
            hint="wins ÷ commits"
            {...headerProps}
          />
          <Header
            label="btc spent"
            sortKey="spend"
            className="text-right"
            hint="pox payouts + burns, whole window"
            {...headerProps}
          />
          <Header
            label="stx earned"
            sortKey="revenue"
            className="text-right"
            hint={`coinbase + fees, ${maturedLabel}`}
            {...headerProps}
          />
          <Header
            label="usd margin"
            sortKey="margin"
            className="text-right"
            hint={`(USD earned − USD spent) ÷ USD earned over matured blocks (${maturedLabel}); unavailable when prices are missing`}
            {...headerProps}
          />
          <Header
            label="sats/stx"
            sortKey="satsPerStx"
            className="text-right"
            hint={`spend ÷ revenue over matured blocks (${maturedLabel})`}
            {...headerProps}
          />
          <Header
            label="last tenure"
            sortKey="latestBlock"
            className="text-right"
            hint="btc height of the latest block this miner produced · wins among the last 500 tenures"
            {...headerProps}
          />
        </div>
        {sorted.map((row) => (
          <DesktopRow
            key={row.key}
            row={row}
            totalWins={totalWins}
            maxRate={maxRate}
            blocks={blocks}
            networkKey={networkKey}
            windowKey={windowKey}
          />
        ))}
      </div>
      <div className="md:hidden">
        {sorted.map((row) => (
          <MobileCard
            key={row.key}
            row={row}
            totalWins={totalWins}
            networkKey={networkKey}
            windowKey={windowKey}
          />
        ))}
      </div>
    </section>
  );
}
