import {
  ArrivalDistribution,
  type ArrivalEstimate,
  type ArrivalForecast,
  type ArrivalInput,
  type ArrivalPlan,
  estimateArrival,
  MAX_HORIZON_BLOCKS,
} from 'slot-watch-common';

export const RETARGET_INTERVAL = 2016;
export const HALVING_INTERVAL = 210_000;
/** PoX prepare phase length in burn blocks (the same on mainnet and testnet). */
export const PREPARE_PHASE_LENGTH = 100;
/** Furthest back the arrival route resolves a mined height's time. */
export const MAX_MINED_LOOKBACK = 2016;

export interface PoxParams {
  firstBurnchainBlockHeight: number;
  rewardCycleLength: number;
}

export interface PoxPosition {
  cycle: number;
  /** 0-based index of the height within its reward cycle. */
  index: number;
  /** True for the last {@link PREPARE_PHASE_LENGTH} blocks of a cycle. */
  inPrepare: boolean;
  cycleStart: number;
  prepareStart: number;
  nextCycleStart: number;
}

/** Where a burn height sits in the PoX reward-cycle schedule, or null before PoX began. */
export function poxPosition(
  height: number,
  pox: PoxParams
): PoxPosition | null {
  const { firstBurnchainBlockHeight: first, rewardCycleLength: len } = pox;
  if (!(len > 0) || height < first) return null;
  const cycle = Math.floor((height - first) / len);
  const cycleStart = first + cycle * len;
  const nextCycleStart = cycleStart + len;
  const prepareStart = nextCycleStart - PREPARE_PHASE_LENGTH;
  return {
    cycle,
    index: height - cycleStart,
    inPrepare: height >= prepareStart,
    cycleStart,
    prepareStart,
    nextCycleStart,
  };
}

export type MilestoneKind = 'bitcoin' | 'cycle' | 'bond';

export interface Milestone {
  /** Stable id; merged rows join their ids. */
  key: string;
  label: string;
  detail: string;
  height: number;
  kinds: MilestoneKind[];
}

/** Bond schedule heights, as {@link upcomingMilestones} needs them. */
export interface BondSchedule {
  index: number;
  enrollmentCutoff: number;
  activation: number;
}

/** How many upcoming PoX cycle starts to list. */
export const CYCLES_AHEAD = 12;

const nextMultiple = (tip: number, step: number) =>
  (Math.floor(tip / step) + 1) * step;

/** The first block of the next PoX reward cycle, or null before PoX / without params. */
export function nextCycleStart(tip: number, pox: PoxParams | null) {
  const here = pox ? poxPosition(tip, pox) : null;
  return here ? here.nextCycleStart : null;
}

/**
 * Upcoming heights worth forecasting, ascending: bitcoin events, the next
 * {@link CYCLES_AHEAD} PoX cycle starts (plus the next prepare phase), and
 * each bond's enrollment cutoff and activation. Events at the same height
 * are merged into one row.
 */
export function upcomingMilestones(
  tip: number,
  pox: PoxParams | null,
  bonds: readonly BondSchedule[] = []
): Milestone[] {
  return mergeByHeight([
    ...bitcoinMilestones(tip),
    ...cycleMilestones(tip, pox),
    ...bondMilestones(tip, bonds),
  ]);
}

function bitcoinMilestones(tip: number): Milestone[] {
  const retarget = nextMultiple(tip, RETARGET_INTERVAL);
  const round = nextMultiple(tip, 10_000);
  const halving = nextMultiple(tip, HALVING_INTERVAL);
  const bitcoin = (m: Omit<Milestone, 'kinds'>): Milestone => ({
    ...m,
    kinds: ['bitcoin'],
  });
  return [
    bitcoin({
      key: 'next',
      label: 'next block',
      detail: 'tip + 1',
      height: tip + 1,
    }),
    bitcoin({
      key: 'day',
      label: '+144 blocks',
      detail: '≈ one day of blocks',
      height: tip + 144,
    }),
    bitcoin({
      key: 'retarget',
      label: 'difficulty adjustment',
      detail: `epoch ${retarget / RETARGET_INTERVAL}`,
      height: retarget,
    }),
    bitcoin({
      key: 'retarget-2',
      label: 'following adjustment',
      detail: `epoch ${retarget / RETARGET_INTERVAL + 1}`,
      height: retarget + RETARGET_INTERVAL,
    }),
    bitcoin({
      key: 'round',
      label: round.toLocaleString(),
      detail: 'round number',
      height: round,
    }),
    bitcoin({
      key: 'halving',
      label: 'halving',
      detail: `subsidy era ${halving / HALVING_INTERVAL + 1}`,
      height: halving,
    }),
  ];
}

