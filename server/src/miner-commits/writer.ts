import { Duration, Effect, Schedule } from 'effect';
import { Outbox } from './outbox';
import { WatcherState } from './state';
import { CommitStore, StoreError } from './store';

const BATCH_SIZE = 100;
/** A single op that keeps failing on its own is dead-lettered after this. */
const MAX_WRITE_ATTEMPTS = 8;
/** Let a burst of ops (a block, several commits) coalesce into one batch. */
const COALESCE = '250 millis';
const IDLE_WAIT = '15 seconds';

const writeBackoff = Schedule.exponential('1 second').pipe(
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(
      Duration.millis(Math.min(Duration.toMillis(duration), 60_000))
    )
  )
);

/**
 * Drains the outbox's write ops into Postgres in order. Rows are acked only
 * after their transaction commits, so a restart replays at most one batch,
 * which the idempotent writes absorb. If the DB is down, ops keep piling up
 * durably in the Durable Object and drain once it's back.
 */
export const runWriter = Effect.gen(function* () {
  const store = yield* CommitStore;
  const outbox = yield* Outbox;
  const state = yield* WatcherState;

  /** Returns how many ops were applied; fails to trigger backoff. */
  const drainBatch = Effect.gen(function* () {
    const batch = yield* outbox.nextWrites(BATCH_SIZE);
    if (batch.length === 0) return 0;
    const ops = batch.map((b) => b.op);
    const seqs = batch.map((b) => b.seq);

    const batchError = yield* store.apply(ops).pipe(
      Effect.as(null),
      Effect.catchTag('@errors/StoreError', (error) => Effect.succeed(error))
    );
    if (batchError === null) {
      yield* outbox.ackWrites(seqs);
      yield* state.count('writesApplied', ops.length);
      return ops.length;
    }

    // Isolate the bad op(s) so one poison write can't block the queue.
    yield* Effect.logWarning(
      'Write batch failed; retrying ops one by one'
    ).pipe(
      Effect.annotateLogs({ size: ops.length, error: batchError.message })
    );
    const results = yield* store.applyEach(ops);
    const failed: string[] = [];
    for (const [i, error] of results.entries()) {
      const seq = seqs[i];
      if (seq === undefined) continue;
      if (error === null) {
        yield* outbox.ackWrites([seq]);
      } else {
        failed.push(`${ops[i]?._tag}: ${error}`);
        yield* outbox.failWrite(seq, error, MAX_WRITE_ATTEMPTS);
      }
    }
    yield* state.count('writesApplied', results.length - failed.length);
    if (failed.length > 0) {
      yield* state.count('writeFailures', failed.length);
      return yield* new StoreError({
        operation: 'applyEach',
        message: failed.slice(0, 3).join('; '),
      });
    }
    return ops.length;
  });

  const drainAll = Effect.gen(function* () {
    while ((yield* drainBatch) === BATCH_SIZE) {
      // keep going while full batches come back
    }
  }).pipe(
    Effect.tapError((error) =>
      Effect.all([
        state.recordError('writer', error),
        Effect.logError('Postgres write failed; backing off').pipe(
          Effect.annotateLogs({ error: error.message })
        ),
      ])
    ),
    Effect.retry(writeBackoff)
  );

  for (;;) {
    yield* drainAll;
    yield* Effect.race(outbox.writesAvailable, Effect.sleep(IDLE_WAIT));
    yield* Effect.sleep(COALESCE);
  }
});
