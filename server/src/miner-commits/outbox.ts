import { Context, Effect, Layer, Queue, Schema } from 'effect';
import { type Job, JobJson, type WriteOp, WriteOpJson } from './ops';

/**
 * A durable FIFO in the Durable Object's SQLite storage. Producers append
 * synchronously (so nothing is lost if the object restarts mid-flight) and a
 * consumer acks rows only after Postgres has committed them. Replays after a
 * restart are safe because every write op is idempotent.
 *
 * `write` rows are Postgres writes, drained in `seq` order. `job` rows are
 * network-bound work with a `run_at` and backoff.
 */

const MAX_DEAD_LETTERS = 500;

export interface QueuedWrite {
  readonly seq: number;
  readonly op: WriteOp;
}

export interface QueuedJob {
  readonly seq: number;
  readonly job: Job;
  readonly attempts: number;
}

export interface OutboxDepth {
  readonly writes: number;
  readonly jobs: number;
  readonly deadLetters: number;
  readonly oldestWriteAt: number | null;
}

type Row = Record<string, SqlStorageValue>;

const encodeWrite = Schema.encodeSync(WriteOpJson);
const encodeJob = Schema.encodeSync(JobJson);
const decodeWrite = Schema.decodeUnknownSync(WriteOpJson);
const decodeJob = Schema.decodeUnknownSync(JobJson);

