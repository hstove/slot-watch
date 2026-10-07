import { Duration, Effect, Ref, Schedule, Schema } from 'effect';
import { Socket } from 'effect/unstable/socket';
import { MEMPOOL_WS_URL } from 'slot-watch-common';
import { EsploraTx, MempoolApi } from './mempool-api';
import { type Commit, toCommit, type WriteOp } from './ops';
import { Outbox } from './outbox';
import { WatcherState } from './state';
import { CommitStore, TrackedMinersJson } from './store';

const SNAPSHOT_INTERVAL = '30 seconds';
/** No message (mempool-blocks arrive ~1/s) for this long means a dead socket. */
const WATCHDOG = '90 seconds';
/** A session that lasted this long reconnects at once instead of backing off. */
const HEALTHY_SESSION_MS = 60_000;
const TRACKED_REFRESH = '2 minutes';
const TRACKED_RETRY = '15 seconds';
/** Give mempool.space's RBF cache and Slot Watch's `miner_spends` time to settle. */
const RECONCILE_DELAY_MS = 90_000;
const RECENT_RECONCILE_SPACING_MS = 5000;
const META_LAST_RECONCILE_HEIGHT = 'lastReconcileHeight';
const META_TRACKED_MINERS = 'trackedMiners';

const TipBlock = Schema.Struct({
  id: Schema.String,
  height: Schema.Number,
  timestamp: Schema.Number,
  tx_count: Schema.optionalKey(Schema.Number),
  weight: Schema.optionalKey(Schema.Number),
  extras: Schema.optionalKey(
    Schema.Struct({
      medianFee: Schema.optionalKey(Schema.Number),
      feeRange: Schema.optionalKey(Schema.Array(Schema.Number)),
      totalFees: Schema.optionalKey(Schema.Number),
      pool: Schema.optionalKey(Schema.Struct({ name: Schema.String })),
    })
  ),
});
type TipBlock = typeof TipBlock.Type;

const ProjectedBlock = Schema.Struct({
  blockVSize: Schema.Number,
  nTx: Schema.Number,
  totalFees: Schema.Number,
  medianFee: Schema.Number,
  feeRange: Schema.Array(Schema.Number),
});

const AddressTransactions = Schema.Struct({
  mempool: Schema.optionalKey(Schema.Array(EsploraTx)),
  confirmed: Schema.optionalKey(Schema.Array(EsploraTx)),
  removed: Schema.optionalKey(Schema.Array(EsploraTx)),
});
type AddressTransactions = typeof AddressTransactions.Type;
type MempoolTx = typeof EsploraTx.Type;

const WsMessage = Schema.Struct({
  block: Schema.optionalKey(TipBlock),
  blocks: Schema.optionalKey(Schema.Array(TipBlock)),
  'mempool-blocks': Schema.optionalKey(Schema.Array(ProjectedBlock)),
  'multi-address-transactions': Schema.optionalKey(
    Schema.Record(Schema.String, AddressTransactions)
  ),
  'track-addresses-error': Schema.optionalKey(Schema.String),
});
type WsMessage = typeof WsMessage.Type;

const decodeMessage = Schema.decodeUnknownEffect(
  Schema.fromJsonString(WsMessage)
);
const textDecoder = new TextDecoder();
const WS_SCHEME = /^ws/;

class WatcherStalled extends Schema.TaggedError<WatcherStalled>()(
  '@errors/WatcherStalled',
  { message: Schema.String }
) {}

const reconnectBackoff = Schedule.exponential('1 second').pipe(
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(
      Duration.millis(Math.min(Duration.toMillis(duration), 30_000))
    )
  )
);

/**
 * Workers can't use `new WebSocket(url)` for outbound sockets reliably; the
 * documented client is a `fetch` with `Upgrade: websocket`.
 */
