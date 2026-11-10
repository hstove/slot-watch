/**
 * Predictive distribution for the arrival time of a Bitcoin block.
 *
 * All times are unix SECONDS (not milliseconds), probabilities are in (0, 1).
 *
 * ## Construction (`gamma-rate-uncertainty/v1`)
 *
 * Let `n` be the number of blocks still to be mined, `M` the model's mean time
 * to mine them (seconds) and `pace = M / n`. The arrival time is
 * `now + pace * X` where `X` is the "unit" waiting time, in units of the mean
 * block interval:
 *
 * - With a known block rate, `X ~ Gamma(n, 1)` (sum of `n` exponential block
 *   intervals).
 * - With an uncertain rate (relative sd `s`), `X` is moment-matched to a Gamma
 *   with mean `n` and variance `v = n + n^2 s^2`, i.e. shape `n^2 / v`, scale
 *   `v / n`. Its quantile is `gammaQuantile(n^2 / v, p) * v / n`.
 *
 * The research study fitted `s` separately for the central 80% interval
 * (`sigma80`, at p = 0.1 / 0.9) and the central 95% interval (`sigma95`, at
 * p = 0.025 / 0.975); one Gamma cannot hit both (the tails are heavier), and
 * the point estimate (p = 0.5) is the plain Gamma(n) median (`s = 0`).
 *
 * To get ONE strictly monotone quantile function that reproduces all of those
 * fitted values exactly, the effective sigma is made a smooth function of
 * `|z|`, `z = normalQuantile(p)`:
 *
 * - `s(0) = 0`, `s(z80) = sigma80`, `s(z95) = sigma95`, with
 *   `z80 = normalQuantile(0.9)` and `z95 = normalQuantile(0.975)`;
 * - a C1 cubic Hermite interpolation between those knots (zero slope at
 *   `z = 0`, Fritsch-Carlson slope at `z80`, zero slope at `z95`);
 * - held constant at `sigma95` for `|z| > z95`.
 *
 * `quantile(p) = now + pace * gammaQuantile(a(s), p) * v(s) / n` with
 * `s = s(|normalQuantile(p)|)`. Because `s` grows with `|z|`, moving away from
 * the median both terms push the quantile outwards on each side, so `quantile`
 * is strictly increasing (verified numerically in the tests across
 * n = 1..10,000 and a fine grid of p). `cdf` inverts `quantile` numerically
 * and `pdf` is `dp/dt` obtained from the same function, so the three are
 * mutually consistent.
 *
 * ## Honest limits
 *
 * - Calibration exists only at p = 0.5, 0.1/0.9 and 0.025/0.975. Between those
 *   levels, and beyond the 95% interval, the shape is an interpolation or
 *   extrapolation, not a fitted/validated density. The density is a smooth
 *   plausible curve, not an evaluated one.
 * - The distribution's true mean is only approximately `mean` (`now + M`)
 *   because `s` is not constant; the point estimate shown to users should be
 *   the median.
 * - Intervals were calibrated up to about one week of horizon and found
 *   conservative beyond about 14 days on held-out data.
 * - Tails are truncated at `P_MIN = 1e-10` on each side: `cdf` is 0 / 1
 *   outside `[quantile(P_MIN), quantile(1 - P_MIN)]` and `pdf` is 0 there.
 */

import { gammaQuantile, normalQuantile } from './gamma';

export const ARRIVAL_DISTRIBUTION_CONSTRUCTION =
  'gamma-rate-uncertainty/v1' as const;

/** Plain, JSON-serialisable parameters of an arrival distribution. */
export interface ArrivalDistributionParams {
  /** Which construction the parameters belong to. */
  construction: typeof ARRIVAL_DISTRIBUTION_CONSTRUCTION;
  /** Anchor instant, unix seconds (the wall clock the forecast was made at). */
  now: number;
  /** Blocks still to be mined until the target (n >= 1). */
  blocks: number;
  /** Modelled mean time to mine those blocks, seconds (`M`). */
  meanSeconds: number;
  /** Relative rate sd fitted for the 80% interval. */
  sigma80: number;
  /** Relative rate sd fitted for the 95% interval. */
  sigma95: number;
}

