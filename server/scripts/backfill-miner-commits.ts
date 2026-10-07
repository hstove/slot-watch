/**
 * Backfill `miner_commit_txs`, `bitcoin_blocks` and `mempool_fee_snapshots`
 * from the miner-commit logger's JSONL files (`log-miner-commits.ts`), for the
 * time before the `MinerCommitsWatcher` Durable Object went live.
 *
 * Usage (from repo root):
 *   bun run --cwd server --env-file=../.env.local scripts/backfill-miner-commits.ts \
 *     [--dry-run] [--only commits,blocks,snapshots] [--cutoff <iso>] [files...]
 *
 * Files are streamed in order. Each later file only contributes events after
 * the previous files' last `t` (the `combined.jsonl` merge rule), so pass the
 * first session file then the live one (the default), or `combined.jsonl` then
 * the live one.
 *
 * - commits: one row per tx version, chained by first input in order of first
 *   appearance. `first_seen_at` is the logger's live sighting (source
 *   `logger`); seeded and confirmed-only versions get null. Confirmations come
 *   from `miner_spends`, then the logger. Chains first seen after the cutoff
 *   (default: the watcher's first fee snapshot) or already in the DB belong to
 *   the watcher and are skipped. Instead, the overlap is diffed against the DB.
 * - blocks: mempool.space stats and Hiro sortitions for every height the log
 *   covers, plus `observed_at` from the logger's `block` events.
 * - snapshots: `fee_snapshot` events before the cutoff.
 *
 * Rows the watcher wrote are never overwritten (inserts skip conflicts,
 * block columns only fill nulls), so re-running is safe.
 */
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { and, eq, gte, inArray, lte, min, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { ESPLORA_HOSTS, minerAddressFromPublicKey } from '../src/bitcoin';
import * as schema from '../src/db/schema';
import {
  bitcoinBlocks,
  mempoolFeeSnapshots,
  minerCommitTxs,
  minerSpends,
} from '../src/db/schema';

const NETWORK_KEY = 'mainnet';
const LOG_DIR = resolve(import.meta.dir, '../../tmp/miner-commits');
const DEFAULT_FILES = [
  `${LOG_DIR}/2026-09-28T17-11-06-976Z.jsonl`,
  `${LOG_DIR}/2026-09-28T23-08-53-385Z.jsonl`,
];
/** No events (snapshots come every 30s) for this long is a coverage hole. */
const SILENT_GAP_MS = 90_000;
/** A chain still pending this long before the log ends never confirmed. */
const ABANDONED_MS = 60 * 60_000;
const HIRO_API_URL = 'https://api.hiro.so';
const MEMPOOL_HOSTS = ESPLORA_HOSTS.slice(0, 2);
const STEPS = ['commits', 'blocks', 'snapshots'] as const;

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'dry-run': { type: 'boolean', default: false },
    only: { type: 'string' },
    cutoff: { type: 'string' },
  },
});
const dryRun = args['dry-run'] ?? false;
const steps = new Set(args.only?.split(',') ?? STEPS);
const files = positionals.length > 0 ? positionals : DEFAULT_FILES;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  keepAlive: true,
});
await client.connect();
const db = drizzle(client, { schema });

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const iso = (ms: number) => new Date(ms).toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------- log events ----------

interface LogCommit {
  btcAddress: string;
  publicKey?: string;
  stxAddress?: string | null;
  txid: string;
  input: string;
  bidSats: number;
  feeSats: number;
  vsize: number;
  parentHeight: number;
  parentVtx: number;
  modulus: number;
  seenAt: number;
}

interface LogMempoolBlock {
  medianFee: number;
  feeRange: number[];
  blockVSize: number;
}

interface LogEvent {
  t: number;
  type: string;
  commit?: LogCommit;
  previous?: LogCommit;
  height?: number | null;
  hash?: string;
  blockTimestamp?: number;
  tip?: number | null;
  mempoolBlocks?: LogMempoolBlock[];
}