export function initOutboxSchema(sql: SqlStorage) {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS outbox (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      run_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS outbox_kind_run_at ON outbox (kind, run_at, seq);
    CREATE TABLE IF NOT EXISTS dead_letters (
      seq INTEGER PRIMARY KEY,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      last_error TEXT,
      failed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export class Outbox extends Context.Service<
  Outbox,
  {
    enqueueWrites(ops: readonly WriteOp[]): Effect.Effect<void>;
    enqueueJob(job: Job, runAt: number): Effect.Effect<void>;
    /** Oldest writes first. Undecodable rows are dead-lettered and skipped. */
    nextWrites(limit: number): Effect.Effect<readonly QueuedWrite[]>;
    ackWrites(seqs: readonly number[]): Effect.Effect<void>;
    /** Count a failed attempt; dead-letter after `maxAttempts`. */
    failWrite(
      seq: number,
      error: string,
      maxAttempts: number
    ): Effect.Effect<void>;
    nextDueJob(now: number): Effect.Effect<QueuedJob | null>;
    nextJobAt(): Effect.Effect<number | null>;
    /** Delete the job and enqueue its writes atomically. */
    completeJob(seq: number, writes: readonly WriteOp[]): Effect.Effect<void>;
    retryJob(
      seq: number,
      runAt: number,
      error: string | null,
      maxAttempts: number
    ): Effect.Effect<void>;
    depth(): Effect.Effect<OutboxDepth>;
    /** Wakes when writes are enqueued. */
    readonly writesAvailable: Effect.Effect<void>;
    /** Wakes when a job is enqueued. */
    readonly jobsAvailable: Effect.Effect<void>;
    getMeta(key: string): Effect.Effect<string | null>;
    setMeta(key: string, value: string): Effect.Effect<void>;
  }
>()('@app/miner-commits/Outbox') {}

export const makeOutboxLayer = (storage: DurableObjectStorage) =>
  Layer.effect(
    Outbox,
    Effect.gen(function* () {
      const sql = storage.sql;
      const writeSignal = yield* Queue.sliding<void>(1);
      const jobSignal = yield* Queue.sliding<void>(1);

      const one = <T extends Row>(query: string, ...bindings: unknown[]) =>
        sql.exec<T>(query, ...bindings).toArray()[0] ?? null;

      const deadLetter = (seq: number, error: string) => {
        sql.exec(
          `INSERT OR REPLACE INTO dead_letters (seq, kind, payload, attempts, last_error, failed_at)
           SELECT seq, kind, payload, attempts, ?, ? FROM outbox WHERE seq = ?`,
          error,
          Date.now(),
          seq
        );
        sql.exec('DELETE FROM outbox WHERE seq = ?', seq);
        sql.exec(
          `DELETE FROM dead_letters WHERE seq NOT IN
           (SELECT seq FROM dead_letters ORDER BY seq DESC LIMIT ?)`,
          MAX_DEAD_LETTERS
        );
      };

      const insertWrites = (ops: readonly WriteOp[]) => {
        const now = Date.now();
        for (const op of ops) {
          sql.exec(
            `INSERT INTO outbox (kind, payload, run_at, created_at) VALUES ('write', ?, ?, ?)`,
            encodeWrite(op),
            now,
            now
          );
        }
      };

      const logDeadLetter = (seq: number, kind: string, error: string) =>
        Effect.logError('Outbox entry dead-lettered').pipe(
          Effect.annotateLogs({ seq, kind, error })
        );

      return Outbox.of({
        enqueueWrites: (ops) =>
          ops.length === 0
            ? Effect.void
            : Effect.sync(() => insertWrites(ops)).pipe(
                Effect.andThen(Queue.offer(writeSignal, undefined)),
                Effect.asVoid
              ),

        enqueueJob: (job, runAt) =>
          Effect.sync(() => {
            sql.exec(
              `INSERT INTO outbox (kind, payload, run_at, created_at) VALUES ('job', ?, ?, ?)`,
              encodeJob(job),
              runAt,
              Date.now()
            );
          }).pipe(
            Effect.andThen(Queue.offer(jobSignal, undefined)),
            Effect.asVoid
          ),

        nextWrites: (limit) =>
          Effect.gen(function* () {
            const rows = sql
              .exec<{ seq: number; payload: string }>(
                `SELECT seq, payload FROM outbox WHERE kind = 'write' ORDER BY seq LIMIT ?`,
                limit
              )
              .toArray();
            const writes: QueuedWrite[] = [];
            for (const row of rows) {
              try {
                writes.push({ seq: row.seq, op: decodeWrite(row.payload) });
              } catch (error) {
                const message = `undecodable payload: ${String(error)}`;
                deadLetter(row.seq, message);
                yield* logDeadLetter(row.seq, 'write', message);
              }
            }
            return writes;
          }),

        ackWrites: (seqs) =>
          Effect.sync(() => {
            if (seqs.length === 0) return;
            sql.exec(
              `DELETE FROM outbox WHERE seq IN (${seqs.map(() => '?').join(',')})`,
              ...seqs
            );
          }),

        failWrite: (seq, error, maxAttempts) =>
          Effect.gen(function* () {
            const row = one<{ attempts: number }>(
              'UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE seq = ? RETURNING attempts',
              error,
              seq
            );
            if (row && row.attempts >= maxAttempts) {
              deadLetter(seq, error);
              yield* logDeadLetter(seq, 'write', error);
            }
          }),

        nextDueJob: (now) =>
          Effect.gen(function* () {
            for (;;) {
              const row = one<{
                seq: number;
                payload: string;
                attempts: number;
              }>(
                `SELECT seq, payload, attempts FROM outbox
                 WHERE kind = 'job' AND run_at <= ? ORDER BY run_at, seq LIMIT 1`,
                now
              );
              if (!row) return null;
              try {
                return {
                  seq: row.seq,
                  job: decodeJob(row.payload),
                  attempts: row.attempts,
                };
              } catch (error) {
                const message = `undecodable payload: ${String(error)}`;
                deadLetter(row.seq, message);
                yield* logDeadLetter(row.seq, 'job', message);
              }
            }
          }),

        nextJobAt: () =>
          Effect.sync(
            () =>
              one<{ run_at: number }>(
                `SELECT run_at FROM outbox WHERE kind = 'job' ORDER BY run_at LIMIT 1`
              )?.run_at ?? null
          ),

        completeJob: (seq, writes) =>
          Effect.sync(() =>
            storage.transactionSync(() => {
              sql.exec('DELETE FROM outbox WHERE seq = ?', seq);
              insertWrites(writes);
            })
          ).pipe(
            Effect.andThen(Queue.offer(writeSignal, undefined)),
            Effect.asVoid
          ),

        retryJob: (seq, runAt, error, maxAttempts) =>
          Effect.gen(function* () {
            const row = one<{ attempts: number }>(
              `UPDATE outbox SET attempts = attempts + 1, run_at = ?, last_error = coalesce(?, last_error)
               WHERE seq = ? RETURNING attempts`,
              runAt,
              error,
              seq
            );
            if (row && row.attempts >= maxAttempts) {
              const message = error ?? 'gave up waiting';
              deadLetter(seq, message);
              yield* logDeadLetter(seq, 'job', message);
            }
          }),

        depth: () =>
          Effect.sync(() => {
            const counts = one<{
              writes: number;
              jobs: number;
              oldest: number | null;
            }>(
              `SELECT
                 sum(kind = 'write') AS writes,
                 sum(kind = 'job') AS jobs,
                 min(CASE WHEN kind = 'write' THEN created_at END) AS oldest
               FROM outbox`
            );
            const dead = one<{ n: number }>(
              'SELECT count(*) AS n FROM dead_letters'
            );
            return {
              writes: counts?.writes ?? 0,
              jobs: counts?.jobs ?? 0,
              deadLetters: dead?.n ?? 0,
              oldestWriteAt: counts?.oldest ?? null,
            };
          }),

        writesAvailable: Queue.take(writeSignal),
        jobsAvailable: Queue.take(jobSignal),

        getMeta: (key) =>
          Effect.sync(
            () =>
              one<{ value: string }>(
                'SELECT value FROM meta WHERE key = ?',
                key
              )?.value ?? null
          ),

        setMeta: (key, value) =>
          Effect.sync(() => {
            sql.exec(
              'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
              key,
              value
            );
          }),
      });
    })
  );
