import { describe, expect, test } from 'bun:test';
import { v7 as uuidv7 } from 'uuid';
import {
  type BurnRowLite,
  checkHeightWindow,
  guardIngestTime,
  heightsWithoutBitcoinHeader,
  INGEST_GUARD,
  MAX_AHEAD_BLOCKS,
  MAX_BEHIND_BLOCKS,
  MAX_HEIGHTS_PARAM,
  parseHeightsParam,
  pickCanonicalBurnRows,
  resolveTimes,
  toApiSamples,
  uuidV7Seconds,
} from '../src/arrival/assemble';

const T0 = 1_790_000_000; // unix seconds

function idAt(seconds: number, seq = 0): string {
  return uuidv7({ msecs: seconds * 1000, seq });
}

function row(
  height: number,
  ingestSeconds: number,
  hash = `h${height}`
): BurnRowLite {
  return {
    id: idAt(ingestSeconds),
    height,
    hash,
    consensusHash: `c${height}`,
  };
}

const canonicalOf = (rows: BurnRowLite[]) => pickCanonicalBurnRows(rows);

describe('uuidV7Seconds', () => {
  test('decodes the ingest time in seconds', () => {
    expect(uuidV7Seconds(idAt(T0))).toBe(T0);
    expect(uuidV7Seconds(uuidv7({ msecs: T0 * 1000 + 999 }))).toBe(T0);
  });
  test('returns null instead of throwing for bad ids', () => {
    expect(uuidV7Seconds('nope')).toBeNull();
    expect(uuidV7Seconds('11111111-1111-4111-8111-111111111111')).toBeNull();
    expect(uuidV7Seconds('zzzzzzzz-zzzz-7zzz-8zzz-zzzzzzzzzzzz')).toBeNull();
  });
});

describe('pickCanonicalBurnRows (reorgs)', () => {
  test('the most recently ingested hash wins, in any input order', () => {
    const orphan: BurnRowLite = {
      ...row(100, T0, 'orphan'),
      consensusHash: 'x',
    };
    const winner: BurnRowLite = {
      ...row(100, T0 + 700, 'winner'),
      consensusHash: 'y',
    };
    const other = row(101, T0 + 1300);
    for (const rows of [
      [orphan, winner, other],
      [winner, other, orphan],
    ]) {
      const picked = pickCanonicalBurnRows(rows);
      expect(picked.get(100)?.hash).toBe('winner');
      expect(picked.get(101)?.hash).toBe('h101');
      expect(picked.size).toBe(2);
    }
  });
});

describe('guardIngestTime', () => {
  const below = { height: 1000, time: T0 };
  const above = { height: 1010, time: T0 + 6000 };

  test('accepts an ingest time on the header trend', () => {
    const res = guardIngestTime({
      height: 1005,
      ingestTime: T0 + 3100,
      below,
      above,
    });
    expect(res.ok).toBe(true);
  });

  test('rejects an ingest time hours off the trend (backfilled)', () => {
    const res = guardIngestTime({
      height: 1005,
      ingestTime: T0 + 3000 + 6 * 3600,
      below,
      above,
    });
    expect(res).toEqual({ ok: false, reason: 'inconsistent' });
  });

  test('rejects an ingest time long before the neighbour (clock/outlier)', () => {
    const res = guardIngestTime({
      height: 1005,
      ingestTime: T0 - 20_000,
      below,
      above,
    });
    expect(res).toEqual({ ok: false, reason: 'inconsistent' });
  });

  test('needs a header neighbour', () => {
    expect(guardIngestTime({ height: 5, ingestTime: T0 })).toEqual({
      ok: false,
      reason: 'no-neighbour',
    });
  });

  test('extrapolates at 600 s/block from a single neighbour', () => {
    expect(
      guardIngestTime({ height: 1003, ingestTime: T0 + 1800 + 1000, below }).ok
    ).toBe(true);
    expect(
      guardIngestTime({ height: 1003, ingestTime: T0 + 1800 + 20_000, below })
    ).toEqual({ ok: false, reason: 'inconsistent' });
    expect(
      guardIngestTime({
        height: 997,
        ingestTime: T0 - 1800 + 500,
        above: below,
      }).ok
    ).toBe(true);
  });

  test('tolerance grows with distance from the nearest neighbour', () => {
    const dev = 3600 + 600 * 1 + 200; // fails at distance 1, passes at distance 36
    const near = guardIngestTime({
      height: 1001,
      ingestTime: T0 + 600 + dev,
      below,
    });
    const far = guardIngestTime({
      height: 1036,
      ingestTime: T0 + 36 * 600 + dev,
      below,
    });
    expect(near.ok).toBe(false);
    expect(far.ok).toBe(true);
  });

  test('burst: adjacent ingests within 2 s and off-trend are rejected', () => {
    const ingestTime = T0 + 3000 + 1500; // 1500 s off trend, within tolerance
    const alone = guardIngestTime({ height: 1005, ingestTime, below, above });
    expect(alone.ok).toBe(true);
    const burst = guardIngestTime({
      height: 1005,
      ingestTime,
      below,
      above,
      adjacentIngestTimes: [ingestTime + 1],
    });
    expect(burst).toEqual({ ok: false, reason: 'burst' });
  });

  test('a burst member right on the trend is still accepted', () => {
    const ingestTime = T0 + 3000 + INGEST_GUARD.burstTrendSeconds - 100;
    const res = guardIngestTime({
      height: 1005,
      ingestTime,
      below,
      above,
      adjacentIngestTimes: [ingestTime - 1],
    });
    expect(res.ok).toBe(true);
  });

  test('non-finite ingest time is rejected', () => {
    expect(
      guardIngestTime({ height: 1005, ingestTime: Number.NaN, below, above }).ok
    ).toBe(false);
  });
});