/** Events from all files, applying the merge rule. */
async function* readEvents() {
  let last = Number.NEGATIVE_INFINITY;
  for (const file of files) {
    const floor = last;
    let kept = 0;
    let bad = 0;
    const lines = createInterface({
      input: createReadStream(file),
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    for await (const line of lines) {
      if (!line) continue;
      let event: LogEvent;
      try {
        event = JSON.parse(line);
      } catch {
        // The live file's last line can be mid-write.
        bad++;
        continue;
      }
      if (event.t <= floor) continue;
      last = Math.max(last, event.t);
      kept++;
      yield event;
    }
    log(`read ${file}: ${kept} events${bad ? `, ${bad} unparseable` : ''}`);
  }
}

// ---------- cutoff ----------

const [firstSnapshot] = await db
  .select({ at: min(mempoolFeeSnapshots.observedAt) })
  .from(mempoolFeeSnapshots)
  .where(eq(mempoolFeeSnapshots.networkKey, NETWORK_KEY));
const cutoffDate = args.cutoff
  ? new Date(args.cutoff)
  : (firstSnapshot?.at ?? null);
if (!cutoffDate || Number.isNaN(cutoffDate.getTime())) {
  throw new Error('No --cutoff and no watcher snapshots to derive one from');
}
const cutoff = cutoffDate.getTime();
log(`cutoff ${iso(cutoff)} dryRun=${dryRun} steps=${[...steps].join(',')}`);

// ---------- pass over the log ----------

interface Version {
  commit: LogCommit;
  /** First event that mentions it. */
  appearedAt: number;
  /** Live mempool sighting (commit_new / commit_rbf); null if seeded or only seen confirmed. */
  seenAt: number | null;
  confirmedHeight: number | null;
  confirmedAt: number | null;
  droppedAt: number | null;
}

interface LoggedBlock {
  hash: string;
  height: number;
  timestamp: number;
  observedAt: number;
}

interface Gap {
  from: number;
  to: number;
  reason: string;
}

const versions = new Map<string, Version>();
const chains = new Map<string, Version[]>();
const loggedBlocks = new Map<string, LoggedBlock>();
const snapshots: (typeof mempoolFeeSnapshots.$inferInsert)[] = [];
const gaps: Gap[] = [];
let firstT: number | null = null;
let lastT: number | null = null;
let closedAt: number | null = null;

function see(commit: LogCommit, t: number, seenAt: number | null) {
  const existing = versions.get(commit.txid);
  if (existing) {
    existing.seenAt ??= seenAt;
    return existing;
  }
  const version: Version = {
    commit,
    appearedAt: t,
    seenAt,
    confirmedHeight: null,
    confirmedAt: null,
    droppedAt: null,
  };
  versions.set(commit.txid, version);
  const chain = chains.get(commit.input) ?? [];
  chain.push(version);
  chains.set(commit.input, chain);
  return version;
}

function onSnapshot(event: LogEvent) {
  const [next, second] = event.mempoolBlocks ?? [];
  if (event.t >= cutoff || !next || event.tip == null) return;
  snapshots.push({
    networkKey: NETWORK_KEY,
    observedAt: new Date(event.t),
    tipHeight: event.tip,
    nextMedianFeeRate: next.medianFee,
    nextFeeRange: next.feeRange,
    nextBlockVsize: Math.round(next.blockVSize),
    secondMinFeeRate: second?.feeRange[0] ?? null,
  });
}

function onCoverage(event: LogEvent) {
  if (lastT !== null && event.t - lastT > SILENT_GAP_MS) {
    gaps.push({ from: lastT, to: event.t, reason: 'no events' });
  }
  firstT ??= event.t;
  lastT = event.t;
  if (event.type === 'ws_close') closedAt = event.t;
  if (event.type === 'ws_open' && closedAt !== null) {
    gaps.push({ from: closedAt, to: event.t, reason: 'ws_close' });
    closedAt = null;
  }
}

function onCommit(event: LogEvent, commit: LogCommit) {
  const { t } = event;
  switch (event.type) {
    case 'commit_seed':
      see(commit, t, null);
      break;
    case 'commit_new':
      see(commit, t, commit.seenAt);
      break;
    case 'commit_rbf':
      if (event.previous) see(event.previous, t, null);
      see(commit, t, commit.seenAt);
      break;
    case 'commit_dropped':
      see(commit, t, null).droppedAt ??= t;
      break;
    case 'commit_confirmed': {
      const version = see(commit, t, null);
      version.confirmedHeight ??= event.height ?? null;
      version.confirmedAt ??= t;
      break;
    }
    default:
  }
}

function onBlock({ hash, height, blockTimestamp, t }: LogEvent) {
  if (!hash || height == null || !blockTimestamp || loggedBlocks.has(hash)) {
    return;
  }
  loggedBlocks.set(hash, {
    hash,
    height,
    timestamp: blockTimestamp,
    observedAt: t,
  });
}

function onEvent(event: LogEvent) {
  onCoverage(event);
  if (event.commit) onCommit(event, event.commit);
  else if (event.type === 'block') onBlock(event);
  else if (event.type === 'fee_snapshot') onSnapshot(event);
}

for await (const event of readEvents()) onEvent(event);
if (firstT === null || lastT === null) throw new Error('No events in the log');
const logEnd = lastT;
log(
  `log ${iso(firstT)} → ${iso(logEnd)}: ${versions.size} commit versions in ${chains.size} chains, ${loggedBlocks.size} blocks, ${snapshots.length} snapshots before the cutoff`
);

console.log(
  '\nCoverage holes (commits broadcast and replaced inside these were not seen live):'
);
for (const gap of gaps) {
  console.log(
    `  ${iso(gap.from)} → ${iso(gap.to)}  ${((gap.to - gap.from) / 1000).toFixed(1)}s  ${gap.reason}`
  );
}
console.log();

// ---------- commits ----------

interface Spend {
  height: number;
  publicKey: string | null;
  minerAddress: string | null;
}

async function loadSpends(txids: readonly string[]) {
  const spends = new Map<string, Spend>();
  /** The latest known key per BTC address, for chains that never confirmed. */
  const keys = new Map<string, string>();
  for (const batch of chunk(txids, 1000)) {
    const rows = await db
      .select({
        txid: minerSpends.txid,
        height: minerSpends.burnBlockHeight,
        publicKey: minerSpends.minerPublicKey,
        minerAddress: minerSpends.minerAddress,
        btcAddress: minerSpends.minerBtcAddress,
      })
      .from(minerSpends)
      .where(
        and(
          eq(minerSpends.networkKey, NETWORK_KEY),
          inArray(minerSpends.txid, batch)
        )
      );
    for (const row of rows) {
      spends.set(row.txid, row);
      if (row.btcAddress && row.publicKey) {
        keys.set(row.btcAddress, row.publicKey);
      }
    }
  }
  return { spends, keys };
}

type CommitRow = typeof minerCommitTxs.$inferSelect;

async function loadExisting(
  txids: readonly string[],
  inputs: readonly string[]
) {
  const rows = new Map<string, CommitRow>();
  const chainInputs = new Set<string>();
  for (const batch of chunk(txids, 1000)) {
    const found = await db
      .select()
      .from(minerCommitTxs)
      .where(
        and(
          eq(minerCommitTxs.networkKey, NETWORK_KEY),
          inArray(minerCommitTxs.txid, batch)
        )
      );
    for (const row of found) rows.set(row.txid, row);
  }
  for (const batch of chunk(inputs, 1000)) {
    const found = await db
      .selectDistinct({ chainInput: minerCommitTxs.chainInput })
      .from(minerCommitTxs)
      .where(
        and(
          eq(minerCommitTxs.networkKey, NETWORK_KEY),
          inArray(minerCommitTxs.chainInput, batch)
        )
      );
    for (const row of found) chainInputs.add(row.chainInput);
  }
  return { rows, chainInputs };
}

/** Logger vs watcher for chains first seen after the cutoff. */
function diffOverlap(existing: Map<string, CommitRow>) {
  const overlap = [...versions.values()].filter((v) => v.appearedAt >= cutoff);
  const missing = overlap.filter((v) => !existing.has(v.commit.txid));
  const deltas: number[] = [];
  let linkMismatches = 0;
  for (const v of overlap) {
    const row = existing.get(v.commit.txid);
    if (!row) continue;
    if (v.seenAt !== null && row.firstSeenAt && row.firstSeenSource === 'ws') {
      deltas.push(Math.abs(row.firstSeenAt.getTime() - v.seenAt));
    }
    const chain = chains.get(v.commit.input) ?? [];
    const previous = chain[chain.indexOf(v) - 1];
    if (previous && row.replacesTxid !== previous.commit.txid) {
      linkMismatches++;
    }
  }
  deltas.sort((a, b) => a - b);
  const pct = (p: number) =>
    deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * p))] ?? 0;
  log(
    `overlap since cutoff: ${overlap.length} logger versions, ${overlap.length - missing.length} in DB, ${missing.length} missing, ${linkMismatches} link mismatches`
  );
  if (deltas.length > 0) {
    log(
      `  first_seen_at |logger - ws|: n=${deltas.length} median=${pct(0.5)}ms p95=${pct(0.95)}ms max=${pct(1)}ms`
    );
  }
  for (const v of missing.slice(0, 20)) {
    log(
      `  missing ${v.commit.txid} ${v.commit.stxAddress ?? v.commit.btcAddress} appeared ${iso(v.appearedAt)}`
    );
  }
}

