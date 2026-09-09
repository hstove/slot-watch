/**
 * Backfill per-commit miner spend (miner_spends) and the winning commit txid
 * on burn_blocks from a locally restored Hiro stacks-blockchain-api dump,
 * then resolve each commit's miner from its Bitcoin input key via an
 * Esplora API (mempool.space / blockstream.info).
 *
 * Usage (from repo root):
 *   bun run --cwd server --env-file=../.env.local scripts/backfill-miner-spends.ts \
 *     [--from 2026-07-01] [--network mainnet] [--dry-run] [--only winners|spends|senders|gap]
 *
 * `senders` re-resolves rows whose miner is null. `gap` covers burn blocks the
 * dump lacks (or the Worker missed): winning txids from the Hiro API and
 * commit rows rebuilt from each miner's Bitcoin address history. Both only
 * need the Hiro DB for the start height and are safe to re-run.
 *
 * Env: DATABASE_URL (target, prod), HIRO_PG_URL (source, defaults to local hiro_api)
 */
import { execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import * as schema from '../src/db/schema';
import { burnBlocks, minerSpends, stacksBlocks } from '../src/db/schema';
import { inputPublicKey, minerAddressFromPublicKey } from '../src/bitcoin';

const execFileAsync = promisify(execFile);

const { values: args } = parseArgs({
  options: {
    from: { type: 'string', default: '2026-07-01' },
    network: { type: 'string', default: 'mainnet' },
    'dry-run': { type: 'boolean', default: false },
    only: { type: 'string' },
  },
});

const networkKey = args.network ?? 'mainnet';
const dryRun = args['dry-run'] ?? false;
const fromEpoch = Math.floor(
  new Date(`${args.from}T00:00:00Z`).getTime() / 1000
);
if (Number.isNaN(fromEpoch)) throw new Error(`Bad --from date: ${args.from}`);

const hiro = new Client({
  connectionString:
    process.env.HIRO_PG_URL ?? 'postgresql://localhost:5432/hiro_api',
});
// Address walks can take an hour; keepalive stops the pooler dropping us.
const prodClient = new Client({
  connectionString: process.env.DATABASE_URL,
  keepAlive: true,
});
await hiro.connect();
await prodClient.connect();
await hiro.query('set search_path to stacks_blockchain_api');
const db = drizzle(prodClient, { schema });

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

const {
  rows: [startRow],
} = await hiro.query<{ h: number }>(
  'select min(burn_block_height)::int as h from blocks where canonical and burn_block_time >= $1',
  [fromEpoch]
);
const startBurnHeight = startRow?.h;
if (!startBurnHeight)
  throw new Error('Could not resolve start burn height from Hiro blocks');
log(
  `from=${args.from} startBurnHeight=${startBurnHeight} network=${networkKey} dryRun=${dryRun}`
);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const uuidMs = (id: string) =>
  Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16);

// ---------------------------------------------------------------------------
// burn_blocks.winning_txid: Hiro blocks carry miner_txid per block; prod
// stacks_blocks carry the tenure's consensus hash. Join on index block hash.
// ---------------------------------------------------------------------------
async function backfillWinners() {
  const { rows: hiroBlocks } = await hiro.query<{ ibh: string; txid: string }>(
    `select encode(index_block_hash, 'hex') as ibh, encode(miner_txid, 'hex') as txid
     from blocks where canonical and burn_block_height >= $1`,
    [startBurnHeight]
  );
  const txidByIbh = new Map(hiroBlocks.map((r) => [r.ibh, r.txid]));
  log(`winners: ${txidByIbh.size} Hiro blocks`);

  // First block of each tenure carries the tenure's winning commit.
  const starts = await db
    .select({
      ibh: stacksBlocks.indexBlockHash,
      consensusHash: stacksBlocks.consensusHash,
    })
    .from(stacksBlocks)
    .where(
      and(
        eq(stacksBlocks.networkKey, networkKey),
        eq(stacksBlocks.tenureChangeCause, 0),
        gte(stacksBlocks.burnBlockHeight, startBurnHeight - 1)
      )
    );
  const byConsensus = new Map<string, string>();
  for (const b of starts) {
    const txid = txidByIbh.get(b.ibh);
    if (txid) byConsensus.set(b.consensusHash, txid);
  }
  log(
    `winners: ${starts.length} tenure starts, ${byConsensus.size} with a Hiro txid`
  );

  let updated = 0;
  for (const batch of chunk([...byConsensus], 5000)) {
    if (dryRun) continue;
    const res = await prodClient.query(
      `update burn_blocks b set winning_txid = v.txid
       from unnest($2::text[], $3::text[]) as v(ch, txid)
       where b.network_key = $1 and b.consensus_hash = v.ch
         and b.winning_txid is distinct from v.txid`,
      [networkKey, batch.map(([ch]) => ch), batch.map(([, txid]) => txid)]
    );
    updated += res.rowCount ?? 0;
  }
  log(`winners: updated=${updated}`);
}

