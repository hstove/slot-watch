import { Gauge } from 'prom-client';
import { getMinerIdentity } from 'slot-watch-common';
import { minerMetricsSnapshotCache } from './db/miner-economics';
import type { Db } from './db/db';
import { minerGaugeSamples, type MinerGaugeName } from './metrics-miners-calc';

const minerLabels = ['miner_address', 'miner_name', 'window'] as const;
const basisLabels = [...minerLabels, 'basis'] as const;

const gauges: Record<MinerGaugeName, Gauge<string>> = {
  commits: new Gauge({
    name: 'slot_watch_miner_commits',
    help: 'Confirmed block commits by the miner in the window',
    labelNames: minerLabels,
  }),
  blocksWon: new Gauge({
    name: 'slot_watch_miner_blocks_won',
    help: "Sortitions won: commits whose txid is the burn block's winning txid",
    labelNames: minerLabels,
  }),
  winRate: new Gauge({
    name: 'slot_watch_miner_win_rate',
    help: 'Blocks won / commits (per-attempt success rate)',
    labelNames: minerLabels,
  }),
  blockShare: new Gauge({
    name: 'slot_watch_miner_block_share',
    help: 'Blocks won / burn blocks in the window, null sortitions included',
    labelNames: minerLabels,
  }),
  spendSats: new Gauge({
    name: 'slot_watch_miner_spend_sats',
    help: 'Commit spend (PoX payouts + burns) in sats, excluding Bitcoin tx fees',
    labelNames: minerLabels,
  }),
  btcTxFeesSats: new Gauge({
    name: 'slot_watch_miner_btc_tx_fees_sats',
    help: 'Bitcoin tx fees paid by the confirmed commits, from miner_commit_txs',
    labelNames: minerLabels,
  }),
  btcTxFeesMissing: new Gauge({
    name: 'slot_watch_miner_btc_tx_fees_missing_commits',
    help: 'Confirmed commits without a miner_commit_txs row. When > 0, cost_usd for the live window is left unset',
    labelNames: minerLabels,
  }),
  txFeesEarnedUstx: new Gauge({
    name: 'slot_watch_miner_tx_fees_earned_ustx',
    help: 'Stacks tx fees earned (uSTX). expected: fees of the tenures won in the window; matured: miner_rewards fees in the matured window',
    labelNames: basisLabels,
  }),
  coinbaseUstx: new Gauge({
    name: 'slot_watch_miner_coinbase_ustx',
    help: 'Coinbase earned (uSTX). expected: wins x base coinbase (excludes coinbases accumulated from missed sortitions); matured: miner_rewards coinbase in the matured window',
    labelNames: basisLabels,
  }),
  revenueUsd: new Gauge({
    name: 'slot_watch_miner_revenue_usd',
    help: 'Coinbase + tx fees in USD. expected: latest STX-USD open; matured: STX-USD open at the earning hour. Unset if a price is missing',
    labelNames: basisLabels,
  }),
  costUsd: new Gauge({
    name: 'slot_watch_miner_cost_usd',
    help: "Commit spend + burns + Bitcoin tx fees in USD at each burn block's BTC-USD open, over the basis's window heights. Unset if a price or tx fee is missing",
    labelNames: basisLabels,
  }),
  profitUsd: new Gauge({
    name: 'slot_watch_miner_profit_usd',
    help: 'revenue_usd - cost_usd',
    labelNames: basisLabels,
  }),
  margin: new Gauge({
    name: 'slot_watch_miner_margin',
    help: 'profit_usd / revenue_usd',
    labelNames: basisLabels,
  }),
  nullMinerWinRate: new Gauge({
    name: 'slot_watch_null_miner_win_rate',
    help: 'Burn blocks with at least one commit where there was no sortition (was_sortition = false), over those with a known outcome',
    labelNames: ['window'] as const,
  }),
  burnBlocks: new Gauge({
    name: 'slot_watch_burn_blocks',
    help: 'Burn blocks in the window (denominator for block_share)',
    labelNames: ['window'] as const,
  }),
  windowHeights: new Gauge({
    name: 'slot_watch_miner_economics_window_heights',
    help: 'Burn heights each window covers. expected = observed in the last 24h/7d; matured = same span ending at the latest matured tenure',
    labelNames: ['window', 'basis', 'edge'] as const,
  }),
  expectedCoinbasePerWinUstx: new Gauge({
    name: 'slot_watch_expected_coinbase_per_win_ustx',
    help: 'Base coinbase used for expected revenue: the most common per-tenure coinbase among recently matured tenures',
  }),
};

function minerName(publicKey: string | null) {
  return getMinerIdentity(publicKey).minerLabel ?? '';
}

/**
 * Populates the per-miner economics gauges from a ~5 minute cached snapshot.
 * Callers must isolate failures: this is diagnostic and must never fail
 * `/metrics`.
 */
export async function warmMinerMetrics(db: Db) {
  // Reset first so departed miners and newly-unset values disappear, and a
  // failure below leaves no series rather than stale ones.
  for (const gauge of Object.values(gauges)) gauge.reset();
  const snapshot = await minerMetricsSnapshotCache.get(db, 'mainnet');
  const samples = snapshot ? minerGaugeSamples(snapshot, minerName) : [];
  for (const { gauge, labels, value } of samples) {
    gauges[gauge].set(labels, value);
  }
}
