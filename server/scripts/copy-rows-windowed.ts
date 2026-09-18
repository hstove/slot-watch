/**
 * Copies rows with uuidv7 ids in [--from, --to) from --source to --target in
 * short, individually committed time windows. Used to rebuild a bloated table
 * from the rows we keep without holding a single multi-hour statement open
 * (long-lived connections to Supabase have been dropping after ~10 minutes).
 *
 * Progress is persisted so the run can be stopped and resumed.
 *
 * Usage (from ./server):
 *   bun --env-file=../.env.local scripts/copy-rows-windowed.ts \
 *     --source block_responses --target block_responses_new \
 *     --from 2026-03-18T18:53:08Z [--to <iso>] [--window-min 360]
 */
import postgres from 'postgres';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

const source = arg('source');
const target = arg('target');
const from = arg('from');
if (!(source && target && from)) {
  throw new Error('--source, --target and --from are required');
}
if (!(/^[a-z_]+$/.test(source) && /^[a-z_]+$/.test(target))) {
  throw new Error('table names must be [a-z_]+');
}
const to = arg('to');
const toMs = to ? new Date(to).getTime() : Date.now();
const windowMs = Number(arg('window-min', '360')) * 60_000;
const stateFile = `tmp/copy-${target}.state.json`;

function uuid7At(ms: number) {
  const h = ms.toString(16).padStart(12, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-7000-8000-000000000000`;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const sql = postgres(databaseUrl.replace(':6543', ':5432'), {
  max: 1,
  keep_alive: 20,
  idle_timeout: 0,
  prepare: false,
  connect_timeout: 30,
});

async function main() {
  await sql.unsafe('set statement_timeout = 0');
  let frontierMs = new Date(from).getTime();
  if (existsSync(stateFile)) {
    frontierMs = JSON.parse(readFileSync(stateFile, 'utf8')).frontierMs;
    console.log(`resuming from ${new Date(frontierMs).toISOString()}`);
  }
  console.log(
    `${source} -> ${target}: ${new Date(frontierMs).toISOString()} .. ${new Date(toMs).toISOString()}`
  );
  let total = 0;
  const started = Date.now();
  while (frontierMs < toMs) {
    const hiMs = Math.min(frontierMs + windowMs, toMs);
    const t0 = Date.now();
    const res = await sql.unsafe(
      `insert into ${target} select * from ${source} where id >= $1 and id < $2 order by id on conflict do nothing`,
      [uuid7At(frontierMs), uuid7At(hiMs)]
    );
    const ms = Date.now() - t0;
    total += res.count;
    console.log(
      `${new Date(frontierMs).toISOString()} rows=${res.count} ${ms}ms total=${total}`
    );
    frontierMs = hiMs;
    writeFileSync(stateFile, JSON.stringify({ frontierMs, total }));
  }
  console.log(
    `done: ${total} rows in ${((Date.now() - started) / 60_000).toFixed(1)} min`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