describe('resolveTimes source selection', () => {
  const rows = [
    row(100, T0),
    row(101, T0 + 600),
    row(102, T0 + 1200),
    row(103, T0 + 1800),
    row(104, T0 + 2400),
  ];
  const canonical = canonicalOf(rows);

  test('bitcoin_blocks header beats stacks_blocks beats ingest time', () => {
    const res = resolveTimes({
      heights: [100, 101, 102, 103, 104],
      canonical,
      bitcoinHeaders: [
        { hash: 'h100', time: T0 - 5 },
        { hash: 'h101', time: T0 + 590 },
      ],
      stacksHeaders: [
        { hash: 'h100', time: T0 - 99 },
        { hash: 'h102', time: T0 + 1190 },
      ],
    });
    const by = new Map(res.samples.map((s) => [s.height, s]));
    expect(by.get(100)).toEqual({
      height: 100,
      time: T0 - 5,
      source: 'header-bitcoin-blocks',
    });
    expect(by.get(101)).toEqual({
      height: 101,
      time: T0 + 590,
      source: 'header-bitcoin-blocks',
    });
    expect(by.get(102)).toEqual({
      height: 102,
      time: T0 + 1190,
      source: 'header-stacks-blocks',
    });
    expect(by.get(103)?.source).toBe('ingest-time');
    expect(by.get(103)?.time).toBe(T0 + 1800);
    expect(by.get(104)?.source).toBe('ingest-time');
    expect(res.rejected).toEqual([]);
  });

  test('a header for an orphaned hash at the same height is never used', () => {
    const orphan = row(100, T0 - 30, 'orphan');
    const winner = row(100, T0, 'winner');
    const res = resolveTimes({
      heights: [100],
      canonical: canonicalOf([orphan, winner]),
      bitcoinHeaders: [{ hash: 'orphan', time: T0 - 9999 }],
      stacksHeaders: [],
    });
    // no header for the canonical hash and no neighbours: nothing trustworthy
    expect(res.samples).toEqual([]);
    expect(res.rejected).toEqual([{ height: 100, reason: 'no-neighbour' }]);
  });

  test('ingest time with no header neighbour at all is dropped, not guessed', () => {
    const res = resolveTimes({
      heights: [100, 101],
      canonical,
      bitcoinHeaders: [],
      stacksHeaders: [],
    });
    expect(res.samples).toEqual([]);
    expect(res.rejected.length).toBe(2);
  });

  test('anchors validate ingest times without becoming samples', () => {
    const res = resolveTimes({
      heights: [102],
      canonical,
      bitcoinHeaders: [],
      stacksHeaders: [],
      anchors: [{ height: 100, time: T0 + 30 }],
    });
    expect(res.samples).toEqual([
      { height: 102, time: T0 + 1200, source: 'ingest-time' },
    ]);
  });

  test('a backfill burst is dropped while on-trend live heights survive', () => {
    // Heights 200..210 were mined 600 s apart but all ingested within 1 s, 5 h later.
    const mined = (h: number) => T0 + (h - 200) * 600;
    const burstRows = Array.from({ length: 11 }, (_, i) =>
      row(200 + i, T0 + 5 * 3600 + i * 0.1)
    );
    const live = [row(199, mined(199) + 3), row(211, mined(211) + 4)];
    const res = resolveTimes({
      heights: [199, ...Array.from({ length: 11 }, (_, i) => 200 + i), 211],
      canonical: canonicalOf([...burstRows, ...live]),
      bitcoinHeaders: [
        { hash: 'h199', time: mined(199) },
        { hash: 'h211', time: mined(211) },
      ],
      stacksHeaders: [],
    });
    expect(res.samples.map((s) => s.height)).toEqual([199, 211]);
    expect(res.rejected.length).toBe(11);
  });

  test('duplicate heights and unordered input are fine, output is ascending', () => {
    const res = resolveTimes({
      heights: [102, 100, 102, 101],
      canonical,
      bitcoinHeaders: [
        { hash: 'h100', time: T0 },
        { hash: 'h101', time: T0 + 600 },
        { hash: 'h102', time: T0 + 1200 },
      ],
      stacksHeaders: [],
    });
    expect(res.samples.map((s) => s.height)).toEqual([100, 101, 102]);
  });

  test('earliest stacks timestamp per hash and junk values are handled', () => {
    const res = resolveTimes({
      heights: [100],
      canonical,
      bitcoinHeaders: [{ hash: 'h100', time: Number.NaN }],
      stacksHeaders: [
        { hash: 'h100', time: T0 + 40 },
        { hash: 'h100', time: T0 + 10 },
      ],
    });
    expect(res.samples).toEqual([
      { height: 100, time: T0 + 10, source: 'header-stacks-blocks' },
    ]);
  });
});

