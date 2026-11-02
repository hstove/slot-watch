/**
 * Backfill miner spend (burn_blocks.pox_spend_sats / burn_amount_sats) and
 * miner revenue (miner_rewards) from a locally restored Hiro
 * stacks-blockchain-api Postgres dump.
 *
 * Usage (from repo root):
 *   bun run --cwd server --env-file=../.env.local scripts/backfill-miner-economics.ts \
 *     [--from 2026-07-01] [--network mainnet] [--dry-run] [--only spend|rewards]
 *
 * Env: DATABASE_URL (target, prod), HIRO_PG_URL (source, defaults to local hiro_api)
 */
import { parseArgs } from 'node:util';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import * as schema from '../src/db/schema';
import { burnBlocks, minerRewards, stacksBlocks } from '../src/db/schema';

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
const prodClient = new Client({ connectionString: process.env.DATABASE_URL });
await hiro.connect();
await prodClient.connect();
await hiro.query('set search_path to stacks_blockchain_api');
const db = drizzle(prodClient, { schema });

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

// Burn height where the requested date range starts, per Hiro's canonical blocks.
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

// ---------------------------------------------------------------------------
// Miner spend: burn_blocks.pox_spend_sats + burn_amount_sats
// ---------------------------------------------------------------------------
async function backfillSpend() {
  // pox_spend = sum of every commit's reward outputs (matches sumPoxSpendSats
  // over pox_transactions). burn_amount comes from burnchain_rewards, which
  // repeats the burn block's top-level burn_amount on every recipient row.
  interface SpendRow {
    burn_block_hash: string;
    burn_block_height: number;
    pox_spend: string | null;
    burn_amount: string | null;
  }
  const { rows } = await hiro.query<SpendRow>(
    `
    with heights as (
      select distinct burn_block_hash, burn_block_height
      from burn_block_pox_txs where canonical and burn_block_height >= $1
      union
      select distinct burn_block_hash, burn_block_height
      from burnchain_rewards where canonical and burn_block_height >= $1
    ),
    pox as (
      select burn_block_hash, sum(amount) as pox_spend
      from burn_block_pox_txs where canonical and burn_block_height >= $1
      group by burn_block_hash
    ),
    burns as (
      select burn_block_hash, max(burn_amount) as burn_amount
      from burnchain_rewards where canonical and burn_block_height >= $1
      group by burn_block_hash
    )
    select encode(h.burn_block_hash, 'hex') as burn_block_hash, h.burn_block_height,
           p.pox_spend::text, b.burn_amount::text
    from heights h
    left join pox p on p.burn_block_hash = h.burn_block_hash
    left join burns b on b.burn_block_hash = h.burn_block_hash
    order by h.burn_block_height
    `,
    [startBurnHeight]
  );
  log(`spend: ${rows.length} Hiro burn blocks from height ${startBurnHeight}`);

  let updated = 0;
  let missing = 0;
  for (const batch of chunk(rows, 500)) {
    const hashes = batch.map((r) => r.burn_block_hash);
    const existing = await db
      .select({
        hash: burnBlocks.burnBlockHash,
        pox: burnBlocks.poxSpendSats,
        burn: burnBlocks.burnAmountSats,
      })
      .from(burnBlocks)
      .where(
        and(
          eq(burnBlocks.networkKey, networkKey),
          inArray(burnBlocks.burnBlockHash, hashes)
        )
      );
    const byHash = new Map(existing.map((e) => [e.hash, e]));
    for (const r of batch) {
      const cur = byHash.get(r.burn_block_hash);
      if (!cur) {
        missing++;
        continue;
      }
      const pox = Number(r.pox_spend ?? 0);
      const burn = Number(r.burn_amount ?? 0);
      if (cur.pox === pox && cur.burn === burn) continue;
      updated++;
      if (dryRun) continue;
      await db
        .update(burnBlocks)
        .set({ poxSpendSats: pox, burnAmountSats: burn })
        .where(
          and(
            eq(burnBlocks.networkKey, networkKey),
            eq(burnBlocks.burnBlockHash, r.burn_block_hash)
          )
        );
    }
  }
  log(`spend: updated=${updated} missingInProd=${missing}`);
}

