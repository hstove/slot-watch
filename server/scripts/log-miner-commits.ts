/**
 * Logs live miner block-commit activity (mirrors the /miners/live page) to an
 * append-only JSONL file for later analysis.
 *
 *   bun server/scripts/log-miner-commits.ts [out.jsonl]
 *
 * Default output: tmp/miner-commits/<start-iso>.jsonl. Every line is a
 * standalone JSON object written with a single append, so the file can be read
 * (tail -f, jq, etc.) while the script runs. Stop with Ctrl-C.
 *
 * Every event has `ts` (ISO time), `t` (epoch ms) and `type`. Types:
 *
 * - session_start: output file, btc tip, tracked `miners`.
 * - miners_changed: tracked miner set changed after a refresh (added/removed).
 * - ws_open / ws_close / error: connection and fetch diagnostics.
 * - commit_seed: pending commit found via REST (startup / reconnect / new miner),
 *   i.e. it was broadcast before we were watching. `seenAt` is not a broadcast time.
 * - commit_new: a miner broadcast a commit that isn't an RBF of their pending one.
 * - commit_rbf: a commit replaced the miner's pending commit (same first input).
 *   Includes `previous`, deltas, `rbfCount` and `fees` context at that moment.
 * - commit_dropped: pending commit left the mempool without an RBF or confirmation.
 * - commit_confirmed: commit mined in `height`; `secondsSinceFirstSeen` spans
 *   the whole RBF chain.
 * - block: new BTC block. `pendingAtBlock` is every tracked pending commit at
 *   that moment (stale/feeStatus computed against the pre-block tip).
 * - block_result: ~20s+ after a block, once Slot Watch has indexed it:
 *   `included` / `missed` (from live data) and the sortition `winner` plus all
 *   indexed commits for that height.
 * - fee_snapshot: every 30s. Projected mempool blocks (`feeRange` is
 *   [min, p10, p25, p50, p75, p90, max] sat/vB), mempool stats, recommended fees,
 *   and each tracked miner's pending commit with fee position and est. odds.
 *
 * Commit objects: miner label/stxAddress/btcAddress, txid, input (txid:vout of
 * first input), bidSats, feeSats, vsize, feeRate (sat/vB), parentHeight,
 * parentVtx, modulus, confirmedHeight, seenAt (epoch ms), stale (won't count at
 * the next block), behind (parent older than latest sortition winner) and
 * feeStatus (next | marginal | later(n blocks) | low vs projected blocks).
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  type AddressTransactions,
  type EsploraTx,
  feeStatus,
  fetchAddressMempool,
  isStaleCommit,
  type LiveCommit,
  MEMPOOL_WS_URL,
  type MempoolBlock,
  type MempoolTipBlock,
  parseBlockCommit,
} from 'slot-watch-common';

const API = 'https://api.slotwatch.dev';
const RECENT_BLOCKS = 12;
const COMMITMENT_WINDOW = 6;
const SNAPSHOT_MS = 30_000;
const REFETCH_DELAY_MS = 20_000;
const MAX_RESOLVE_ATTEMPTS = 8;
const RECONNECT_MS = 3000;
const WATCHDOG_MS = 120_000;

const outFile = resolve(
  process.argv[2] ??
    `tmp/miner-commits/${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
);
mkdirSync(dirname(outFile), { recursive: true });

function log(type: string, data: Record<string, unknown> = {}) {
  const t = Date.now();
  const line = JSON.stringify({
    ts: new Date(t).toISOString(),
    t,
    type,
    ...data,
  });
  appendFileSync(outFile, `${line}\n`);
  console.log(summarize(type, data));
}

// ---------- Slot Watch data ----------

interface ApiCommit {
  txid: string;
  minerAddress: string | null;
  minerPublicKey: string | null;
  btcAddress: string | null;
  spendSats: number;
  burnSats: number;
  vtxindex: number;
}
interface ApiBlock {
  burnBlockHeight: number;
  winningTxid: string | null;
  commits: ApiCommit[];
}
interface Miner {
  label: string;
  stxAddress: string | null;
  publicKey: string;
  btcAddress: string;
  wins: number;
  bids: Map<number, number>;
}

let miners: Miner[] = [];
let byAddress = new Map<string, Miner>();
let byKey = new Map<string, Miner>();
let indexedBlocks: ApiBlock[] = [];

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

async function fetchMiners() {
  const { burnBlocks } = await getJson<{
    burnBlocks: { burnBlockHeight: number }[];
  }>('/burn-blocks/mainnet');
  const apiTip = burnBlocks[0]?.burnBlockHeight ?? 0;
  const { blocks } = await getJson<{ blocks: ApiBlock[] }>(
    `/miner-economics/mainnet/commits?fromHeight=${Math.max(0, apiTip - RECENT_BLOCKS + 1)}&toHeight=${apiTip}`
  );
  const keyed = new Map<string, Miner>();
  for (const block of blocks) {
    for (const c of block.commits) {
      if (!(c.minerPublicKey && c.btcAddress)) continue;
      const m = keyed.get(c.minerPublicKey) ?? {
        label: c.minerAddress ?? c.minerPublicKey,
        stxAddress: c.minerAddress,
        publicKey: c.minerPublicKey,
        btcAddress: c.btcAddress,
        wins: 0,
        bids: new Map(),
      };
      m.btcAddress = c.btcAddress;
      m.bids.set(block.burnBlockHeight, c.spendSats + c.burnSats);
      if (c.txid === block.winningTxid) m.wins++;
      keyed.set(c.minerPublicKey, m);
    }
  }
  indexedBlocks = blocks;
  miners = [...keyed.values()];
  byAddress = new Map(miners.map((m) => [m.btcAddress, m]));
  byKey = new Map(miners.map((m) => [m.publicKey, m]));
  return apiTip;
}

function minerJson(m: Miner | undefined) {
  return m
    ? {
        miner: m.label,
        stxAddress: m.stxAddress,
        btcAddress: m.btcAddress,
        publicKey: m.publicKey,
      }
    : { miner: null };
}

// ---------- live state ----------

interface MinerLive {
  pending: LiveCommit | null;
  replaced: LiveCommit[];
}
const live = new Map<string, MinerLive>();
let mempoolBlocks: MempoolBlock[] = [];
const stats: Record<string, unknown> = {};
let tip: MempoolTipBlock | null = null;
let lastBlockAt: number | null = null;
const blockRecords = new Map<
  number,
  { pendingAtBlock: Map<string, LiveCommit>; included: LiveCommit[] }
>();

function liveOf(address: string) {
  let m = live.get(address);
  if (!m) {
    m = { pending: null, replaced: [] };
    live.set(address, m);
  }
  return m;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function latestWinnerHeight() {
  return indexedBlocks.filter((b) => b.winningTxid).at(-1)?.burnBlockHeight;
}

function commitJson(c: LiveCommit, tipHeight = tip?.height) {
  const winner = latestWinnerHeight();
  return {
    ...minerJson(byAddress.get(c.btcAddress)),
    btcAddress: c.btcAddress,
    txid: c.txid,
    input: c.input,
    bidSats: c.bidSats,
    feeSats: c.feeSats,
    vsize: c.vsize,
    feeRate: round(c.feeRate),
    parentHeight: c.parentHeight,
    parentVtx: c.parentVtx,
    modulus: c.modulus,
    confirmedHeight: c.confirmedHeight,
    seenAt: c.seenAt,
    stale: tipHeight === undefined ? null : isStaleCommit(c, tipHeight),
    behind: winner === undefined ? null : c.parentHeight < winner,
    feeStatus: mempoolBlocks.length
      ? feeStatus(c.feeRate, mempoolBlocks)
      : null,
  };
}

function feeContext() {
  const [next, second] = mempoolBlocks;
  if (!next) return null;
  return {
    nextMin: round(next.feeRange[0] ?? 0),
    nextP10: round(next.feeRange[1] ?? 0),
    nextMedian: round(next.medianFee),
    nextVSize: next.blockVSize,
    secondMedian: second ? round(second.medianFee) : null,
    projectedBlocks: mempoolBlocks.length,
  };
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

/** Same approximation as the live page: min(bid, median of last 6 commits). */
function pendingRows() {
  if (!tip) return [];
  const tipHeight = tip.height;
  const indexed = new Set(indexedBlocks.map((b) => b.burnBlockHeight));
  const rows = miners.map((m) => {
    const pending = live.get(m.btcAddress)?.pending ?? null;
    const stale = pending ? isStaleCommit(pending, tipHeight) : false;
    let effectiveBid = 0;
    if (pending && !stale) {
      const prior: number[] = [];
      for (let h = tipHeight - COMMITMENT_WINDOW + 2; h <= tipHeight; h++) {
        if (indexed.has(h)) prior.push(m.bids.get(h) ?? 0);
      }
      effectiveBid = Math.min(
        pending.bidSats,
        median([...prior, pending.bidSats])
      );
    }
    return { m, pending, effectiveBid };
  });
  const total = rows.reduce((s, r) => s + r.effectiveBid, 0);
  return rows.map(({ m, pending, effectiveBid }) => ({
    miner: m.label,
    btcAddress: m.btcAddress,
    pending: pending ? commitJson(pending) : null,
    rbfCount: live.get(m.btcAddress)?.replaced.length ?? 0,
    effectiveBid,
    odds: total ? round(effectiveBid / total, 4) : 0,
  }));
}