interface ChainContext {
  spends: Map<string, Spend>;
  keys: Map<string, string>;
  blockObservedAt: Map<number, number>;
}

type CommitInsert = typeof minerCommitTxs.$inferInsert;

const heightOf = (v: Version, ctx: ChainContext) =>
  ctx.spends.get(v.commit.txid)?.height ?? v.confirmedHeight;

const confirmedAt = (v: Version, height: number, ctx: ChainContext) =>
  ctx.blockObservedAt.get(height) ?? v.confirmedAt;

/**
 * Status and mempool exit time for version `i`. A version after the confirmed
 * one is a late RBF the block beat: like the watcher, mark it replaced (the
 * confirmation evicted it).
 */
function outcome(chain: Version[], i: number, ctx: ChainContext) {
  const v = chain[i] as Version;
  const next = chain[i + 1];
  const height = heightOf(v, ctx);
  if (height !== null) {
    return {
      status: 'confirmed' as const,
      height,
      leftMempoolAt: confirmedAt(v, height, ctx),
    };
  }
  if (next) {
    return { status: 'replaced' as const, height, leftMempoolAt: next.seenAt };
  }
  const mined = chain.find((c) => heightOf(c, ctx) !== null);
  const minedHeight = mined ? heightOf(mined, ctx) : null;
  if (mined && minedHeight !== null) {
    const at = confirmedAt(mined, minedHeight, ctx);
    return {
      status: 'replaced' as const,
      height,
      leftMempoolAt: at !== null && at > v.appearedAt ? at : null,
    };
  }
  const abandoned = logEnd - v.appearedAt > ABANDONED_MS;
  return {
    status: v.droppedAt !== null || abandoned ? 'dropped' : 'pending',
    height,
    leftMempoolAt: v.droppedAt,
  } as const;
}

