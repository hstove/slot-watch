/**
 * Bitcoin block arrival-time estimator ("combined" model, `btc-arrival/combined-v1`).
 *
 * Derivation and evidence: `history/2026-11-10-bitcoin-arrival-estimates.md`.
 * Pure and dependency free. ALL times are unix SECONDS, all heights are
 * Bitcoin block heights. Assumes difficulty retargets at `height % 2016 == 0`
 * (true for Bitcoin mainnet and testnet3/4 and signet; not for regtest).
 *
 * What it reads (via `blockTime(height)`, undefined if unknown): see
 * {@link requiredHeights}. Missing times are tolerated: the nearest known block
 * at or below the wanted height is used and the true height difference is
 * divided out (this lookup lives inside the model so heights stay attached to
 * their times). With no history at all it degrades to a flat 600 s/block
 * forecast.
 *
 * The forecast is anchored at `now`, not at the tip's timestamp: block
 * arrival is memoryless, so time already elapsed since the tip carries no
 * information.
 */

import {
  ARRIVAL_DISTRIBUTION_CONSTRUCTION,
  ArrivalDistribution,
  type ArrivalDistributionParams,
} from './distribution';
import { gammaQuantile } from './gamma';

export const ARRIVAL_MODEL_VERSION = 'btc-arrival/combined-v1';

// ---------------------------------------------------------------- constants (tuned on the study's dev split)
const EPOCH = 2016;
const TARGET_TIMESPAN = 1_209_600; // 2016 * 600
const CHUNK = 72; // divides 2016: chunks never straddle a retarget
const HALF_LIFE = 700; // blocks
const PRIOR_BLOCKS = 300; // prior weight on "pace 600 under the current difficulty"
const FAR_PACE = 600; // s/block beyond the next retarget
const MAX_AGE = HALF_LIFE * 4; // history window: 4 half-lives
const MAX_BACK = 7000; // how far below the tip a missing time is searched for
const FIRST_SCAN = 60; // how far above an epoch start a missing first block is searched for
const MIN_EPOCH_SPAN = 500;
const RATIO_MIN = 0.25;
const RATIO_MAX = 4;
/** Margin (extra heights below each chunk boundary) fetched by `requiredHeights`. */
const CHUNK_MARGIN = 1;
/** Margin (extra heights next to epoch first/last blocks) fetched by `requiredHeights`. */
const EPOCH_MARGIN = 2;

/** Farthest supported target: ~69 days. Beyond this `estimateArrival` reports `invalid`. */
export const MAX_HORIZON_BLOCKS = 10_000;

/**
 * Relative sd of the mean-pace estimate, `[n, sigma80, sigma95]` knots, linear
 * in log(n), flat outside. Refit on the study's dev split for this estimator.
 */
export const SIGMA_TABLE: readonly (readonly [
  n: number,
  s80: number,
  s95: number,
])[] = [
  [1, 0.0475, 0.05],
  [18, 0.0475, 0.05],
  [36, 0.0475, 0.0525],
  [72, 0.0425, 0.0475],
  [144, 0.04, 0.0425],
  [288, 0.0375, 0.0425],
  [432, 0.035, 0.0425],
  [720, 0.035, 0.0425],
  [1008, 0.0375, 0.04],
  [2016, 0.0375, 0.0375],
  [3024, 0.035, 0.0325],
  [4320, 0.0275, 0.0275],
  [6048, 0.0225, 0.02],
  [8640, 0.0175, 0.015],
];

export interface Sigmas {
  s80: number;
  s95: number;
}

/** Linear interpolation in log(n); flat outside the knots. */
export function interpSigma(
  table: readonly (readonly [number, number, number])[],
  n: number
): Sigmas {
  const first = table[0];
  if (n <= first[0]) {
    return { s80: first[1], s95: first[2] };
  }
  for (let i = 1; i < table.length; i++) {
    if (n <= table[i][0]) {
      const [n0, a0, b0] = table[i - 1];
      const [n1, a1, b1] = table[i];
      const t = Math.log(n / n0) / Math.log(n1 / n0);
      return { s80: a0 + t * (a1 - a0), s95: b0 + t * (b1 - b0) };
    }
  }
  const last = table.at(-1) ?? first;
  return { s80: last[1], s95: last[2] };
}

