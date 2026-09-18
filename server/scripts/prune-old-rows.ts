/**
 * Prunes rows older than a cutoff from a table whose `id` is a uuidv7, by
 * walking forward through time windows and deleting each window with a plain
 * `id >= lo AND id < hi` range scan on the primary key.
 *
 * Why windows instead of `DELETE ... LIMIT n`: after a mass delete the low end
 * of the pkey index is full of dead entries until VACUUM runs, so every
 * `ORDER BY id LIMIT n` re-walks them (we measured ~6s of skipping plus ~6s of
 * planning per batch). Forward windows never revisit deleted ranges.
 *
 * The window adapts to keep each delete near --target rows. Progress is
 * persisted to a state file so the run can be stopped and resumed.
 *
 * Usage (from ./server):
 *   bun --env-file=../.env.local scripts/prune-old-rows.ts \
 *     --table block_responses --older-than 6mo [--target 50000] [--pace 0.5] [--dry-run]
 */
import postgres from 'postgres';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ALLOWED_TABLES = new Set([
  'block_responses',
  'state_machine_updates',
  'block_pre_commits',
  'block_pushes',
]);

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const table = arg('table', '');
if (!ALLOWED_TABLES.has(table)) {
  throw new Error(`--table must be one of ${[...ALLOWED_TABLES].join(', ')}`);
}
const target = Number(arg('target', '50000'));
// Sleep this fraction of each delete's duration, leaving IO headroom for prod.
const pace = Number(arg('pace', '0.5'));
const dryRun = flag('dry-run');
const stateFile = `tmp/prune-${table}.state.json`;

const OLDER_THAN_RE = /^(\d+)(mo|d|h)$/;

function parseOlderThan(s: string): Date {
  const m = OLDER_THAN_RE.exec(s);
  if (!m) throw new Error('--older-than must look like 6mo, 90d or 12h');
  const n = Number(m[1]);
  const d = new Date();
  if (m[2] === 'mo') d.setUTCMonth(d.getUTCMonth() - n);
  else if (m[2] === 'd') d.setUTCDate(d.getUTCDate() - n);
  else d.setUTCHours(d.getUTCHours() - n);
  return d;
}
const cutoff = parseOlderThan(arg('older-than', '6mo') ?? '6mo');

export function uuid7At(ms: number) {
  const h = ms.toString(16).padStart(12, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-7000-8000-000000000000`;
}
export function msOfUuid7(id: string) {
  return Number.parseInt(id.replace('-', '').slice(0, 12), 16);
}

const MIN_WINDOW = 10_000; // 10s
const MAX_WINDOW = 12 * 3_600_000; // 12h

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const sql = postgres(databaseUrl.replace(':6543', ':5432'), {
  max: 1,
  keep_alive: 20,
  idle_timeout: 0,
  prepare: false,
});

async function main() {
  await sql.unsafe('set statement_timeout = 0');
  const cutoffMs = cutoff.getTime();

  let frontierMs: number;
  let windowMs = 5 * 60_000;
  if (existsSync(stateFile)) {
    const s = JSON.parse(readFileSync(stateFile, 'utf8'));
    frontierMs = s.frontierMs;
    windowMs = s.windowMs ?? windowMs;
    console.log(`resuming from ${new Date(frontierMs).toISOString()}`);
  } else {
    const [{ min }] = await sql.unsafe<{ min: string | null }[]>(
      `select min(id) from ${table}`
    );
    if (!min) return console.log('table is empty');
    frontierMs = msOfUuid7(min);
  }
  console.log(
    `${table}: pruning ${new Date(frontierMs).toISOString()} -> ${cutoff.toISOString()} ` +
      `(target ${target}/batch, pace ${pace}${dryRun ? ', DRY RUN' : ''})`
  );

  let total = 0;
  const started = Date.now();
  while (frontierMs < cutoffMs) {
    const hiMs = Math.min(frontierMs + windowMs, cutoffMs);
    const lo = uuid7At(frontierMs);
    const hi = uuid7At(hiMs);
    const t0 = Date.now();
    let rows: number;
    if (dryRun) {
      const [{ count }] = await sql.unsafe<{ count: string }[]>(
        `select count(*) from ${table} where id >= $1 and id < $2`,
        [lo, hi]
      );
      rows = Number(count);
    } else {
      const res = await sql.unsafe(
        `delete from ${table} where id >= $1 and id < $2`,
        [lo, hi]
      );
      rows = res.count;
    }
    const ms = Date.now() - t0;
    total += rows;
    console.log(
      `${new Date(frontierMs).toISOString()} +${(windowMs / 60_000).toFixed(1)}m ` +
        `rows=${rows} ${ms}ms ${rows ? Math.round((rows / ms) * 1000) : 0}/s total=${total}`
    );

    frontierMs = hiMs;
    if (rows > target * 2) windowMs = Math.max(MIN_WINDOW, windowMs / 2);
    else if (rows < target / 2) windowMs = Math.min(MAX_WINDOW, windowMs * 2);
    writeFileSync(stateFile, JSON.stringify({ frontierMs, windowMs, total }));

    if (pace > 0 && rows > 0)
      await new Promise((r) => setTimeout(r, Math.min(ms * pace, 10_000)));
  }
  const mins = ((Date.now() - started) / 60_000).toFixed(1);
  console.log(`done: ${total} rows in ${mins} min`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