// ---------------------------------------------------------------------------
// miner_spends rows (miner unresolved) from Hiro burn_block_pox_txs
// ---------------------------------------------------------------------------
async function backfillSpends() {
  type Row = {
    burn_block_height: number;
    burn_block_hash: string;
    txid: string;
    spend: string;
    recipients: number;
  };
  const { rows } = await hiro.query<Row>(
    // Hiro's canonical flag tracks Stacks forks, not Bitcoin ones, so a real
    // burn block can be marked non-canonical. Keep every distinct output and
    // let the prod burn_blocks join decide which hashes matter.
    `select burn_block_height, encode(burn_block_hash, 'hex') as burn_block_hash,
            encode(tx_id, 'hex') as txid, sum(amount)::text as spend, count(*)::int as recipients
     from (select distinct burn_block_height, burn_block_hash, tx_id, utxo_idx, amount
           from burn_block_pox_txs where burn_block_height >= $1) t
     group by 1, 2, 3 order by 1, 3`,
    [startBurnHeight]
  );
  log(`spends: ${rows.length} Hiro commits from height ${startBurnHeight}`);

  let inserted = 0;
  let missing = 0;
  for (const batch of chunk(rows, 500)) {
    const hashes = [...new Set(batch.map((r) => r.burn_block_hash))];
    const blocks = await db
      .select({
        id: burnBlocks.id,
        hash: burnBlocks.burnBlockHash,
        consensusHash: burnBlocks.consensusHash,
      })
      .from(burnBlocks)
      .where(
        and(
          eq(burnBlocks.networkKey, networkKey),
          inArray(burnBlocks.burnBlockHash, hashes)
        )
      );
    const byHash = new Map(blocks.map((b) => [b.hash, b]));
    const values = batch.flatMap((r, i) => {
      const block = byHash.get(r.burn_block_hash);
      if (!block) {
        missing++;
        return [];
      }
      return [
        {
          id: uuidv7({ msecs: uuidMs(block.id) + i }),
          networkKey,
          burnBlockHeight: r.burn_block_height,
          burnBlockHash: r.burn_block_hash,
          consensusHash: block.consensusHash,
          txid: r.txid,
          spendSats: Number(r.spend),
          burnSats: 0,
          recipientCount: r.recipients,
          minerPublicKey: null,
          minerAddress: null,
        },
      ];
    });
    if (values.length === 0 || dryRun) continue;
    const res = await db
      .insert(minerSpends)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: minerSpends.id });
    inserted += res.length;
  }
  log(`spends: inserted=${inserted} missingBurnBlockInProd=${missing}`);
}

// ---------------------------------------------------------------------------
// Resolve miner keys from Bitcoin inputs
// ---------------------------------------------------------------------------
const BTC_BURN_ADDRESS = '1111111111111111111114oLvT2';
// Team-hosted mempool instance first (no public rate limit), then public hosts.
const ESPLORA = [
  'https://leather.mempool.space/api',
  'https://blockstream.info/api',
  'https://mempool.space/api',
];

interface EsploraTx {
  txid: string;
  vin: {
    scriptsig_asm?: string;
    witness?: string[];
    prevout?: { scriptpubkey_type?: string; scriptpubkey_address?: string };
  }[];
  status: { block_height?: number };
}

