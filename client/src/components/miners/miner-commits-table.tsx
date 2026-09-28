import React from 'react';
import { Link } from '@tanstack/react-router';
import {
  type MinerCommit,
  type MinerCommitsBlock,
  minerDisplay,
} from 'slot-watch-common';
import { formatSats, minerKey, percent } from '@/lib/miner-economics';
import type { MinerRow } from '@/lib/miner-rows';
import { cn, truncateMiddle } from '@/lib/utils';

const MAX_ROWS = 150;

const gridClassName =
  'grid grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_4.5rem_4rem_minmax(0,1.4fr)] items-center gap-x-3 px-3';

interface CommitRow {
  height: number;
  hash: string;
  ownSats: number;
  blockSats: number;
  commits: number;
  outcome: 'won' | 'lost' | 'none';
  /** Winner display label. */
  winner: string | null;
}

function winnerLabel(commit: MinerCommit) {
  const identity = minerDisplay(commit);
  if (identity) return identity.label;
  return commit.minerAddress ? truncateMiddle(commit.minerAddress, 6, 4) : null;
}

function toRows(blocks: MinerCommitsBlock[], key: string): CommitRow[] {
  const rows: CommitRow[] = [];
  for (const block of blocks) {
    const own = block.commits.filter((c) => minerKey(c.minerAddress) === key);
    if (own.length === 0) continue;
    const winner = block.commits.find((c) => c.txid === block.winningTxid);
    let outcome: CommitRow['outcome'] = 'none';
    if (winner)
      outcome = minerKey(winner.minerAddress) === key ? 'won' : 'lost';
    rows.push({
      height: block.burnBlockHeight,
      hash: block.burnBlockHash,
      ownSats: own.reduce((s, c) => s + c.spendSats + c.burnSats, 0),
      blockSats: block.commits.reduce(
        (s, c) => s + c.spendSats + c.burnSats,
        0
      ),
      commits: block.commits.length,
      outcome,
      winner: winner ? winnerLabel(winner) : null,
    });
  }
  return rows.reverse();
}

function Head({ children, right }: { children: string; right?: boolean }) {
  return (
    <span
      className={cn(
        'font-mono text-[10px] uppercase tracking-wider text-muted-foreground',
        right && 'text-right'
      )}
    >
      {children}
    </span>
  );
}

function Outcome({ row, color }: { row: CommitRow; color: string }) {
  if (row.outcome === 'won') {
    return (
      <span className="flex items-center gap-1.5 font-mono text-xs">
        <i className="h-2 w-2" style={{ backgroundColor: color }} /> won
      </span>
    );
  }
  if (row.outcome === 'lost') {
    return (
      <span className="font-mono text-xs text-muted-foreground">
        lost · {row.winner ?? 'unresolved'}
      </span>
    );
  }
  return (
    <span className="font-mono text-xs text-muted-foreground/60">
      no winner
    </span>
  );
}

export function MinerCommitsTable({
  blocks,
  row,
}: {
  blocks: MinerCommitsBlock[];
  row: MinerRow;
}) {
  const all = React.useMemo(() => toRows(blocks, row.key), [blocks, row.key]);
  const rows = all.slice(0, MAX_ROWS);
  if (rows.length === 0) return null;
  return (
    <section className="min-w-0 border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          block commits
        </span>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
          {rows.length < all.length
            ? `latest ${rows.length} of ${all.length.toLocaleString()} blocks`
            : `${all.length.toLocaleString()} blocks`}
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[40rem]">
          <div
            className={cn(
              gridClassName,
              'h-8 border-b border-border bg-muted/30'
            )}
          >
            <Head>btc block</Head>
            <Head right>spend</Head>
            <Head right>block total</Head>
            <Head right>share</Head>
            <Head right>commits</Head>
            <Head>result</Head>
          </div>
          {rows.map((r) => (
            <div
              key={r.hash}
              className={cn(
                gridClassName,
                'h-8 border-b border-border/50 text-xs last:border-b-0 hover:bg-muted/30'
              )}
            >
              <Link
                to="/btc-blocks/$heightOrHash"
                params={{ heightOrHash: String(r.height) }}
                className="font-mono tabular-nums hover:underline"
              >
                {r.height.toLocaleString()}
              </Link>
              <span className="text-right font-mono tabular-nums">
                {formatSats(r.ownSats)}
              </span>
              <span className="text-right font-mono tabular-nums text-muted-foreground">
                {formatSats(r.blockSats)}
              </span>
              <span className="text-right font-mono tabular-nums text-muted-foreground">
                {percent(r.ownSats, r.blockSats)}
              </span>
              <span className="text-right font-mono tabular-nums text-muted-foreground">
                {r.commits}
              </span>
              <Outcome row={r} color={row.color} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
