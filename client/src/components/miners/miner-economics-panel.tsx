import React from 'react';
import { Link } from '@tanstack/react-router';
import type {
  MinerCommitsResponse,
  MinerEconomicsMinersResponse,
} from 'slot-watch-common';
import {
  formatBtc,
  formatCompact,
  formatSats,
  formatStx,
  MINER_WINDOWS,
  type MinerWindow,
  percent,
  UNRESOLVED_KEY,
} from '@/lib/miner-economics';
import { buildMinerRows, type MinerRow } from '@/lib/miner-rows';
import { Metric } from './miner-overview';
import { SpendChart } from './spend-chart';
import { MinerCommitsTable } from './miner-commits-table';
import { UsdComparison } from './usd-comparison';
import { cn } from '@/lib/utils';

export interface MinerEconomicsData {
  tip: number;
  fromHeight: number;
  windowKey: MinerWindow;
  economics: MinerEconomicsMinersResponse;
  matured: MinerEconomicsMinersResponse | null;
  commits: MinerCommitsResponse;
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

function DetailWindowSwitch({
  publicKey,
  networkKey,
  active,
}: {
  publicKey: string;
  networkKey: string;
  active: MinerWindow;
}) {
  return (
    <div className="flex">
      {(Object.keys(MINER_WINDOWS) as MinerWindow[]).map((key) => (
        <Link
          key={key}
          to="/miners/$publicKey"
          params={{ publicKey }}
          search={{ network: networkKey, window: key }}
          className={cn(
            'border border-border px-2 py-0.5 font-mono text-[10px] uppercase transition-colors hover:bg-muted/30 hover:text-foreground [&+&]:border-l-0',
            active === key
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

function ownCommits(data: MinerEconomicsData, row: MinerRow) {
  return data.commits.blocks.map((block) => ({
    ...block,
    commits: block.commits.filter(
      (c) => (c.minerAddress ?? UNRESOLVED_KEY) === row.key
    ),
  }));
}

export function MinerEconomicsPanel({
  data,
  publicKey,
  networkKey,
}: {
  data: MinerEconomicsData;
  publicKey: string;
  networkKey: string;
}) {
  const rows = React.useMemo(
    () =>
      buildMinerRows({
        networkKey,
        economics: data.economics,
        matured: data.matured,
        minerStats: [],
      }),
    [data, networkKey]
  );
  const row = rows.find((r) => r.publicKey === publicKey);
  const blocks = data.tip - data.fromHeight + 1;
  const commitBlocks = React.useMemo(
    () => (row ? ownCommits(data, row) : []),
    [data, row]
  );
  if (!row) {
    return (
      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="font-mono text-sm font-medium">economics</h2>
          <DetailWindowSwitch
            publicKey={publicKey}
            networkKey={networkKey}
            active={data.windowKey}
          />
        </div>
        <div className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
          no block commits from this key in the last {blocks.toLocaleString()}{' '}
          blocks
        </div>
      </section>
    );
  }
  const totalWins = rows.reduce((sum, r) => sum + r.wins, 0);
  const totalSpend = rows.reduce((sum, r) => sum + r.spendSats + r.burnSats, 0);
  const spend = row.spendSats + row.burnSats;
  const maturedTo = Math.min(data.tip, data.economics.maturedThroughHeight);
  const commitsFrom = commitBlocks[0]?.burnBlockHeight ?? data.fromHeight;

  return (
    <>
      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="h-3 w-1" style={{ backgroundColor: row.color }} />
            <h2 className="font-mono text-sm font-medium">economics</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PanelLabel>
              btc {data.fromHeight.toLocaleString()} –{' '}
              {data.tip.toLocaleString()} · {blocks.toLocaleString()} blocks
            </PanelLabel>
            <DetailWindowSwitch
              publicKey={publicKey}
              networkKey={networkKey}
              active={data.windowKey}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6">
          <Metric
            label="commits"
            value={row.commits.toLocaleString()}
            detail={`${percent(row.commits, blocks, 0)} of blocks`}
          />
          <Metric
            label="wins"
            value={row.wins.toLocaleString()}
            detail={`${percent(row.wins, row.commits)} win rate · ${percent(row.wins, totalWins)} of sortitions`}
          />
          <Metric
            label="btc spent"
            value={formatBtc(spend)}
            detail={`${percent(spend, totalSpend)} of all spend${row.burnSats ? ` · burn ${formatBtc(row.burnSats)}` : ''}`}
          />
          <Metric
            label="per commit"
            value={
              row.commits
                ? `${formatSats(Math.round(spend / row.commits))}`
                : '–'
            }
            detail={
              row.wins
                ? `sats · ${formatSats(Math.round(spend / row.wins))} spent per won tenure`
                : 'sats'
            }
          />
          <Metric
            label="stx earned"
            value={
              row.revenueUstx
                ? `${formatCompact(row.revenueUstx / 1e6)} STX`
                : '–'
            }
            detail={`matured ≤ ${maturedTo.toLocaleString()} · ${formatStx(row.txFeesUstx)} fees`}
          />
          <Metric
            label="sats / stx"
            value={
              row.satsPerStx === null
                ? '–'
                : Math.round(row.satsPerStx).toLocaleString()
            }
            detail="break-even over matured blocks"
          />
        </div>
        <UsdComparison
          totals={
            data.matured && row.hasMaturedActivity
              ? {
                  spendUsd: row.maturedSpendUsd,
                  revenueUsd: row.maturedRevenueUsd,
                  pricedSpendUsd: row.maturedPricedSpendUsd,
                  pricedRevenueUsd: row.maturedPricedRevenueUsd,
                  spendPriceMissing: row.maturedSpendPriceMissing,
                  revenuePriceMissing: row.maturedRevenuePriceMissing,
                }
              : null
          }
          fromHeight={data.fromHeight}
          toHeight={maturedTo}
        />
        <div className="border-t border-border px-3 py-2.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <PanelLabel>commit spend</PanelLabel>
            <PanelLabel>
              btc {commitsFrom.toLocaleString()} – {data.tip.toLocaleString()}
            </PanelLabel>
          </div>
          <SpendChart
            blocks={commitBlocks}
            rows={[row]}
            winnerBlocks={data.commits.blocks}
            stripLabel="wins in colour · grey = other miner"
          />
        </div>
      </section>
      <MinerCommitsTable blocks={data.commits.blocks} row={row} />
    </>
  );
}