/** Rows for one chain, in order of first appearance. */
function chainRows(input: string, chain: Version[], ctx: ChainContext) {
  return chain.map((v, i): CommitInsert => {
    const { commit } = v;
    const { status, height, leftMempoolAt } = outcome(chain, i, ctx);
    const publicKey =
      ctx.spends.get(commit.txid)?.publicKey ??
      ctx.keys.get(commit.btcAddress) ??
      commit.publicKey ??
      null;
    return {
      id: uuidv7({ msecs: v.seenAt ?? v.appearedAt }),
      networkKey: NETWORK_KEY,
      txid: commit.txid,
      chainInput: input,
      replacesTxid: chain[i - 1]?.commit.txid ?? null,
      replacedByTxid: chain[i + 1]?.commit.txid ?? null,
      chainPosition: i,
      minerBtcAddress: commit.btcAddress,
      minerPublicKey: publicKey,
      minerAddress: publicKey
        ? minerAddressFromPublicKey(publicKey, NETWORK_KEY)
        : (commit.stxAddress ?? null),
      bidSats: commit.bidSats,
      feeSats: commit.feeSats,
      vsize: commit.vsize,
      feeRate: commit.feeSats / commit.vsize,
      parentHeight: commit.parentHeight,
      parentVtx: commit.parentVtx,
      burnModulus: commit.modulus,
      firstSeenAt: v.seenAt === null ? null : new Date(v.seenAt),
      firstSeenSource: v.seenAt === null ? null : 'logger',
      status,
      leftMempoolAt: leftMempoolAt === null ? null : new Date(leftMempoolAt),
      confirmedHeight: height,
    };
  });
}

