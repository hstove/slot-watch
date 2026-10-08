/**
 * Pure math behind the per-miner economics gauges: turns a
 * `MinerMetricsSnapshot` (query rows) into gauge samples.
 *
 * Kept free of IO and of `cloudflare:workers` imports so it is testable under
 * `bun test`, like `metrics-precommit-calc.ts`.
 *
 * Two revenue bases:
 * - `expected`: tenures won in the live window, at the recent average
 *   coinbase per win plus the won tenures' Stacks tx fees, valued at the latest STX-USD open.
 * - `matured`: `miner_rewards` for tenures earned in the latest fully
 *   matured window (same span, ending at the matured-through height), valued
 *   at the earning hour and already keyed by commit-funding address. Cost for
 *   this basis covers the same heights.
 */
import type {
  ExpectedFeesRow,
  MinerMetricsSnapshot,
  MinerMetricsWindowSnapshot,
  RevenueTotalsRow,
  SpendTotalsRow,
} from './db/miner-economics';

export type MinerGaugeName =
  | 'commits'
  | 'blocksWon'
  | 'winRate'
  | 'blockShare'
  | 'spendSats'
  | 'btcTxFeesSats'
  | 'btcTxFeesMissing'
  | 'txFeesEarnedUstx'
  | 'coinbaseUstx'
  | 'revenueUsd'
  | 'costUsd'
  | 'profitUsd'
  | 'margin'
  | 'nullMinerWinRate'
  | 'burnBlocks'
  | 'windowHeights'
  | 'expectedCoinbasePerWinUstx';

export interface GaugeSample {
  gauge: MinerGaugeName;
  labels: Record<string, string>;
  value: number;
}

export type Basis = 'expected' | 'matured';

/** The latest STX-USD open is ignored for expected revenue past this age. */
export const MAX_STX_PRICE_AGE_MS = 3 * 60 * 60 * 1000;

const USTX_PER_STX = 1_000_000;

/** USD cost of a miner's commits, or null if any commit lacks a price or tx fee. */
export function costUsd(row: SpendTotalsRow | undefined) {
  if (!row) return 0;
  if (row.spendPriceMissing > 0 || row.btcTxFeeMissing > 0) return null;
  return Number(row.pricedSpendUsd ?? 0) + Number(row.pricedBtcTxFeeUsd ?? 0);
}