// ---------------------------------------------------------------------------
// Miner revenue: miner_rewards
// ---------------------------------------------------------------------------
async function backfillRewards() {
  interface RewardRow {
    recipient: string;
    miner_address: string | null;
    coinbase_amount: string;
    tx_fees_anchored: string;
    tx_fees_streamed_confirmed: string;
    tx_fees_streamed_produced: string;
    from_stacks_block_hash: string;
    from_index_block_hash: string;
    mature_block_height: number;
    matured_burn_block_height: number;
    matured_block_time: number;
    earned_burn_block_height: number | null;
  }
  // Hiro's miner_rewards.block_hash is the earning block's hash
  // (from_stacks_block_hash); index_block_hash is the maturing block's.
  // Upsert so rows ingested before the two-entry fix get their fee shares.
  const { rows } = await hiro.query<RewardRow>(
    `
    select mr.recipient, mr.miner_address,
           mr.coinbase_amount::text, mr.tx_fees_anchored::text,
           mr.tx_fees_streamed_confirmed::text, mr.tx_fees_streamed_produced::text,
           mr.from_stacks_block_hash, mr.from_index_block_hash, mr.mature_block_height,
           b.burn_block_height as matured_burn_block_height,
           greatest(b.block_time, b.burn_block_time) as matured_block_time,
           eb.burn_block_height as earned_burn_block_height
    from (
      -- The node emits two entries per (from_index, recipient) for a maturing
      -- block: coinbase + anchored fees, and streamed-produced fees. Sum them.
      select index_block_hash, recipient, max(miner_address) as miner_address,
             sum(coinbase_amount) as coinbase_amount,
             sum(tx_fees_anchored) as tx_fees_anchored,
             sum(tx_fees_streamed_confirmed) as tx_fees_streamed_confirmed,
             sum(tx_fees_streamed_produced) as tx_fees_streamed_produced,
             min(encode(block_hash, 'hex')) as from_stacks_block_hash,
             encode(from_index_block_hash, 'hex') as from_index_block_hash,
             min(mature_block_height) as mature_block_height
      from miner_rewards
      where canonical
      group by index_block_hash, from_index_block_hash, recipient
    ) mr
    join blocks b on b.index_block_hash = mr.index_block_hash and b.canonical
    left join blocks eb on eb.index_block_hash = decode(mr.from_index_block_hash, 'hex')
    where b.burn_block_height >= $1
    order by mr.mature_block_height, mr.recipient
    `,
    [startBurnHeight]
  );
  log(
    `rewards: ${rows.length} Hiro matured reward rows from burn height ${startBurnHeight}`
  );

  let upserted = 0;
  let unresolved = 0;
  for (const batch of chunk(rows, 500)) {
    const fromHashes = [...new Set(batch.map((r) => r.from_index_block_hash))];
    const earned = await db
      .select({
        indexBlockHash: stacksBlocks.indexBlockHash,
        consensusHash: stacksBlocks.consensusHash,
        burnBlockHeight: stacksBlocks.burnBlockHeight,
      })
      .from(stacksBlocks)
      .where(
        and(
          eq(stacksBlocks.networkKey, networkKey),
          inArray(stacksBlocks.indexBlockHash, fromHashes)
        )
      );
    const earnedByHash = new Map(earned.map((e) => [e.indexBlockHash, e]));

    // Fallback for earning blocks we never indexed: burn height from Hiro,
    // consensus hash from our burn_blocks at that height.
    const fallbackHeights = [
      ...new Set(
        batch.flatMap((r) =>
          !earnedByHash.has(r.from_index_block_hash) &&
          r.earned_burn_block_height != null
            ? [r.earned_burn_block_height]
            : []
        )
      ),
    ];
    const fallbackBurn = fallbackHeights.length
      ? await db
          .select({
            height: burnBlocks.burnBlockHeight,
            consensusHash: burnBlocks.consensusHash,
          })
          .from(burnBlocks)
          .where(
            and(
              eq(burnBlocks.networkKey, networkKey),
              inArray(burnBlocks.burnBlockHeight, fallbackHeights)
            )
          )
      : [];
    const consensusByHeight = new Map(
      fallbackBurn.map((b) => [b.height, b.consensusHash])
    );

    const values = batch.map((r) => {
      const e = earnedByHash.get(r.from_index_block_hash);
      const earnedBurnBlockHeight =
        e?.burnBlockHeight ?? r.earned_burn_block_height ?? null;
      const earnedConsensusHash =
        e?.consensusHash ??
        (earnedBurnBlockHeight != null
          ? (consensusByHeight.get(earnedBurnBlockHeight) ?? null)
          : null);
      if (earnedConsensusHash == null) unresolved++;
      return {
        id: uuidv7({ msecs: r.matured_block_time * 1000 }),
        networkKey,
        recipient: r.recipient,
        minerAddress: r.miner_address,
        coinbaseUstx: Number(r.coinbase_amount),
        txFeesAnchoredUstx: Number(r.tx_fees_anchored),
        txFeesStreamedConfirmedUstx: Number(r.tx_fees_streamed_confirmed),
        txFeesStreamedProducedUstx: Number(r.tx_fees_streamed_produced),
        fromStacksBlockHash: r.from_stacks_block_hash,
        fromIndexBlockHash: r.from_index_block_hash,
        maturedBlockHeight: r.mature_block_height,
        maturedBurnBlockHeight: r.matured_burn_block_height,
        earnedConsensusHash,
        earnedBurnBlockHeight,
      };
    });
    if (dryRun) continue;
    const res = await db
      .insert(minerRewards)
      .values(values)
      .onConflictDoUpdate({
        target: [
          minerRewards.networkKey,
          minerRewards.fromIndexBlockHash,
          minerRewards.recipient,
        ],
        set: {
          coinbaseUstx: sql`excluded.coinbase_ustx`,
          txFeesAnchoredUstx: sql`excluded.tx_fees_anchored_ustx`,
          txFeesStreamedConfirmedUstx: sql`excluded.tx_fees_streamed_confirmed_ustx`,
          txFeesStreamedProducedUstx: sql`excluded.tx_fees_streamed_produced_ustx`,
          earnedConsensusHash: sql`coalesce(${minerRewards.earnedConsensusHash}, excluded.earned_consensus_hash)`,
          earnedBurnBlockHeight: sql`coalesce(${minerRewards.earnedBurnBlockHeight}, excluded.earned_burn_block_height)`,
        },
      })
      .returning({ id: minerRewards.id });
    upserted += res.length;
  }
  log(`rewards: upserted=${upserted} unresolvedEarnedConsensus=${unresolved}`);

  // Repair rows (existing or new) whose earned_* attribution is still null.
  if (!dryRun) {
    const repaired = await db.execute(sql`
      update miner_rewards mr
      set earned_consensus_hash = sb.consensus_hash,
          earned_burn_block_height = sb.burn_block_height
      from stacks_blocks sb
      where mr.network_key = ${networkKey}
        and sb.network_key = mr.network_key
        and sb.index_block_hash = mr.from_index_block_hash
        and mr.earned_consensus_hash is null
    `);
    log(`rewards: repaired null earned_* rows=${repaired.rowCount}`);
  }
  const [{ nulls }] = await db
    .select({ nulls: sql<number>`count(*)::int` })
    .from(minerRewards)
    .where(
      and(
        eq(minerRewards.networkKey, networkKey),
        isNull(minerRewards.earnedConsensusHash)
      )
    );
  log(`rewards: remaining null earned_consensus_hash rows=${nulls}`);
}

if (args.only !== 'rewards') await backfillSpend();
if (args.only !== 'spend') await backfillRewards();

await hiro.end();
await prodClient.end();
