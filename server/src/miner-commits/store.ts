import { Context, Effect, Layer, Schema } from 'effect';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { makeDb, type Db } from '../db/db';
import {
  bitcoinBlocks,
  type FirstSeenSource,
  mempoolFeeSnapshots,
  minerCommitTxs,
  minerSpends,
} from '../db/schema';
import { minerAddressFromPublicKey } from '../bitcoin';
import { uuidAtTime } from '../utils';
import { type Commit, WriteOp } from './ops';

export const NETWORK_KEY = 'mainnet';
/** Miners with a confirmed commit in this many recent burn blocks are tracked. */
const TRACKED_BLOCKS = 12;
const QUERY_TIMEOUT = '30 seconds';

const TrackedMiner = Schema.Struct({
  btcAddress: Schema.String,
  publicKey: Schema.NullOr(Schema.String),
  minerAddress: Schema.NullOr(Schema.String),
});
export type TrackedMiner = typeof TrackedMiner.Type;
export const TrackedMinersJson = Schema.fromJsonString(
  Schema.Array(TrackedMiner)
);

/** Couldn't connect (or timed out): retry the whole batch later. */
export class StoreUnavailable extends Schema.TaggedError<StoreUnavailable>()(
  '@errors/StoreUnavailable',
  { message: Schema.String }
) {}

/** A statement failed: possibly a bad op, so isolate it. */
export class StoreError extends Schema.TaggedError<StoreError>()(
  '@errors/StoreError',
  { operation: Schema.String, message: Schema.String }
) {}

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const toDate = (ms: number | null) => (ms === null ? null : new Date(ms));

function commitColumns(c: Commit) {
  return {
    networkKey: NETWORK_KEY,
    txid: c.txid,
    chainInput: c.chainInput,
    minerBtcAddress: c.btcAddress,
    minerPublicKey: c.minerPublicKey,
    minerAddress: c.minerPublicKey
      ? minerAddressFromPublicKey(c.minerPublicKey, NETWORK_KEY)
      : null,
    bidSats: c.bidSats,
    feeSats: c.feeSats,
    vsize: c.vsize,
    feeRate: c.feeRate,
    parentHeight: c.parentHeight,
    parentVtx: c.parentVtx,
    burnModulus: c.modulus,
  };
}

/**
 * Insert a commit version, or fill gaps on an existing row. An existing
 * first-seen time always wins, so replays and seeds never overwrite the
 * WebSocket's timestamp. Returns true if the row is new.
 */
