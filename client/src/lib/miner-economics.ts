import type { MinerCommitsBlock, MinerEconomicsMiner } from 'slot-watch-common';

export const MINER_WINDOWS = {
  '1d': { label: '24h', blocks: 144 },
  '7d': { label: '7d', blocks: 1008 },
  '28d': { label: '28d', blocks: 4032 },
} as const;
export type MinerWindow = keyof typeof MINER_WINDOWS;
export const DEFAULT_MINER_WINDOW: MinerWindow = '7d';

/** Longest range the commits endpoint serves. */
export const MAX_COMMIT_BLOCKS = 1008;
/** Upper bound on bars in the spend chart. */
export const MAX_CHART_BARS = 144;

const PALETTE = [
  '#f59e0b',
  '#3b82f6',
  '#10b981',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
  '#ef4444',
  '#84cc16',
];
export const UNRESOLVED_COLOR = '#6b7280';
export const UNRESOLVED_KEY = 'unresolved';

/** Stable colour per miner: keys are sorted so the mapping survives re-ordering. */
export function minerColorMap(keys: Iterable<string>) {
  const sorted = [...new Set(keys)].filter((k) => k !== UNRESOLVED_KEY).sort();
  const map = new Map<string, string>();
  sorted.forEach((key, i) => {
    map.set(key, PALETTE[i % PALETTE.length] ?? UNRESOLVED_COLOR);
  });
  map.set(UNRESOLVED_KEY, UNRESOLVED_COLOR);
  return map;
}

export function minerKey(address: string | null | undefined) {
  return address ?? UNRESOLVED_KEY;
}

export function formatBtc(sats: number) {
  if (sats === 0) return '0';
  if (Math.abs(sats) < 1_000_000) return `${sats.toLocaleString()} sats`;
  return `${(sats / 1e8).toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })} BTC`;
}

export function formatSats(sats: number) {
  return sats.toLocaleString();
}

export function formatStx(ustx: number, digits = 0) {
  return (ustx / 1e6).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

export function formatCompact(value: number) {
  return value.toLocaleString(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

export function parseUsd(value: string | null): number | null {
  return value === null ? null : Number(value);
}

export function formatUsd(value: number | null, compact = false) {
  if (value === null) return '–';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(value);
}

/** Gross margin uses revenue as the denominator: $1,000 earned on $700
 * spent is 30%. A zero-revenue or incompletely priced range has no margin. */
export function grossMarginPercent(
  spendUsd: number | null,
  revenueUsd: number | null
) {
  return spendUsd === null || revenueUsd === null || revenueUsd <= 0
    ? null
    : ((revenueUsd - spendUsd) / revenueUsd) * 100;
}

export interface UsdTotals {
  spendUsd: number | null;
  revenueUsd: number | null;
  pricedSpendUsd: number | null;
  pricedRevenueUsd: number | null;
  spendPriceMissing: number;
  revenuePriceMissing: number;
}

/** Aggregate the API's per-miner totals without treating missing prices as 0.
 * A miner with no rewards contributes 0 revenue to the network total. */
export function sumUsdTotals(miners: MinerEconomicsMiner[]): UsdTotals {
  let spend = 0;
  let revenue = 0;
  let pricedSpend = 0;
  let pricedRevenue = 0;
  let spendMissing = 0;
  let revenueMissing = 0;
  for (const miner of miners) {
    spend += parseUsd(miner.spendUsd) ?? 0;
    revenue += parseUsd(miner.revenueUsd) ?? 0;
    pricedSpend += parseUsd(miner.pricedSpendUsd) ?? 0;
    pricedRevenue += parseUsd(miner.pricedRevenueUsd) ?? 0;
    spendMissing += miner.spendPriceMissing;
    revenueMissing += miner.revenuePriceMissing;
  }
  return {
    spendUsd: spendMissing ? null : spend,
    revenueUsd: revenueMissing ? null : revenue,
    pricedSpendUsd: miners.length ? pricedSpend : null,
    pricedRevenueUsd: miners.length ? pricedRevenue : null,
    spendPriceMissing: spendMissing,
    revenuePriceMissing: revenueMissing,
  };
}

export function percent(numerator: number, denominator: number, digits = 1) {
  if (denominator === 0) return '–';
  return `${((numerator / denominator) * 100).toFixed(digits)}%`;
}

/** Satoshis of BTC spent per STX earned; the miner's implied break-even price. */
export function satsPerStx(spendSats: number, revenueUstx: number) {
  if (revenueUstx === 0) return null;
  return spendSats / (revenueUstx / 1e6);
}

export function totalSpend(
  m: Pick<MinerEconomicsMiner, 'spendSats' | 'burnSats'>
) {
  return m.spendSats + m.burnSats;
}

export function totalRevenue(
  m: Pick<MinerEconomicsMiner, 'coinbaseUstx' | 'txFeesUstx'>
) {
  return m.coinbaseUstx + m.txFeesUstx;
}

export interface SpendBucket {
  /** First burn height in the bucket. */
  fromHeight: number;
  toHeight: number;
  blocks: number;
  /** Sats per miner key (pox + burn). */
  spend: Record<string, number>;
  totalSats: number;
  commits: number;
  /** Winner miner key per block, null when the sortition had no winner. */
  winners: (string | null)[];
}

/** Aggregate commits into at most `maxBars` contiguous height buckets. */
export function bucketCommits(
  blocks: MinerCommitsBlock[],
  maxBars = MAX_CHART_BARS
): SpendBucket[] {
  if (blocks.length === 0) return [];
  const size = Math.max(1, Math.ceil(blocks.length / maxBars));
  const buckets: SpendBucket[] = [];
  for (let i = 0; i < blocks.length; i += size) {
    const slice = blocks.slice(i, i + size);
    const first = slice[0];
    const last = slice.at(-1);
    if (!(first && last)) continue;
    const bucket: SpendBucket = {
      fromHeight: first.burnBlockHeight,
      toHeight: last.burnBlockHeight,
      blocks: slice.length,
      spend: {},
      totalSats: 0,
      commits: 0,
      winners: [],
    };
    for (const block of slice) {
      let winner: string | null = null;
      for (const commit of block.commits) {
        const key = minerKey(commit.minerAddress);
        const sats = commit.spendSats + commit.burnSats;
        bucket.spend[key] = (bucket.spend[key] ?? 0) + sats;
        bucket.totalSats += sats;
        bucket.commits += 1;
        if (block.winningTxid === commit.txid) winner = key;
      }
      bucket.winners.push(winner);
    }
    buckets.push(bucket);
  }
  return buckets;
}

export function winnerByBlock(blocks: MinerCommitsBlock[]) {
  return blocks.map((block) => {
    const winner = block.commits.find((c) => c.txid === block.winningTxid);
    return {
      burnBlockHeight: block.burnBlockHeight,
      burnBlockHash: block.burnBlockHash,
      winner: winner ? minerKey(winner.minerAddress) : null,
      commits: block.commits.length,
      spendSats: block.commits.reduce(
        (sum, c) => sum + c.spendSats + c.burnSats,
        0
      ),
    };
  });
}