function commitsOf(txs: EsploraTx[], seenAt: number) {
  return txs.flatMap((tx) => parseBlockCommit(tx, seenAt) ?? []);
}

function onSeed(address: string, txs: EsploraTx[]) {
  const latest = commitsOf(txs, Date.now()).reduce<LiveCommit | null>(
    (best, c) => (!best || c.parentHeight > best.parentHeight ? c : best),
    null
  );
  const m = liveOf(address);
  if (!latest || m.pending?.txid === latest.txid) return;
  m.pending = latest;
  m.replaced = [];
  log('commit_seed', { commit: commitJson(latest), fees: feeContext() });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass per tx kind
function onAddress(address: string, txs: AddressTransactions) {
  const now = Date.now();
  const m = liveOf(address);

  for (const c of commitsOf(txs.mempool, now)) {
    const prev = m.pending;
    if (prev?.txid === c.txid) continue;
    if (prev && prev.input === c.input) {
      m.replaced.push(prev);
      m.pending = c;
      log('commit_rbf', {
        commit: commitJson(c),
        previous: commitJson(prev),
        feeRateDelta: round(c.feeRate - prev.feeRate),
        bidDelta: c.bidSats - prev.bidSats,
        parentChanged: c.parentHeight !== prev.parentHeight,
        secondsSincePrevious: round((c.seenAt - prev.seenAt) / 1000, 1),
        rbfCount: m.replaced.length,
        fees: feeContext(),
      });
    } else {
      log('commit_new', {
        commit: commitJson(c),
        supersededPending: prev ? commitJson(prev) : null,
        fees: feeContext(),
      });
      m.pending = c;
      m.replaced = [];
    }
  }

  for (const tx of txs.removed) {
    if (m.pending?.txid !== tx.txid) continue;
    log('commit_dropped', {
      commit: commitJson(m.pending),
      rbfCount: m.replaced.length,
      fees: feeContext(),
    });
    m.pending = null;
    m.replaced = [];
  }

  for (const c of commitsOf(txs.confirmed, now)) {
    const height = c.confirmedHeight ?? tip?.height ?? null;
    const confirmed = { ...c, confirmedHeight: height };
    const wasPending = m.pending?.txid === c.txid;
    const firstSeen = wasPending
      ? (m.replaced[0]?.seenAt ?? m.pending?.seenAt)
      : undefined;
    log('commit_confirmed', {
      commit: commitJson(confirmed),
      height,
      wasPending,
      rbfCount: wasPending ? m.replaced.length : null,
      secondsSinceFirstSeen: firstSeen
        ? round((now - firstSeen) / 1000, 1)
        : null,
    });
    if (wasPending) {
      m.pending = null;
      m.replaced = [];
    }
    const record = height === null ? undefined : blockRecords.get(height);
    if (record) {
      record.included = [
        ...record.included.filter((x) => x.btcAddress !== address),
        confirmed,
      ];
    }
  }
}

function onTip(block: MempoolTipBlock, isNew: boolean) {
  if (tip && block.height <= tip.height) return;
  if (!isNew) {
    tip = block;
    return;
  }
  const pendingAtBlock = new Map<string, LiveCommit>();
  for (const [address, m] of live) {
    if (m.pending) pendingAtBlock.set(address, m.pending);
  }
  const now = Date.now();
  log('block', {
    height: block.height,
    hash: block.id,
    blockTimestamp: block.timestamp,
    secondsSincePreviousBlock: lastBlockAt
      ? round((now - lastBlockAt) / 1000, 1)
      : null,
    previousBlockTimestamp: tip?.timestamp ?? null,
    pendingAtBlock: [...pendingAtBlock.values()].map((c) => commitJson(c)),
    fees: feeContext(),
  });
  tip = block;
  lastBlockAt = now;
  blockRecords.set(block.height, { pendingAtBlock, included: [] });
  setTimeout(() => resolveBlock(block.height, 1), REFETCH_DELAY_MS);
}

async function refreshMiners() {
  const before = new Set(miners.map((m) => m.btcAddress));
  await fetchMiners();
  const after = new Set(miners.map((m) => m.btcAddress));
  const added = [...after].filter((a) => !before.has(a));
  const removed = [...before].filter((a) => !after.has(a));
  if (added.length === 0 && removed.length === 0) return;
  log('miners_changed', {
    added: added.map((a) => minerJson(byAddress.get(a))),
    removed,
  });
  subscribe(added);
}

async function resolveBlock(height: number, attempt: number) {
  try {
    await refreshMiners();
  } catch (e) {
    log('error', { where: 'refreshMiners', message: String(e) });
  }
  const indexed = indexedBlocks.find((b) => b.burnBlockHeight === height);
  if (!indexed && attempt < MAX_RESOLVE_ATTEMPTS) {
    setTimeout(() => resolveBlock(height, attempt + 1), REFETCH_DELAY_MS);
    return;
  }
  const record = blockRecords.get(height);
  blockRecords.delete(height);
  const includedAddresses = new Set(record?.included.map((c) => c.btcAddress));
  const winner = indexed?.commits.find((c) => c.txid === indexed.winningTxid);
  log('block_result', {
    height,
    indexed: !!indexed,
    winningTxid: indexed?.winningTxid ?? null,
    winner: winner
      ? {
          ...minerJson(
            winner.minerPublicKey ? byKey.get(winner.minerPublicKey) : undefined
          ),
          stxAddress: winner.minerAddress,
          bidSats: winner.spendSats + winner.burnSats,
        }
      : null,
    included: record?.included.map((c) => commitJson(c, height - 1)) ?? [],
    missed: record
      ? [...record.pendingAtBlock.values()]
          .filter((c) => !includedAddresses.has(c.btcAddress))
          .map((c) => commitJson(c, height - 1))
      : [],
    indexedCommits:
      indexed?.commits.map((c) => ({
        miner: c.minerAddress ?? c.minerPublicKey,
        btcAddress: c.btcAddress,
        txid: c.txid,
        bidSats: c.spendSats + c.burnSats,
        vtxindex: c.vtxindex,
        won: c.txid === indexed.winningTxid,
      })) ?? [],
  });
}

function logSnapshot() {
  log('fee_snapshot', {
    tip: tip?.height ?? null,
    secondsSinceBlock: lastBlockAt
      ? round((Date.now() - lastBlockAt) / 1000, 1)
      : null,
    fees: feeContext(),
    mempoolBlocks: mempoolBlocks.map((b, i) => ({
      index: i,
      medianFee: round(b.medianFee),
      feeRange: b.feeRange.map((f) => round(f)),
      blockVSize: b.blockVSize,
      nTx: b.nTx,
      totalFees: b.totalFees,
    })),
    mempoolInfo: stats.mempoolInfo ?? null,
    vBytesPerSecond: stats.vBytesPerSecond ?? null,
    recommendedFees: stats.fees ?? null,
    miners: pendingRows(),
  });
}

// ---------- websocket ----------

interface WsMessage {
  block?: MempoolTipBlock;
  blocks?: MempoolTipBlock[];
  'mempool-blocks'?: MempoolBlock[];
  'multi-address-transactions'?: Record<string, AddressTransactions>;
  'track-addresses-error'?: string;
  mempoolInfo?: unknown;
  vBytesPerSecond?: unknown;
  fees?: unknown;
}

let ws: WebSocket | null = null;
let lastMessageAt = Date.now();

function subscribe(newAddresses: string[]) {
  if (ws?.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      'track-addresses': miners.map((m) => m.btcAddress).sort(),
    })
  );
  for (const address of newAddresses) {
    fetchAddressMempool(address)
      .then((txs) => onSeed(address, txs))
      .catch((e) =>
        log('error', { where: 'seed', address, message: String(e) })
      );
  }
}