function cycleMilestones(tip: number, pox: PoxParams | null): Milestone[] {
  const here = pox ? poxPosition(tip, pox) : null;
  if (!(pox && here)) return [];
  const len = pox.rewardCycleLength;
  const anchors = here.inPrepare ? here.cycle + 2 : here.cycle + 1;
  const out: Milestone[] = [
    {
      key: 'prepare',
      label: `cycle ${anchors} prepare`,
      detail: `prepare phase · anchors cycle ${anchors}`,
      height: here.inPrepare ? here.prepareStart + len : here.prepareStart,
      kinds: ['cycle'],
    },
  ];
  for (let i = 0; i < CYCLES_AHEAD; i++) {
    const cycle = here.cycle + 1 + i;
    out.push({
      key: i === 0 ? 'cycle' : `cycle-${cycle}`,
      label: `cycle ${cycle} starts`,
      detail: 'reward phase begins',
      height: here.nextCycleStart + i * len,
      kinds: ['cycle'],
    });
  }
  return out;
}

function bondMilestones(
  tip: number,
  bonds: readonly BondSchedule[]
): Milestone[] {
  return bonds
    .flatMap((bond): Milestone[] => [
      {
        key: `bond-${bond.index}-cutoff`,
        label: `bond ${bond.index} enrollment closes`,
        detail: 'register before this block',
        height: bond.enrollmentCutoff,
        kinds: ['bond'],
      },
      {
        key: `bond-${bond.index}-opens`,
        label: `bond ${bond.index} opens`,
        detail: 'bond activates',
        height: bond.activation,
        kinds: ['bond'],
      },
    ])
    .filter((m) => m.height > tip);
}

function mergeByHeight(items: Milestone[]): Milestone[] {
  const byHeight = new Map<number, Milestone>();
  for (const m of items) {
    const existing = byHeight.get(m.height);
    if (!existing) {
      byHeight.set(m.height, { ...m, kinds: [...m.kinds] });
      continue;
    }
    existing.key = `${existing.key}+${m.key}`;
    existing.label = `${existing.label} · ${m.label}`;
    existing.detail = `${existing.detail} · ${m.detail}`;
    for (const kind of m.kinds) {
      if (!existing.kinds.includes(kind)) existing.kinds.push(kind);
    }
  }
  return [...byHeight.values()].sort((a, b) => a.height - b.height);
}

/** The forecast for `height`, or null if it is mined, too far ahead or invalid. */
export function forecastFor(
  input: ArrivalInput,
  height: number,
  plan?: ArrivalPlan
): ArrivalForecast | null {
  const estimate: ArrivalEstimate = estimateArrival(input, height, plan);
  return estimate.status === 'forecast' ? estimate : null;
}

/**
 * The first height whose median arrival is at or after `time` (unix seconds),
 * i.e. the block most likely being mined around then. Null if `time` is in the
 * past or beyond the model's horizon.
 */
export function heightAtTime(
  input: ArrivalInput,
  plan: ArrivalPlan,
  time: number
): number | null {
  if (!(time > input.now)) return null;
  const medianAt = (n: number) =>
    forecastFor(input, input.tipHeight + n, plan)?.median ?? Number.NaN;
  if (!(medianAt(MAX_HORIZON_BLOCKS) >= time)) return null;
  let lo = 1;
  let hi = MAX_HORIZON_BLOCKS;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (medianAt(mid) >= time) hi = mid;
    else lo = mid + 1;
  }
  return input.tipHeight + lo;
}

// ---------------------------------------------------------------- formatting

/** Compact duration: "45s", "7m", "2h 15m", "3d 4h". */
export function formatDuration(seconds: number) {
  const s = Math.abs(seconds);
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) {
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return joinUnits(h, 'h', m, 'm', 60);
  }
  const d = Math.floor(s / 86_400);
  const h = Math.round((s % 86_400) / 3600);
  return joinUnits(d, 'd', h, 'h', 24);
}

/** "2h 15m", carrying a rounded-up minor unit ("1h 60m" -> "2h") and dropping a zero one. */
function joinUnits(
  major: number,
  majorUnit: string,
  minor: number,
  minorUnit: string,
  perMajor: number
) {
  if (minor === perMajor) return `${major + 1}${majorUnit}`;
  if (minor === 0) return `${major}${majorUnit}`;
  return `${major}${majorUnit} ${minor}${minorUnit}`;
}

