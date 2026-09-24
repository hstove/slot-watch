import React from 'react';
import { Route } from '../../routes/miners/index';
import { buildMinerRows } from '@/lib/miner-rows';
import { MINER_WINDOWS, sumUsdTotals } from '@/lib/miner-economics';
import { MinerMetrics, SortitionShare, WindowSwitch } from './miner-overview';
import { SpendChart } from './spend-chart';
import { MinersTable } from './miners-table';
import { UsdComparison } from './usd-comparison';

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

export const Miners = () => {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const rows = React.useMemo(
    () =>
      buildMinerRows({
        networkKey: data.networkKey,
        economics: data.economics,
        matured: data.matured,
        minerStats: data.minerStats.miners,
      }),
    [data]
  );
  const blocks = data.tip - data.fromHeight + 1;
  const commitBlocks = data.commits.blocks;
  const commitsFrom = commitBlocks[0]?.burnBlockHeight ?? data.fromHeight;

  return (
    <div className="flex flex-col gap-2">
      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-mono text-sm font-medium">miners</h1>
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              btc {data.fromHeight.toLocaleString()} –{' '}
              {data.tip.toLocaleString()} ·{' '}
              {MINER_WINDOWS[data.windowKey].label} · {blocks.toLocaleString()}{' '}
              blocks
            </span>
          </div>
          <WindowSwitch active={data.windowKey} network={search.network} />
        </div>
        <MinerMetrics
          rows={rows}
          blocks={blocks}
          maturedThroughHeight={Math.min(
            data.tip,
            data.economics.maturedThroughHeight
          )}
          fromHeight={data.fromHeight}
        />
        <UsdComparison
          totals={data.matured ? sumUsdTotals(data.matured.miners) : null}
          fromHeight={data.fromHeight}
          toHeight={Math.min(data.tip, data.economics.maturedThroughHeight)}
        />
        <div className="grid grid-cols-[minmax(0,1fr)] border-t border-border md:grid-cols-[minmax(16rem,0.8fr)_minmax(0,2fr)]">
          <div className="min-w-0 border-b border-border px-3 py-2.5 md:border-r md:border-b-0">
            <div className="mb-2 flex items-center justify-between">
              <PanelLabel>sortition share</PanelLabel>
              <PanelLabel>
                {rows.reduce((s, r) => s + r.wins, 0).toLocaleString()} wins
              </PanelLabel>
            </div>
            <SortitionShare rows={rows} />
          </div>
          <div className="min-w-0 px-3 py-2.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <PanelLabel>commit spend by miner</PanelLabel>
              <PanelLabel>
                btc {commitsFrom.toLocaleString()} – {data.tip.toLocaleString()}
                {commitsFrom > data.fromHeight
                  ? ` · last ${(data.tip - commitsFrom + 1).toLocaleString()} blocks`
                  : ''}
              </PanelLabel>
            </div>
            <SpendChart blocks={commitBlocks} rows={rows} />
          </div>
        </div>
      </section>
      <MinersTable
        rows={rows}
        networkKey={data.networkKey}
        windowKey={data.windowKey}
        blocks={blocks}
        fromHeight={data.fromHeight}
        maturedThroughHeight={Math.min(
          data.tip,
          data.economics.maturedThroughHeight
        )}
      />
    </div>
  );
};