function onMessage(msg: WsMessage) {
  const latest = msg.blocks?.reduce<MempoolTipBlock | undefined>(
    (best, b) => (!best || b.height > best.height ? b : best),
    undefined
  );
  if (latest) onTip(latest, false);
  if (msg.block) onTip(msg.block, true);
  if (msg['mempool-blocks']) mempoolBlocks = msg['mempool-blocks'];
  if (msg.mempoolInfo) stats.mempoolInfo = msg.mempoolInfo;
  if (msg.vBytesPerSecond !== undefined)
    stats.vBytesPerSecond = msg.vBytesPerSecond;
  if (msg.fees) stats.fees = msg.fees;
  for (const [address, txs] of Object.entries(
    msg['multi-address-transactions'] ?? {}
  )) {
    onAddress(address, txs);
  }
  if (msg['track-addresses-error']) {
    log('error', {
      where: 'track-addresses',
      message: msg['track-addresses-error'],
    });
  }
}

function connect() {
  const socket = new WebSocket(MEMPOOL_WS_URL);
  ws = socket;
  socket.onopen = () => {
    lastMessageAt = Date.now();
    log('ws_open');
    socket.send(
      JSON.stringify({
        action: 'want',
        data: ['blocks', 'mempool-blocks', 'stats'],
      })
    );
    subscribe(miners.map((m) => m.btcAddress));
  };
  socket.onmessage = (event) => {
    lastMessageAt = Date.now();
    try {
      onMessage(JSON.parse(String(event.data)));
    } catch (e) {
      log('error', { where: 'ws_message', message: String(e) });
    }
  };
  socket.onclose = (event) => {
    if (ws !== socket) return;
    log('ws_close', { code: event.code, reason: event.reason });
    ws = null;
    setTimeout(connect, RECONNECT_MS);
  };
}

