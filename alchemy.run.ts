import alchemy from 'alchemy';
import {
  KVNamespace,
  Worker,
  D1Database,
  WranglerJson,
  CustomDomain,
  Website,
  Vite,
} from 'alchemy/cloudflare';
import { Exec } from 'alchemy/os';

const app = await alchemy('slot-watch', {
  stage: 'prod',
  phase: process.argv.includes('--destroy') ? 'destroy' : 'up',
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
});

const d1 = await D1Database('slot-watch-db', {
  name: 'slot-watch-db',
  migrationsDir: 'server/drizzle',
});

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
});

await WranglerJson('wrangler-website', {
  worker: website,
  path: 'client/wrangler.jsonc',
});

await CustomDomain('slot-watch-website-domain', {
  name: 'slotwatch.dev',
  zoneId: '121c1d3bc83456fd77bf1957012e03bc',
  workerName: website.name,
});

const worker = await Worker('slot-watch-worker', {
  name: 'slot-watch-worker',
  entrypoint: 'server/src/server.ts',
  compatibilityFlags: ['nodejs_compat'],
  compatibilityDate: '2025-05-29',
  observability: {
    enabled: true,
  },
  bindings: {
    CACHE: kv,
    DB: d1,
  },
});

const domain = await CustomDomain('slot-watch-api-domain', {
  name: 'api.slotwatch.dev',
  zoneId: '121c1d3bc83456fd77bf1957012e03bc',
  workerName: worker.name,
});

await WranglerJson('wrangler-worker', {
  worker,
  path: 'server/wrangler.jsonc',
});

await app.finalize();
