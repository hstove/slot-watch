/**
 * Small numeric kernel for the arrival-time model: log-gamma, the regularised
 * lower incomplete gamma function, and Gamma / Normal quantiles. Dependency
 * free. Ported from the research implementation; `gammaQuantile` is
 * bit-identical to it.
 */

const LANCZOS = [
  0.999_999_999_999_809_93, 676.520_368_121_885_1, -1259.139_216_722_402_8,
  771.323_428_777_653_13, -176.615_029_162_140_59, 12.507_343_278_686_905,
  -0.138_571_095_265_720_12, 9.984_369_578_019_571_6e-6,
  1.505_632_735_149_311_6e-7,
];

const HALF_LOG_TWO_PI = 0.5 * Math.log(2 * Math.PI);

/** Natural log of the gamma function (Lanczos approximation, g = 7). */
export function lgamma(x: number): number {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  const y = x - 1;
  let a = LANCZOS[0];
  const t = y + 7.5;
  for (let i = 1; i < 9; i++) {
    a += LANCZOS[i] / (y + i);
  }
  return HALF_LOG_TWO_PI + (y + 0.5) * Math.log(t) - t + Math.log(a);
}

const SERIES_MAX_ITER = 10_000;
const SERIES_EPS = 1e-15;
const TINY = 1e-300;

function gammaPSeries(a: number, x: number, logPrefix: number): number {
  let term = 1 / a;
  let sum = term;
  for (
    let k = 1;
    k < SERIES_MAX_ITER && Math.abs(term) > Math.abs(sum) * SERIES_EPS;
    k++
  ) {
    term *= x / (a + k);
    sum += term;
  }
  return sum * Math.exp(logPrefix);
}

function gammaPContinuedFraction(
  a: number,
  x: number,
  logPrefix: number
): number {
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < SERIES_MAX_ITER; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) {
      d = TINY;
    }
    c = b + an / c;
    if (Math.abs(c) < TINY) {
      c = TINY;
    }
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < SERIES_EPS) {
      break;
    }
  }
  return 1 - Math.exp(logPrefix) * h;
}

/** Regularised lower incomplete gamma function P(a, x). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) {
    return 0;
  }
  const logPrefix = a * Math.log(x) - x - lgamma(a);
  return x < a + 1
    ? gammaPSeries(a, x, logPrefix)
    : gammaPContinuedFraction(a, x, logPrefix);
}

// Acklam's rational approximation of the standard normal quantile.
const NQ_A = [
  -39.696_830_286_653_76, 220.946_098_424_520_5, -275.928_510_446_968_7,
  138.357_751_867_269, -30.664_798_066_147_16, 2.506_628_277_459_239,
];
const NQ_B = [
  -54.476_098_798_224_06, 161.585_836_858_040_9, -155.698_979_859_886_6,
  66.801_311_887_719_72, -13.280_681_552_885_72,
];
const NQ_C = [
  -0.007_784_894_002_430_293, -0.322_396_458_041_136_5, -2.400_758_277_161_838,
  -2.549_732_539_343_734, 4.374_664_141_464_968, 2.938_163_982_698_783,
];
const NQ_D = [
  0.007_784_695_709_041_462, 0.322_467_129_070_039_8, 2.445_134_137_142_996,
  3.754_408_661_907_416,
];
const NQ_TAIL = 0.024_25;

/** Standard normal quantile (relative error about 1e-9). */
export function normalQuantile(p: number): number {
  if (p < NQ_TAIL || p > 1 - NQ_TAIL) {
    const q = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
    const x =
      (((((NQ_C[0] * q + NQ_C[1]) * q + NQ_C[2]) * q + NQ_C[3]) * q + NQ_C[4]) *
        q +
        NQ_C[5]) /
      ((((NQ_D[0] * q + NQ_D[1]) * q + NQ_D[2]) * q + NQ_D[3]) * q + 1);
    return p < 0.5 ? x : -x;
  }
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((NQ_A[0] * r + NQ_A[1]) * r + NQ_A[2]) * r + NQ_A[3]) * r + NQ_A[4]) *
      r +
      NQ_A[5]) *
      q) /
    (((((NQ_B[0] * r + NQ_B[1]) * r + NQ_B[2]) * r + NQ_B[3]) * r + NQ_B[4]) *
      r +
      1)
  );
}

/** Standard normal density. */
export function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

const NEWTON_MAX_ITER = 60;
const NEWTON_REL_TOL = 1e-12;

/** Quantile of Gamma(shape `a`, scale 1): Wilson-Hilferty start, bracketed Newton polish. */
export function gammaQuantile(a: number, p: number): number {
  const z = normalQuantile(p);
  const w = 1 - 1 / (9 * a) + z * Math.sqrt(1 / (9 * a));
  let x =
    w > 0.05
      ? a * w * w * w
      : Math.exp((Math.log(p) + Math.log(a) + lgamma(a)) / a);
  let lo = 0;
  let hi = Number.POSITIVE_INFINITY;
  for (let i = 0; i < NEWTON_MAX_ITER; i++) {
    const f = gammaP(a, x) - p;
    if (f > 0) {
      hi = x;
    } else {
      lo = x;
    }
    const density = Math.exp((a - 1) * Math.log(x) - x - lgamma(a));
    let next = x - f / density;
    if (!(next > lo && next < hi)) {
      next = Number.isFinite(hi) ? (lo + hi) / 2 : x * 2;
    }
    if (Math.abs(next - x) < NEWTON_REL_TOL * x) {
      return next;
    }
    x = next;
  }
  return x;
}