const openWorkersWebSocket = (url: string) =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(url.replace(WS_SCHEME, 'http'), {
          headers: { Upgrade: 'websocket' },
        });
        const ws = response.webSocket;
        if (!ws) {
          throw new Error(`WebSocket upgrade failed: HTTP ${response.status}`);
        }
        ws.accept();
        return ws;
      },
      catch: (cause) =>
        new Socket.SocketError({
          reason: new Socket.SocketOpenError({ kind: 'Unknown', cause }),
        }),
    }),
    (ws) =>
      Effect.sync(() => {
        try {
          ws.close(1000);
        } catch {
          // already closed
        }
      })
  );

const blockSeen = (block: TipBlock, observedAt: number | null): WriteOp => ({
  _tag: 'BlockSeen',
  hash: block.id,
  height: block.height,
  timestamp: block.timestamp,
  observedAt,
  medianFee: block.extras?.medianFee ?? null,
  feeRange: block.extras?.feeRange ?? null,
  totalFees: block.extras?.totalFees ?? null,
  txCount: block.tx_count ?? null,
  weight: block.weight ?? null,
  poolName: block.extras?.pool?.name ?? null,
});

const round2 = (n: number) => Math.round(n * 100) / 100;

const logSeen = (commit: Commit, replaced: Commit | undefined) =>
  Effect.logInfo(replaced ? 'Commit replaced (RBF)' : 'Commit seen').pipe(
    Effect.annotateLogs({
      txid: commit.txid,
      btcAddress: commit.btcAddress,
      bidSats: commit.bidSats,
      feeRate: round2(commit.feeRate),
      parentHeight: commit.parentHeight,
      modulus: commit.modulus,
      ...(replaced && {
        previousTxid: replaced.txid,
        feeRateDelta: round2(commit.feeRate - replaced.feeRate),
        parentChanged: commit.parentHeight !== replaced.parentHeight,
      }),
    })
  );

/**
 * Hold the mempool.space WebSocket open, tracking the recent miners'
 * addresses, and turn its events into outbox ops. Never completes.
 */
