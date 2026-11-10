import {
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

export interface Milestone {
  key: string;
  label: string;
  detail: string;
  height: number;
}

const nextMultiple = (tip: number, step: number) =>
  (Math.floor(tip / step) + 1) * step;

/** Upcoming heights worth forecasting, ascending. */
export function upcomingMilestones(tip: number, pox: PoxParams | null) {
  const out: Milestone[] = [
    { key: 'next', label: 'next block', detail: 'tip + 1', height: tip + 1 },
    {
      key: 'day',
      label: '+144 blocks',
      detail: '≈ one day of blocks',
      height: tip + 144,
    },
  ];
  const retarget = nextMultiple(tip, RETARGET_INTERVAL);
  out.push({
    key: 'retarget',
    label: 'difficulty adjustment',
    detail: `epoch ${retarget / RETARGET_INTERVAL}`,
    height: retarget,
  });
  out.push({
    key: 'retarget-2',
    label: 'following adjustment',
    detail: `epoch ${retarget / RETARGET_INTERVAL + 1}`,
    height: retarget + RETARGET_INTERVAL,
  });
  const here = pox ? poxPosition(tip, pox) : null;
  if (pox && here) {
    const len = pox.rewardCycleLength;
    if (here.inPrepare) {
      out.push({
        key: 'cycle',
        label: `cycle ${here.cycle + 1} starts`,
        detail: 'reward phase begins',
        height: here.nextCycleStart,
      });
      out.push({
        key: 'prepare',
        label: `cycle ${here.cycle + 2} prepare`,
        detail: `anchors cycle ${here.cycle + 2}`,
        height: here.prepareStart + len,
      });
    } else {
      out.push({
        key: 'prepare',
        label: `cycle ${here.cycle + 1} prepare`,
        detail: `anchors cycle ${here.cycle + 1}`,
        height: here.prepareStart,
      });
      out.push({
        key: 'cycle',
        label: `cycle ${here.cycle + 1} starts`,
        detail: 'reward phase begins',
        height: here.nextCycleStart,
      });
    }
    out.push({
      key: 'cycle-2',
      label: `cycle ${here.cycle + 2} starts`,
      detail: 'reward phase begins',
      height: here.nextCycleStart + len,
    });
  }
  const round = nextMultiple(tip, 10_000);
  out.push({
    key: 'round',
    label: round.toLocaleString(),
    detail: 'round number',
    height: round,
  });
  const halving = nextMultiple(tip, HALVING_INTERVAL);
  out.push({
    key: 'halving',
    label: 'halving',
    detail: `subsidy era ${halving / HALVING_INTERVAL + 1}`,
    height: halving,
  });
  return out.sort((a, b) => a.height - b.height);
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
