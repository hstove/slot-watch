import { describe, expect, test } from 'bun:test';
import type {
  MinerMetricsSnapshot,
  MinerMetricsWindowSnapshot,
  SpendTotalsRow,
} from '../src/db/miner-economics';
import {
  costUsd,
  currentStxUsd,
  type GaugeSample,
  mergeRevenue,
  minerGaugeSamples,
} from '../src/metrics-miners-calc';

/**
 * Covers the per-miner economics math. The properties that matter: values
 * that can't be computed honestly (missing prices or tx fees, zero
 * denominators) are omitted rather than reported as 0, and matured rewards
 * paid to a different address than the commit key land on the right miner.
 */

const NOW = '2026-10-07T12:30:00.000Z';

function spend(overrides: Partial<SpendTotalsRow> = {}): SpendTotalsRow {
  return {
    minerKey: 'SPA',
    minerPublicKey: '02aa',
    commits: 10,
    wins: 2,
    spendSats: 900_000,
    burnSats: 100_000,
    btcTxFeeSats: 5000,
    btcTxFeeMissing: 0,
    pricedSpendUsd: '1000',
    pricedBtcTxFeeUsd: '5',
    spendPriceMissing: 0,
    ...overrides,
  };
}

function window(
  overrides: Partial<MinerMetricsWindowSnapshot> = {}
): MinerMetricsWindowSnapshot {
  return {
    window: '24h',
    live: { fromHeight: 1000, toHeight: 1143 },
    matured: { fromHeight: 857, toHeight: 1000 },
    liveSpend: [spend()],
    maturedSpend: [spend({ pricedSpendUsd: '800', pricedBtcTxFeeUsd: '4' })],
    maturedRevenue: [
      {
        minerKey: 'SPA',
        coinbaseUstx: 3_000_000_000,
        txFeesUstx: 100_000_000,
        pricedRevenueUsd: '1550',
        revenuePriceMissing: 0,
      },
    ],
    expectedFees: [{ minerKey: 'SPA', wins: 2, txFeesUstx: 50_000_000 }],
    burnStats: { burnBlocks: 144, contested: 100, nullWins: 20 },
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<MinerMetricsSnapshot> = {}
): MinerMetricsSnapshot {
  return {
    computedAt: NOW,
    tipHeight: 1143,
    maturedThroughHeight: 1000,
    coinbasePerWinUstx: 1_000_000_000,
    latestStxUsd: { hourStart: '2026-10-07T12:00:00.000Z', openPrice: '0.5' },
    rewardAliases: [],
    windows: [window()],
    ...overrides,
  };
}

function find(
  samples: GaugeSample[],
  gauge: GaugeSample['gauge'],
  labels: Record<string, string> = {}
) {
  return samples.filter(
    (s) =>
      s.gauge === gauge &&
      Object.entries(labels).every(([k, v]) => s.labels[k] === v)
  );
}

function value(
  samples: GaugeSample[],
  gauge: GaugeSample['gauge'],
  labels: Record<string, string> = {}
) {
  const matches = find(samples, gauge, labels);
  if (matches.length !== 1)
    throw new Error(`Expected one ${gauge} sample, got ${matches.length}`);
  return matches[0]?.value;
}

const name = (pk: string | null) => (pk ? `miner-${pk}` : '');

describe('minerGaugeSamples', () => {
  test('activity and network gauges', () => {
    const samples = minerGaugeSamples(snapshot(), name);
    const labels = { miner_address: 'SPA', miner_name: 'miner-02aa' };
    expect(value(samples, 'commits', labels)).toBe(10);
    expect(value(samples, 'blocksWon', labels)).toBe(2);
    expect(value(samples, 'winRate', labels)).toBe(0.2);
    expect(value(samples, 'blockShare', labels)).toBe(2 / 144);
    expect(value(samples, 'spendSats', labels)).toBe(1_000_000);
    expect(value(samples, 'btcTxFeesSats', labels)).toBe(5000);
    expect(value(samples, 'nullMinerWinRate')).toBe(0.2);
    expect(value(samples, 'burnBlocks')).toBe(144);
    expect(value(samples, 'expectedCoinbasePerWinUstx')).toBe(1_000_000_000);
    expect(
      value(samples, 'windowHeights', { basis: 'matured', edge: 'from' })
    ).toBe(857);
  });

  test('expected basis: wins x coinbase per win + tenure fees at the latest price', () => {
    const samples = minerGaugeSamples(snapshot(), name);
    const labels = { basis: 'expected' };
    expect(value(samples, 'coinbaseUstx', labels)).toBe(2_000_000_000);
    expect(value(samples, 'txFeesEarnedUstx', labels)).toBe(50_000_000);
    // (2000 + 50) STX * $0.5
    expect(value(samples, 'revenueUsd', labels)).toBe(1025);
    expect(value(samples, 'costUsd', labels)).toBe(1005);
    expect(value(samples, 'profitUsd', labels)).toBe(20);
    expect(value(samples, 'margin', labels)).toBeCloseTo(20 / 1025);
  });

  test('expected coinbase uses the average per win, rounded to uSTX', () => {
    const samples = minerGaugeSamples(
      snapshot({ coinbasePerWinUstx: 1_311_123_456.7 }),
      name
    );
    expect(value(samples, 'coinbaseUstx', { basis: 'expected' })).toBe(
      2_622_246_913
    );
  });

  test('matured basis uses matured revenue and matured-window cost', () => {
    const samples = minerGaugeSamples(snapshot(), name);
    const labels = { basis: 'matured' };
    expect(value(samples, 'coinbaseUstx', labels)).toBe(3_000_000_000);
    expect(value(samples, 'revenueUsd', labels)).toBe(1550);
    expect(value(samples, 'costUsd', labels)).toBe(804);
    expect(value(samples, 'profitUsd', labels)).toBe(746);
  });

  test('stale or missing STX price leaves expected USD unset', () => {
    const stale = minerGaugeSamples(
      snapshot({
        latestStxUsd: {
          hourStart: '2026-10-07T08:00:00.000Z',
          openPrice: '0.5',
        },
      }),
      name
    );
    expect(find(stale, 'revenueUsd', { basis: 'expected' })).toHaveLength(0);
    expect(find(stale, 'profitUsd', { basis: 'expected' })).toHaveLength(0);
    // Cost doesn't depend on the STX price.
    expect(find(stale, 'costUsd', { basis: 'expected' })).toHaveLength(1);
  });

  test('missing BTC price or tx fee leaves cost and profit unset', () => {
    for (const row of [
      spend({ spendPriceMissing: 1 }),
      spend({ btcTxFeeMissing: 1 }),
    ]) {
      const samples = minerGaugeSamples(
        snapshot({ windows: [window({ liveSpend: [row] })] }),
        name
      );
      expect(find(samples, 'costUsd', { basis: 'expected' })).toHaveLength(0);
      expect(find(samples, 'profitUsd', { basis: 'expected' })).toHaveLength(0);
      expect(find(samples, 'commits')).toHaveLength(1);
    }
  });

  test('missing matured revenue price leaves matured revenue unset', () => {
    const samples = minerGaugeSamples(
      snapshot({
        windows: [
          window({
            maturedRevenue: [
              {
                minerKey: 'SPA',
                coinbaseUstx: 1,
                txFeesUstx: 1,
                pricedRevenueUsd: '1',
                revenuePriceMissing: 1,
              },
            ],
          }),
        ],
      }),
      name
    );
    expect(find(samples, 'revenueUsd', { basis: 'matured' })).toHaveLength(0);
    expect(value(samples, 'coinbaseUstx', { basis: 'matured' })).toBe(1);
  });

  test('reward aliases re-key matured revenue to the commit key', () => {
    const samples = minerGaugeSamples(
      snapshot({
        rewardAliases: [{ rewardAddress: 'SPREWARD', spendAddress: 'SPA' }],
        windows: [
          window({
            maturedRevenue: [
              {
                minerKey: 'SPREWARD',
                coinbaseUstx: 1_000_000_000,
                txFeesUstx: 0,
                pricedRevenueUsd: '500',
                revenuePriceMissing: 0,
              },
            ],
          }),
        ],
      }),
      name
    );
    expect(value(samples, 'coinbaseUstx', { basis: 'matured' })).toBe(
      1_000_000_000
    );
    expect(
      find(samples, 'commits', { miner_address: 'SPREWARD' })
    ).toHaveLength(0);
  });

  test('only miners with commits get series; zero revenue gives no margin', () => {
    const samples = minerGaugeSamples(
      snapshot({
        windows: [
          window({
            liveSpend: [spend({ wins: 0 })],
            expectedFees: [],
            maturedRevenue: [
              {
                minerKey: 'SPGONE',
                coinbaseUstx: 1,
                txFeesUstx: 0,
                pricedRevenueUsd: '1',
                revenuePriceMissing: 0,
              },
            ],
          }),
        ],
      }),
      name
    );
    expect(find(samples, 'commits', { miner_address: 'SPGONE' })).toHaveLength(
      0
    );
    expect(value(samples, 'revenueUsd', { basis: 'expected' })).toBe(0);
    expect(find(samples, 'margin', { basis: 'expected' })).toHaveLength(0);
  });

  test('unresolved commits get an empty address and name', () => {
    const samples = minerGaugeSamples(
      snapshot({
        windows: [window({ liveSpend: [spend({ minerKey: '' })] })],
      }),
      name
    );
    expect(
      value(samples, 'commits', { miner_address: '', miner_name: '' })
    ).toBe(10);
  });

  test('no contested blocks leaves the null-miner rate unset', () => {
    const samples = minerGaugeSamples(
      snapshot({
        windows: [
          window({ burnStats: { burnBlocks: 3, contested: 0, nullWins: 0 } }),
        ],
      }),
      name
    );
    expect(find(samples, 'nullMinerWinRate')).toHaveLength(0);
  });
});

describe('helpers', () => {
  test('costUsd is 0 for a miner with no commits in the range', () => {
    expect(costUsd(undefined)).toBe(0);
  });

  test('mergeRevenue sums rows that alias to one miner', () => {
    const merged = mergeRevenue(
      [
        {
          minerKey: 'SPA',
          coinbaseUstx: 1,
          txFeesUstx: 2,
          pricedRevenueUsd: '3',
          revenuePriceMissing: 0,
        },
        {
          minerKey: 'SPB',
          coinbaseUstx: 10,
          txFeesUstx: 20,
          pricedRevenueUsd: '30',
          revenuePriceMissing: 1,
        },
      ],
      new Map([['SPB', 'SPA']])
    );
    expect(merged.get('SPA')).toEqual({
      coinbaseUstx: 11,
      txFeesUstx: 22,
      usd: 33,
      missing: 1,
    });
  });

  test('currentStxUsd rejects non-positive prices', () => {
    expect(
      currentStxUsd(
        snapshot({
          latestStxUsd: {
            hourStart: '2026-10-07T12:00:00.000Z',
            openPrice: '0',
          },
        })
      )
    ).toBeNull();
  });
});