describe('helpers', () => {
  test('heightsWithoutBitcoinHeader finds the stacks_blocks fallback candidates', () => {
    const canonical = canonicalOf([row(1, T0), row(2, T0), row(3, T0)]);
    expect(
      heightsWithoutBitcoinHeader([1, 2, 3, 4], canonical, [
        { hash: 'h2', time: T0 },
      ])
    ).toEqual([1, 3]);
  });

  test('toApiSamples keeps only required heights', () => {
    const out = toApiSamples(
      [
        { height: 1, time: 10, source: 'ingest-time' },
        { height: 2, time: 20, source: 'header-bitcoin-blocks' },
      ],
      new Set([2])
    );
    expect(out).toEqual([
      { height: 2, time: 20, source: 'header-bitcoin-blocks' },
    ]);
  });

  test('parseHeightsParam', () => {
    expect(parseHeightsParam('900000,900144')).toEqual({
      ok: true,
      heights: [900_000, 900_144],
    });
    expect(parseHeightsParam(' 5 , 5,6 ')).toEqual({
      ok: true,
      heights: [5, 6],
    });
    for (const bad of [
      '',
      'a',
      '1,,2',
      '-1',
      '1.5',
      '1e3',
      '12345678901',
      '0x10',
    ]) {
      expect(parseHeightsParam(bad).ok).toBe(false);
    }
    const many = Array.from(
      { length: MAX_HEIGHTS_PARAM + 1 },
      (_, i) => i + 1
    ).join(',');
    expect(parseHeightsParam(many).ok).toBe(false);
    const max = Array.from({ length: MAX_HEIGHTS_PARAM }, (_, i) => i + 1).join(
      ','
    );
    expect(parseHeightsParam(max).ok).toBe(true);
  });

  test('checkHeightWindow', () => {
    const tip = 950_000;
    expect(checkHeightWindow(tip, tip)).toBeNull();
    expect(checkHeightWindow(tip + MAX_AHEAD_BLOCKS, tip)).toBeNull();
    expect(checkHeightWindow(tip + MAX_AHEAD_BLOCKS + 1, tip)).not.toBeNull();
    expect(checkHeightWindow(tip - MAX_BEHIND_BLOCKS, tip)).toBeNull();
    expect(checkHeightWindow(tip - MAX_BEHIND_BLOCKS - 1, tip)).not.toBeNull();
  });
});