async function upsertCommit(
  tx: Tx,
  commit: Commit,
  firstSeenAt: Date | null,
  source: FirstSeenSource | null
) {
  const [row] = await tx
    .insert(minerCommitTxs)
    .values({
      id: uuidAtTime(firstSeenAt ?? new Date()),
      ...commitColumns(commit),
      firstSeenAt,
      firstSeenSource: firstSeenAt ? source : null,
      status: 'pending',
    })
    .onConflictDoUpdate({
      target: [minerCommitTxs.networkKey, minerCommitTxs.txid],
      set: {
        firstSeenAt: sql`coalesce(miner_commit_txs.first_seen_at, excluded.first_seen_at)`,
        firstSeenSource: sql`case when miner_commit_txs.first_seen_at is null then excluded.first_seen_source else miner_commit_txs.first_seen_source end`,
        minerPublicKey: sql`coalesce(miner_commit_txs.miner_public_key, excluded.miner_public_key)`,
        minerAddress: sql`coalesce(miner_commit_txs.miner_address, excluded.miner_address)`,
      },
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return row?.inserted === true;
}

/**
 * Link a newly inserted version after the latest existing version of its
 * chain, and mark that one replaced. Only call for the newest version: the
 * reconcile rewrites whole chains from mempool.space's RBF tree.
 */
async function linkToChain(tx: Tx, commit: Commit, at: Date | null) {
  await tx.execute(sql`
    with prev as (
      select txid, chain_position from miner_commit_txs
      where network_key = ${NETWORK_KEY}
        and chain_input = ${commit.chainInput}
        and txid <> ${commit.txid}
      order by chain_position desc, first_seen_at desc nulls last
      limit 1
    ), me as (
      update miner_commit_txs m
      set replaces_txid = prev.txid, chain_position = prev.chain_position + 1
      from prev
      where m.network_key = ${NETWORK_KEY} and m.txid = ${commit.txid}
    )
    update miner_commit_txs p
    set replaced_by_txid = ${commit.txid},
      status = case when p.status in ('pending', 'dropped') then 'replaced' else p.status end,
      left_mempool_at = coalesce(p.left_mempool_at, ${at}::timestamptz)
    from prev
    where p.network_key = ${NETWORK_KEY} and p.txid = prev.txid`);
}

/** Once a version confirms, every other version of its chain was replaced. */
async function replaceSiblings(
  tx: Tx,
  commit: Commit | string,
  at: Date | null
) {
  const txid = typeof commit === 'string' ? commit : commit.txid;
  await tx
    .update(minerCommitTxs)
    .set({
      status: 'replaced',
      leftMempoolAt: sql`coalesce(left_mempool_at, ${at}::timestamptz)`,
    })
    .where(
      and(
        eq(minerCommitTxs.networkKey, NETWORK_KEY),
        eq(
          minerCommitTxs.chainInput,
          sql`(select chain_input from miner_commit_txs where network_key = ${NETWORK_KEY} and txid = ${txid})`
        ),
        ne(minerCommitTxs.txid, txid),
        inArray(minerCommitTxs.status, ['pending', 'dropped'])
      )
    );
}

const byTxid = (txid: string) =>
  and(
    eq(minerCommitTxs.networkKey, NETWORK_KEY),
    eq(minerCommitTxs.txid, txid)
  );

type OpOf<T extends WriteOp['_tag']> = Extract<WriteOp, { _tag: T }>;

async function applyCommitSeen(tx: Tx, op: OpOf<'CommitSeen'>) {
  const seenAt = toDate(op.seenAt);
  if (await upsertCommit(tx, op.commit, seenAt, op.source)) {
    await linkToChain(tx, op.commit, seenAt);
  }
}

async function applyCommitConfirmed(tx: Tx, op: OpOf<'CommitConfirmed'>) {
  const at = new Date(op.at);
  if (await upsertCommit(tx, op.commit, null, null)) {
    await linkToChain(tx, op.commit, null);
  }
  await tx
    .update(minerCommitTxs)
    .set({
      status: 'confirmed',
      confirmedHeight: op.height,
      leftMempoolAt: sql`coalesce(left_mempool_at, ${at}::timestamptz)`,
    })
    .where(byTxid(op.commit.txid));
  await replaceSiblings(tx, op.commit, at);
}

async function applyCommitDropped(tx: Tx, op: OpOf<'CommitDropped'>) {
  await tx
    .update(minerCommitTxs)
    .set({ status: 'dropped', leftMempoolAt: new Date(op.at) })
    .where(and(byTxid(op.txid), eq(minerCommitTxs.status, 'pending')));
}

/** mempool.space's tree is authoritative for links, positions and statuses. */
async function applyChainReconciled(tx: Tx, op: OpOf<'ChainReconciled'>) {
  const { versions } = op;
  const now = new Date();
  for (const [i, v] of versions.entries()) {
    const last = i === versions.length - 1;
    const firstSeen = toDate(v.firstSeenAt);
    const nextSeen = toDate(versions[i + 1]?.firstSeenAt ?? null);
    if (v.commit) {
      await upsertCommit(tx, v.commit, firstSeen, 'mempool_space');
    }
    await tx
      .update(minerCommitTxs)
      .set({
        // A single version keeps whatever links the live path made.
        ...(versions.length > 1 && {
          chainPosition: i,
          replacesTxid: versions[i - 1]?.txid ?? null,
          replacedByTxid: versions[i + 1]?.txid ?? null,
        }),
        status: last ? 'confirmed' : 'replaced',
        confirmedHeight: last ? op.height : null,
        fullRbf: v.fullRbf ?? sql`full_rbf`,
        reconciledAt: now,
        firstSeenAt: sql`coalesce(first_seen_at, ${firstSeen}::timestamptz)`,
        firstSeenSource: sql`case when first_seen_at is null and ${firstSeen}::timestamptz is not null then 'mempool_space' else first_seen_source end`,
        leftMempoolAt: sql`coalesce(left_mempool_at, ${nextSeen}::timestamptz)`,
      })
      .where(byTxid(v.txid));
    if (last) await replaceSiblings(tx, v.txid, null);
  }
}

async function applyBlockSeen(tx: Tx, op: OpOf<'BlockSeen'>) {
  const fees = {
    medianFeeRate: op.medianFee,
    feeRange: op.feeRange ? [...op.feeRange] : null,
    totalFeesSats: op.totalFees,
    txCount: op.txCount,
    weight: op.weight,
    poolName: op.poolName,
  };
  await tx
    .insert(bitcoinBlocks)
    .values({
      networkKey: NETWORK_KEY,
      burnBlockHash: op.hash,
      burnBlockHeight: op.height,
      headerTimestamp: new Date(op.timestamp * 1000),
      observedAt: toDate(op.observedAt),
      ...fees,
    })
    .onConflictDoUpdate({
      target: [bitcoinBlocks.networkKey, bitcoinBlocks.burnBlockHash],
      set: {
        ...fees,
        headerTimestamp: new Date(op.timestamp * 1000),
        observedAt: sql`coalesce(bitcoin_blocks.observed_at, excluded.observed_at)`,
        fetchedAt: sql`now()`,
      },
    });
}

async function applySortition(tx: Tx, op: OpOf<'Sortition'>) {
  const sortition = {
    wasSortition: op.wasSortition,
    sortitionMinerPkHash160: op.minerPkHash160,
  };
  await tx
    .insert(bitcoinBlocks)
    .values({
      networkKey: NETWORK_KEY,
      burnBlockHash: op.hash,
      burnBlockHeight: op.height,
      ...sortition,
    })
    .onConflictDoUpdate({
      target: [bitcoinBlocks.networkKey, bitcoinBlocks.burnBlockHash],
      set: sortition,
    });
}

async function applyFeeSnapshot(tx: Tx, op: OpOf<'FeeSnapshot'>) {
  await tx
    .insert(mempoolFeeSnapshots)
    .values({
      networkKey: NETWORK_KEY,
      observedAt: new Date(op.observedAt),
      tipHeight: op.tipHeight,
      nextMedianFeeRate: op.nextMedianFee,
      nextFeeRange: [...op.nextFeeRange],
      nextBlockVsize: Math.round(op.nextBlockVsize),
      secondMinFeeRate: op.secondMinFee,
    })
    .onConflictDoNothing();
}

const applyOp = (tx: Tx, op: WriteOp): Promise<void> =>
  WriteOp.match(op, {
    CommitSeen: (o) => applyCommitSeen(tx, o),
    CommitConfirmed: (o) => applyCommitConfirmed(tx, o),
    CommitDropped: (o) => applyCommitDropped(tx, o),
    ChainReconciled: (o) => applyChainReconciled(tx, o),
    BlockSeen: (o) => applyBlockSeen(tx, o),
    Sortition: (o) => applySortition(tx, o),
    FeeSnapshot: (o) => applyFeeSnapshot(tx, o),
  });

export class CommitStore extends Context.Service<
  CommitStore,
  {
    /** Apply ops in order, in one transaction. */
    apply(
      ops: readonly WriteOp[]
    ): Effect.Effect<void, StoreUnavailable | StoreError>;
    /** Apply each op in its own transaction; the error message per failed op. */
    applyEach(
      ops: readonly WriteOp[]
    ): Effect.Effect<readonly (string | null)[], StoreUnavailable | StoreError>;
    trackedMiners(): Effect.Effect<
      readonly TrackedMiner[],
      StoreUnavailable | StoreError
    >;
    /** Commit txids `miner_spends` has for a burn height (from `/new_burn_block`). */
    confirmedCommitTxids(
      height: number
    ): Effect.Effect<readonly string[], StoreUnavailable | StoreError>;
    knownTxids(
      txids: readonly string[]
    ): Effect.Effect<ReadonlySet<string>, StoreUnavailable | StoreError>;
  }
>()('@app/miner-commits/CommitStore') {}

/** One short-lived connection per call; Hyperdrive pools the real ones. */
const withDb = <A>(operation: string, f: (db: Db) => Promise<A>) =>
  Effect.acquireUseRelease(
    Effect.tryPromise({
      try: async () => {
        const db = makeDb();
        await db.$client.connect();
        return db;
      },
      catch: (cause) =>
        new StoreUnavailable({ message: `connect: ${errorMessage(cause)}` }),
    }),
    (db) =>
      Effect.tryPromise({
        try: () => f(db),
        catch: (cause) =>
          new StoreError({ operation, message: errorMessage(cause) }),
      }),
    (db) => Effect.promise(() => db.$client.end().catch(() => undefined))
  ).pipe(
    Effect.timeoutOrElse({
      duration: QUERY_TIMEOUT,
      orElse: () =>
        Effect.fail(
          new StoreUnavailable({ message: `${operation} timed out` })
        ),
    })
  );

export const CommitStoreLive = Layer.succeed(
  CommitStore,
  CommitStore.of({
    apply: (ops) =>
      withDb('apply', (db) =>
        db.transaction(async (tx) => {
          for (const op of ops) await applyOp(tx, op);
        })
      ),

    applyEach: (ops) =>
      withDb('applyEach', async (db) => {
        const results: (string | null)[] = [];
        for (const op of ops) {
          try {
            await db.transaction((tx) => applyOp(tx, op));
            results.push(null);
          } catch (error) {
            results.push(errorMessage(error));
          }
        }
        return results;
      }),

    trackedMiners: () =>
      withDb('trackedMiners', async (db) => {
        const result = await db.execute<{
          btcAddress: string;
          publicKey: string | null;
          minerAddress: string | null;
        }>(sql`
          select distinct on (miner_btc_address)
            miner_btc_address as "btcAddress",
            miner_public_key as "publicKey",
            miner_address as "minerAddress"
          from miner_spends
          where network_key = ${NETWORK_KEY}
            and miner_btc_address is not null
            and burn_block_height > (
              select max(burn_block_height) from miner_spends
              where network_key = ${NETWORK_KEY}
            ) - ${TRACKED_BLOCKS}
          order by miner_btc_address, burn_block_height desc`);
        return result.rows;
      }),

    confirmedCommitTxids: (height) =>
      withDb('confirmedCommitTxids', async (db) => {
        const rows = await db
          .select({ txid: minerSpends.txid })
          .from(minerSpends)
          .where(
            and(
              eq(minerSpends.networkKey, NETWORK_KEY),
              eq(minerSpends.burnBlockHeight, height)
            )
          );
        return rows.map((r) => r.txid);
      }),

    knownTxids: (txids) =>
      txids.length === 0
        ? Effect.succeed(new Set<string>())
        : withDb('knownTxids', async (db) => {
            const rows = await db
              .select({ txid: minerCommitTxs.txid })
              .from(minerCommitTxs)
              .where(
                and(
                  eq(minerCommitTxs.networkKey, NETWORK_KEY),
                  inArray(minerCommitTxs.txid, [...txids])
                )
              );
            return new Set(rows.map((r) => r.txid));
          }),
  })
);
