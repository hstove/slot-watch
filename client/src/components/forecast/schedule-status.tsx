import type React from 'react';
import { type Bond, type BondPhase, bondPhase } from '@/lib/bonds';
import {
  PREPARE_PHASE_LENGTH,
  type PoxParams,
  poxPosition,
} from '@/lib/btc-arrival';
import { cn } from '@/lib/utils';

/** Bonds to draw: locked at, or enrolling within this many cycles after, the target. */
const BOND_LOOKAHEAD_CYCLES = 4;

const fmt = (n: number) => n.toLocaleString();

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

/** Vertical marker at `pct` across a bar or a stack of lanes. */
function Marker({
  pct,
  className,
  title,
}: {
  pct: number;
  className: string;
  title: string;
}) {
  return (
    <div
      title={title}
      className={cn('absolute inset-y-0 w-0.5 -translate-x-1/2', className)}
      style={{ left: `${pct}%` }}
    />
  );
}

/**
 * Where `height` falls in its PoX reward cycle: the reward and prepare
 * segments, with the target (and the tip, when it is in the same cycle).
 */
function CycleBar({
  height,
  tip,
  pox,
}: {
  height: number;
  tip: number;
  pox: PoxParams;
}) {
  const pos = poxPosition(height, pox);
  if (!pos) return null;
  const len = pox.rewardCycleLength;
  const pct = (h: number) => ((h - pos.cycleStart) / len) * 100;
  const rewardPct = pct(pos.prepareStart);
  const tipInCycle = tip >= pos.cycleStart && tip < pos.nextCycleStart;
  const status = pos.inPrepare
    ? `prepare phase · block ${fmt(height - pos.prepareStart + 1)}/${PREPARE_PHASE_LENGTH} · anchors cycle ${pos.cycle + 1}`
    : `reward phase · block ${fmt(pos.index + 1)}/${fmt(len - PREPARE_PHASE_LENGTH)} · prepare in ${fmt(pos.prepareStart - height)} (${fmt(pos.prepareStart)})`;
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 font-mono text-xs">
        <span>
          cycle {pos.cycle}{' '}
          <span
            className={cn(
              'text-[10px]',
              pos.inPrepare
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground'
            )}
          >
            {status}
          </span>
        </span>
        <span className="text-[10px] text-muted-foreground">
          {fmt(pos.index + 1)}/{fmt(len)}
        </span>
      </div>
      <div className="relative h-5 border border-border">
        <div
          className="absolute inset-y-0 left-0 bg-muted/50"
          style={{ width: `${rewardPct}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-amber-500/30"
          style={{ left: `${rewardPct}%` }}
          title={`prepare phase from ${fmt(pos.prepareStart)}`}
        />
        <div
          className="absolute inset-y-0 left-0 bg-foreground/10"
          style={{ width: `${pct(height)}%` }}
        />
        {tipInCycle && tip !== height ? (
          <Marker
            pct={pct(tip)}
            className="bg-muted-foreground"
            title={`tip ${fmt(tip)}`}
          />
        ) : null}
        <Marker
          pct={pct(height)}
          className="bg-foreground"
          title={`block ${fmt(height)}`}
        />
      </div>
      <div className="relative mt-1 h-3 font-mono text-[10px] tabular-nums text-muted-foreground">
        <span className="absolute left-0">{fmt(pos.cycleStart)}</span>
        <span className="absolute right-0">
          cycle {pos.cycle + 1} · {fmt(pos.nextCycleStart)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <i className="h-1.5 w-3 bg-muted/50" /> reward phase
        </span>
        <span className="flex items-center gap-1">
          <i className="h-1.5 w-3 bg-amber-500/30" /> prepare phase
        </span>
        <span className="flex items-center gap-1">
          <i className="h-2.5 w-0.5 bg-foreground" /> this block
        </span>
        {tipInCycle && tip !== height ? (
          <span className="flex items-center gap-1">
            <i className="h-2.5 w-0.5 bg-muted-foreground" /> tip
          </span>
        ) : null}
      </div>
    </div>
  );
}

const PHASE_TEXT: Record<BondPhase, string> = {
  upcoming: 'upcoming',
  closed: 'enrollment closed',
  locked: 'locked',
  unlocked: 'unlocked',
};

function bondDetail(bond: Bond, height: number, phase: BondPhase) {
  switch (phase) {
    case 'upcoming':
      return `closes in ${fmt(bond.enrollmentCutoff - height)}`;
    case 'closed':
      return `opens in ${fmt(bond.activation - height)}`;
    case 'locked':
      return `unlocks in ${fmt(bond.unlock - height)}`;
    default:
      return `since ${fmt(bond.unlock)}`;
  }
}

/**
 * One lane per bond around `height`: a tick at the enrollment cutoff, a
 * narrow gap until activation, then the locked period until unlock.
 */
function BondLanes({
  height,
  bonds,
  pox,
}: {
  height: number;
  bonds: readonly Bond[];
  pox: PoxParams | null;
}) {
  const cycleLen = pox?.rewardCycleLength ?? 2100;
  const relevant = bonds.filter(
    (b) =>
      b.unlock > height &&
      b.enrollmentCutoff <= height + BOND_LOOKAHEAD_CYCLES * cycleLen
  );
  if (relevant.length === 0) {
    return (
      <div className="font-mono text-[10px] text-muted-foreground">
        {bonds.length === 0
          ? 'bond schedule unavailable'
          : 'no known bond is locked or enrolling around this height'}
      </div>
    );
  }
  const lo = Math.min(height, ...relevant.map((b) => b.enrollmentCutoff));
  const hi = Math.max(height, ...relevant.map((b) => b.unlock));
  const span = Math.max(1, hi - lo);
  const pct = (h: number) => ((h - lo) / span) * 100;
  const locked = relevant.filter((b) => bondPhase(b, height) === 'locked');
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 font-mono text-xs">
        <span>
          {locked.length} bond{locked.length === 1 ? '' : 's'} locked
        </span>
        <span className="text-[10px] text-muted-foreground">
          {fmt(lo)} – {fmt(hi)}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {relevant.map((bond) => {
          const phase = bondPhase(bond, height);
          return (
            <div
              key={bond.index}
              className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2 font-mono text-[10px] sm:grid-cols-[3.5rem_minmax(0,1fr)_12rem]"
            >
              <span
                className={cn(
                  'tabular-nums',
                  phase === 'locked'
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
                title={bond.status}
              >
                bond {bond.index}
              </span>
              <div className="relative h-3">
                <div className="absolute inset-x-0 top-1/2 border-t border-border/60" />
                <div
                  className="absolute inset-y-0 w-px bg-muted-foreground"
                  style={{ left: `${pct(bond.enrollmentCutoff)}%` }}
                  title={`enrollment closes ${fmt(bond.enrollmentCutoff)}`}
                />
                <div
                  className={cn(
                    'absolute inset-y-0',
                    phase === 'locked' ? 'bg-amber-500/70' : 'bg-amber-500/35',
                    bond.status === 'projected' && 'opacity-70'
                  )}
                  style={{
                    left: `${pct(bond.activation)}%`,
                    width: `${pct(bond.unlock) - pct(bond.activation)}%`,
                  }}
                  title={`locked ${fmt(bond.activation)} – ${fmt(bond.unlock)} (cycle ${bond.activationCycle}+)`}
                />
                <Marker
                  pct={pct(height)}
                  className="bg-foreground"
                  title={`block ${fmt(height)}`}
                />
              </div>
              <span className="col-span-2 truncate pl-[4rem] text-muted-foreground sm:col-span-1 sm:pl-0">
                <span
                  className={
                    phase === 'locked'
                      ? 'text-amber-600 dark:text-amber-400'
                      : ''
                  }
                >
                  {PHASE_TEXT[phase]}
                </span>{' '}
                · {bondDetail(bond, height, phase)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <i className="h-2.5 w-px bg-muted-foreground" /> enrollment cutoff
        </span>
        <span className="flex items-center gap-1">
          <i className="h-1.5 w-3 bg-amber-500/70" /> locked
        </span>
        <span className="flex items-center gap-1">
          <i className="h-2.5 w-0.5 bg-foreground" /> this block
        </span>
      </div>
    </div>
  );
}

/** "Where does this height fall": its PoX cycle and the bonds around it. */
export function ScheduleStatus({
  height,
  tip,
  pox,
  bonds,
}: {
  height: number;
  tip: number;
  pox: PoxParams | null;
  bonds: readonly Bond[];
}) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-3 px-3 py-3 md:grid-cols-2">
      <div className="min-w-0">
        <div className="mb-1.5">
          <Label>stacking cycle</Label>
        </div>
        {pox ? (
          <CycleBar height={height} tip={tip} pox={pox} />
        ) : (
          <div className="font-mono text-[10px] text-muted-foreground">
            pox parameters unavailable
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="mb-1.5">
          <Label>bonds</Label>
        </div>
        <BondLanes height={height} bonds={bonds} pox={pox} />
      </div>
    </div>
  );
}