interface EsploraFullTx extends EsploraTx {
  vout: {
    scriptpubkey_type: string;
    scriptpubkey_address?: string;
    value: number;
  }[];
  status: { block_height?: number; block_hash?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let esploraCalls = 0;
let esploraThrottled = 0;

function noteThrottle(status: number, host: string) {
  esploraThrottled++;
  if (esploraThrottled % 20 === 1)
    log(
      `esplora: ${status} from ${host} (throttled ${esploraThrottled}/${esploraCalls})`
    );
}

/**
 * GET JSON via curl. Bun's fetch to mempool.space hangs from this machine
 * (IPv6 path; curl -4 and Node are fine), so shell out for the backfill.
 */
async function curlJson(
  url: string
): Promise<{ status: number; body: string }> {
  try {
    const { stdout } = await execFileAsync(
      'curl',
      ['-4', '-sS', '-m', '25', '-w', '\n%{http_code}', url],
      { maxBuffer: 64 * 1024 * 1024 }
    );
    const nl = stdout.lastIndexOf('\n');
    return {
      status: Number(stdout.slice(nl + 1)) || 0,
      body: stdout.slice(0, nl),
    };
  } catch {
    return { status: 0, body: '' };
  }
}

/** GET from the Esplora hosts, falling back to the next on errors and 429/5xx. */
async function esplora<T>(path: string): Promise<T | null> {
  esploraCalls++;
  for (let attempt = 0; attempt < 8; attempt++) {
    const host = ESPLORA[attempt % ESPLORA.length];
    const { status, body } = await curlJson(`${host}${path}`);
    if (status >= 200 && status < 300) return JSON.parse(body) as T;
    if (status === 404) return null;
    if (status !== 0 && status !== 429 && status < 500)
      throw new Error(`${status} ${path}`);
    noteThrottle(status, host);
    await sleep(3000 * (attempt + 1));
  }
  return null;
}

async function applyResolved(resolved: Map<string, string>) {
  // Group txids by key so each update is one statement per miner.
  const byKey = new Map<string, string[]>();
  for (const [txid, key] of resolved) {
    const list = byKey.get(key) ?? [];
    list.push(txid);
    byKey.set(key, list);
  }
  let updated = 0;
  for (const [key, txids] of byKey) {
    const address = minerAddressFromPublicKey(key, networkKey);
    for (const batch of chunk(txids, 1000)) {
      if (dryRun) continue;
      const res = await db
        .update(minerSpends)
        .set({ minerPublicKey: key, minerAddress: address })
        .where(
          and(
            eq(minerSpends.networkKey, networkKey),
            isNull(minerSpends.minerPublicKey),
            inArray(minerSpends.txid, batch)
          )
        )
        .returning({ id: minerSpends.id });
      updated += res.length;
    }
  }
  return updated;
}

async function unresolvedTxids() {
  const rows = await db
    .select({
      txid: minerSpends.txid,
      height: minerSpends.burnBlockHeight,
    })
    .from(minerSpends)
    .where(
      and(
        eq(minerSpends.networkKey, networkKey),
        isNull(minerSpends.minerPublicKey),
        gte(minerSpends.burnBlockHeight, startBurnHeight)
      )
    );
  return rows;
}

/** Look up the newest unresolved commits to learn each active miner's sender address. */
async function seedSenders(
  sample: { txid: string }[],
  resolved: Map<string, string>
) {
  const senders = new Map<string, string>(); // address -> pubkey
  for (const { txid } of sample) {
    const tx = await esplora<EsploraTx>(`/tx/${txid}`);
    const vin = tx?.vin[0];
    const key = inputPublicKey(vin);
    const address = vin?.prevout?.scriptpubkey_address;
    if (key && address) {
      senders.set(address, key);
      resolved.set(txid, key);
    }
  }
  log(
    `senders: ${senders.size} sender addresses from ${sample.length} samples`
  );
  return senders;
}

/** Record the pending commits in one history page that were signed by `key`. */
function collectPage(
  txs: EsploraTx[],
  key: string,
  pendingSet: Set<string>,
  resolved: Map<string, string>
) {
  for (const tx of txs) {
    if (pendingSet.has(tx.txid) && inputPublicKey(tx.vin[0]) === key) {
      resolved.set(tx.txid, key);
    }
  }
}

/** Walk a sender's confirmed history back to `minHeight`, 25 txs a page. */
async function walkHistory(
  address: string,
  minHeight: number,
  onPage: (txs: EsploraFullTx[]) => void
) {
  let last: string | undefined;
  let pages = 0;
  for (;;) {
    const path = `/address/${address}/txs/chain${last ? `/${last}` : ''}`;
    const txs = await esplora<EsploraFullTx[]>(path);
    if (!txs?.length) break;
    pages++;
    onPage(txs);
    const oldest = txs.at(-1);
    const height = oldest?.status.block_height ?? 0;
    if (!oldest || height < minHeight) break;
    last = oldest.txid;
    if (pages % 20 === 0)
      log(`senders: ${address} page ${pages} at height ${height}`);
  }
  log(`senders: ${address} walked ${pages} pages`);
}

async function backfillSenders() {
  let pending = await unresolvedTxids();
  log(`senders: ${pending.length} unresolved commits`);
  if (pending.length === 0) return;
  const minHeight = Math.min(...pending.map((p) => p.height));
  const pendingSet = new Set(pending.map((p) => p.txid));

  // Miners chain commit UTXOs from one address, so a few samples cover every
  // active miner and each address history yields thousands of txids cheaply.
  const resolved = new Map<string, string>(); // txid -> pubkey
  const senders = await seedSenders(
    pending.sort((a, b) => b.height - a.height).slice(0, 40),
    resolved
  );
  // One address at a time: parallel walks get throttled and time out. Persist
  // after each address so a failed walk doesn't lose the others' work.
  let updated = 0;
  for (const [address, key] of senders) {
    try {
      await walkHistory(address, minHeight, (txs) =>
        collectPage(txs, key, pendingSet, resolved)
      );
    } catch (e) {
      log(`senders: ${address} walk aborted: ${String(e).slice(0, 80)}`);
    }
    updated += await applyResolved(resolved);
    resolved.clear();
  }
  log(`senders: updated via address history=${updated}`);

  // Anything left gets a direct tx lookup.
  pending = await unresolvedTxids();
  log(`senders: ${pending.length} left for per-tx lookup`);
  const direct = new Map<string, string>();
  for (const batch of chunk(pending, 8)) {
    await Promise.all(
      batch.map(async ({ txid }) => {
        const tx = await esplora<EsploraTx>(`/tx/${txid}`);
        const key = inputPublicKey(tx?.vin[0]);
        if (key) direct.set(txid, key);
      })
    );
    if (direct.size > 0 && direct.size % 200 < 8)
      log(`senders: direct ${direct.size}`);
  }
  updated = await applyResolved(direct);
  log(`senders: resolved via tx lookup=${direct.size} updated=${updated}`);
}

// ---------------------------------------------------------------------------
// Gap repair for burn blocks the Hiro dump doesn't cover (or the Worker missed)
// ---------------------------------------------------------------------------
interface EsploraFullTx extends EsploraTx {
  vout: {
    scriptpubkey_type: string;
    scriptpubkey_address?: string;
    value: number;
  }[];
  status: { block_height?: number; block_hash?: string };
}

/** Fill burn_blocks.winning_txid from the Hiro API for tenures still missing it. */
async function gapWinners() {
  const starts = await db.execute<{
    block_hash: string;
    consensus_hash: string;
  }>(sql`
    select sb.block_hash, sb.consensus_hash
    from stacks_blocks sb
    join burn_blocks b on b.network_key = sb.network_key and b.consensus_hash = sb.consensus_hash
    where sb.network_key = ${networkKey} and sb.tenure_change_cause = 0
      and sb.burn_block_height >= ${startBurnHeight} and b.winning_txid is null`);
  log(`gap winners: ${starts.rows.length} tenures without winning_txid`);
  const headers = process.env.HIRO_API_KEY
    ? { 'x-api-key': process.env.HIRO_API_KEY }
    : undefined;
  let updated = 0;
  for (const { block_hash, consensus_hash } of starts.rows) {
    const res = await fetch(
      `https://api.hiro.so/extended/v2/blocks/0x${block_hash}`,
      { headers }
    );
    if (!res.ok) continue;
    const { miner_txid } = (await res.json()) as { miner_txid: string };
    if (dryRun) continue;
    const r = await db
      .update(burnBlocks)
      .set({ winningTxid: miner_txid.replace('0x', '') })
      .where(
        and(
          eq(burnBlocks.networkKey, networkKey),
          eq(burnBlocks.consensusHash, consensus_hash),
          isNull(burnBlocks.winningTxid)
        )
      )
      .returning({ id: burnBlocks.id });
    updated += r.length;
  }
  log(`gap winners: updated=${updated}`);
}

type GapBlock = {
  id: string;
  burn_block_height: number;
  burn_block_hash: string;
  consensus_hash: string;
};

/** A miner_spends row for a commit tx, or null if it isn't a commit by `key`. */
function commitRow(
  tx: EsploraFullTx,
  block: GapBlock,
  address: string,
  key: string,
  seq: number
): typeof minerSpends.$inferInsert | null {
  if (inputPublicKey(tx.vin[0]) !== key) return null;
  // Everything but the OP_RETURN and the change back to the sender is spend;
  // burn-address outputs are tracked apart from PoX payouts.
  const outputs = tx.vout.filter(
    (v) =>
      v.scriptpubkey_type !== 'op_return' && v.scriptpubkey_address !== address
  );
  const payouts = outputs.filter(
    (v) => v.scriptpubkey_address !== BTC_BURN_ADDRESS
  );
  const burnSats = outputs
    .filter((v) => v.scriptpubkey_address === BTC_BURN_ADDRESS)
    .reduce((sum, v) => sum + v.value, 0);
  if (outputs.length === 0) return null;
  return {
    id: uuidv7({ msecs: uuidMs(block.id) + seq }),
    networkKey,
    burnBlockHeight: block.burn_block_height,
    burnBlockHash: block.burn_block_hash,
    consensusHash: block.consensus_hash,
    txid: tx.txid,
    spendSats: payouts.reduce((sum, v) => sum + v.value, 0),
    burnSats,
    recipientCount: payouts.length,
    minerPublicKey: key,
    minerAddress: minerAddressFromPublicKey(key, networkKey),
  };
}

/** Rebuild commit rows for every burn block in range from the miners' Bitcoin
 * histories (Hiro's per-commit tables have gaps); existing rows are kept via
 * the unique key, then zero block totals are corrected. */
async function gapSpends() {
  const blocks = await db.execute<GapBlock>(sql`
    select b.id, b.burn_block_height, b.burn_block_hash, b.consensus_hash
    from burn_blocks b
    where b.network_key = ${networkKey} and b.burn_block_height >= ${startBurnHeight}
    order by b.burn_block_height`);
  const gapBlocks = new Map(blocks.rows.map((b) => [b.burn_block_hash, b]));
  log(`gap spends: ${gapBlocks.size} burn blocks in range`);
  if (gapBlocks.size === 0) return;
  const minHeight = Math.min(...blocks.rows.map((b) => b.burn_block_height));

  // Learn sender addresses from the newest resolved commits, then walk each
  // sender's history back to the oldest gap block.
  const recent = await db
    .select({ txid: minerSpends.txid })
    .from(minerSpends)
    .where(
      and(
        eq(minerSpends.networkKey, networkKey),
        sql`${minerSpends.minerPublicKey} is not null`
      )
    )
    .orderBy(sql`${minerSpends.burnBlockHeight} desc`)
    .limit(40);
  const senders = await seedSenders(recent, new Map());
  let built = 0;
  let inserted = 0;
  // Insert after each address so a failed or hung walk keeps earlier work.
  for (const [address, key] of senders) {
    const rows: (typeof minerSpends.$inferInsert)[] = [];
    try {
      await walkHistory(address, minHeight, (txs) => {
        for (const tx of txs) {
          const hash = tx.status.block_hash?.replace('0x', '') ?? '';
          const block = gapBlocks.get(hash);
          const row = block && commitRow(tx, block, address, key, rows.length);
          if (row) rows.push(row);
        }
      });
    } catch (e) {
      log(`gap spends: ${address} walk aborted: ${String(e).slice(0, 80)}`);
    }
    built += rows.length;
    for (const batch of chunk(rows, 500)) {
      if (dryRun) continue;
      const res = await db
        .insert(minerSpends)
        .values(batch)
        .onConflictDoNothing()
        .returning({ id: minerSpends.id });
      inserted += res.length;
    }
    log(
      `gap spends: ${address} built=${rows.length} inserted so far=${inserted}`
    );
  }
  log(`gap spends: built=${built} inserted=${inserted}`);
  if (dryRun) return;
  const fixed = await db.execute(sql`
    update burn_blocks b set pox_spend_sats = x.pox, burn_amount_sats = x.burn
    from (select burn_block_hash, sum(spend_sats) as pox, sum(burn_sats) as burn
          from miner_spends where network_key = ${networkKey} group by 1) x
    where b.network_key = ${networkKey} and b.burn_block_hash = x.burn_block_hash
      and (b.pox_spend_sats, b.burn_amount_sats) = (0, 0)
      and (x.pox, x.burn) <> (0, 0)`);
  log(`gap spends: burn block totals corrected=${fixed.rowCount}`);
}

async function report() {
  const [summary] = await db
    .select({
      rows: sql<number>`count(*)`,
      unresolved: sql<number>`count(*) filter (where ${minerSpends.minerPublicKey} is null)`,
      miners: sql<number>`count(distinct ${minerSpends.minerAddress})`,
      sats: sql<string>`sum(${minerSpends.spendSats})`,
      burnSats: sql<string>`sum(${minerSpends.burnSats})`,
      minH: sql<number>`min(${minerSpends.burnBlockHeight})`,
      maxH: sql<number>`max(${minerSpends.burnBlockHeight})`,
    })
    .from(minerSpends)
    .where(
      and(
        eq(minerSpends.networkKey, networkKey),
        gte(minerSpends.burnBlockHeight, startBurnHeight)
      )
    );
  log('miner_spends:', summary);
  const mismatch = await db.execute(sql`
    select count(*) as blocks from (
      select b.burn_block_hash, b.pox_spend_sats, coalesce(sum(s.spend_sats), 0) as per_tx
      from burn_blocks b
      left join miner_spends s on s.network_key = b.network_key and s.burn_block_hash = b.burn_block_hash
      where b.network_key = ${networkKey} and b.burn_block_height >= ${startBurnHeight}
      group by 1, 2
    ) x where pox_spend_sats <> per_tx`);
  log('burn blocks where per-commit sum != pox_spend_sats:', mismatch.rows[0]);
  const perMiner = await db.execute(sql`
    select s.miner_address, count(*) as commits,
      count(*) filter (where exists (select 1 from burn_blocks b where b.network_key = s.network_key and b.burn_block_hash = s.burn_block_hash and b.winning_txid = s.txid)) as wins,
      sum(s.spend_sats) as spend_sats, sum(s.burn_sats) as burn_sats,
      (select sum(coinbase_ustx + tx_fees_anchored_ustx + tx_fees_streamed_confirmed_ustx + tx_fees_streamed_produced_ustx)
         from miner_rewards r where r.network_key = s.network_key and r.miner_address = s.miner_address
           and r.earned_burn_block_height >= ${startBurnHeight}) as revenue_ustx
    from miner_spends s
    where s.network_key = ${networkKey} and s.burn_block_height >= ${startBurnHeight}
    group by s.network_key, s.miner_address order by commits desc`);
  console.table(perMiner.rows);
}

const only = args.only;
if (!only || only === 'winners') await backfillWinners();
if (!only || only === 'spends') await backfillSpends();
if (!only || only === 'senders') await backfillSenders();
if (!only || only === 'gap') {
  await gapWinners();
  await gapSpends();
}
await report();

await hiro.end();
await prodClient.end();
