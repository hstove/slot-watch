import alchemy from 'alchemy';
import {
  KVNamespace,
  Worker,
  D1Database,
  WranglerJson,
  Hyperdrive,
  CustomDomain,
  Website,
  Vite,
} from 'alchemy/cloudflare';
import { Exec } from 'alchemy/os';

const app = await alchemy('slot-watch', {
  stage: 'prod',
  phase: process.argv.includes('--destroy') ? 'destroy' : 'up',
  password: process.env.ALCHEMY_PASSWORD,
});

await Exec('build-common', {
  command: 'bun build:common',
  memoize: {
    patterns: ['./common/**/*'],
  },
});

await Exec('build-server', {
  command: 'bun build:server',
  memoize: {
    patterns: ['./server/**/*'],
  },
});

const kv = await KVNamespace('cache', {
  title: 'slot-watch-cache',
  adopt: true,
});

// const d1 = await D1Database('slot-watch-db', {
//   name: 'slot-watch-db',
//   migrationsDir: 'server/drizzle',
//   adopt: true,
// });

const website = await Website('slot-watch-website', {
  name: 'slot-watch-website',
  assets: 'client/dist',
  command: 'bun build:client',
  main: 'client/worker.ts',
  compatibilityFlags: ['nodejs_compat'],
  compatibilityDate: '2025-05-29',
  bindings: {
    VITE_SLOTS_API_URL: 'https://slot-watch.fly.dev',
  },
  adopt: true,
});

await WranglerJson('wrangler-website', {
  worker: website,
  path: 'client/wrangler.jsonc',
  // adopt: true,
});

await CustomDomain('slot-watch-website-domain', {
  name: 'slotwatch.dev',
  zoneId: '121c1d3bc83456fd77bf1957012e03bc',
  workerName: website.name,
});

const db = await Hyperdrive('slot-watch-pg', {
  name: 'slot-watch-pg',
  origin: {
    host: 'db.gfbcmmnyivekyvrxdcul.supabase.co',
    port: 5432,
    user: 'postgres',
    database: 'postgres',
    password: alchemy.secret(process.env.DATABASE_PASSWORD),
  },
  caching: {
    disabled: true,
  },
});

export const worker = await Worker('slot-watch-worker', {
  name: 'slot-watch-worker',
  entrypoint: 'server/src/server.ts',
  compatibilityFlags: ['nodejs_compat'],
  compatibilityDate: '2025-05-29',
  bundle: {
    format: 'esm',
    metafile: true,
    target: 'es2022',
  },
  observability: {
    enabled: true,
  },
  bindings: {
    CACHE: kv,
    DB: db,
    STREAMER_URL: 'https://slot-watch-streamer.fly.dev',
    // UPSTASH_REDIS_REST_URL: alchemy.secret(process.env.UPSTASH_REDIS_REST_URL),
    // UPSTASH_REDIS_REST_TOKEN: alchemy.secret(
    //   process.env.UPSTASH_REDIS_REST_TOKEN,
    // ),
    OBSERVER_TOKEN: alchemy.secret(process.env.OBSERVER_TOKEN),
    DATABASE_URL: alchemy.secret(process.env.DATABASE_URL),
    KV_API_TOKEN: alchemy.secret(process.env.KV_API_TOKEN),
    CF_KV_ACCOUNT_ID: alchemy.secret(process.env.CF_KV_ACCOUNT_ID),
    KV_NAMESPACE_ID: alchemy.secret(process.env.KV_NAMESPACE_ID),
    HIRO_API_KEY: alchemy.secret(process.env.HIRO_API_KEY),
  },
  adopt: true,
});

const domain = await CustomDomain('slot-watch-api-domain', {
  name: 'api.slotwatch.dev',
  zoneId: '121c1d3bc83456fd77bf1957012e03bc',
  workerName: worker.name,
});

await WranglerJson('wrangler-worker', {
  worker,
  path: 'server-wrangler.jsonc',
});

await Exec('deploy-streamer', {
  command: 'fly deploy',
  cwd: 'streamer',
  memoize: {
    patterns: ['./streamer/**/*'],
  },
});

await app.finalize();
