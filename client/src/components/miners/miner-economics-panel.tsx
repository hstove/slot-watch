import React from 'react';
import type {
  MinerCommitsResponse,
  MinerEconomicsMinersResponse,
} from 'slot-watch-common';
import {
  formatBtc,
  formatCompact,
  formatSats,
  formatStx,
  percent,
  UNRESOLVED_KEY,
} from '@/lib/miner-economics';
import { buildMinerRows, type MinerRow } from '@/lib/miner-rows';
import { Metric } from './miner-overview';
import { SpendChart } from './spend-chart';
import { MinerCommitsTable } from './miner-commits-table';

export interface MinerEconomicsData {
  tip: number;
  fromHeight: number;
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
      <section className="border border-border bg-card px-3 py-2.5 font-mono text-[10px] text-muted-foreground">
        no block commits from this key in the last {blocks.toLocaleString()}{' '}
        blocks
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
          <PanelLabel>
            btc {data.fromHeight.toLocaleString()} – {data.tip.toLocaleString()}{' '}
            · {blocks.toLocaleString()} blocks
          </PanelLabel>
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
