import { describe, expect, test } from 'bun:test';
import {
  ARRIVAL_MODEL_VERSION,
  ArrivalDistribution,
  type ArrivalDistributionParams,
  type ArrivalForecast,
  SIGMA_TABLE,
  arrivalInputFromSamples,
  blockTimeFromSamples,
  estimateArrival,
  estimateArrivals,
  interpSigma,
  requiredHeights,
} from '../src/btc-arrival';
import fixture from './fixtures/btc-arrival-reference.json';

type Sample = [number, number];
const FIELDS = ['median', 'mean', 'q025', 'q10', 'q90', 'q975'] as const;

function forecast(est: ReturnType<typeof estimateArrival>): ArrivalForecast {
  if (est.status !== 'forecast') {
    throw new Error(`expected forecast, got ${est.status}`);
  }
  return est;
}

function makeInput(tip: number, tipTime: number, now: number, pace = 600) {
  return {
    now,
    tipHeight: tip,
    tipTime,
    blockTime: (h: number) =>
      h > tip ? undefined : tipTime - (tip - h) * pace,
  };
}

function distributionFor(n: number, meanPace = 600) {
  const { s80, s95 } = interpSigma(SIGMA_TABLE, n);
  return new ArrivalDistribution({
    construction: 'gamma-rate-uncertainty/v1',
    now: 1_800_000_000,
    blocks: n,
    meanSeconds: meanPace * n,
    sigma80: s80,
    sigma95: s95,
  });
}

describe('reference equivalence (committed fixture)', () => {
  test('fixture has the expected shape and size', () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(25);
    expect(fixture.order).toEqual([...FIELDS]);
  });

  test('median, mean and the four quantiles match the reference within 1 s', () => {
    let maxDiff = 0;
    let maxDiffFull = 0;
    let compared = 0;
    for (const c of fixture.cases) {
      const input = arrivalInputFromSamples({
        now: c.now,
        tip: { height: c.tip, time: c.tipTime },
        samples: (c.samples as Sample[]).map(([height, time]) => ({
          height,
          time,
        })),
      });
      const plan = undefined;
      for (const [n, expectedSamples, expectedFull] of c.results as [
        number,
        number[],
        number[],
      ][]) {
        const f = forecast(estimateArrival(input, c.tip + n, plan));
        FIELDS.forEach((key, i) => {
          const d = Math.abs(f[key] - c.now - expectedSamples[i]);
          maxDiff = Math.max(maxDiff, d);
          if (c.gaps === 0) {
            maxDiffFull = Math.max(
              maxDiffFull,
              Math.abs(f[key] - c.now - expectedFull[i])
            );
          }
        });
        compared++;
      }
    }
    console.log(
      `btc-arrival fixture: ${compared} (tip, horizon) pairs; max |port - reference| = ${maxDiff.toExponential(2)} s (same samples), ${maxDiffFull.toExponential(2)} s (reference on full history, gap-free windows)`
    );
    expect(compared).toBeGreaterThan(400);
    expect(maxDiff).toBeLessThan(1);
    // Sample set vs full history: the sample-restricted model agrees with the
    // reference run on full history wherever the window had no gaps.
    expect(maxDiffFull).toBeLessThan(1);
  });

  test('sample set run agrees with a full-history run of the port itself', () => {
    // Use a synthetic full history with a wobbling pace and compare.
    const tip = 960_000 + 1234;
    const tipTime = 1_790_000_000;
    const times = new Map<number, number>();
    let t = tipTime;
    for (let h = tip; h >= tip - 8000; h--) {
      times.set(h, t);
      t -= 560 + ((h * 7919) % 97) * 1.1 + (h % 2016 < 1000 ? 30 : 0);
    }
    const full = {
      now: tipTime + 400,
      tipHeight: tip,
      tipTime,
      blockTime: (h: number) => times.get(h),
    };
    const wanted = requiredHeights(tip);
    const samples = wanted.map((h) => ({ height: h, time: times.get(h) ?? 0 }));
    const sampled = arrivalInputFromSamples({
      now: full.now,
      tip: { height: tip, time: tipTime },
      samples,
    });
    let maxDiff = 0;
    for (const n of [1, 6, 72, 288, 1008, 2016, 4320, 8640]) {
      const a = forecast(estimateArrival(full, tip + n));
      const b = forecast(estimateArrival(sampled, tip + n));
      for (const key of FIELDS) {
        maxDiff = Math.max(maxDiff, Math.abs(a[key] - b[key]));
      }
    }
    expect(maxDiff).toBeLessThan(1e-6);
  });
});