function summarize(rows: readonly CommitInsert[], ctx: ChainContext) {
  const counts: Record<string, number> = {};
  const add = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };
  for (const row of rows) {
    add(`status:${row.status}`);
    if (row.firstSeenAt) add('seenLive');
    if (!row.minerPublicKey) add('noPublicKey');
    if (row.status !== 'confirmed') continue;
    if (!ctx.spends.has(row.txid)) add('confirmedByLoggerOnly');
    else if (versions.get(row.txid)?.confirmedHeight == null) {
      add('confirmedBySpendsOnly');
    }
    if (row.replacedByTxid) add('lateRbfLostToBlock');
  }
  return counts;
}

/** Chains the watcher hasn't written, first seen before the cutoff. */
function backfillableChains(existingInputs: ReadonlySet<string>) {
  const kept: [string, Version[]][] = [];
  let inDb = 0;
  let afterCutoff = 0;
  for (const [input, chain] of chains) {
    if (existingInputs.has(input)) inDb++;
    else if ((chain[0]?.appearedAt ?? cutoff) >= cutoff) afterCutoff++;
    else kept.push([input, chain]);
  }
  log(
    `chains: ${kept.length} to backfill, ${inDb} already in DB, ${afterCutoff} after the cutoff`
  );
  return kept;
}

async function backfillCommits() {
  const txids = [...versions.keys()];
  const { spends, keys } = await loadSpends(txids);
  const existing = await loadExisting(txids, [...chains.keys()]);
  diffOverlap(existing.rows);

  const blockObservedAt = new Map<number, number>();
  for (const block of loggedBlocks.values()) {
    if (!blockObservedAt.has(block.height)) {
      blockObservedAt.set(block.height, block.observedAt);
    }
  }
  const ctx: ChainContext = { spends, keys, blockObservedAt };
  const rows = backfillableChains(existing.chainInputs).flatMap(
    ([input, chain]) => chainRows(input, chain, ctx)
  );
  log(`commits: ${rows.length} rows`, summarize(rows, ctx));
  if (dryRun) return;

  let inserted = 0;
  await db.transaction(async (tx) => {
    for (const batch of chunk(rows, 500)) {
      const result = await tx
        .insert(minerCommitTxs)
        .values(batch)
        .onConflictDoNothing()
        .returning({ txid: minerCommitTxs.txid });
      inserted += result.length;
    }
  });
  log(`commits: inserted ${inserted} of ${rows.length}`);
}

// ---------- blocks ----------

interface BlockStats {
  id: string;
  height: number;
  timestamp: number;
  tx_count?: number;
  weight?: number;
  extras?: {
    medianFee?: number;
    feeRange?: number[];
    totalFees?: number;
    pool?: { name: string };
  };
}

