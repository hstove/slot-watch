import { Data, Effect } from 'effect';
import { MempoolApi, type RbfNode } from './mempool-api';
import { Job, type ReconciledVersion, toCommit, type WriteOp } from './ops';
import { Outbox, type QueuedJob } from './outbox';
import { WatcherState } from './state';
import { CommitStore } from './store';

const MAX_JOB_ATTEMPTS = 12;
const MAX_RETRY_MS = 30 * 60_000;
/** A block with no `miner_spends` rows after this many tries had no commits. */
const EMPTY_BLOCK_ATTEMPTS = 8;
const IDLE_WAIT_MS = 60_000;

type JobOutcome = Data.TaggedEnum<{
  Done: { readonly writes: readonly WriteOp[] };
  /** The data isn't there yet (indexing lag): retry later without logging an error. */
  NotReady: { readonly reason: string };
}>;
const JobOutcome = Data.taggedEnum<JobOutcome>();

const retryDelay = (attempts: number, baseMs: number) =>
  Math.min(MAX_RETRY_MS, baseMs * 2 ** attempts);

/** Versions oldest first, with the mined root last. */
function chainVersions(root: RbfNode): RbfNode[] {
  const older: RbfNode[] = [];
  const walk = (node: RbfNode) => {
    for (const child of node.replaces) {
      older.push(child);
      walk(child);
    }
  };
  walk(root);
  older.sort((a, b) => a.tx.time - b.tx.time);
  return [...older, root];
}

/**
 * Runs due jobs from the outbox. A job's write ops are enqueued atomically
 * with its completion, so a restart either re-runs the job or has its writes.
 */
export const runJobs = Effect.gen(function* () {
  const api = yield* MempoolApi;
  const store = yield* CommitStore;
  const outbox = yield* Outbox;
  const state = yield* WatcherState;

  /** Parse a version we don't have; null if its cache entry expired (we link around the gap). */
  const fetchVersion = (
    version: Omit<ReconciledVersion, 'commit'>,
    mined: boolean
  ) =>
    (mined ? api.tx(version.txid) : api.cachedTx(version.txid)).pipe(
      Effect.map((tx): ReconciledVersion | null => {
        const commit = tx ? toCommit(tx) : null;
        return commit ? { ...version, commit } : null;
      })
    );

  /**
   * Rebuild each confirmed commit's replacement chain from mempool.space's
   * RBF tree. This fills in versions the WebSocket missed (restarts, deploys,
   * miners we weren't tracking) and their first-seen times.
   */
  const reconcileBlock = Effect.fn('MinerCommits.reconcileBlock')(function* (
    height: number,
    attempts: number
  ) {
    const txids = yield* store.confirmedCommitTxids(height);
    if (txids.length === 0) {
      return attempts >= EMPTY_BLOCK_ATTEMPTS
        ? JobOutcome.Done({ writes: [] })
        : JobOutcome.NotReady({ reason: 'no miner_spends for height yet' });
    }
    const trees = yield* Effect.forEach(txids, (txid) => api.rbfTree(txid), {
      concurrency: 4,
    });
    const chains = txids.map((txid, i) => {
      const tree = trees[i];
      return tree
        ? chainVersions(tree).map((node) => ({
            txid: node.tx.txid,
            firstSeenAt: node.tx.time * 1000,
            fullRbf: node.tx.fullRbf ?? node.fullRbf ?? null,
          }))
        : [{ txid, firstSeenAt: null, fullRbf: null }];
    });
    const known = yield* store.knownTxids(chains.flat().map((v) => v.txid));

    const writes = yield* Effect.forEach(
      chains,
      (chain) =>
        Effect.gen(function* () {
          const versions = yield* Effect.forEach(chain, (version, i) =>
            known.has(version.txid)
              ? Effect.succeed<ReconciledVersion | null>({
                  ...version,
                  commit: null,
                })
              : fetchVersion(version, i === chain.length - 1)
          );
          return {
            _tag: 'ChainReconciled',
            height,
            versions: versions.filter((v) => v !== null),
          } satisfies WriteOp;
        }),
      { concurrency: 2 }
    );
    yield* Effect.logInfo('Reconciled block commits').pipe(
      Effect.annotateLogs({
        height,
        commits: txids.length,
        replaced: writes.reduce((n, w) => n + w.versions.length - 1, 0),
        fetched: chains.flat().filter((v) => !known.has(v.txid)).length,
      })
    );
    return JobOutcome.Done({ writes });
  });

  const fetchSortition = Effect.fn('MinerCommits.fetchSortition')(function* (
    height: number
  ) {
    const sortition = yield* api.sortition(height);
    if (!sortition)
      return JobOutcome.NotReady({ reason: 'sortition not found' });
    return JobOutcome.Done({ writes: [{ _tag: 'Sortition', ...sortition }] });
  });

  const handle = (job: Job, attempts: number) =>
    Job.match(job, {
      ReconcileBlock: ({ height }) => reconcileBlock(height, attempts),
      FetchSortition: ({ height }) => fetchSortition(height),
    });

  const runJob = (queued: QueuedJob) =>
    handle(queued.job, queued.attempts).pipe(
      Effect.matchEffect({
        onSuccess: JobOutcome.$match({
          Done: ({ writes }) =>
            Effect.gen(function* () {
              yield* outbox.completeJob(queued.seq, writes);
              yield* state.count('jobsCompleted');
              if (queued.job._tag === 'ReconcileBlock') {
                // New miners show up once their first commit is indexed.
                yield* state.requestTrackedRefresh;
              }
            }),
          NotReady: ({ reason }) =>
            Effect.gen(function* () {
              yield* outbox.retryJob(
                queued.seq,
                Date.now() + retryDelay(queued.attempts, 30_000),
                reason,
                MAX_JOB_ATTEMPTS
              );
              yield* Effect.logDebug('Job not ready').pipe(
                Effect.annotateLogs({ job: queued.job, reason })
              );
            }),
        }),
        onFailure: (error) =>
          Effect.gen(function* () {
            yield* outbox.retryJob(
              queued.seq,
              Date.now() + retryDelay(queued.attempts, 60_000),
              error.message,
              MAX_JOB_ATTEMPTS
            );
            yield* state.count('jobFailures');
            yield* state.recordError(queued.job._tag, error);
            yield* Effect.logWarning('Job failed, will retry').pipe(
              Effect.annotateLogs({
                job: queued.job,
                attempts: queued.attempts + 1,
                error: error.message,
              })
            );
          }),
      })
    );

  for (;;) {
    for (;;) {
      const queued = yield* outbox.nextDueJob(Date.now());
      if (!queued) break;
      yield* runJob(queued);
    }
    const next = yield* outbox.nextJobAt();
    const wait =
      next === null
        ? IDLE_WAIT_MS
        : Math.max(0, Math.min(IDLE_WAIT_MS, next - Date.now()));
    yield* Effect.race(Effect.sleep(wait), outbox.jobsAvailable);
  }
});