describe('requiredHeights', () => {
  test('is a compact, sorted, in-range set', () => {
    for (const tip of [959_999, 960_000, 960_001, 961_000, 962_015, 962_016]) {
      const hs = requiredHeights(tip);
      expect(hs.length).toBeGreaterThanOrEqual(50);
      expect(hs.length).toBeLessThanOrEqual(110);
      expect([...hs].sort((a, b) => a - b)).toEqual(hs);
      expect(new Set(hs).size).toBe(hs.length);
      expect(hs.every((h) => h < tip && h >= tip - 7000)).toBe(true);
    }
  });

  test('covers every chunk boundary and epoch edge the model reads', () => {
    const tip = 961_000; // epoch 476 starts at 959,616
    const hs = new Set(requiredHeights(tip));
    for (let k = Math.floor((tip - 1) / 72); tip - k * 72 <= 2872; k--) {
      expect(hs.has(k * 72)).toBe(true);
    }
    expect(hs.has(476 * 2016)).toBe(true);
    expect(hs.has(475 * 2016)).toBe(true);
    expect(hs.has(476 * 2016 - 1)).toBe(true);
  });

  test('degenerate tips', () => {
    expect(requiredHeights(0)).toEqual([]);
    expect(requiredHeights(Number.NaN)).toEqual([]);
    expect(requiredHeights(-5)).toEqual([]);
    expect(requiredHeights(3).length).toBeLessThanOrEqual(3);
  });

  test('one missing sample height barely changes the estimate', () => {
    const tip = 961_000;
    const tipTime = 1_790_000_000;
    const times = (h: number) => tipTime - (tip - h) * 590 - (h % 13) * 5;
    const wanted = requiredHeights(tip);
    const all = wanted.map((height) => ({ height, time: times(height) }));
    const base = forecast(
      estimateArrival(
        arrivalInputFromSamples({
          now: tipTime + 100,
          tip: { height: tip, time: tipTime },
          samples: all,
        }),
        tip + 144
      )
    );
    const dropped = all.filter((s) => s.height !== 960_984); // a multiple of 72
    expect(wanted).toContain(960_984);
    const degraded = forecast(
      estimateArrival(
        arrivalInputFromSamples({
          now: tipTime + 100,
          tip: { height: tip, time: tipTime },
          samples: dropped,
        }),
        tip + 144
      )
    );
    expect(Math.abs(degraded.median - base.median)).toBeLessThan(120);
  });
});