// ---------------------------------------------------------------- types
export interface ArrivalInput {
  /** Prediction instant (wall clock), unix seconds. */
  now: number;
  /** Height of the newest known block. */
  tipHeight: number;
  /** Time of the newest known block, unix seconds. */
  tipTime: number;
  /** Time of the block at `height` (unix seconds) or undefined if unknown. Exact lookup, no gap-filling. */
  blockTime: (height: number) => number | undefined;
}

export interface PaceSegment {
  /** Modelled seconds per block. */
  secondsPerBlock: number;
  /** How many of the blocks up to the target are priced at this pace. */
  blocks: number;
}

export interface ArrivalComponents {
  /** Blocks from the tip (exclusive) to the target (inclusive). */
  blocksRemaining: number;
  /** Rest of the current difficulty epoch, at the hashrate-based pace. */
  currentEpoch: PaceSegment;
  /** The next epoch, at the pace implied by the projected retarget. */
  nextEpoch: PaceSegment;
  /** Blocks beyond the next epoch, priced at 600 s/block. */
  beyond: PaceSegment;
  retarget: {
    /** First height of the next difficulty epoch. */
    height: number;
    /** Expected arrival of that block, unix seconds (mean pace path). */
    projectedTime: number;
    /** Projected difficulty change at that retarget, percent (positive = harder). */
    projectedDifficultyChangePct: number;
    /** Projected duration of the whole current epoch, seconds. */
    projectedEpochSeconds: number;
  };
  /** How the current-epoch pace was estimated from recent blocks. */
  hashratePace: {
    /** Pace measured from recent blocks (difficulty-normalised), s/block; null if no usable history. */
    measuredSecondsPerBlock: number | null;
    /** Pace after shrinking toward 600 s/block; used for the current epoch. */
    shrunkSecondsPerBlock: number;
    /** Prior weight, in blocks, on "600 s/block". */
    priorBlocks: number;
    /** Exponentially weighted, difficulty-normalised blocks of evidence (effective sample size). */
    effectiveBlocks: number;
    /** Share of the pace that comes from measurements (0..1); the rest is the 600 s prior. */
    dataWeight: number;
    /** Number of 72-block chunks that fed the measurement. */
    chunksUsed: number;
  };
}

export interface ArrivalQuality {
  /** How many heights `requiredHeights(tipHeight)` asked for. */
  sampleHeightsRequested: number;
  /** How many of those the `blockTime` lookup returned a time for. */
  sampleHeightsAvailable: number;
  /** `now - tipTime`, seconds. Negative means the tip's header time is ahead of `now`. */
  tipAgeSeconds: number;
  /** True when `tipAgeSeconds < 0` (clock skew or a miner timestamp in the future). */
  clockSkew: boolean;
  /** True when no usable history existed and the pace is a flat 600 s/block. */
  flatFallback: boolean;
}

export interface ArrivalForecast {
  status: 'forecast';
  modelVersion: string;
  now: number;
  tipHeight: number;
  targetHeight: number;
  blocksRemaining: number;
  /** Median arrival time: the point estimate to display. Unix seconds. */
  median: number;
  /** `now` plus the modelled mean time to target. Unix seconds. */
  mean: number;
  /** 95% interval is [q025, q975]. */
  q025: number;
  /** 80% interval is [q10, q90]. */
  q10: number;
  q90: number;
  q975: number;
  /** Full predictive distribution; rehydrate with `ArrivalDistribution.fromParams`. */
  distribution: ArrivalDistributionParams;
  components: ArrivalComponents;
  quality: ArrivalQuality;
}

export interface MinedArrival {
  status: 'mined';
  modelVersion: string;
  targetHeight: number;
  /** Known block time, unix seconds; null if the time of that block is not known. */
  time: number | null;
  /** Where the time came from. */
  timeSource: 'tip' | 'sample' | 'unknown';
}

export interface InvalidArrival {
  status: 'invalid';
  modelVersion: string;
  reason: string;
}

export type ArrivalEstimate = ArrivalForecast | MinedArrival | InvalidArrival;

// ---------------------------------------------------------------- history access
interface Pt {
  height: number;
  time: number;
}

