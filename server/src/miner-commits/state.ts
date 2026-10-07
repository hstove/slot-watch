import { Context, Effect, Layer, Queue, Ref } from 'effect';
import type { Commit } from './ops';

/** One projected mempool block from mempool.space's `mempool-blocks`. */
export interface ProjectedBlock {
  readonly blockVSize: number;
  readonly medianFee: number;
  /** [min, p10, p25, p50, p75, p90, max] sat/vB. */
  readonly feeRange: readonly number[];
}

export interface WatcherCounts {
  readonly messages: number;
  readonly commitsSeen: number;
  readonly rbfs: number;
  readonly confirmed: number;
  /** Commit versions that left the mempool (replaced, dropped or mined). */
  readonly removed: number;
  readonly blocks: number;
  readonly snapshots: number;
  readonly writesApplied: number;
  readonly writeFailures: number;
  readonly jobsCompleted: number;
  readonly jobFailures: number;
  readonly connects: number;
}

export interface WatcherStatus {
  readonly startedAt: number;
  readonly connectedAt: number | null;
  readonly lastMessageAt: number | null;
  readonly tip: { readonly height: number; readonly hash: string } | null;
  readonly trackedMiners: number;
  readonly counts: WatcherCounts;
  readonly lastError: {
    readonly at: number;
    readonly where: string;
    readonly message: string;
  } | null;
}

const emptyCounts: WatcherCounts = {
  messages: 0,
  commitsSeen: 0,
  rbfs: 0,
  confirmed: 0,
  removed: 0,
  blocks: 0,
  snapshots: 0,
  writesApplied: 0,
  writeFailures: 0,
  jobsCompleted: 0,
  jobFailures: 0,
  connects: 0,
};

/** Bound on the dedupe set of txids already enqueued as seen. */
const MAX_SEEN = 5000;

/** In-memory state for one Durable Object instance. Lost on restart by design. */
export class WatcherState extends Context.Service<
  WatcherState,
  {
    readonly status: Ref.Ref<WatcherStatus>;
    readonly mempoolBlocks: Ref.Ref<readonly ProjectedBlock[]>;
    /** Latest pending commit per miner BTC address, for RBF detection in logs. */
    readonly pending: Map<string, Commit>;
    /** Returns false if `txid` was already marked. */
    markSeen(txid: string): boolean;
    readonly requestTrackedRefresh: Effect.Effect<void>;
    readonly trackedRefreshRequested: Effect.Effect<void>;
    count(key: keyof WatcherCounts, n?: number): Effect.Effect<void>;
    recordError(where: string, error: unknown): Effect.Effect<void>;
  }
>()('@app/miner-commits/WatcherState') {}

export const WatcherStateLive = Layer.effect(
  WatcherState,
  Effect.gen(function* () {
    const status = yield* Ref.make<WatcherStatus>({
      startedAt: Date.now(),
      connectedAt: null,
      lastMessageAt: null,
      tip: null,
      trackedMiners: 0,
      counts: emptyCounts,
      lastError: null,
    });
    const refresh = yield* Queue.sliding<void>(1);
    let seen = new Set<string>();

    return WatcherState.of({
      status,
      mempoolBlocks: yield* Ref.make<readonly ProjectedBlock[]>([]),
      pending: new Map(),
      markSeen: (txid) => {
        if (seen.has(txid)) return false;
        if (seen.size >= MAX_SEEN) seen = new Set();
        seen.add(txid);
        return true;
      },
      requestTrackedRefresh: Queue.offer(refresh, undefined).pipe(
        Effect.asVoid
      ),
      trackedRefreshRequested: Queue.take(refresh),
      count: (key, n = 1) =>
        Ref.update(status, (s) => ({
          ...s,
          counts: { ...s.counts, [key]: s.counts[key] + n },
        })),
      recordError: (where, error) =>
        Ref.update(status, (s) => ({
          ...s,
          lastError: {
            at: Date.now(),
            where,
            message: error instanceof Error ? error.message : String(error),
          },
        })),
    });
  })
);