/** Latest STX-USD open, or null when missing or stale. */
export function currentStxUsd(snapshot: MinerMetricsSnapshot) {
  const latest = snapshot.latestStxUsd;
  if (!latest) return null;
  const age =
    new Date(snapshot.computedAt).getTime() -
    new Date(latest.hourStart).getTime();
  if (!(age <= MAX_STX_PRICE_AGE_MS)) return null;
  const price = Number(latest.openPrice);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

interface MinerLabel {
  miner_address: string;
  miner_name: string;
}

function economicsSamples(
  labels: Record<string, string>,
  values: {
    coinbaseUstx: number | null;
    txFeesUstx: number;
    revenueUsd: number | null;
    costUsd: number | null;
  }
): GaugeSample[] {
  const samples: GaugeSample[] = [
    { gauge: 'txFeesEarnedUstx', labels, value: values.txFeesUstx },
  ];
  if (values.coinbaseUstx !== null)
    samples.push({ gauge: 'coinbaseUstx', labels, value: values.coinbaseUstx });
  if (values.revenueUsd !== null)
    samples.push({ gauge: 'revenueUsd', labels, value: values.revenueUsd });
  if (values.costUsd !== null)
    samples.push({ gauge: 'costUsd', labels, value: values.costUsd });
  if (values.revenueUsd !== null && values.costUsd !== null) {
    const profit = values.revenueUsd - values.costUsd;
    samples.push({ gauge: 'profitUsd', labels, value: profit });
    const margin = ratio(profit, values.revenueUsd);
    if (margin !== null)
      samples.push({ gauge: 'margin', labels, value: margin });
  }
  return samples;
}

interface CalcContext {
  coinbasePerWinUstx: number | null;
  stxUsd: number | null;
}

/** Window-level (not per-miner) samples: burn blocks, null rate, heights. */
function networkSamples(win: MinerMetricsWindowSnapshot): GaugeSample[] {
  const { window } = win;
  const { burnBlocks, contested, nullWins } = win.burnStats;
  const samples: GaugeSample[] = [
    { gauge: 'burnBlocks', labels: { window }, value: burnBlocks },
  ];
  const nullRate = ratio(nullWins, contested);
  if (nullRate !== null)
    samples.push({
      gauge: 'nullMinerWinRate',
      labels: { window },
      value: nullRate,
    });

  const ranges: [Basis, typeof win.live | null][] = [
    ['expected', win.live],
    ['matured', win.matured],
  ];
  for (const [basis, range] of ranges) {
    if (!range) continue;
    for (const edge of ['from', 'to'] as const) {
      samples.push({
        gauge: 'windowHeights',
        labels: { window, basis, edge },
        value: edge === 'from' ? range.fromHeight : range.toHeight,
      });
    }
  }
  return samples;
}

/** Commit activity in the live window. */
function activitySamples(
  labels: Record<string, string>,
  spend: SpendTotalsRow | undefined,
  burnBlocks: number
): GaugeSample[] {
  const commits = spend?.commits ?? 0;
  const wins = spend?.wins ?? 0;
  const samples: GaugeSample[] = [
    { gauge: 'commits', labels, value: commits },
    { gauge: 'blocksWon', labels, value: wins },
    {
      gauge: 'spendSats',
      labels,
      value: (spend?.spendSats ?? 0) + (spend?.burnSats ?? 0),
    },
    { gauge: 'btcTxFeesSats', labels, value: spend?.btcTxFeeSats ?? 0 },
    { gauge: 'btcTxFeesMissing', labels, value: spend?.btcTxFeeMissing ?? 0 },
  ];
  const winRate = ratio(wins, commits);
  if (winRate !== null)
    samples.push({ gauge: 'winRate', labels, value: winRate });
  const share = ratio(wins, burnBlocks);
  if (share !== null)
    samples.push({ gauge: 'blockShare', labels, value: share });
  return samples;
}

function expectedSamples(
  labels: Record<string, string>,
  expected: ExpectedFeesRow | undefined,
  spend: SpendTotalsRow | undefined,
  ctx: CalcContext
) {
  const coinbaseUstx =
    ctx.coinbasePerWinUstx === null
      ? null
      : Math.round((expected?.wins ?? 0) * ctx.coinbasePerWinUstx);
  const txFeesUstx = expected?.txFeesUstx ?? 0;
  const revenueUsd =
    coinbaseUstx === null || ctx.stxUsd === null
      ? null
      : ((coinbaseUstx + txFeesUstx) / USTX_PER_STX) * ctx.stxUsd;
  return economicsSamples(
    { ...labels, basis: 'expected' },
    { coinbaseUstx, txFeesUstx, revenueUsd, costUsd: costUsd(spend) }
  );
}

function maturedSamples(
  labels: Record<string, string>,
  revenue: RevenueTotalsRow | undefined,
  spend: SpendTotalsRow | undefined
) {
  let revenueUsd: number | null = Number(revenue?.pricedRevenueUsd ?? 0);
  if (revenue && revenue.revenuePriceMissing > 0) revenueUsd = null;
  return economicsSamples(
    { ...labels, basis: 'matured' },
    {
      coinbaseUstx: revenue?.coinbaseUstx ?? 0,
      txFeesUstx: revenue?.txFeesUstx ?? 0,
      revenueUsd,
      costUsd: costUsd(spend),
    }
  );
}

function byMiner<T extends { minerKey: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.minerKey, row]));
}

function windowSamples(
  win: MinerMetricsWindowSnapshot,
  miners: Map<string, MinerLabel>,
  ctx: CalcContext
): GaugeSample[] {
  const samples = networkSamples(win);
  const liveSpend = byMiner(win.liveSpend);
  const maturedSpend = byMiner(win.maturedSpend);
  const expectedFees = byMiner(win.expectedFees);
  const maturedRevenue = byMiner(win.maturedRevenue);

  for (const [key, miner] of miners) {
    const labels = { ...miner, window: win.window };
    const spend = liveSpend.get(key);
    samples.push(
      ...activitySamples(labels, spend, win.burnStats.burnBlocks),
      ...expectedSamples(labels, expectedFees.get(key), spend, ctx)
    );
    if (win.matured)
      samples.push(
        ...maturedSamples(
          labels,
          maturedRevenue.get(key),
          maturedSpend.get(key)
        )
      );
  }
  return samples;
}

/**
 * Gauge samples for a snapshot. Only miners with a commit in some live
 * window (the 7d one is the superset) get series; unresolved commits are
 * reported under `miner_address=""`. Values that can't be computed honestly
 * (missing prices, missing tx fees, zero denominators) are omitted rather
 * than reported as 0.
 */
export function minerGaugeSamples(
  snapshot: MinerMetricsSnapshot,
  minerName: (publicKey: string | null) => string
): GaugeSample[] {
  const miners = new Map<string, MinerLabel>();
  for (const win of snapshot.windows) {
    for (const row of win.liveSpend) {
      if (miners.has(row.minerKey) || row.commits === 0) continue;
      miners.set(row.minerKey, {
        miner_address: row.minerKey,
        miner_name: row.minerKey ? minerName(row.minerPublicKey) : '',
      });
    }
  }

  const ctx: CalcContext = {
    coinbasePerWinUstx: snapshot.coinbasePerWinUstx,
    stxUsd: currentStxUsd(snapshot),
  };
  const samples = snapshot.windows.flatMap((win) =>
    windowSamples(win, miners, ctx)
  );
  if (snapshot.coinbasePerWinUstx !== null)
    samples.push({
      gauge: 'expectedCoinbasePerWinUstx',
      labels: {},
      value: snapshot.coinbasePerWinUstx,
    });
  return samples;
}