// ---------- summary for the terminal ----------

function short(c: unknown) {
  const x = c as ReturnType<typeof commitJson> | undefined;
  return x
    ? `${(x.miner ?? '?').slice(0, 10)} ${x.bidSats} @ ${x.feeRate}`
    : '';
}

function summarize(type: string, d: Record<string, unknown>) {
  const time = new Date().toISOString().slice(11, 19);
  switch (type) {
    case 'commit_rbf':
      return `${time} rbf  ${short(d.previous)} → ${short(d.commit)}`;
    case 'commit_new':
    case 'commit_seed':
    case 'commit_dropped':
    case 'commit_confirmed':
      return `${time} ${type.slice(7)} ${short(d.commit)}`;
    case 'block':
      return `${time} BLOCK #${d.height}`;
    case 'block_result':
      return `${time} result #${d.height} winner ${(d.winner as { miner?: string } | null)?.miner ?? 'none'}`;
    case 'fee_snapshot':
      return `${time} fees next median ${(d.fees as { nextMedian?: number } | null)?.nextMedian ?? '-'}`;
    default:
      return `${time} ${type} ${Object.keys(d).length ? JSON.stringify(d).slice(0, 160) : ''}`;
  }
}

// ---------- main ----------

process.on('unhandledRejection', (e) =>
  log('error', { where: 'unhandledRejection', message: String(e) })
);
process.on('SIGINT', () => {
  log('session_end');
  process.exit(0);
});

const apiTip = await fetchMiners();
log('session_start', {
  outFile,
  apiTip,
  miners: miners.map((m) => ({
    ...minerJson(m),
    wins: m.wins,
    bids: Object.fromEntries(m.bids),
  })),
});
console.log(`writing to ${outFile}`);
connect();
setInterval(logSnapshot, SNAPSHOT_MS);
setInterval(() => {
  if (Date.now() - lastMessageAt > WATCHDOG_MS) {
    log('error', {
      where: 'watchdog',
      message: 'no ws messages, reconnecting',
    });
    lastMessageAt = Date.now();
    const stale = ws;
    ws = null;
    stale?.close();
    connect();
  }
}, 30_000);