/** "in 2h 15m" / "4m ago". */
export function formatRelative(time: number, now: number) {
  const diff = time - now;
  if (Math.abs(diff) < 30) return 'now';
  return diff > 0
    ? `in ${formatDuration(diff)}`
    : `${formatDuration(diff)} ago`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Ticking countdown: "1d 02h 03m 04s", "03m 04s". */
export function formatCountdown(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m ${pad(sec)}s`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(sec)}s`;
  return `${pad(m)}m ${pad(sec)}s`;
}

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZoneName: 'short',
});
const axisFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const axisTimeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "Tue, Nov 11, 14:32" */
export const formatDateTime = (unix: number) =>
  dateTimeFormat.format(unix * 1000);
/** "Tue, Nov 11, 2026" */
export const formatDate = (unix: number) => dateFormat.format(unix * 1000);
/** "14:32 PST" */
export const formatTime = (unix: number) => timeFormat.format(unix * 1000);

/** Axis tick label; drops the date when the whole range is within a day. */
export const formatAxisTime = (unix: number, spanSeconds: number) =>
  spanSeconds < 20 * 3600
    ? axisTimeFormat.format(unix * 1000)
    : axisFormat.format(unix * 1000);

/** Probability as a short percentage: "<1%", "37%", ">99%". */
export function formatProbability(p: number) {
  if (p < 0.01) return '<1%';
  if (p > 0.99) return '>99%';
  return `${Math.round(p * 100)}%`;
}

/** Value for `<input type="datetime-local">` in local time. */
export function toDateTimeLocal(unix: number) {
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocal(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms / 1000 : null;
}

// ---------------------------------------------------------------- 10-minute baseline

export const TARGET_BLOCK_SECONDS = 600;

/** "9:41" per block. */
export function formatPace(seconds: number) {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const PACE_PATTERN = /^(\d{1,3})(?::(\d{1,2}))?$/;

/** Parse "9:41", "10" (minutes) or "9:5" into seconds per block; null if invalid. */
export function parsePace(value: string): number | null {
  const match = PACE_PATTERN.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = match[2] === undefined ? 0 : Number(match[2]);
  if (seconds >= 60) return null;
  const total = minutes * 60 + seconds;
  return total >= 1 ? total : null;
}

export interface BaselineForecast {
  median: number;
  q10: number;
  q90: number;
  q025: number;
  q975: number;
  meanSeconds: number;
  /** Rehydratable params (same construction and sigma as the model). */
  distribution: ArrivalForecast['distribution'];
}

/**
 * The same target forecast with user-chosen paces instead of the model's:
 * `paceUntil` for the blocks left in the current difficulty epoch and
 * `paceAfter` for every block from the retarget on. Uses the model's own
 * Gamma + rate-uncertainty construction and sigma(n), so with 10:00 / 10:00
 * it is "flat 600 s/block from now" with comparable intervals.
 */
export function baselineForecast(
  forecast: ArrivalForecast,
  paceUntil: number,
  paceAfter: number
): BaselineForecast {
  const { currentEpoch, nextEpoch, beyond } = forecast.components;
  const meanSeconds =
    currentEpoch.blocks * paceUntil +
    (nextEpoch.blocks + beyond.blocks) * paceAfter;
  const distribution = { ...forecast.distribution, meanSeconds };
  const dist = new ArrivalDistribution(distribution);
  return {
    median: dist.quantile(0.5),
    q10: dist.quantile(0.1),
    q90: dist.quantile(0.9),
    q025: dist.quantile(0.025),
    q975: dist.quantile(0.975),
    meanSeconds,
    distribution,
  };
}

export interface PaceStat {
  /** Mean seconds per block over the window. */
  mean: number;
  blocks: number;
  /** Approximate 95% band for the underlying pace (normal approx. to the mean of exponential intervals). */
  lo: number;
  hi: number;
}

/** Average block time between two known blocks, with its sampling noise band. */
export function paceStat(
  from: { height: number; time: number },
  to: { height: number; time: number }
): PaceStat | null {
  const blocks = to.height - from.height;
  const seconds = to.time - from.time;
  if (!(blocks > 0 && seconds > 0)) return null;
  const mean = seconds / blocks;
  const half = (1.96 * mean) / Math.sqrt(blocks);
  return { mean, blocks, lo: mean - half, hi: mean + half };
}