class History {
  readonly tip: number;
  readonly tipTime: number;
  readonly #blockTime: (h: number) => number | undefined;
  // Memo of the last downward search: heights in [#missTo.height, #missFrom] resolve to #missTo.
  #missFrom = -1;
  #missTo: Pt | undefined;

  constructor(input: ArrivalInput) {
    this.tip = input.tipHeight;
    this.tipTime = input.tipTime;
    this.#blockTime = input.blockTime;
  }

  timeAt(height: number): number | undefined {
    if (height > this.tip) {
      return;
    }
    if (height === this.tip) {
      return this.tipTime;
    }
    const t = this.#blockTime(height);
    return t !== undefined && Number.isFinite(t) ? t : undefined;
  }

  /** Nearest known block at or below `height` (clamped to the tip), searching at most MAX_BACK below the tip. */
  knownAtOrBelow(height: number): Pt | undefined {
    const start = Math.min(height, this.tip);
    if (
      this.#missTo &&
      start <= this.#missFrom &&
      start >= this.#missTo.height
    ) {
      return this.#missTo;
    }
    const floor = Math.max(0, this.tip - MAX_BACK);
    for (let x = start; x >= floor; x--) {
      const t = this.timeAt(x);
      if (t !== undefined) {
        const p = { height: x, time: t };
        if (x < start) {
          this.#missFrom = start;
          this.#missTo = p;
        }
        return p;
      }
    }
    return;
  }

  /** Nearest known block at or above `height`, scanning at most `scan` heights, never above the tip. */
  knownAbove(height: number, scan = FIRST_SCAN): Pt | undefined {
    for (let i = 0; i <= scan && height + i <= this.tip; i++) {
      const t = this.timeAt(height + i);
      if (t !== undefined) {
        return { height: height + i, time: t };
      }
    }
    return;
  }
}

/** Duration of a completed epoch scaled to 2015 intervals; undefined if the usable span is < 500 blocks. */
function epochDuration(h: History, ep: number): number | undefined {
  const first = h.knownAbove(ep * EPOCH);
  const last = h.knownAtOrBelow(ep * EPOCH + EPOCH - 1);
  if (!(first && last) || last.height - first.height < MIN_EPOCH_SPAN) {
    return;
  }
  const dt = last.time - first.time;
  if (dt <= 0) {
    return;
  }
  return (dt * (EPOCH - 1)) / (last.height - first.height);
}

const clampRatio = (timespan: number) =>
  Math.min(RATIO_MAX, Math.max(RATIO_MIN, TARGET_TIMESPAN / timespan));

// ---------------------------------------------------------------- required heights
/**
 * The set of heights (ascending, all strictly below `tipHeight`) whose times the
 * model may read for a tip at `tipHeight`:
 *
 * - every multiple of 72 from `tip - 2872` to the tip, plus the height just
 *   below (the model falls back to the nearest known block at or below);
 * - first block of each difficulty epoch touched by the 2,800-block window and
 *   of the current epoch (plus two neighbours above, the model searches up);
 * - last block of each completed epoch touched (plus two neighbours below).
 *
 * About 95 heights. The tip itself is passed to the model separately
 * (`tipHeight` / `tipTime`) and never read through `blockTime`.
 */