export interface DensityPoint {
  /** Unix seconds. */
  t: number;
  /** Probability density per second at `t`. */
  density: number;
  /** Probability the block has arrived by `t`. */
  cdf: number;
}

export interface DensityCurveOptions {
  /** Number of points (default 200, min 2, max 5000). */
  points?: number;
  /** Lower probability bound of the plotted range (default 0.001). */
  pLo?: number;
  /** Upper probability bound of the plotted range (default 0.999). */
  pHi?: number;
}

/** Tail probabilities below this are treated as 0 / 1. */
export const P_MIN = 1e-10;
const X_LIMIT = Math.log((1 - P_MIN) / P_MIN);
const P80 = 0.9;
const P95 = 0.975;
const Z80 = normalQuantile(P80);
const Z95 = normalQuantile(P95);
const SOLVE_MAX_ITER = 200;
const DERIVATIVE_STEP = 1e-3;
const DEFAULT_POINTS = 200;
const MAX_POINTS = 5000;

/** Fritsch-Carlson slope at an interior knot (0 at a local extremum). */
function interiorSlope(h1: number, d1: number, h2: number, d2: number): number {
  if (d1 * d2 <= 0) {
    return 0;
  }
  const w1 = 2 * h2 + h1;
  const w2 = h2 + 2 * h1;
  return (w1 + w2) / (w1 / d1 + w2 / d2);
}

function hermite(
  x: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  m0: number,
  m1: number
): number {
  const h = x1 - x0;
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * y0 +
    (t3 - 2 * t2 + t) * h * m0 +
    (-2 * t3 + 3 * t2) * y1 +
    (t3 - t2) * h * m1
  );
}

/** Effective relative rate sd at normal score `|z|`: see the module comment. */
export function effectiveSigma(
  z: number,
  sigma80: number,
  sigma95: number
): number {
  const az = Math.abs(z);
  if (az >= Z95) {
    return sigma95;
  }
  const d1 = sigma80 / Z80;
  const d2 = (sigma95 - sigma80) / (Z95 - Z80);
  const m80 = interiorSlope(Z80, d1, Z95 - Z80, d2);
  if (az <= Z80) {
    return hermite(az, 0, Z80, 0, sigma80, 0, m80);
  }
  return hermite(az, Z80, Z95, sigma80, sigma95, m80, 0);
}