interface Sortition {
  burn_block_hash: string;
  burn_block_height: number;
  was_sortition: boolean;
  miner_pk_hash160: string | null;
}

const strip0x = (hex: string) => (hex.startsWith('0x') ? hex.slice(2) : hex);

/** GET JSON with retries; null on 404. */
async function getJson<T>(
  urls: readonly string[],
  headers: Record<string, string> = {}
): Promise<T | null> {
  let lastError = '';
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = urls[attempt % urls.length] ?? '';
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 404) return null;
      if (res.ok) return (await res.json()) as T;
      lastError = `${res.status} ${(await res.text()).slice(0, 120)}`;
    } catch (error) {
      lastError = String(error);
    }
    await sleep(1000 * 2 ** attempt);
  }
  throw new Error(`${urls[0]}: ${lastError}`);
}

type BlockRow = typeof bitcoinBlocks.$inferInsert;

/** Rows keyed by hash: a stale block the logger saw gets its own row. */
class BlockRows {
  readonly rows = new Map<string, BlockRow>();

  merge(hash: string, height: number, values: Partial<BlockRow>) {
    const row = this.rows.get(hash) ?? {
      networkKey: NETWORK_KEY,
      burnBlockHash: hash,
      burnBlockHeight: height,
    };
    this.rows.set(hash, { ...row, ...values });
  }
}

/** Heights the log covers, and which of them lack stats or a sortition. */
async function blockHeights() {
  const heights = [...loggedBlocks.values()].map((b) => b.height);
  for (const v of versions.values()) {
    if (v.confirmedHeight !== null) heights.push(v.confirmedHeight);
  }
  const from = Math.min(...heights);
  const to = Math.max(...heights);
  const existing = await db
    .select({
      height: bitcoinBlocks.burnBlockHeight,
      hasStats: sql<boolean>`${bitcoinBlocks.medianFeeRate} is not null`,
      hasSortition: sql<boolean>`${bitcoinBlocks.wasSortition} is not null`,
    })
    .from(bitcoinBlocks)
    .where(
      and(
        eq(bitcoinBlocks.networkKey, NETWORK_KEY),
        gte(bitcoinBlocks.burnBlockHeight, from),
        lte(bitcoinBlocks.burnBlockHeight, to)
      )
    );
  const has = (key: 'hasStats' | 'hasSortition') =>
    new Set(existing.filter((b) => b[key]).map((b) => b.height));
  const withStats = has('hasStats');
  const withSortition = has('hasSortition');
  const all = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return {
    from,
    to,
    needStats: all.filter((h) => !withStats.has(h)),
    needSortition: all.filter((h) => !withSortition.has(h)),
  };
}

const statsColumns = (b: BlockStats): Partial<BlockRow> => ({
  headerTimestamp: new Date(b.timestamp * 1000),
  medianFeeRate: b.extras?.medianFee ?? null,
  feeRange: b.extras?.feeRange ?? null,
  totalFeesSats: b.extras?.totalFees ?? null,
  txCount: b.tx_count ?? null,
  weight: b.weight ?? null,
  poolName: b.extras?.pool?.name ?? null,
});

/** mempool.space block stats; `/v1/blocks/:h` returns h and the 14 below. */
async function fetchStats(needed: readonly number[], rows: BlockRows) {
  const pending = new Set(needed);
  const top = Math.max(...needed);
  const bottom = Math.min(...needed);
  for (let h = top; h >= bottom; h -= 15) {
    if (
      !Array.from({ length: 15 }, (_, i) => h - i).some((x) => pending.has(x))
    ) {
      continue;
    }
    const blocks = await getJson<BlockStats[]>(
      MEMPOOL_HOSTS.map((host) => `${host}/v1/blocks/${h}`)
    );
    for (const b of blocks ?? []) {
      if (pending.delete(b.height)) rows.merge(b.id, b.height, statsColumns(b));
    }
    await sleep(300);
  }
  log(
    `blocks: stats for ${needed.length - pending.size}, ${pending.size} missing`
  );
}