export const runWatcher = Effect.gen(function* () {
  const api = yield* MempoolApi;
  const store = yield* CommitStore;
  const outbox = yield* Outbox;
  const state = yield* WatcherState;

  const snapshot = Effect.fn('MinerCommits.snapshot')(function* (
    observedAt: number,
    tipHeight: number | undefined
  ) {
    const [next, second] = yield* Ref.get(state.mempoolBlocks);
    if (!next || tipHeight === undefined) return;
    yield* outbox.enqueueWrites([
      {
        _tag: 'FeeSnapshot',
        observedAt,
        tipHeight,
        nextMedianFee: next.medianFee,
        nextFeeRange: next.feeRange,
        nextBlockVsize: next.blockVSize,
        secondMinFee: second?.feeRange[0] ?? null,
      },
    ]);
    yield* state.count('snapshots');
  });

  const scheduleReconcile = Effect.fn('MinerCommits.scheduleReconcile')(
    function* (block: TipBlock, runAt: number) {
      yield* outbox.enqueueJob(
        { _tag: 'ReconcileBlock', height: block.height, hash: block.id },
        runAt
      );
      yield* outbox.enqueueJob(
        { _tag: 'FetchSortition', height: block.height },
        runAt
      );
      const last = Number(
        (yield* outbox.getMeta(META_LAST_RECONCILE_HEIGHT)) ?? 0
      );
      if (block.height > last) {
        yield* outbox.setMeta(META_LAST_RECONCILE_HEIGHT, String(block.height));
      }
    }
  );

  const setTip = (block: TipBlock) =>
    Ref.update(state.status, (s) =>
      s.tip && s.tip.height >= block.height
        ? s
        : { ...s, tip: { height: block.height, hash: block.id } }
    );

  /** The last ~8 blocks, sent on connect. Reconcile any we never scheduled. */
  const onRecentBlocks = Effect.fn('MinerCommits.onRecentBlocks')(function* (
    blocks: readonly TipBlock[]
  ) {
    const sorted = [...blocks].sort((a, b) => a.height - b.height);
    yield* outbox.enqueueWrites(sorted.map((b) => blockSeen(b, null)));
    const last = Number(
      (yield* outbox.getMeta(META_LAST_RECONCILE_HEIGHT)) ?? 0
    );
    const missed = sorted.filter((b) => b.height > last);
    const now = Date.now();
    for (const [i, block] of missed.entries()) {
      yield* scheduleReconcile(block, now + i * RECENT_RECONCILE_SPACING_MS);
    }
    const tip = sorted.at(-1);
    if (tip) yield* setTip(tip);
    if (missed.length > 0) {
      yield* Effect.logInfo('Scheduled reconcile for recent blocks').pipe(
        Effect.annotateLogs({ heights: missed.map((b) => b.height) })
      );
    }
  });

  const onNewBlock = Effect.fn('MinerCommits.onNewBlock')(function* (
    block: TipBlock,
    now: number
  ) {
    const { tip } = yield* Ref.get(state.status);
    // The ladder this block was mined against, before mempool-blocks updates.
    yield* snapshot(now, tip?.height);
    yield* outbox.enqueueWrites([blockSeen(block, now)]);
    yield* scheduleReconcile(block, now + RECONCILE_DELAY_MS);
    yield* setTip(block);
    yield* state.count('blocks');
    yield* Effect.logInfo('New Bitcoin block').pipe(
      Effect.annotateLogs({
        height: block.height,
        hash: block.id,
        pendingCommits: state.pending.size,
        medianFee: block.extras?.medianFee,
      })
    );
  });

  const forgetPending = (address: string, txid: string) => {
    if (state.pending.get(address)?.txid === txid)
      state.pending.delete(address);
  };

  /** New versions in the mempool, stamped with our arrival time. */
  const onMempoolTxs = Effect.fn('MinerCommits.onMempoolTxs')(function* (
    address: string,
    txs: readonly MempoolTx[],
    now: number
  ) {
    const ops: WriteOp[] = [];
    for (const tx of txs) {
      const commit = toCommit(tx);
      if (!(commit && state.markSeen(commit.txid))) continue;
      const previous = state.pending.get(address);
      const replaced =
        previous?.chainInput === commit.chainInput ? previous : undefined;
      state.pending.set(address, commit);
      ops.push({ _tag: 'CommitSeen', commit, seenAt: now, source: 'ws' });
      yield* state.count(replaced ? 'rbfs' : 'commitsSeen');
      yield* logSeen(commit, replaced);
    }
    return ops;
  });

  /** Removed from the mempool: replaced, dropped, or (rarely) mined. The DB only marks still-pending rows as dropped. */
  const onRemovedTxs = (
    address: string,
    txs: readonly MempoolTx[],
    now: number
  ) =>
    Effect.gen(function* () {
      const commits = txs.filter((tx) => toCommit(tx) !== null);
      for (const tx of commits) forgetPending(address, tx.txid);
      yield* state.count('removed', commits.length);
      return commits.map(
        (tx): WriteOp => ({ _tag: 'CommitDropped', txid: tx.txid, at: now })
      );
    });

  const onConfirmedTxs = (
    address: string,
    txs: readonly MempoolTx[],
    now: number
  ) =>
    Effect.gen(function* () {
      const { tip } = yield* Ref.get(state.status);
      const ops: WriteOp[] = [];
      for (const tx of txs) {
        const commit = toCommit(tx);
        const height = tx.status.block_height ?? tip?.height;
        if (!commit || height === undefined) continue;
        ops.push({ _tag: 'CommitConfirmed', commit, height, at: now });
        forgetPending(address, commit.txid);
      }
      yield* state.count('confirmed', ops.length);
      return ops;
    });

  /** Order matters: a replacement links before its predecessor's removal. */
  const onAddress = (address: string, txs: AddressTransactions, now: number) =>
    Effect.gen(function* () {
      const ops = [
        ...(yield* onMempoolTxs(address, txs.mempool ?? [], now)),
        ...(yield* onRemovedTxs(address, txs.removed ?? [], now)),
        ...(yield* onConfirmedTxs(address, txs.confirmed ?? [], now)),
      ];
      yield* outbox.enqueueWrites(ops);
    });

  const handleMessage = Effect.fn('MinerCommits.handleMessage')(function* (
    msg: WsMessage,
    now: number
  ) {
    if (msg.blocks?.length) yield* onRecentBlocks(msg.blocks);
    if (msg.block) yield* onNewBlock(msg.block, now);
    const ladder = msg['mempool-blocks'];
    if (ladder) yield* Ref.set(state.mempoolBlocks, ladder);
    for (const [address, txs] of Object.entries(
      msg['multi-address-transactions'] ?? {}
    )) {
      yield* onAddress(address, txs, now);
    }
    const trackError = msg['track-addresses-error'];
    if (trackError) {
      yield* Effect.logWarning('mempool.space rejected track-addresses').pipe(
        Effect.annotateLogs({ error: trackError })
      );
    }
  });

  /** Pending commits broadcast before we were watching (startup, reconnect, new miner). */
  const seedAddress = Effect.fn('MinerCommits.seedAddress')(
    function* (address: string) {
      const txs = yield* api.addressMempool(address);
      const commits = txs.flatMap((tx) => toCommit(tx) ?? []);
      const fresh = commits.filter((c) => state.markSeen(c.txid));
      if (fresh.length === 0) return;
      const times = yield* api
        .transactionTimes(fresh.map((c) => c.txid))
        .pipe(Effect.orElseSucceed((): readonly number[] => []));
      yield* outbox.enqueueWrites(
        fresh.map((commit, i): WriteOp => {
          const seconds = times[i] ?? 0;
          return seconds > 0
            ? {
                _tag: 'CommitSeen',
                commit,
                seenAt: seconds * 1000,
                source: 'mempool_space',
              }
            : { _tag: 'CommitSeen', commit, seenAt: null, source: null };
        })
      );
      const latest = fresh.reduce((a, b) =>
        b.parentHeight > a.parentHeight ? b : a
      );
      state.pending.set(address, latest);
    },
    (effect, address) =>
      effect.pipe(
        Effect.tapError((error) =>
          Effect.logWarning('Seeding pending commits failed').pipe(
            Effect.annotateLogs({ address, error: error.message })
          )
        ),
        Effect.ignore
      )
  );

  /** DB first; the last list we stored if the DB is unavailable. */
  const loadTrackedMiners = store.trackedMiners().pipe(
    Effect.tap((miners) =>
      outbox.setMeta(META_TRACKED_MINERS, JSON.stringify(miners))
    ),
    Effect.catch((error) =>
      Effect.gen(function* () {
        const cached = yield* outbox.getMeta(META_TRACKED_MINERS);
        if (!cached) return yield* error;
        yield* Effect.logWarning('Using cached tracked miners').pipe(
          Effect.annotateLogs({ error: error.message })
        );
        return yield* Schema.decodeUnknownEffect(TrackedMinersJson)(cached);
      })
    )
  );

  const trackMiners = (writer: Socket.Writer) =>
    Effect.gen(function* () {
      let subscribed = new Set<string>();
      const refresh = Effect.gen(function* () {
        const miners = yield* loadTrackedMiners;
        const addresses = new Set(miners.map((m) => m.btcAddress));
        const added = [...addresses].filter((a) => !subscribed.has(a));
        if (added.length > 0 || addresses.size !== subscribed.size) {
          yield* writer.write(
            JSON.stringify({ 'track-addresses': [...addresses].sort() })
          );
          subscribed = addresses;
          yield* Ref.update(state.status, (s) => ({
            ...s,
            trackedMiners: addresses.size,
          }));
          yield* Effect.logInfo('Tracking miner addresses').pipe(
            Effect.annotateLogs({ count: addresses.size, added })
          );
        }
        yield* Effect.forEach(added, seedAddress, {
          concurrency: 3,
          discard: true,
        });
      });
      for (;;) {
        const ok = yield* refresh.pipe(
          Effect.as(true),
          Effect.catch((error) =>
            Effect.gen(function* () {
              yield* state.recordError('trackMiners', error);
              yield* Effect.logError('Refreshing tracked miners failed').pipe(
                Effect.annotateLogs({ error: error.message })
              );
              return false;
            })
          )
        );
        yield* ok
          ? Effect.race(
              Effect.sleep(TRACKED_REFRESH),
              state.trackedRefreshRequested
            )
          : Effect.sleep(TRACKED_RETRY);
      }
    });

  const snapshotLoop = Effect.gen(function* () {
    const { tip, lastMessageAt } = yield* Ref.get(state.status);
    const now = Date.now();
    // Don't persist a frozen ladder from a quiet socket.
    if (lastMessageAt && now - lastMessageAt < 30_000) {
      yield* snapshot(now, tip?.height);
    }
  }).pipe(Effect.repeat(Schedule.spaced(SNAPSHOT_INTERVAL)));

  const session = Effect.gen(function* () {
    const socket = yield* Socket.fromWebSocket(
      openWorkersWebSocket(MEMPOOL_WS_URL),
      { openTimeout: '15 seconds' }
    );
    const reader = yield* socket.reader;
    const writer = yield* socket.writer;
    const openedAt = Date.now();
    yield* writer.write(
      JSON.stringify({ action: 'want', data: ['blocks', 'mempool-blocks'] })
    );
    state.pending.clear();
    yield* Ref.update(state.status, (s) => ({ ...s, connectedAt: openedAt }));
    yield* state.count('connects');
    yield* Effect.logInfo('Connected to mempool.space WebSocket');
    yield* Effect.forkScoped(trackMiners(writer));
    yield* Effect.forkScoped(snapshotLoop);

    const readLoop = Effect.gen(function* () {
      for (;;) {
        const frames = yield* reader.pull.pipe(
          Effect.timeoutOrElse({
            duration: WATCHDOG,
            orElse: () =>
              Effect.fail(
                new WatcherStalled({ message: `no messages for ${WATCHDOG}` })
              ),
          })
        );
        const now = Date.now();
        yield* Ref.update(state.status, (s) => ({ ...s, lastMessageAt: now }));
        yield* state.count('messages', frames.length);
        for (const frame of frames) {
          const text =
            typeof frame === 'string' ? frame : textDecoder.decode(frame);
          yield* decodeMessage(text).pipe(
            Effect.flatMap((msg) => handleMessage(msg, now)),
            Effect.catchTag('SchemaError', (error) =>
              Effect.logWarning('Undecodable WebSocket message').pipe(
                Effect.annotateLogs({
                  error: error.message.slice(0, 500),
                  sample: text.slice(0, 200),
                })
              )
            )
          );
        }
      }
    });

    // A long healthy session ending is normal churn: succeed so the outer
    // repeat reconnects at once and the backoff starts over.
    return yield* readLoop.pipe(
      Effect.catch((error) =>
        Date.now() - openedAt > HEALTHY_SESSION_MS
          ? Effect.logWarning('WebSocket session ended').pipe(
              Effect.annotateLogs({ error: error.message })
            )
          : Effect.fail(error)
      )
    );
  }).pipe(
    Effect.scoped,
    Effect.ensuring(
      Ref.update(state.status, (s) => ({ ...s, connectedAt: null }))
    )
  );

  return yield* session.pipe(
    Effect.tapError((error) =>
      Effect.all([
        state.recordError('websocket', error),
        Effect.logError('WebSocket session failed').pipe(
          Effect.annotateLogs({ error: error.message })
        ),
      ])
    ),
    Effect.retry(reconnectBackoff),
    Effect.repeat(Schedule.spaced('1 second')),
    Effect.andThen(Effect.never)
  );
});
