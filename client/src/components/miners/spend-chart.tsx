import React from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MinerCommitsBlock } from 'slot-watch-common';
import {
  bucketCommits,
  formatBtc,
  formatSats,
  type SpendBucket,
  UNRESOLVED_KEY,
  winnerByBlock,
} from '@/lib/miner-economics';
import type { MinerRow } from '@/lib/miner-rows';
import { truncateMiddle } from '@/lib/utils';

function minerLabel(row: MinerRow | undefined, key: string) {
  if (key === UNRESOLVED_KEY) return 'unresolved';
  return truncateMiddle(row?.address ?? key, 6, 4);
}

function BucketTooltip({
  active,
  payload,
  rows,
}: {
  active?: boolean;
  payload?: { payload: SpendBucket }[];
  rows: Map<string, MinerRow>;
}) {
  const bucket = payload?.[0]?.payload;
  if (!(active && bucket)) return null;
  const entries = Object.entries(bucket.spend).sort((a, b) => b[1] - a[1]);
  const heights =
    bucket.fromHeight === bucket.toHeight
      ? bucket.fromHeight.toLocaleString()
      : `${bucket.fromHeight.toLocaleString()} – ${bucket.toHeight.toLocaleString()}`;
  const winsFor = (key: string) =>
    bucket.winners.filter((w) => w === key).length;
  return (
    <div className="border border-border bg-card p-2.5 font-mono text-[10px]">
      <div className="mb-1.5 flex justify-between gap-4 text-muted-foreground">
        <span>btc {heights}</span>
        <span>
          {bucket.commits} commits · {bucket.blocks} blk
        </span>
      </div>
      <div className="space-y-0.5">
        {entries.map(([key, sats]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <i
                className="h-1.5 w-1.5"
                style={{ backgroundColor: rows.get(key)?.color ?? '#6b7280' }}
              />
              {minerLabel(rows.get(key), key)}
            </span>
            <span className="tabular-nums">
              {formatSats(sats)}
              <span className="ml-1.5 text-muted-foreground">
                {winsFor(key)}w
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between gap-4 border-t border-border pt-1.5">
        <span className="text-muted-foreground">total</span>
        <span className="tabular-nums">{formatBtc(bucket.totalSats)}</span>
      </div>
    </div>
  );
}

function WinnerStrip({
  blocks,
  rows,
}: {
  blocks: MinerCommitsBlock[];
  rows: Map<string, MinerRow>;
}) {
  const cells = React.useMemo(() => winnerByBlock(blocks), [blocks]);
  return (
    <div className="flex h-2 w-full gap-px overflow-hidden bg-muted">
      {cells.map((cell) => (
        <div
          key={cell.burnBlockHash}
          className="h-full min-w-0 flex-1"
          title={`${cell.burnBlockHeight.toLocaleString()} · ${
            cell.winner
              ? minerLabel(rows.get(cell.winner), cell.winner)
              : 'no winner'
          } · ${cell.commits} commits · ${formatSats(cell.spendSats)} sats`}
          style={{
            backgroundColor: cell.winner
              ? (rows.get(cell.winner)?.color ?? '#6b7280')
              : 'transparent',
          }}
        />
      ))}
    </div>
  );
}

export function SpendChart({
  blocks,
  rows,
  winnerBlocks = blocks,
  stripLabel = 'sortition winner per block',
}: {
  blocks: MinerCommitsBlock[];
  rows: MinerRow[];
  /** Blocks used for the winner strip; defaults to `blocks`. Winners whose
   * miner is not in `rows` render grey. */
  winnerBlocks?: MinerCommitsBlock[];
  stripLabel?: string;
}) {
  const rowMap = React.useMemo(
    () => new Map(rows.map((row) => [row.key, row])),
    [rows]
  );
  const buckets = React.useMemo(() => bucketCommits(blocks), [blocks]);
  const keys = React.useMemo(() => {
    const seen = new Set<string>();
    for (const bucket of buckets) {
      for (const key of Object.keys(bucket.spend)) seen.add(key);
    }
    return [...seen].sort();
  }, [buckets]);
  const data = React.useMemo(
    () => buckets.map((bucket) => ({ ...bucket, ...bucket.spend })),
    [buckets]
  );
  const first = blocks[0]?.burnBlockHeight;
  const last = blocks.at(-1)?.burnBlockHeight;
  const bucketSize = buckets[0]?.blocks ?? 1;

  if (buckets.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center font-mono text-[10px] text-muted-foreground">
        no commits in range
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
            barCategoryGap={1}
          >
            <XAxis
              dataKey="fromHeight"
              tick={{ fontSize: 9, fontFamily: 'var(--font-mono)' }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              tickFormatter={(v: number) => v.toLocaleString()}
            />
            <YAxis
              width={44}
              tick={{ fontSize: 9, fontFamily: 'var(--font-mono)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                v >= 1e6
                  ? `${(v / 1e6).toFixed(1)}M`
                  : `${Math.round(v / 1e3)}k`
              }
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted))' }}
              content={<BucketTooltip rows={rowMap} />}
            />
            {keys.map((key) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="spend"
                fill={rowMap.get(key)?.color ?? '#6b7280'}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2">
        <WinnerStrip blocks={winnerBlocks} rows={rowMap} />
        <div className="mt-1 flex min-w-0 justify-between gap-1 font-mono text-[9px] text-muted-foreground">
          <span>{first?.toLocaleString()}</span>
          <span className="min-w-0 text-center">
            {stripLabel} · each bar ={' '}
            {bucketSize === 1 ? '1 btc block' : `${bucketSize} btc blocks`}
          </span>
          <span>{last?.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