/** The node's sortition outcomes via Hiro, ~4 requests/s. */
async function fetchSortitions(needed: readonly number[], rows: BlockRows) {
  const headers: Record<string, string> = process.env.HIRO_API_KEY
    ? { 'x-api-key': process.env.HIRO_API_KEY }
    : {};
  let fetched = 0;
  for (const [i, batch] of chunk(needed, 4).entries()) {
    const results = await Promise.all(
      batch.map((h) =>
        getJson<Sortition[]>(
          [`${HIRO_API_URL}/v3/sortitions/burn_height/${h}`],
          headers
        )
      )
    );
    for (const s of results.map((r) => r?.[0])) {
      if (!s) continue;
      fetched++;
      rows.merge(strip0x(s.burn_block_hash), s.burn_block_height, {
        wasSortition: s.was_sortition,
        sortitionMinerPkHash160: s.miner_pk_hash160
          ? strip0x(s.miner_pk_hash160)
          : null,
      });
    }
    if (i % 50 === 49) log(`  sortitions ${fetched}/${needed.length}`);
    await sleep(1000);
  }
  log(`blocks: ${fetched} sortitions, ${needed.length - fetched} not found`);
}

/** Fill only missing columns, so the watcher's values win. */
const fillNull = (column: string) =>
  sql.raw(`coalesce(bitcoin_blocks.${column}, excluded.${column})`);

async function upsertBlocks(rows: readonly BlockRow[]) {
  const set = {
    headerTimestamp: fillNull('header_timestamp'),
    observedAt: fillNull('observed_at'),
    wasSortition: fillNull('was_sortition'),
    sortitionMinerPkHash160: fillNull('sortition_miner_pk_hash160'),
    medianFeeRate: fillNull('median_fee_rate'),
    feeRange: fillNull('fee_range'),
    totalFeesSats: fillNull('total_fees_sats'),
    txCount: fillNull('tx_count'),
    weight: fillNull('weight'),
    poolName: fillNull('pool_name'),
  };
  await db.transaction(async (tx) => {
    for (const batch of chunk(rows, 500)) {
      await tx
        .insert(bitcoinBlocks)
        .values(batch)
        .onConflictDoUpdate({
          target: [bitcoinBlocks.networkKey, bitcoinBlocks.burnBlockHash],
          set,
        });
    }
  });
  log(`blocks: upserted ${rows.length} rows`);
}

async function backfillBlocks() {
  const { from, to, needStats, needSortition } = await blockHeights();
  log(
    `blocks ${from}..${to}: ${needStats.length} need stats, ${needSortition.length} need sortitions, ${loggedBlocks.size} logged`
  );
  if (dryRun) return;

  const rows = new BlockRows();
  for (const block of loggedBlocks.values()) {
    rows.merge(block.hash, block.height, {
      headerTimestamp: new Date(block.timestamp * 1000),
      observedAt: new Date(block.observedAt),
    });
  }
  if (needStats.length > 0) await fetchStats(needStats, rows);
  if (needSortition.length > 0) await fetchSortitions(needSortition, rows);
  await upsertBlocks([...rows.rows.values()]);
}

// ---------- snapshots ----------

async function backfillSnapshots() {
  log(`snapshots: ${snapshots.length} rows before the cutoff`);
  if (dryRun) return;
  let inserted = 0;
  for (const batch of chunk(snapshots, 1000)) {
    const result = await db
      .insert(mempoolFeeSnapshots)
      .values(batch)
      .onConflictDoNothing()
      .returning({ at: mempoolFeeSnapshots.observedAt });
    inserted += result.length;
  }
  log(`snapshots: inserted ${inserted} of ${snapshots.length}`);
}

try {
  if (steps.has('commits')) await backfillCommits();
  if (steps.has('blocks')) await backfillBlocks();
  if (steps.has('snapshots')) await backfillSnapshots();
} finally {
  await client.end();
}