describe('coherent distribution', () => {
  test('quantile is strictly increasing for n = 1..10000 and a fine p grid', () => {
    const ps: number[] = [];
    for (let i = 1; i < 400; i++) {
      ps.push(i / 400);
    }
    for (let i = 0; i <= 40; i++) {
      ps.push(1e-9 * 10 ** (i / 5), 1 - 1e-9 * 10 ** (i / 5));
    }
    ps.push(0.025, 0.1, 0.9, 0.975);
    const grid = [...new Set(ps)].sort((a, b) => a - b);
    const ns = new Set<number>();
    for (let n = 1; n <= 400; n++) {
      ns.add(n);
    }
    for (let n = 400; n <= 10_000; n += 37) {
      ns.add(n);
    }
    ns.add(10_000);
    for (const knot of SIGMA_TABLE) {
      ns.add(knot[0]);
    }
    for (const n of ns) {
      const d = distributionFor(n);
      let prev = Number.NEGATIVE_INFINITY;
      for (const p of grid) {
        const q = d.quantile(p);
        if (!(q > prev)) {
          throw new Error(`non-monotone at n=${n} p=${p}: ${prev} -> ${q}`);
        }
        prev = q;
      }
    }
  });

  test('reproduces the reference at the fitted levels (via forecast fields)', () => {
    for (const n of [1, 7, 36, 144, 1008, 3000, 8640]) {
      const f = forecast(
        estimateArrival(
          makeInput(900_000, 1_700_000_000, 1_700_000_100),
          900_000 + n
        )
      );
      const d = ArrivalDistribution.fromParams(f.distribution);
      expect(d.quantile(0.5)).toBe(f.median);
      expect(d.quantile(0.1)).toBe(f.q10);
      expect(d.quantile(0.9)).toBe(f.q90);
      expect(d.quantile(0.025)).toBe(f.q025);
      expect(d.quantile(0.975)).toBe(f.q975);
      expect(f.q025).toBeLessThan(f.q10);
      expect(f.q10).toBeLessThan(f.median);
      expect(f.median).toBeLessThan(f.q90);
      expect(f.q90).toBeLessThan(f.q975);
    }
  });

  test('cdf inverts quantile', () => {
    for (const n of [1, 3, 18, 144, 1008, 4320, 10_000]) {
      const d = distributionFor(n);
      for (const p of [
        1e-6, 0.001, 0.025, 0.1, 0.3, 0.5, 0.7, 0.9, 0.975, 0.999,
      ]) {
        expect(Math.abs(d.cdf(d.quantile(p)) - p)).toBeLessThan(1e-9);
      }
      for (const p of [0.02, 0.5, 0.95]) {
        const t = d.quantile(p) + 0.37;
        expect(Math.abs(d.quantile(d.cdf(t)) - t)).toBeLessThan(1e-3);
      }
    }
  });

  test('cdf is 0 before the support and 1 after, and monotone', () => {
    const d = distributionFor(72);
    expect(d.cdf(d.params.now - 10)).toBe(0);
    expect(d.cdf(d.params.now + 1e9)).toBe(1);
    expect(d.pdf(d.params.now - 10)).toBe(0);
    expect(d.pdf(d.params.now + 1e9)).toBe(0);
    let prev = -1;
    const { lo, hi } = d.support;
    for (let i = 0; i <= 500; i++) {
      const c = d.cdf(lo + ((hi - lo) * i) / 500);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  test('pdf is non-negative and integrates to about 1', () => {
    const integrals: number[] = [];
    for (const n of [1, 2, 6, 36, 144, 1008, 3024, 8640]) {
      const d = distributionFor(n);
      const lo = d.quantile(1e-7);
      const hi = d.quantile(1 - 1e-7);
      const steps = 4000;
      let area = 0;
      let prevT = lo;
      let prevF = d.pdf(lo);
      for (let i = 1; i <= steps; i++) {
        const t = lo + ((hi - lo) * i) / steps;
        const f = d.pdf(t);
        expect(f).toBeGreaterThanOrEqual(0);
        area += ((prevF + f) / 2) * (t - prevT);
        prevT = t;
        prevF = f;
      }
      // the mass outside [q(1e-7), q(1 - 1e-7)] is ~2e-7
      integrals.push(area);
      expect(Math.abs(area - 1)).toBeLessThan(0.005);
    }
    console.log(
      `btc-arrival pdf integrals: min ${Math.min(...integrals).toFixed(5)} max ${Math.max(...integrals).toFixed(5)}`
    );
  });

  test('pdf agrees with a numeric derivative of cdf', () => {
    const d = distributionFor(144);
    for (const p of [0.01, 0.1, 0.5, 0.9, 0.99]) {
      const t = d.quantile(p);
      const h = 1;
      const numeric = (d.cdf(t + h) - d.cdf(t - h)) / (2 * h);
      expect(Math.abs(d.pdf(t) / numeric - 1)).toBeLessThan(1e-4);
    }
  });

  test('densityCurve returns plot-ready, ordered points', () => {
    const d = distributionFor(36);
    const curve = d.densityCurve({ points: 50, pLo: 0.01, pHi: 0.99 });
    expect(curve.length).toBe(50);
    expect(Math.abs(curve[0].cdf - 0.01)).toBeLessThan(1e-9);
    expect(Math.abs(curve[49].cdf - 0.99)).toBeLessThan(1e-9);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].t).toBeGreaterThan(curve[i - 1].t);
      expect(curve[i].cdf).toBeGreaterThan(curve[i - 1].cdf);
      expect(curve[i].density).toBeGreaterThanOrEqual(0);
    }
    expect(d.densityCurve().length).toBe(200);
    expect(() => d.densityCurve({ pLo: 0.9, pHi: 0.1 })).toThrow();
  });

  test('JSON round trip rehydrates an identical distribution', () => {
    const f = forecast(
      estimateArrival(makeInput(900_000, 1_700_000_000, 1_700_000_300), 900_500)
    );
    const wire = JSON.parse(JSON.stringify(f)) as ArrivalForecast;
    const d = ArrivalDistribution.fromParams(wire.distribution);
    const original = new ArrivalDistribution(f.distribution);
    for (const p of [0.01, 0.1, 0.5, 0.9, 0.99]) {
      expect(d.quantile(p)).toBe(original.quantile(p));
    }
    const t = f.median + 1234;
    expect(d.cdf(t)).toBe(original.cdf(t));
    expect(d.pdf(t)).toBe(original.pdf(t));
    expect(JSON.parse(JSON.stringify(d))).toEqual(wire.distribution);
  });

  test('rejects invalid parameters', () => {
    const ok: ArrivalDistributionParams = distributionFor(10).toJSON();
    expect(() =>
      ArrivalDistribution.fromParams({ ...ok, blocks: 0 })
    ).toThrow();
    expect(() =>
      ArrivalDistribution.fromParams({ ...ok, meanSeconds: Number.NaN })
    ).toThrow();
    expect(() =>
      ArrivalDistribution.fromParams({
        ...ok,
        construction: 'other' as 'gamma-rate-uncertainty/v1',
      })
    ).toThrow();
    expect(() => distributionFor(10).quantile(0)).toThrow();
    expect(() => distributionFor(10).quantile(1)).toThrow();
  });
});

