import alchemy from 'alchemy';
import {
  KVNamespace,
  Worker,
  D1Database,
  WranglerJson,
  CustomDomain,
} from 'alchemy/cloudflare';

const app = await alchemy('slot-watch', {
  stage: 'prod',
  phase: process.argv.includes('--destroy') ? 'destroy' : 'up',
});

const kv = await KVNamespace('cache', {
  title: 'slot-watch-cache',
});

const d1 = await D1Database('slot-watch-db', {
  name: 'slot-watch-db',
  migrationsDir: 'drizzle',
});

const worker = await Worker('slot-watch-worker', {
  name: 'slot-watch-worker',
  entrypoint: 'src/server.ts',
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

await WranglerJson('wrangler', {
  worker,
});

await app.finalize();
