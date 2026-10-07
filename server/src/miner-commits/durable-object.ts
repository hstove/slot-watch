import { DurableObject } from 'cloudflare:workers';
import { Cause, Effect, Layer, Logger, ManagedRuntime, Ref } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { runJobs } from './jobs';
import { MempoolApiLive } from './mempool-api';
import { initOutboxSchema, makeOutboxLayer, Outbox } from './outbox';
import { WatcherState, WatcherStateLive } from './state';
import { CommitStoreLive } from './store';
import { runWatcher } from './watcher';
import { runWriter } from './writer';

/**
 * The alarm is the keepalive and the restart path: alarms survive deploys and
 * evictions, so a new version is running again within one interval.
 */
const ALARM_INTERVAL_MS = 15_000;
const HEARTBEAT = '5 minutes';
const RESTART_DELAY = '5 seconds';

/**
 * Restart a never-ending worker after a defect, so a bug in one (say, the
 * writer) doesn't take down the others. Interrupts (shutdown) pass through.
 */
const supervise = <E, R>(name: string, worker: Effect.Effect<never, E, R>) =>
  worker.pipe(
    Effect.catchCauseIf(
      (cause) => !Cause.hasInterruptsOnly(cause),
      (cause) =>
        Effect.logError(`${name} crashed; restarting`).pipe(
          Effect.annotateLogs({ cause: Cause.pretty(cause) }),
          Effect.andThen(Effect.sleep(RESTART_DELAY))
        )
    ),
    Effect.forever
  );

/**
 * Holds the mempool.space WebSocket for live miner commits (first-seen times,
 * RBFs, drops), fee snapshots and block stats, and persists them to Postgres
 * through a durable outbox. One instance, addressed by name `mainnet`.
 *
 * Restarts (deploys, evictions) lose only in-memory state: queued writes and
 * jobs live in this object's SQLite storage, the WebSocket reconnects and
 * re-seeds pending commits, and the per-block reconcile backfills any RBF
 * versions missed while it was down.
 */
export class MinerCommitsWatcher extends DurableObject {
  private readonly runtime;
  private running = false;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    initOutboxSchema(ctx.storage.sql);
    const layer = Layer.mergeAll(
      MempoolApiLive,
      CommitStoreLive,
      makeOutboxLayer(ctx.storage),
      WatcherStateLive
    ).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provideMerge(Logger.layer([Logger.consoleStructured]))
    );
    this.runtime = ManagedRuntime.make(layer);
    ctx.blockConcurrencyWhile(async () => {
      if ((await ctx.storage.getAlarm()) === null) {
        await ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
      }
    });
    this.ensureRunning();
  }

  private ensureRunning() {
    if (this.running) return;
    this.running = true;
    const status = this.statusEffect;
    const heartbeat = Effect.gen(function* () {
      yield* Effect.sleep(HEARTBEAT);
      yield* Effect.logInfo('Watcher heartbeat').pipe(
        Effect.annotateLogs(yield* status)
      );
    }).pipe(Effect.forever);
    const main = Effect.all(
      [
        supervise('watcher', runWatcher),
        supervise('writer', runWriter),
        supervise('jobs', runJobs),
        supervise('heartbeat', heartbeat),
      ],
      { concurrency: 'unbounded', discard: true }
    ).pipe(
      Effect.annotateLogs({ topic: 'miner-commits' }),
      Effect.onExit(() =>
        Effect.sync(() => {
          this.running = false;
        })
      )
    );
    this.runtime.runFork(
      Effect.logInfo('Miner commits watcher starting').pipe(
        Effect.annotateLogs({ topic: 'miner-commits' }),
        Effect.andThen(main)
      )
    );
  }

  private get statusEffect() {
    return Effect.gen(function* () {
      const state = yield* WatcherState;
      const outbox = yield* Outbox;
      const status = yield* Ref.get(state.status);
      return { ...status, outbox: yield* outbox.depth() };
    });
  }

  override async alarm() {
    this.ensureRunning();
    await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
  }

  override async fetch(_request: Request) {
    this.ensureRunning();
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    }
    const status = await this.runtime.runPromise(this.statusEffect);
    return Response.json({ running: this.running, ...status });
  }
}