export function requiredHeights(tipHeight: number): number[] {
  if (!Number.isSafeInteger(tipHeight) || tipHeight < 1) {
    return [];
  }
  const wanted = new Set<number>();
  const add = (height: number) => {
    if (height >= 0 && height < tipHeight) {
      wanted.add(height);
    }
  };
  for (let k = Math.floor((tipHeight - 1) / CHUNK); k >= 0; k--) {
    if (tipHeight - k * CHUNK > MAX_AGE + CHUNK) {
      break;
    }
    for (let m = 0; m <= CHUNK_MARGIN; m++) {
      add(k * CHUNK - m);
    }
  }
  const e = Math.floor(tipHeight / EPOCH);
  const firstEp = Math.floor(Math.max(0, tipHeight - MAX_AGE) / EPOCH);
  for (let ep = firstEp; ep <= e; ep++) {
    for (let m = 0; m <= EPOCH_MARGIN; m++) {
      add(ep * EPOCH + m);
      if (ep < e) {
        add(ep * EPOCH + EPOCH - 1 - m);
      }
    }
  }
  return [...wanted].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- pace plan
export interface ArrivalPlan {
  tipHeight: number;
  /** Modelled s/block for the rest of the current epoch. */
  paceCurrent: number;
  /** Projected s/block for the next epoch. */
  paceNext: number;
  /** First height of the next epoch. */
  nextRetargetHeight: number;
  /** Projected whole-epoch duration used for the retarget projection, seconds. */
  projectedEpochSeconds: number;
  /** Projected difficulty change at the next retarget, percent. */
  projectedDifficultyChangePct: number;
  hashratePace: ArrivalComponents['hashratePace'];
  flatFallback: boolean;
  /** Mean seconds from the tip until `target` arrives, summed over the pace path. */
  secondsToTarget(target: number): number;
}

interface PaceSums {
  sumT: number;
  sumW: number;
  chunks: number;
}

function sumChunks(h: History, relD: Map<number, number>): PaceSums {
  const tip = h.tip;
  const Dof = (ep: number) => relD.get(ep) ?? relD.get(ep + 1) ?? 1;
  const workBetween = (h1: number, h2: number): number => {
    let w = 0;
    let lo = h1 + 1;
    while (lo <= h2) {
      const ep = Math.floor(lo / EPOCH);
      const hi = Math.min(h2, ep * EPOCH + EPOCH - 1);
      w += (hi - lo + 1) * Dof(ep);
      lo = hi + 1;
    }
    return w;
  };
  let sumT = 0;
  let sumW = 0;
  let chunks = 0;
  let newer: Pt = { height: tip, time: h.tipTime };
  const lam = Math.LN2 / HALF_LIFE;
  for (let k = Math.floor((tip - 1) / CHUNK); k >= 0; k--) {
    if (tip - k * CHUNK > MAX_AGE + CHUNK) {
      break;
    }
    const older = h.knownAtOrBelow(k * CHUNK);
    if (!older || older.height >= newer.height) {
      continue;
    }
    const dt = newer.time - older.time;
    const age = tip - (newer.height + older.height) / 2;
    const w = Math.exp(-lam * age);
    sumT += w * dt;
    sumW += w * workBetween(older.height, newer.height);
    chunks++;
    newer = older;
  }
  return { sumT, sumW, chunks };
}

/** Fit the pace path to the history visible at the tip. Reusable for several targets. Input must be valid. */
export function buildArrivalPlan(input: ArrivalInput): ArrivalPlan {
  const h = new History(input);
  const tip = h.tip;
  const e = Math.floor(tip / EPOCH);

  // Relative difficulty per epoch (current = 1): D_{ep-1} = D_ep * T_{ep-1} / 1209600.
  const relD = new Map<number, number>();
  relD.set(e, 1);
  const firstEp = Math.floor(Math.max(0, tip - MAX_AGE) / EPOCH);
  for (let ep = e - 1; ep >= firstEp; ep--) {
    const duration = epochDuration(h, ep);
    relD.set(
      ep,
      (relD.get(ep + 1) ?? 1) *
        (duration === undefined ? 1 : duration / TARGET_TIMESPAN)
    );
  }

  const { sumT, sumW, chunks } = sumChunks(h, relD);

  // Elapsed time in the current epoch at the tip.
  const first = h.knownAbove(e * EPOCH);
  const k = tip - e * EPOCH;
  const elapsed =
    first && tip > first.height && h.tipTime > first.time
      ? ((h.tipTime - first.time) * k) / (tip - first.height)
      : k * FAR_PACE;

  // Pace under the current difficulty, shrunk toward 600.
  const shrunk = (PRIOR_BLOCKS * FAR_PACE + sumT) / (PRIOR_BLOCKS + sumW);
  const paceCurrent = Number.isFinite(shrunk) && shrunk > 0 ? shrunk : FAR_PACE;
  // Projected duration of the current epoch -> retarget ratio -> next epoch's pace.
  const projectedEpochSeconds = elapsed + (EPOCH - 1 - k) * paceCurrent;
  const ratio = clampRatio(Math.max(1, projectedEpochSeconds));
  const paceNext = paceCurrent * ratio;
  const paceFor = (j: number) => {
    if (j === 0) {
      return paceCurrent;
    }
    return j === 1 ? paceNext : FAR_PACE;
  };
  const nextRetargetHeight = (e + 1) * EPOCH;
  const dataWeight = sumW > 0 ? sumW / (PRIOR_BLOCKS + sumW) : 0;
  const measured =
    sumW > 0 && Number.isFinite(sumT / sumW) ? sumT / sumW : null;

  return {
    tipHeight: tip,
    paceCurrent,
    paceNext,
    nextRetargetHeight,
    projectedEpochSeconds,
    projectedDifficultyChangePct: (ratio - 1) * 100,
    flatFallback: chunks === 0,
    hashratePace: {
      measuredSecondsPerBlock: measured,
      shrunkSecondsPerBlock: paceCurrent,
      priorBlocks: PRIOR_BLOCKS,
      effectiveBlocks: sumW,
      dataWeight,
      chunksUsed: chunks,
    },
    secondsToTarget(target: number): number {
      let t = 0;
      let lo = tip + 1;
      while (lo <= target) {
        const ep = Math.floor(lo / EPOCH);
        const hi = Math.min(target, ep * EPOCH + EPOCH - 1);
        t += (hi - lo + 1) * paceFor(ep - e);
        lo = hi + 1;
      }
      return t;
    },
  };
}

// ---------------------------------------------------------------- public API
function validateInput(
  input: ArrivalInput,
  targetHeight: number
): string | null {
  if (!(Number.isSafeInteger(input.tipHeight) && input.tipHeight >= 0)) {
    return 'tipHeight must be a non-negative integer';
  }
  if (!Number.isFinite(input.tipTime)) {
    return 'tipTime must be a finite number';
  }
  if (!Number.isFinite(input.now)) {
    return 'now must be a finite number';
  }
  if (!(Number.isSafeInteger(targetHeight) && targetHeight >= 0)) {
    return 'targetHeight must be a non-negative integer';
  }
  if (targetHeight - input.tipHeight > MAX_HORIZON_BLOCKS) {
    return `targetHeight is more than ${MAX_HORIZON_BLOCKS} blocks ahead of the tip`;
  }
  return null;
}

function segments(
  tip: number,
  target: number,
  plan: ArrivalPlan
): Pick<ArrivalComponents, 'currentEpoch' | 'nextEpoch' | 'beyond'> {
  const R = plan.nextRetargetHeight;
  const n = target - tip;
  const cur = Math.max(0, Math.min(target, R - 1) - tip);
  const next = target >= R ? Math.min(target, R + EPOCH - 1) - R + 1 : 0;
  return {
    currentEpoch: { secondsPerBlock: plan.paceCurrent, blocks: cur },
    nextEpoch: { secondsPerBlock: plan.paceNext, blocks: next },
    beyond: { secondsPerBlock: FAR_PACE, blocks: n - cur - next },
  };
}

/**
 * Arrival-time forecast of Bitcoin block `targetHeight`.
 *
 * - `mean`: `now + M`, `M` = modelled mean time to target from `now`.
 * - `median`: `now + M * median(Gamma(n)) / n`, `n = targetHeight - tipHeight`.
 * - `q10`/`q90`, `q025`/`q975`: the 80% / 95% intervals; same values as the
 *   research reference, and the returned `distribution` passes through them.
 *
 * `targetHeight <= tipHeight` returns `status: 'mined'` with the known time
 * (the reference returned the tip time when unknown; this returns null).
 * Invalid inputs or targets more than {@link MAX_HORIZON_BLOCKS} ahead return
 * `status: 'invalid'` and never throw.
 */
export function estimateArrival(
  input: ArrivalInput,
  targetHeight: number,
  plan?: ArrivalPlan
): ArrivalEstimate {
  const invalid = validateInput(input, targetHeight);
  if (invalid) {
    return {
      status: 'invalid',
      modelVersion: ARRIVAL_MODEL_VERSION,
      reason: invalid,
    };
  }
  const { now, tipHeight, tipTime } = input;
  const n = targetHeight - tipHeight;
  if (n <= 0) {
    if (targetHeight === tipHeight) {
      return {
        status: 'mined',
        modelVersion: ARRIVAL_MODEL_VERSION,
        targetHeight,
        time: tipTime,
        timeSource: 'tip',
      };
    }
    const t = input.blockTime(targetHeight);
    const known = t !== undefined && Number.isFinite(t);
    return {
      status: 'mined',
      modelVersion: ARRIVAL_MODEL_VERSION,
      targetHeight,
      time: known ? t : null,
      timeSource: known ? 'sample' : 'unknown',
    };
  }

  const p = plan ?? buildArrivalPlan(input);
  const M = p.secondsToTarget(targetHeight);
  const { s80, s95 } = interpSigma(SIGMA_TABLE, n);
  const params: ArrivalDistributionParams = {
    construction: ARRIVAL_DISTRIBUTION_CONSTRUCTION,
    now,
    blocks: n,
    meanSeconds: M,
    sigma80: s80,
    sigma95: s95,
  };
  const pace = M / n;
  const requested = requiredHeights(tipHeight);
  const available = requested.filter((x) => {
    const t = input.blockTime(x);
    return t !== undefined && Number.isFinite(t);
  }).length;
  const distribution = new ArrivalDistribution(params);

  return {
    status: 'forecast',
    modelVersion: ARRIVAL_MODEL_VERSION,
    now,
    tipHeight,
    targetHeight,
    blocksRemaining: n,
    median: now + pace * gammaQuantile(n, 0.5),
    mean: now + M,
    q025: distribution.quantile(0.025),
    q10: distribution.quantile(0.1),
    q90: distribution.quantile(0.9),
    q975: distribution.quantile(0.975),
    distribution: params,
    components: {
      blocksRemaining: n,
      ...segments(tipHeight, targetHeight, p),
      retarget: {
        height: p.nextRetargetHeight,
        projectedTime: now + p.secondsToTarget(p.nextRetargetHeight),
        projectedDifficultyChangePct: p.projectedDifficultyChangePct,
        projectedEpochSeconds: p.projectedEpochSeconds,
      },
      hashratePace: p.hashratePace,
    },
    quality: {
      sampleHeightsRequested: requested.length,
      sampleHeightsAvailable: available,
      tipAgeSeconds: now - tipTime,
      clockSkew: now < tipTime,
      flatFallback: p.flatFallback,
    },
  };
}

// ---------------------------------------------------------------- sample helpers
export interface BlockTimeSample {
  height: number;
  /** Unix seconds. */
  time: number;
}

/**
 * Exact `height -> time` lookup over a sample list (non-finite entries
 * ignored; the first entry wins for duplicate heights). Gaps stay undefined:
 * the model itself falls back to the nearest known block at or below.
 */
export function blockTimeFromSamples(
  samples: readonly BlockTimeSample[]
): (height: number) => number | undefined {
  const byHeight = new Map<number, number>();
  for (const s of samples) {
    if (
      Number.isFinite(s.height) &&
      Number.isFinite(s.time) &&
      !byHeight.has(s.height)
    ) {
      byHeight.set(s.height, s.time);
    }
  }
  return (height) => byHeight.get(height);
}

export interface ArrivalSampleInput {
  now: number;
  tip: BlockTimeSample;
  samples: readonly BlockTimeSample[];
}

/** Build an {@link ArrivalInput} from a tip plus a sample list (e.g. a route response). */
export function arrivalInputFromSamples(
  input: ArrivalSampleInput
): ArrivalInput {
  return {
    now: input.now,
    tipHeight: input.tip.height,
    tipTime: input.tip.time,
    blockTime: blockTimeFromSamples(input.samples),
  };
}

/** Convenience: forecast for several targets sharing one pace fit. */
export function estimateArrivals(
  input: ArrivalInput,
  targetHeights: readonly number[]
): ArrivalEstimate[] {
  const plan =
    Number.isSafeInteger(input.tipHeight) &&
    input.tipHeight >= 0 &&
    Number.isFinite(input.tipTime) &&
    Number.isFinite(input.now)
      ? buildArrivalPlan(input)
      : undefined;
  return targetHeights.map((target) => estimateArrival(input, target, plan));
}
