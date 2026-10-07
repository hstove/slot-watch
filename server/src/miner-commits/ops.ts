import { Schema } from 'effect';
import { type EsploraTx, parseBlockCommit } from 'slot-watch-common';
import { inputPublicKey } from '../bitcoin';

/**
 * Durable work items for the `MinerCommitsWatcher` outbox. They are stored as
 * JSON in the Durable Object's SQLite storage and replayed after a restart,
 * so every write op must be idempotent and the schemas must stay
 * backwards-compatible (add optional fields only). A payload that no longer
 * decodes is dead-lettered instead of blocking the queue.
 */

/** A block-commit tx version, as parsed from an Esplora tx. */
export const Commit = Schema.Struct({
  txid: Schema.String,
  /** `txid:vout` of the first input; RBF versions share it. */
  chainInput: Schema.String,
  btcAddress: Schema.String,
  minerPublicKey: Schema.NullOr(Schema.String),
  bidSats: Schema.Number,
  feeSats: Schema.Number,
  vsize: Schema.Number,
  feeRate: Schema.Number,
  parentHeight: Schema.Number,
  parentVtx: Schema.Number,
  modulus: Schema.Number,
});
export type Commit = typeof Commit.Type;

/** Null if `tx` isn't a block commit. */
export function toCommit(tx: EsploraTx): Commit | null {
  const live = parseBlockCommit(tx, 0);
  if (!live) return null;
  return {
    txid: live.txid,
    chainInput: live.input,
    btcAddress: live.btcAddress,
    minerPublicKey: inputPublicKey(tx.vin[0]),
    bidSats: live.bidSats,
    feeSats: live.feeSats,
    vsize: live.vsize,
    feeRate: live.feeRate,
    parentHeight: live.parentHeight,
    parentVtx: live.parentVtx,
    modulus: live.modulus,
  };
}

const FirstSeenSource = Schema.NullOr(Schema.Literals(['ws', 'mempool_space']));

const ReconciledVersion = Schema.Struct({
  txid: Schema.String,
  /** Null when the row already exists; the reconcile only updates it. */
  commit: Schema.NullOr(Commit),
  /** mempool.space first-seen (ms). Only fills a missing `first_seen_at`. */
  firstSeenAt: Schema.NullOr(Schema.Number),
  fullRbf: Schema.NullOr(Schema.Boolean),
});
export type ReconciledVersion = typeof ReconciledVersion.Type;

/** Postgres writes, applied in order by the outbox writer. */
export const WriteOp = Schema.TaggedUnion({
  /** A commit entered the mempool (or was found pending by a seed). */
  CommitSeen: {
    commit: Commit,
    seenAt: Schema.NullOr(Schema.Number),
    source: FirstSeenSource,
  },
  CommitConfirmed: {
    commit: Commit,
    height: Schema.Number,
    at: Schema.Number,
  },
  /** Left the mempool without a replacement or confirmation (so far). */
  CommitDropped: {
    txid: Schema.String,
    at: Schema.Number,
  },
  /** A confirmed commit's full replacement chain, oldest first. */
  ChainReconciled: {
    height: Schema.Number,
    versions: Schema.Array(ReconciledVersion),
  },
  BlockSeen: {
    hash: Schema.String,
    height: Schema.Number,
    /** Header timestamp, unix seconds. */
    timestamp: Schema.Number,
    observedAt: Schema.NullOr(Schema.Number),
    medianFee: Schema.NullOr(Schema.Number),
    feeRange: Schema.NullOr(Schema.Array(Schema.Number)),
    totalFees: Schema.NullOr(Schema.Number),
    txCount: Schema.NullOr(Schema.Number),
    weight: Schema.NullOr(Schema.Number),
    poolName: Schema.NullOr(Schema.String),
  },
  Sortition: {
    hash: Schema.String,
    height: Schema.Number,
    wasSortition: Schema.Boolean,
    minerPkHash160: Schema.NullOr(Schema.String),
  },
  FeeSnapshot: {
    observedAt: Schema.Number,
    tipHeight: Schema.Number,
    nextMedianFee: Schema.Number,
    nextFeeRange: Schema.Array(Schema.Number),
    nextBlockVsize: Schema.Number,
    secondMinFee: Schema.NullOr(Schema.Number),
  },
});
export type WriteOp = typeof WriteOp.Type;

/** Network-bound work that produces write ops. Retried with backoff. */
export const Job = Schema.TaggedUnion({
  /** Pull mempool.space's RBF trees for a block's confirmed commits. */
  ReconcileBlock: {
    height: Schema.Number,
    hash: Schema.String,
  },
  /** The node's sortition outcome for a burn height (via Hiro). */
  FetchSortition: {
    height: Schema.Number,
  },
});
export type Job = typeof Job.Type;

export const WriteOpJson = Schema.fromJsonString(WriteOp);
export const JobJson = Schema.fromJsonString(Job);
