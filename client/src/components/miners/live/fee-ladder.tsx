import { formatFeeRate, type LiveRow } from '@/lib/live-commits';
import type { MempoolBlock } from 'slot-watch-common';
import { cn } from '@/lib/utils';
import { SimpleTooltip } from '../../simple-tooltip';

const BAND_CLASSES = [
  'bg-green-500/15 border-green-500/40',
  'bg-amber-500/15 border-amber-500/40',
  'bg-orange-500/15 border-orange-500/40',
];
const TICKS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
/** Horizontal gap, in % of the axis, a label needs from its lane neighbour. */
const LABEL_GAP = 14;
const LANE_HEIGHT = 14;

/** Assign each sorted position the lowest lane whose last label is far enough left. */
function assignLanes(positions: number[]) {
  const laneEnds: number[] = [];
  return positions.map((pos) => {
    let lane = laneEnds.findIndex((end) => pos - end >= LABEL_GAP);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = pos;
    return lane;
  });
}

/**
 * Log-scale fee axis. Bands mark the fee rates each projected mempool block
 * accepts; ticks mark each miner's pending commit.
 */
export function FeeLadder({
  rows,
  blocks,
}: {
  rows: LiveRow[];
  blocks: MempoolBlock[];
}) {
  const pending = rows
    .flatMap((row) => (row.pending ? [{ row, rate: row.pending.feeRate }] : []))
    .sort((a, b) => a.rate - b.rate);
  const bands = blocks.slice(0, BAND_CLASSES.length);
  const mins = bands.map((b) => b.feeRange[0] ?? 0);
  const rates = pending.map((p) => p.rate);
  const lo = Math.max(0.05, Math.min(...rates, ...mins) * 0.7);
  const hi = Math.max(...rates, blocks[0]?.feeRange[5] ?? 1, lo * 4) * 1.4;
  const x = (v: number) =>
    Math.min(
      100,
      Math.max(
        0,
        ((Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * 100
      )
    );

  const lanes = assignLanes(pending.map((p) => x(p.rate)));
  const laneCount = Math.max(1, ...lanes.map((l) => l + 1));

  return (
    <div className="select-none">
      <div className="relative" style={{ height: laneCount * LANE_HEIGHT + 4 }}>
        {pending.map(({ row, rate }, i) => (
          <div
            key={row.miner.publicKey}
            className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10px] leading-none transition-[left] duration-700"
            style={{
              left: `${x(rate)}%`,
              top: (laneCount - 1 - (lanes[i] ?? 0)) * LANE_HEIGHT,
              color: row.miner.color,
            }}
          >
            {row.miner.label}
          </div>
        ))}
      </div>
      <div className="relative h-8 border border-border bg-red-500/10">
        {bands.map((block, i) => {
          const left = x(mins[i] ?? 0);
          const right = i === 0 ? 100 : x(mins[i - 1] ?? 0);
          return (
            <SimpleTooltip
              key={i}
              content={`block +${i + 1}: ${formatFeeRate(block.feeRange[0] ?? 0)}–${formatFeeRate(block.feeRange.at(-1) ?? 0)} sat/vB · median ${formatFeeRate(block.medianFee)}`}
            >
              <div
                className={cn('absolute inset-y-0 border-l', BAND_CLASSES[i])}
                style={{
                  left: `${left}%`,
                  width: `${Math.max(0, right - left)}%`,
                }}
              >
                <span className="absolute bottom-0.5 left-1 font-mono text-[9px] text-muted-foreground">
                  +{i + 1}
                </span>
              </div>
            </SimpleTooltip>
          );
        })}
        {blocks[0] ? (
          <div
            className="absolute inset-y-0 border-l border-dashed border-foreground/40"
            style={{ left: `${x(blocks[0].medianFee)}%` }}
          />
        ) : null}
        {pending.map(({ row, rate }) => (
          <SimpleTooltip
            key={row.miner.publicKey}
            content={`${row.miner.label} · ${formatFeeRate(rate)} sat/vB`}
          >
            <div
              className={cn(
                'absolute inset-y-0 w-0.5 -translate-x-1/2 transition-[left] duration-700',
                row.stale && 'opacity-40'
              )}
              style={{ left: `${x(rate)}%`, backgroundColor: row.miner.color }}
            />
          </SimpleTooltip>
        ))}
      </div>
      <div className="relative h-4">
        {TICKS.filter((t) => t >= lo && t <= hi).map((t) => (
          <span
            key={t}
            className="absolute top-0.5 -translate-x-1/2 font-mono text-[9px] text-muted-foreground tabular-nums"
            style={{ left: `${x(t)}%` }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProjectedBlocks({
  blocks,
  rows,
}: {
  blocks: MempoolBlock[];
  rows: LiveRow[];
}) {
  const commitsIn = (index: number) =>
    rows.filter((r) => {
      if (!r.fee) return false;
      if (index === 0)
        return r.fee.kind === 'next' || r.fee.kind === 'marginal';
      return r.fee.kind === 'later' && r.fee.blocks === index + 1;
    });
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {blocks.slice(0, 4).map((block, i) => {
        const commits = commitsIn(i);
        return (
          <div
            key={i}
            className={cn(
              'border border-border px-2.5 py-2',
              i === 0 ? 'bg-green-500/5' : 'bg-muted/10'
            )}
          >
            <div className="flex items-baseline justify-between font-mono text-[10px] text-muted-foreground">
              <span className="uppercase tracking-wider">
                {i === 0 ? 'next block' : `+${i + 1}`}
              </span>
              <span className="tabular-nums">
                {block.nTx.toLocaleString()} tx
              </span>
            </div>
            <div className="mt-1 font-mono text-base font-semibold leading-none tabular-nums">
              ~{formatFeeRate(block.medianFee)}
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                sat/vB
              </span>
            </div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground tabular-nums">
              {formatFeeRate(block.feeRange[0] ?? 0)} –{' '}
              {formatFeeRate(block.feeRange.at(-1) ?? 0)}
            </div>
            <div className="mt-1.5 h-1 bg-muted/40">
              <div
                className="h-full bg-primary/60"
                style={{
                  width: `${Math.min(100, (block.blockVSize / 1e6) * 100)}%`,
                }}
              />
            </div>
            <div className="mt-1.5 flex h-2 gap-0.5">
              {commits.map((r) => (
                <SimpleTooltip key={r.miner.publicKey} content={r.miner.label}>
                  <span
                    className="h-2 w-2"
                    style={{ backgroundColor: r.miner.color }}
                  />
                </SimpleTooltip>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
