import alchemy from 'alchemy';
import {
  KVNamespace,
  Worker,
  WranglerJson,
  Hyperdrive,
  CustomDomain,
  Website,
} from 'alchemy/cloudflare';
import { Exec } from 'alchemy/os';
import { CloudflareStateStore } from 'alchemy/state';

const app = await alchemy('slot-watch', {
  stage: 'prod',
  phase: process.argv.includes('--destroy') ? 'destroy' : 'up',
  password: process.env.ALCHEMY_PASSWORD,
  stateStore: (scope) => new CloudflareStateStore(scope),
});

await Exec('build', {
  command: 'bun run build:client',
});

const kv = await KVNamespace('cache', {
  title: 'slot-watch-cache',
  adopt: true,
});

const db = await Hyperdrive('slot-watch-pg', {
  name: 'slot-watch-pg-hyperdrive',
  origin: {
    host: 'db.gfbcmmnyivekyvrxdcul.supabase.co',
    port: 5432,
    user: 'postgres',
    database: 'postgres',
    password: alchemy.secret(process.env.DATABASE_PASSWORD),
  },
  dev: {
    origin: alchemy.secret(process.env.DATABASE_URL),
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
    OBSERVER_TOKEN: alchemy.secret(process.env.OBSERVER_TOKEN),
    DATABASE_URL: alchemy.secret(process.env.DATABASE_URL),
    KV_API_TOKEN: alchemy.secret(process.env.KV_API_TOKEN),
    CF_KV_ACCOUNT_ID: alchemy.secret(process.env.CF_KV_ACCOUNT_ID),
    KV_NAMESPACE_ID: alchemy.secret(process.env.KV_NAMESPACE_ID),
    HIRO_API_KEY: alchemy.secret(process.env.HIRO_API_KEY),
  },
  adopt: true,
});

const apiDomain = await CustomDomain('slot-watch-api-domain', {
  name: 'api.slotwatch.dev',
  zoneId: '121c1d3bc83456fd77bf1957012e03bc',
  workerName: worker.name,
  adopt: true,
});

await WranglerJson({
  worker,
  path: 'server-wrangler.jsonc',
});

const website = await Website('slot-watch-website', {
  name: 'slot-watch-website',
  assets: 'client/dist',
  wrangler: {
    main: 'client/worker.ts',
  },
  compatibilityFlags: ['nodejs_compat'],
  compatibilityDate: '2025-05-29',
  bindings: {
    VITE_SLOTS_API_URL: 'https://api.slotwatch.dev',
    API_WORKER: worker,
  },
  adopt: true,
});

await WranglerJson({
  worker: website,
  path: 'client/wrangler.jsonc',
  // adopt: true,
});

await CustomDomain('slot-watch-website-domain', {
  name: 'slotwatch.dev',
  zoneId: '121c1d3bc83456fd77bf1957012e03bc',
  workerName: website.name,
  adopt: true,
});

await Exec('deploy-streamer', {
  command: 'flyctl deploy',
  cwd: 'streamer',
  memoize: process.env.CI
    ? false
    : {
        patterns: ['./streamer/**/*.rs', './streamer/Cargo.toml'],
      },
});

await app.finalize();