describe('edge cases and components', () => {
  const tip = 960_500;
  const tipTime = 1_790_000_000;

  test('no history is a flat 600 s/block forecast', () => {
    const input = {
      now: tipTime + 30,
      tipHeight: tip,
      tipTime,
      blockTime: () => undefined,
    };
    const f = forecast(estimateArrival(input, tip + 6));
    expect(f.quality.flatFallback).toBe(true);
    expect(f.quality.sampleHeightsAvailable).toBe(0);
    expect(f.mean - input.now).toBeCloseTo(3600, 6);
    expect(f.components.hashratePace.measuredSecondsPerBlock).toBeNull();
    expect(f.components.hashratePace.dataWeight).toBe(0);
    expect(f.components.currentEpoch.secondsPerBlock).toBe(600);
  });

  test('mined targets return the known time, not a forecast', () => {
    const input = {
      ...makeInput(tip, tipTime, tipTime + 10),
      blockTime: (h: number) => (h === tip - 5 ? 1234 : undefined),
    };
    expect(estimateArrival(input, tip)).toMatchObject({
      status: 'mined',
      time: tipTime,
      timeSource: 'tip',
    });
    expect(estimateArrival(input, tip - 5)).toMatchObject({
      status: 'mined',
      time: 1234,
      timeSource: 'sample',
    });
    expect(estimateArrival(input, tip - 6)).toMatchObject({
      status: 'mined',
      time: null,
      timeSource: 'unknown',
    });
  });

  test('invalid inputs never throw and report why', () => {
    const base = makeInput(tip, tipTime, tipTime + 10);
    const bad = [
      estimateArrival({ ...base, now: Number.NaN }, tip + 1),
      estimateArrival({ ...base, tipTime: Number.NaN }, tip + 1),
      estimateArrival({ ...base, tipHeight: -3 }, tip + 1),
      estimateArrival({ ...base, tipHeight: 1.5 }, tip + 1),
      estimateArrival(base, Number.NaN),
      estimateArrival(base, -1),
      estimateArrival(base, tip + 0.5),
      estimateArrival(base, tip + 10_001),
      estimateArrival(base, Number.POSITIVE_INFINITY),
    ];
    for (const b of bad) {
      expect(b.status).toBe('invalid');
    }
    expect(estimateArrival(base, tip + 10_000).status).toBe('forecast');
  });

  test('NaN or missing block times are tolerated', () => {
    const base = makeInput(tip, tipTime, tipTime + 10);
    const noisy = {
      ...base,
      blockTime: (h: number) => {
        if (h % 5 === 0) {
          return Number.NaN;
        }
        return h % 7 === 0 ? undefined : base.blockTime(h);
      },
    };
    const f = forecast(estimateArrival(noisy, tip + 144));
    expect(Number.isFinite(f.median)).toBe(true);
    expect(
      Math.abs(f.median - forecast(estimateArrival(base, tip + 144)).median)
    ).toBeLessThan(120);
  });

  test('now before the tip time (clock skew) is flagged but still forecast from now', () => {
    const f = forecast(
      estimateArrival(makeInput(tip, tipTime, tipTime - 500), tip + 3)
    );
    expect(f.quality.clockSkew).toBe(true);
    expect(f.quality.tipAgeSeconds).toBe(-500);
    expect(f.median).toBeGreaterThan(tipTime - 500);
    expect(f.q025).toBeGreaterThan(tipTime - 500);
  });

  test('components describe the pace path', () => {
    // Epoch 476 spans 959,616..961,631; tip 960,500, so 1,131 blocks remain in it.
    const f = forecast(
      estimateArrival(makeInput(tip, tipTime, tipTime + 20), tip + 4000)
    );
    const c = f.components;
    expect(c.blocksRemaining).toBe(4000);
    expect(c.currentEpoch.blocks).toBe(961_631 - tip);
    expect(c.nextEpoch.blocks).toBe(2016);
    expect(c.beyond.blocks).toBe(4000 - (961_631 - tip) - 2016);
    expect(c.retarget.height).toBe(961_632);
    expect(c.retarget.projectedTime).toBeGreaterThan(f.now);
    expect(c.retarget.projectedTime).toBeLessThan(f.mean);
    expect(c.beyond.secondsPerBlock).toBe(600);
    expect(f.quality.sampleHeightsRequested).toBe(requiredHeights(tip).length);
    expect(f.quality.sampleHeightsAvailable).toBe(
      f.quality.sampleHeightsRequested
    );
    expect(f.quality.tipAgeSeconds).toBe(20);
    expect(f.modelVersion).toBe(ARRIVAL_MODEL_VERSION);
    expect(c.hashratePace.dataWeight).toBeGreaterThan(0.7);
    expect(c.hashratePace.dataWeight).toBeLessThan(1);
    expect(c.hashratePace.chunksUsed).toBeGreaterThan(30);
    // A chain running exactly at 600 s/block: tiny projected retarget (0.05%).
    expect(Math.abs(c.retarget.projectedDifficultyChangePct)).toBeLessThan(0.5);
  });

  test('a fast chain projects a difficulty increase', () => {
    const f = forecast(
      estimateArrival(
        { ...makeInput(tip, tipTime, tipTime + 5, 540), tipTime },
        tip + 100
      )
    );
    expect(f.components.retarget.projectedDifficultyChangePct).toBeGreaterThan(
      5
    );
    expect(f.components.nextEpoch.blocks).toBe(0);
  });

  test('estimateArrivals shares one fit and matches per-target calls', () => {
    const input = makeInput(tip, tipTime, tipTime + 20, 580);
    const targets = [tip + 1, tip + 200, tip + 3000, tip - 4];
    const many = estimateArrivals(input, targets);
    targets.forEach((t, i) => {
      expect(many[i]).toEqual(estimateArrival(input, t));
    });
    const wild = estimateArrivals({ ...input, now: Number.NaN }, [tip + 1]);
    expect(wild[0].status).toBe('invalid');
  });

  test('blockTimeFromSamples ignores junk and keeps the first duplicate', () => {
    const lookup = blockTimeFromSamples([
      { height: 5, time: 50 },
      { height: 5, time: 99 },
      { height: 6, time: Number.NaN },
      { height: Number.NaN, time: 3 },
    ]);
    expect(lookup(5)).toBe(50);
    expect(lookup(6)).toBeUndefined();
    expect(lookup(7)).toBeUndefined();
  });
});
