import type {
  MinerEconomicsMiner,
  MinerEconomicsMinersResponse,
  MinerName,
} from 'slot-watch-common';
import {
  getStacksAddress,
  getVersionFromString,
  minerDisplay,
} from 'slot-watch-common';
import type { ApiMinerStat } from './slots-api';
import { truncateMiddle } from './utils';
import {
  minerKey,
  satsPerStx,
  parseUsd,
  totalRevenue,
  totalSpend,
  UNRESOLVED_COLOR,
  UNRESOLVED_KEY,
} from './miner-economics';

export interface MinerRow {
  key: string;
  address: string | null;
  publicKey: string | null;
  identity: MinerName | null;
  /** Display name: the miner nickname, else a truncated address. */
  label: string;
  color: string;
  commits: number;
  wins: number;
  spendSats: number;
  burnSats: number;
  /** Spend over the matured slice of the window, comparable with revenue. */
  maturedSpendSats: number;
  hasMaturedActivity: boolean;
  /** Known-price subtotal across the full window; recent commits may be unpriced. */
  pricedSpendUsd: number | null;
  spendPriceMissing: number;
  /** Comparable USD values over the matured slice only. */
  maturedSpendUsd: number | null;
  maturedRevenueUsd: number | null;
  maturedPricedSpendUsd: number | null;
  maturedPricedRevenueUsd: number | null;
  maturedSpendPriceMissing: number;
  maturedRevenuePriceMissing: number;
  coinbaseUstx: number;
  txFeesUstx: number;
  revenueUstx: number;
  satsPerStx: number | null;
  version: string | null;
  shortVersion: string | null;
  latestBlock: number | null;
  /** Blocks won among the last 500 Stacks tenures. */
  recentWins: number;
}

function emptyRow(key: string): MinerRow {
  return {
    key,
    address: key === UNRESOLVED_KEY ? null : key,
    publicKey: null,
    identity: null,
    label: key === UNRESOLVED_KEY ? 'unresolved' : truncateMiddle(key, 6, 4),
    color: UNRESOLVED_COLOR,
    commits: 0,
    wins: 0,
    spendSats: 0,
    burnSats: 0,
    maturedSpendSats: 0,
    hasMaturedActivity: false,
    pricedSpendUsd: null,
    spendPriceMissing: 0,
    maturedSpendUsd: null,
    maturedRevenueUsd: null,
    maturedPricedSpendUsd: null,
    maturedPricedRevenueUsd: null,
    maturedSpendPriceMissing: 0,
    maturedRevenuePriceMissing: 0,
    coinbaseUstx: 0,
    txFeesUstx: 0,
    revenueUstx: 0,
    satsPerStx: null,
    version: null,
    shortVersion: null,
    latestBlock: null,
    recentWins: 0,
  };
}

/** Commit address, which keys economics rows; falls back to the key's own. */
function statsAddress(stat: ApiMinerStat, networkKey: string) {
  if (stat.minerAddress) return stat.minerAddress;
  try {
    return getStacksAddress(stat.publicKey, networkKey);
  } catch {
    return null;
  }
}

export function buildMinerRows({
  networkKey,
  economics,
  matured,
  minerStats,
}: {
  networkKey: string;
  economics: MinerEconomicsMinersResponse;
  matured: MinerEconomicsMinersResponse | null;
  minerStats: ApiMinerStat[];
}): MinerRow[] {
  const statsByAddress = new Map<string, ApiMinerStat>();
  for (const stat of minerStats) {
    const address = statsAddress(stat, networkKey);
    if (address) statsByAddress.set(address, stat);
  }
  const rows = new Map<string, MinerRow>();
  const rowFor = (key: string) => {
    const existing = rows.get(key);
    if (existing) return existing;
    const row = emptyRow(key);
    rows.set(key, row);
    return row;
  };

  for (const m of economics.miners)
    applyEconomics(rowFor(minerKey(m.minerAddress)), m);
  for (const m of matured?.miners ?? [])
    applyMatured(rowFor(minerKey(m.minerAddress)), m);
  for (const [address, stat] of statsByAddress) {
    const row = rowFor(address);
    row.publicKey ??= stat.publicKey;
    row.identity ??= minerDisplay(stat);
    row.version = stat.version;
    row.shortVersion = getVersionFromString(stat.version);
    row.latestBlock = stat.latestBlock;
    row.recentWins = stat.count;
  }
  for (const row of rows.values()) {
    if (!row.identity) continue;
    row.label = row.identity.label;
    row.color = row.identity.hex;
  }
  return [...rows.values()].sort((a, b) => totalSpend(b) - totalSpend(a));
}

function applyEconomics(row: MinerRow, m: MinerEconomicsMiner) {
  row.publicKey ??= m.minerPublicKey;
  row.identity ??= minerDisplay(m);
  row.commits = m.commits;
  row.wins = m.wins;
  row.spendSats = m.spendSats;
  row.burnSats = m.burnSats;
  row.pricedSpendUsd = parseUsd(m.pricedSpendUsd);
  row.spendPriceMissing = m.spendPriceMissing;
}

function applyMatured(row: MinerRow, m: MinerEconomicsMiner) {
  row.hasMaturedActivity = true;
  row.maturedSpendSats = totalSpend(m);
  row.maturedSpendUsd = m.commits ? parseUsd(m.spendUsd) : 0;
  row.maturedRevenueUsd = m.rewardRows ? parseUsd(m.revenueUsd) : 0;
  row.maturedPricedSpendUsd = parseUsd(m.pricedSpendUsd);
  row.maturedPricedRevenueUsd = parseUsd(m.pricedRevenueUsd);
  row.maturedSpendPriceMissing = m.spendPriceMissing;
  row.maturedRevenuePriceMissing = m.revenuePriceMissing;
  row.coinbaseUstx = m.coinbaseUstx;
  row.txFeesUstx = m.txFeesUstx;
  row.revenueUstx = totalRevenue(m);
  row.satsPerStx = satsPerStx(row.maturedSpendSats, row.revenueUstx);
}

export function sumRows(rows: MinerRow[]) {
  return rows.reduce(
    (acc, row) => ({
      commits: acc.commits + row.commits,
      wins: acc.wins + row.wins,
      spendSats: acc.spendSats + row.spendSats,
      burnSats: acc.burnSats + row.burnSats,
      maturedSpendSats: acc.maturedSpendSats + row.maturedSpendSats,
      revenueUstx: acc.revenueUstx + row.revenueUstx,
      coinbaseUstx: acc.coinbaseUstx + row.coinbaseUstx,
      txFeesUstx: acc.txFeesUstx + row.txFeesUstx,
    }),
    {
      commits: 0,
      wins: 0,
      spendSats: 0,
      burnSats: 0,
      maturedSpendSats: 0,
      revenueUstx: 0,
      coinbaseUstx: 0,
      txFeesUstx: 0,
    }
  );
}