/** Quantile of the unit waiting time `X` (units of `pace`), see module comment. */
export function unitQuantile(
  n: number,
  sigma80: number,
  sigma95: number,
  p: number
): number {
  const s = effectiveSigma(normalQuantile(p), sigma80, sigma95);
  const v = n + n * n * s * s;
  return gammaQuantile((n * n) / v, p) * (v / n);
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export class ArrivalDistribution {
  readonly params: ArrivalDistributionParams;
  readonly #pace: number;

  constructor(params: ArrivalDistributionParams) {
    if (
      params.construction !== ARRIVAL_DISTRIBUTION_CONSTRUCTION ||
      !isFiniteNumber(params.now) ||
      !isFiniteNumber(params.blocks) ||
      params.blocks < 1 ||
      !isFiniteNumber(params.meanSeconds) ||
      params.meanSeconds <= 0 ||
      !isFiniteNumber(params.sigma80) ||
      params.sigma80 < 0 ||
      !isFiniteNumber(params.sigma95) ||
      params.sigma95 < 0
    ) {
      throw new Error('Invalid arrival distribution parameters');
    }
    this.params = { ...params };
    this.#pace = params.meanSeconds / params.blocks;
  }

  /** Rehydrate from `toJSON()` output (e.g. parsed from an API response). Throws on invalid input. */
  static fromParams(params: ArrivalDistributionParams): ArrivalDistribution {
    return new ArrivalDistribution(params);
  }

  /** Plain data; `JSON.stringify(distribution)` yields the same object. */
  toJSON(): ArrivalDistributionParams {
    return { ...this.params };
  }

  /** Mean seconds per block used for the forecast (`meanSeconds / blocks`). */
  get pace(): number {
    return this.#pace;
  }

  /** Time by which the block has arrived with probability `p`, p in (0, 1). Unix seconds. */
  quantile(p: number): number {
    if (!(p > 0 && p < 1)) {
      throw new RangeError('p must be in (0, 1)');
    }
    const { now, blocks, sigma80, sigma95 } = this.params;
    return now + this.#pace * unitQuantile(blocks, sigma80, sigma95, p);
  }

  /**
   * Unit waiting time (quantile minus `now`, divided by `pace`) as a function
   * of x = logit(p); strictly increasing. Working on this scale avoids losing
   * precision to the ~1.8e9 magnitude of unix seconds.
   */
  #unitAtLogit(x: number): number {
    const { blocks, sigma80, sigma95 } = this.params;
    return unitQuantile(blocks, sigma80, sigma95, logistic(x));
  }

  /** Solve unit(logistic(x)) = u for x by Illinois regula falsi; u must be inside the bracket. */
  #solveLogit(t: number): number {
    const u = (t - this.params.now) / this.#pace;
    let a = -X_LIMIT;
    let b = X_LIMIT;
    let fa = this.#unitAtLogit(a) - u;
    let fb = this.#unitAtLogit(b) - u;
    let side = 0;
    for (let i = 0; i < SOLVE_MAX_ITER; i++) {
      const c = (a * fb - b * fa) / (fb - fa);
      const fc = this.#unitAtLogit(c) - u;
      if (fc === 0 || Math.abs(b - a) < 1e-13) {
        return c;
      }
      if (fc * fb > 0) {
        b = c;
        fb = fc;
        if (side === -1) {
          fa /= 2;
        }
        side = -1;
      } else {
        a = c;
        fa = fc;
        if (side === 1) {
          fb /= 2;
        }
        side = 1;
      }
      if (Math.abs(fc) < 1e-9 && Math.abs(b - a) < 1e-9) {
        return c;
      }
    }
    return (a + b) / 2;
  }

  /** Earliest / latest time at which the (truncated) distribution has mass. */
  get support(): { lo: number; hi: number } {
    return { lo: this.quantile(P_MIN), hi: this.quantile(1 - P_MIN) };
  }

  /** Probability the block has arrived by unix time `t`. */
  cdf(t: number): number {
    if (Number.isNaN(t)) {
      return Number.NaN;
    }
    const { lo, hi } = this.support;
    if (t <= lo) {
      return 0;
    }
    if (t >= hi) {
      return 1;
    }
    return logistic(this.#solveLogit(t));
  }

  /** Probability density (per second) of the arrival time at `t`. 0 outside the support. */
  pdf(t: number): number {
    const { lo, hi } = this.support;
    if (!(t > lo && t < hi)) {
      return 0;
    }
    return this.#densityAtLogit(this.#solveLogit(t));
  }

  #densityAtLogit(x: number): number {
    const p = logistic(x);
    const h = DERIVATIVE_STEP;
    const dUdx =
      (this.#unitAtLogit(x + h) - this.#unitAtLogit(x - h)) / (2 * h);
    return (p * (1 - p)) / (this.#pace * dUdx);
  }

  /**
   * Points suitable for plotting: `points` evenly spaced times between
   * `quantile(pLo)` and `quantile(pHi)` with the density and cdf at each.
   */
  densityCurve(options: DensityCurveOptions = {}): DensityPoint[] {
    const points = Math.min(
      MAX_POINTS,
      Math.max(2, Math.floor(options.points ?? DEFAULT_POINTS))
    );
    const pLo = options.pLo ?? 0.001;
    const pHi = options.pHi ?? 0.999;
    if (!(pLo > 0 && pHi < 1 && pLo < pHi)) {
      throw new RangeError('Require 0 < pLo < pHi < 1');
    }
    const t0 = this.quantile(pLo);
    const t1 = this.quantile(pHi);
    const out: DensityPoint[] = [];
    for (let i = 0; i < points; i++) {
      const t = t0 + ((t1 - t0) * i) / (points - 1);
      const x = this.#solveLogit(t);
      out.push({ t, density: this.#densityAtLogit(x), cdf: logistic(x) });
    }
    return out;
  }
}
