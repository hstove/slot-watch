import {
  and,
  between,
  desc,
  eq,
  gte,
  isNotNull,
  max,
  min,
  sql,
  type SQLWrapper,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { memoizeCache } from '../cache';
import { COINBASE_SOURCE } from '../prices/coinbase';
import type { Db } from './db';
import {
  bitcoinBlocks,
  burnBlocks,
  hourlyPrices,
  minerCommitTxs,
  minerRewards,
  minerSpends,
  stacksBlocks,
} from './schema';

export const btcPrice = alias(hourlyPrices, 'btc_price');
export const stxPrice = alias(hourlyPrices, 'stx_price');

/** UTC hour a row was observed in, from its uuidv7 id. */
export function observedHour(id: SQLWrapper) {
  return sql<string>`date_trunc('hour', to_timestamp(uuid7_ms(${id}) / 1000.0), 'UTC')`;
}

/** A priced USD total, or null if any of its rows lacked a price. */
export function completeUsd(pricedUsd: string | null, missing: number | null) {
  return Number(missing ?? 0) === 0 ? pricedUsd : null;
}

/**
 * Per-miner block commit totals for commits mined in an inclusive burn height
 * range. Unresolved miners are grouped under `''` so callers can join on
 * equality. Spend is valued at the BTC-USD open for the burn block's observed
 * hour. Commit tx fees come from `miner_commit_txs` (coverage starts
 * 2026-09-28); `btcTxFeeMissing` counts commits without a row there.
 */
export function minerSpendTotals(
  db: Db,
  networkKey: string,
  fromHeight: number,
  toHeight: number
) {
  const won = sql<boolean>`exists (select 1 from ${burnBlocks} bb where bb.network_key = ${minerSpends.networkKey} and bb.burn_block_hash = ${minerSpends.burnBlockHash} and bb.winning_txid = ${minerSpends.txid})`;
  return db
    .select({
      minerKey: sql<string>`coalesce(${minerSpends.minerAddress}, '')`.as(
        'spend_miner_key'
      ),
      minerPublicKey: sql<string | null>`max(${minerSpends.minerPublicKey})`.as(
        'miner_public_key'
      ),
      commits: sql<number>`count(*)`.as('commits'),
      wins: sql<number>`count(*) filter (where ${won})`.as('wins'),
      spendSats: sql<number>`sum(${minerSpends.spendSats})`.as('spend_sats'),
      burnSats: sql<number>`sum(${minerSpends.burnSats})`.as('burn_sats'),
      btcTxFeeSats: sql<number>`coalesce(sum(${minerCommitTxs.feeSats}), 0)`.as(
        'btc_tx_fee_sats'
      ),
      btcTxFeeMissing:
        sql<number>`count(*) filter (where ${minerCommitTxs.txid} is null)`.as(
          'btc_tx_fee_missing'
        ),
      pricedSpendUsd: sql<
        string | null
      >`round(sum((${minerSpends.spendSats}::numeric + ${minerSpends.burnSats}::numeric) / 100000000 * ${btcPrice.openPrice}), 8)::text`.as(
        'priced_spend_usd'
      ),
      pricedBtcTxFeeUsd: sql<
        string | null
      >`round(coalesce(sum(${minerCommitTxs.feeSats}::numeric / 100000000 * ${btcPrice.openPrice}), 0), 8)::text`.as(
        'priced_btc_tx_fee_usd'
      ),
      spendPriceMissing:
        sql<number>`count(*) filter (where ${btcPrice.openPrice} is null)`.as(
          'spend_price_missing'
        ),
    })
    .from(minerSpends)
    .leftJoin(
      burnBlocks,
      and(
        eq(burnBlocks.networkKey, minerSpends.networkKey),
        eq(burnBlocks.burnBlockHash, minerSpends.burnBlockHash)
      )
    )
    .leftJoin(
      btcPrice,
      and(
        eq(btcPrice.source, COINBASE_SOURCE),
        eq(btcPrice.productId, 'BTC-USD'),
        eq(btcPrice.hourStart, observedHour(burnBlocks.id))
      )
    )
    .leftJoin(
      minerCommitTxs,
      and(
        eq(minerCommitTxs.networkKey, minerSpends.networkKey),
        eq(minerCommitTxs.txid, minerSpends.txid)
      )
    )
    .where(
      and(
        eq(minerSpends.networkKey, networkKey),
        between(minerSpends.burnBlockHeight, fromHeight, toHeight)
      )
    )
    .groupBy(sql`coalesce(${minerSpends.minerAddress}, '')`)
    .as('spend');
}

/**
 * Per-miner matured rewards for tenures earned in an inclusive burn height
 * range, keyed by `miner_rewards.miner_address` (`''` if missing). Revenue is
 * valued at the STX-USD open for the earning burn block's observed hour.
 */
export function minerRevenueTotals(
  db: Db,
  networkKey: string,
  fromHeight: number,
  toHeight: number
) {
  return db
    .select({
      minerKey: sql<string>`coalesce(${minerRewards.minerAddress}, '')`.as(
        'revenue_miner_key'
      ),
      coinbaseUstx: sql<number>`sum(${minerRewards.coinbaseUstx})`.as(
        'coinbase_ustx'
      ),
      txFeesUstx:
        sql<number>`sum(${minerRewards.txFeesAnchoredUstx} + ${minerRewards.txFeesStreamedConfirmedUstx} + ${minerRewards.txFeesStreamedProducedUstx})`.as(
          'tx_fees_ustx'
        ),
      rewardRows: sql<number>`count(*)`.as('reward_rows'),
      pricedRevenueUsd: sql<
        string | null
      >`round(sum((${minerRewards.coinbaseUstx}::numeric + ${minerRewards.txFeesAnchoredUstx}::numeric + ${minerRewards.txFeesStreamedConfirmedUstx}::numeric + ${minerRewards.txFeesStreamedProducedUstx}::numeric) / 1000000 * ${stxPrice.openPrice}), 8)::text`.as(
        'priced_revenue_usd'
      ),
      revenuePriceMissing:
        sql<number>`count(*) filter (where ${stxPrice.openPrice} is null)`.as(
          'revenue_price_missing'
        ),
    })
    .from(minerRewards)
    .leftJoin(
      burnBlocks,
      and(
        eq(burnBlocks.networkKey, minerRewards.networkKey),
        eq(burnBlocks.consensusHash, minerRewards.earnedConsensusHash)
      )
    )
    .leftJoin(
      stxPrice,
      and(
        eq(stxPrice.source, COINBASE_SOURCE),
        eq(stxPrice.productId, 'STX-USD'),
        eq(stxPrice.hourStart, observedHour(burnBlocks.id))
      )
    )
    .where(
      and(
        eq(minerRewards.networkKey, networkKey),
        between(minerRewards.earnedBurnBlockHeight, fromHeight, toHeight)
      )
    )
    .groupBy(sql`coalesce(${minerRewards.minerAddress}, '')`)
    .as('revenue');
}

/** Highest burn height with matured rewards; later tenures are still maturing. */
export async function getMaturedThroughHeight(db: Db, networkKey: string) {
  const [row] = await db
    .select({ height: max(minerRewards.earnedBurnBlockHeight) })
    .from(minerRewards)
    .where(
      and(
        eq(minerRewards.networkKey, networkKey),
        isNotNull(minerRewards.earnedBurnBlockHeight)
      )
    );
  return Number(row?.height ?? 0);
}

// --- `/metrics` snapshot --------------------------------------------------

export const MINER_METRIC_WINDOWS = [
  { window: '24h', ms: 24 * 60 * 60 * 1000 },
  { window: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
] as const;
export type MinerMetricWindow = (typeof MINER_METRIC_WINDOWS)[number]['window'];

/** Burn heights to scan back from the tip when resolving windows by time. */
const WINDOW_LOOKBACK_HEIGHTS = 2000;
/** Burn heights of matured tenures used to derive the coinbase per win. */
const COINBASE_PER_WIN_LOOKBACK_HEIGHTS = 1008;

export interface HeightRange {
  fromHeight: number;
  toHeight: number;
}

export interface SpendTotalsRow {
  minerKey: string;
  minerPublicKey: string | null;
  commits: number;
  wins: number;
  spendSats: number;
  burnSats: number;
  btcTxFeeSats: number;
  btcTxFeeMissing: number;
  pricedSpendUsd: string | null;
  pricedBtcTxFeeUsd: string | null;
  spendPriceMissing: number;
}

export interface RevenueTotalsRow {
  minerKey: string;
  coinbaseUstx: number;
  txFeesUstx: number;
  pricedRevenueUsd: string | null;
  revenuePriceMissing: number;
}

export interface ExpectedFeesRow {
  minerKey: string;
  wins: number;
  txFeesUstx: number;
}

export interface BurnBlockStats {
  /** Distinct burn heights in the range. */
  burnBlocks: number;
  /** Heights with at least one commit and a known sortition outcome. */
  contested: number;
  /** Of `contested`, heights where `was_sortition` is false. */
  nullWins: number;
}

/** A reward `miner_address` that differs from the key funding its commits. */
export interface RewardAlias {
  rewardAddress: string;
  spendAddress: string;
}

export interface MinerMetricsWindowSnapshot {
  window: MinerMetricWindow;
  live: HeightRange;
  /** Same span as `live`, ending at the matured-through height. */
  matured: HeightRange | null;
  liveSpend: SpendTotalsRow[];
  maturedSpend: SpendTotalsRow[];
  maturedRevenue: RevenueTotalsRow[];
  expectedFees: ExpectedFeesRow[];
  burnStats: BurnBlockStats;
}

export interface MinerMetricsSnapshot {
  computedAt: string;
  tipHeight: number;
  maturedThroughHeight: number;
  /** Average coinbase actually paid per won tenure, recently matured. */
  coinbasePerWinUstx: number | null;
  latestStxUsd: { hourStart: string; openPrice: string } | null;
  rewardAliases: RewardAlias[];
  windows: MinerMetricsWindowSnapshot[];
}

async function loadSpendTotals(
  db: Db,
  networkKey: string,
  range: HeightRange
): Promise<SpendTotalsRow[]> {
  const spend = minerSpendTotals(
    db,
    networkKey,
    range.fromHeight,
    range.toHeight
  );
  const rows = await db.select().from(spend);
  return rows.map((row) => ({
    minerKey: row.minerKey,
    minerPublicKey: row.minerPublicKey,
    commits: Number(row.commits),
    wins: Number(row.wins),
    spendSats: Number(row.spendSats),
    burnSats: Number(row.burnSats),
    btcTxFeeSats: Number(row.btcTxFeeSats),
    btcTxFeeMissing: Number(row.btcTxFeeMissing),
    pricedSpendUsd: row.pricedSpendUsd,
    pricedBtcTxFeeUsd: row.pricedBtcTxFeeUsd,
    spendPriceMissing: Number(row.spendPriceMissing),
  }));
}

async function loadRevenueTotals(
  db: Db,
  networkKey: string,
  range: HeightRange
): Promise<RevenueTotalsRow[]> {
  const revenue = minerRevenueTotals(
    db,
    networkKey,
    range.fromHeight,
    range.toHeight
  );
  const rows = await db.select().from(revenue);
  return rows.map((row) => ({
    minerKey: row.minerKey,
    coinbaseUstx: Number(row.coinbaseUstx),
    txFeesUstx: Number(row.txFeesUstx),
    pricedRevenueUsd: row.pricedRevenueUsd,
    revenuePriceMissing: Number(row.revenuePriceMissing),
  }));
}

/**
 * Stacks tx fees of the tenures each miner won in the range, summed from
 * `stacks_blocks`. Available immediately, unlike matured rewards.
 */
async function loadExpectedFees(
  db: Db,
  networkKey: string,
  range: HeightRange
): Promise<ExpectedFeesRow[]> {
  const tenureFees = sql<number>`(select coalesce(sum(${stacksBlocks.txFees}), 0) from ${stacksBlocks} where ${stacksBlocks.consensusHash} = ${burnBlocks.consensusHash} and ${stacksBlocks.networkKey} = ${burnBlocks.networkKey})`;
  const minerKey = sql<string>`coalesce(${minerSpends.minerAddress}, '')`;
  const rows = await db
    .select({
      minerKey,
      wins: sql<number>`count(*)`,
      txFeesUstx: sql<number>`sum(${tenureFees})`,
    })
    .from(minerSpends)
    .innerJoin(
      burnBlocks,
      and(
        eq(burnBlocks.networkKey, minerSpends.networkKey),
        eq(burnBlocks.burnBlockHash, minerSpends.burnBlockHash),
        eq(burnBlocks.winningTxid, minerSpends.txid)
      )
    )
    .where(
      and(
        eq(minerSpends.networkKey, networkKey),
        between(minerSpends.burnBlockHeight, range.fromHeight, range.toHeight)
      )
    )
    .groupBy(minerKey);
  return rows.map((row) => ({
    minerKey: row.minerKey,
    wins: Number(row.wins),
    txFeesUstx: Number(row.txFeesUstx),
  }));
}

async function loadBurnBlockStats(
  db: Db,
  networkKey: string,
  range: HeightRange
): Promise<BurnBlockStats> {
  // Match on height first: miner_spends has no burn_block_hash index.
  const hasCommit = sql`exists (select 1 from ${minerSpends} where ${minerSpends.networkKey} = ${burnBlocks.networkKey} and ${minerSpends.burnBlockHeight} = ${burnBlocks.burnBlockHeight} and ${minerSpends.burnBlockHash} = ${burnBlocks.burnBlockHash})`;
  const [row] = await db
    .select({
      burnBlocks: sql<number>`count(distinct ${burnBlocks.burnBlockHeight})`,
      contested: sql<number>`count(distinct ${burnBlocks.burnBlockHeight}) filter (where ${hasCommit} and ${bitcoinBlocks.wasSortition} is not null)`,
      nullWins: sql<number>`count(distinct ${burnBlocks.burnBlockHeight}) filter (where ${hasCommit} and ${bitcoinBlocks.wasSortition} = false)`,
    })
    .from(burnBlocks)
    .leftJoin(
      bitcoinBlocks,
      and(
        eq(bitcoinBlocks.networkKey, burnBlocks.networkKey),
        eq(bitcoinBlocks.burnBlockHash, burnBlocks.burnBlockHash)
      )
    )
    .where(
      and(
        eq(burnBlocks.networkKey, networkKey),
        between(burnBlocks.burnBlockHeight, range.fromHeight, range.toHeight)
      )
    );
  return {
    burnBlocks: Number(row?.burnBlocks ?? 0),
    contested: Number(row?.contested ?? 0),
    nullWins: Number(row?.nullWins ?? 0),
  };
}

/**
 * The tip height and, per window, the lowest burn height observed within it.
 * Heights bound the window queries so the height indexes are used.
 */
async function loadWindowStarts(db: Db, networkKey: string, now: number) {
  const [tip] = await db
    .select({ height: max(burnBlocks.burnBlockHeight) })
    .from(burnBlocks)
    .where(eq(burnBlocks.networkKey, networkKey));
  const tipHeight = Number(tip?.height ?? 0);
  if (tipHeight === 0) return null;

  const starts = await Promise.all(
    MINER_METRIC_WINDOWS.map(async ({ window, ms }) => {
      const [row] = await db
        .select({ height: min(burnBlocks.burnBlockHeight) })
        .from(burnBlocks)
        .where(
          and(
            eq(burnBlocks.networkKey, networkKey),
            gte(
              burnBlocks.burnBlockHeight,
              tipHeight - WINDOW_LOOKBACK_HEIGHTS
            ),
            sql`uuid7_ms(${burnBlocks.id}) >= ${now - ms}`
          )
        );
      return { window, fromHeight: row?.height ?? null };
    })
  );
  return { tipHeight, starts };
}

/**
 * Average coinbase paid per won tenure in recently matured tenures. A win
 * after missed sortitions also collects their coinbases, so this is above the
 * base emission. The base would under-report expected revenue by roughly the
 * null-sortition rate.
 */
async function loadCoinbasePerWin(
  db: Db,
  networkKey: string,
  maturedThroughHeight: number
) {
  const perTenure = db
    .select({
      coinbaseUstx: sql<number>`sum(${minerRewards.coinbaseUstx})`.as(
        'coinbase_ustx'
      ),
    })
    .from(minerRewards)
    .where(
      and(
        eq(minerRewards.networkKey, networkKey),
        between(
          minerRewards.earnedBurnBlockHeight,
          maturedThroughHeight - COINBASE_PER_WIN_LOOKBACK_HEIGHTS,
          maturedThroughHeight
        )
      )
    )
    .groupBy(minerRewards.earnedConsensusHash)
    .as('per_tenure');
  const [row] = await db
    .select({
      coinbaseUstx: sql<
        number | null
      >`avg(${perTenure.coinbaseUstx})`,
    })
    .from(perTenure)
    .where(sql`${perTenure.coinbaseUstx} > 0`);
  return row?.coinbaseUstx == null ? null : Number(row.coinbaseUstx);
}

/**
 * Reward `miner_address`es that differ from the address derived from the
 * winning commit's key. Some miners fund commits from a different key than
 * the one paid rewards, so per-miner revenue needs to be re-keyed to join
 * spend. Matched through coinbase rows, which go to the tenure's winner (the
 * other row per tenure is the previous miner's streamed fees).
 */
async function loadRewardAliases(
  db: Db,
  networkKey: string,
  range: HeightRange
): Promise<RewardAlias[]> {
  const rows = await db
    .select({
      rewardAddress: minerRewards.minerAddress,
      spendAddress: minerSpends.minerAddress,
      tenures: sql<number>`count(*)`,
    })
    .from(minerRewards)
    .innerJoin(
      burnBlocks,
      and(
        eq(burnBlocks.networkKey, minerRewards.networkKey),
        eq(burnBlocks.consensusHash, minerRewards.earnedConsensusHash)
      )
    )
    .innerJoin(
      minerSpends,
      and(
        eq(minerSpends.networkKey, burnBlocks.networkKey),
        eq(minerSpends.txid, burnBlocks.winningTxid)
      )
    )
    .where(
      and(
        eq(minerRewards.networkKey, networkKey),
        between(
          minerRewards.earnedBurnBlockHeight,
          range.fromHeight,
          range.toHeight
        ),
        sql`${minerRewards.coinbaseUstx} > 0`,
        sql`${minerRewards.minerAddress} is distinct from ${minerSpends.minerAddress}`,
        isNotNull(minerRewards.minerAddress),
        isNotNull(minerSpends.minerAddress)
      )
    )
    .groupBy(minerRewards.minerAddress, minerSpends.minerAddress)
    .orderBy(desc(sql`count(*)`));
  // Keep the most frequent pairing per reward address.
  const aliases = new Map<string, string>();
  for (const row of rows) {
    if (
      row.rewardAddress &&
      row.spendAddress &&
      !aliases.has(row.rewardAddress)
    )
      aliases.set(row.rewardAddress, row.spendAddress);
  }
  return [...aliases].map(([rewardAddress, spendAddress]) => ({
    rewardAddress,
    spendAddress,
  }));
}

async function loadLatestStxUsd(db: Db) {
  const [row] = await db
    .select({
      hourStart: hourlyPrices.hourStart,
      openPrice: hourlyPrices.openPrice,
    })
    .from(hourlyPrices)
    .where(
      and(
        eq(hourlyPrices.source, COINBASE_SOURCE),
        eq(hourlyPrices.productId, 'STX-USD')
      )
    )
    .orderBy(desc(hourlyPrices.hourStart))
    .limit(1);
  return row
    ? { hourStart: row.hourStart.toISOString(), openPrice: row.openPrice }
    : null;
}

async function loadWindow(
  db: Db,
  networkKey: string,
  window: MinerMetricWindow,
  live: HeightRange,
  maturedThroughHeight: number
): Promise<MinerMetricsWindowSnapshot> {
  const span = live.toHeight - live.fromHeight;
  const matured =
    maturedThroughHeight > 0
      ? {
          fromHeight: maturedThroughHeight - span,
          toHeight: maturedThroughHeight,
        }
      : null;
  const [liveSpend, maturedSpend, maturedRevenue, expectedFees, burnStats] =
    await Promise.all([
      loadSpendTotals(db, networkKey, live),
      matured ? loadSpendTotals(db, networkKey, matured) : [],
      matured ? loadRevenueTotals(db, networkKey, matured) : [],
      loadExpectedFees(db, networkKey, live),
      loadBurnBlockStats(db, networkKey, live),
    ]);
  return {
    window,
    live,
    matured,
    liveSpend,
    maturedSpend,
    maturedRevenue,
    expectedFees,
    burnStats,
  };
}

export async function getMinerMetricsSnapshot(
  db: Db,
  networkKey: string
): Promise<MinerMetricsSnapshot | null> {
  const now = Date.now();
  const [bounds, maturedThroughHeight, latestStxUsd] = await Promise.all([
    loadWindowStarts(db, networkKey, now),
    getMaturedThroughHeight(db, networkKey),
    loadLatestStxUsd(db),
  ]);
  if (!bounds) return null;
  const { tipHeight, starts } = bounds;

  const ranges = starts.flatMap(({ window, fromHeight }) =>
    fromHeight === null
      ? []
      : [{ window, live: { fromHeight, toHeight: tipHeight } }]
  );
  const longest = Math.max(
    1,
    ...ranges.map(({ live }) => live.toHeight - live.fromHeight)
  );
  const [coinbasePerWinUstx, rewardAliases, windows] = await Promise.all([
    loadCoinbasePerWin(db, networkKey, maturedThroughHeight),
    loadRewardAliases(db, networkKey, {
      fromHeight: maturedThroughHeight - longest,
      toHeight: maturedThroughHeight,
    }),
    Promise.all(
      ranges.map(({ window, live }) =>
        loadWindow(db, networkKey, window, live, maturedThroughHeight)
      )
    ),
  ]);

  return {
    computedAt: new Date(now).toISOString(),
    tipHeight,
    maturedThroughHeight,
    coinbasePerWinUstx,
    latestStxUsd,
    rewardAliases,
    windows,
  };
}

/** Scrapes are frequent and the 7d aggregates touch thousands of rows. */
export const minerMetricsSnapshotCache = memoizeCache(
  (_db: Db, networkKey: string) => `miner-metrics-snapshot:${networkKey}`,
  (db: Db, networkKey: string) => getMinerMetricsSnapshot(db, networkKey),
  { ttl: 60 * 5 }
);
