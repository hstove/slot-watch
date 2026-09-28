import {
  type MinerCommit,
  type MinerCommitsBlock,
  type MinerName,
  minerDisplay,
} from 'slot-watch-common';
import type { MinerLiveState } from '@/hooks/use-mempool-commits';
import {
  type FeeStatus,
  feeStatus,
  isStaleCommit,
  type LiveCommit,
  type MempoolBlock,
} from '@/lib/mempool-space';
import { UNRESOLVED_COLOR } from '@/lib/miner-economics';
import { truncateMiddle } from '@/lib/utils';

/** Sortition weighs a commit by the median of the miner's last 6 commits. */
const COMMITMENT_WINDOW = 6;

export interface TrackedMiner {
  publicKey: string;
  stxAddress: string | null;
  identity: MinerName | null;
  label: string;
  btcAddress: string;
  color: string;
  /** Total spend per burn height. */
  bids: Map<number, number>;
  wins: number;
}

function newTrackedMiner(
  commit: MinerCommit,
  publicKey: string,
  btcAddress: string
): TrackedMiner {
  const identity = minerDisplay(commit);
  return {
    publicKey,
    stxAddress: commit.minerAddress,
    identity,
    label: identity
      ? identity.label
      : truncateMiddle(commit.minerAddress ?? publicKey, 5, 4),
    color: identity?.hex ?? UNRESOLVED_COLOR,
    btcAddress,
    bids: new Map(),
    wins: 0,
  };
}

export function trackedMiners(blocks: MinerCommitsBlock[]): TrackedMiner[] {
  const byKey = new Map<string, TrackedMiner>();
  for (const block of blocks) {
    for (const commit of block.commits) {
      if (!(commit.minerPublicKey && commit.btcAddress)) continue;
      const miner =
        byKey.get(commit.minerPublicKey) ??
        newTrackedMiner(commit, commit.minerPublicKey, commit.btcAddress);
      miner.btcAddress = commit.btcAddress;
      miner.bids.set(block.burnBlockHeight, commit.spendSats + commit.burnSats);
      if (commit.txid === block.winningTxid) miner.wins++;
      byKey.set(commit.minerPublicKey, miner);
    }
  }
  return [...byKey.values()];
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Approximates sortition weight: `min(bid, median(bid, prior 5 commits))`,
 * with missed blocks counting as 0. Heights Slot Watch hasn't indexed yet are
 * skipped rather than counted as misses.
 */
function effectiveBid(
  miner: TrackedMiner,
  bid: number,
  tipHeight: number,
  indexedHeights: Set<number>
) {
  const prior: number[] = [];
  for (let h = tipHeight - COMMITMENT_WINDOW + 2; h <= tipHeight; h++) {
    if (indexedHeights.has(h)) prior.push(miner.bids.get(h) ?? 0);
  }
  return Math.min(bid, median([...prior, bid]));
}

export interface LiveRow {
  miner: TrackedMiner;
  live: MinerLiveState | undefined;
  pending: LiveCommit | null;
  stale: boolean;
  /** Parent tenure is older than the latest sortition winner. */
  behind: boolean;
  fee: FeeStatus | null;
  effectiveBid: number;
  /** Share of all non-stale pending bids. */
  share: number;
  odds: number;
}

export function buildLiveRows({
  miners,
  live,
  blocks,
  mempoolBlocks,
  tipHeight,
}: {
  miners: TrackedMiner[];
  live: Record<string, MinerLiveState>;
  blocks: MinerCommitsBlock[];
  mempoolBlocks: MempoolBlock[];
  tipHeight: number;
}): LiveRow[] {
  const indexedHeights = new Set(blocks.map((b) => b.burnBlockHeight));
  const latestWinner = blocks
    .filter((b) => b.winningTxid)
    .at(-1)?.burnBlockHeight;
  const rows = miners.map((miner) => {
    const state = live[miner.btcAddress];
    const pending = state?.pending ?? null;
    const stale = pending ? isStaleCommit(pending, tipHeight) : false;
    return {
      miner,
      live: state,
      pending,
      stale,
      behind:
        !!pending &&
        latestWinner !== undefined &&
        pending.parentHeight < latestWinner,
      fee: pending ? feeStatus(pending.feeRate, mempoolBlocks) : null,
      effectiveBid:
        pending && !stale
          ? effectiveBid(miner, pending.bidSats, tipHeight, indexedHeights)
          : 0,
      share: 0,
      odds: 0,
    };
  });
  const totalBid = rows.reduce(
    (sum, r) => sum + (r.pending && !r.stale ? r.pending.bidSats : 0),
    0
  );
  const totalEffective = rows.reduce((sum, r) => sum + r.effectiveBid, 0);
  for (const row of rows) {
    row.share =
      row.pending && !row.stale && totalBid
        ? row.pending.bidSats / totalBid
        : 0;
    row.odds = totalEffective ? row.effectiveBid / totalEffective : 0;
  }
  return rows.sort(
    (a, b) =>
      b.odds - a.odds ||
      (b.pending?.bidSats ?? 0) - (a.pending?.bidSats ?? 0) ||
      b.miner.wins - a.miner.wins
  );
}

export function formatFeeRate(rate: number) {
  return rate < 10 ? rate.toFixed(2) : rate.toFixed(1);
}
