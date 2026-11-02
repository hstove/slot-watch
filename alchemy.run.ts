import alchemy from 'alchemy';
import {
  DurableObjectNamespace,
  KVNamespace,
  Worker,
  WranglerJson,
  Hyperdrive,
  CustomDomain,
  Website,
} from 'alchemy/cloudflare';
import { Exec } from 'alchemy/os';
import { CloudflareStateStore } from 'alchemy/state';
import { appendFileSync } from 'node:fs';

/**
 * `prod` is the real deployment. Any other stage (e.g. `pr-42`, deployed by
 * `.github/workflows/preview.yml`) is a preview: its own Workers + KV, a
 * read-only database role, no custom domains, no streamer deploy, and no
 * event-observer ingest.
 */
function resolveStage() {
  const i = process.argv.indexOf('--stage');
  const fromArgs = i === -1 ? undefined : process.argv[i + 1];
  return fromArgs ?? process.env.STAGE ?? 'prod';
}

const stage = resolveStage();
const isProd = stage === 'prod';
const isDestroy = process.argv.includes('--destroy');

if (isProd && isDestroy) {
  throw new Error('Refusing to destroy the prod stage.');
}

/** Required env var; throws early with a clear message instead of deploying junk. */
function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name} for stage "${stage}"`);
  }
  return value;
}

/** Prod keeps its historical resource names; previews get a stage suffix. */
const named = (base: string) => (isProd ? base : `${base}-${stage}`);

const DB_HOST = 'db.gfbcmmnyivekyvrxdcul.supabase.co';
const DB_PORT = 5432;
const DB_NAME = 'postgres';
/** Read-only role used by previews. See history/2026-11-02-preview-deployments.md. */
const PREVIEW_DB_USER = 'slot_watch_readonly';
const PROD_API_URL = 'https://api.slotwatch.dev';
const PROD_STREAMER_URL = 'https://slot-watch-streamer.fly.dev';
const SLOTWATCH_ZONE_ID = '121c1d3bc83456fd77bf1957012e03bc';

const app = await alchemy('slot-watch', {
  stage,
  phase: isDestroy ? 'destroy' : 'up',
  password: process.env.ALCHEMY_PASSWORD,
  stateStore: (scope) =>
    new CloudflareStateStore(scope, {
      forceUpdate: true,
    }),
});

const kv = await KVNamespace('cache', {
  title: named('slot-watch-cache'),
  adopt: isProd,
});

const previewDbPassword = isProd
  ? undefined
  : requireEnv('PREVIEW_DATABASE_PASSWORD');

const previewDbUrl = `postgresql://${PREVIEW_DB_USER}:${encodeURIComponent(
  previewDbPassword ?? ''
)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

const db = await Hyperdrive('slot-watch-pg', {
  name: named('slot-watch-pg-hyperdrive'),
  origin: {
    host: DB_HOST,
    port: DB_PORT,
    user: isProd ? 'postgres' : PREVIEW_DB_USER,
    database: DB_NAME,
    password: alchemy.secret(
      isProd ? process.env.DATABASE_PASSWORD : previewDbPassword
    ),
  },
  dev: {
    origin: alchemy.secret(isProd ? process.env.DATABASE_URL : previewDbUrl),
  },
  caching: {
    disabled: true,
  },
});

/**
 * better-auth (Google sign-in) is only wired up when all of its secrets are
 * set. Previews never get them: their database is read-only, so sessions
 * couldn't be stored anyway. Without them the API's auth routes return 503.
 */
const authBindings =
  isProd &&
  process.env.BETTER_AUTH_SECRET &&
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET
    ? {
        BETTER_AUTH_SECRET: alchemy.secret(process.env.BETTER_AUTH_SECRET),
        GOOGLE_CLIENT_ID: alchemy.secret(process.env.GOOGLE_CLIENT_ID),
        GOOGLE_CLIENT_SECRET: alchemy.secret(process.env.GOOGLE_CLIENT_SECRET),
      }
    : {};

/** Holds the mempool.space WebSocket and persists miner commit activity. */
const minerCommits = DurableObjectNamespace('miner-commits-watcher', {
  className: 'MinerCommitsWatcher',
  sqlite: true,
});

export const worker = await Worker('slot-watch-worker', {
  name: named('slot-watch-worker'),
  entrypoint: 'server/src/server.ts',
  // Previews don't run the cron: it starts the miner-commits watcher and
  // writes hourly prices, neither of which a read-only preview can do.
  crons: isProd ? ['*/5 * * * *'] : [],
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
  // The preview API is served from workers.dev (the client is built against
  // this URL); prod uses api.slotwatch.dev.
  ...(isProd ? {} : { url: true }),
  bindings: {
    CACHE: kv,
    DB: db,
    SLOT_WATCH_STAGE: stage,
    // Previews never push to the shared streamer.
    STREAMER_URL: isProd ? PROD_STREAMER_URL : 'https://streamer.invalid',
    // Previews get a throwaway token, so event-observer ingest is rejected.
    OBSERVER_TOKEN: alchemy.secret(
      isProd ? process.env.OBSERVER_TOKEN : crypto.randomUUID()
    ),
    DATABASE_URL: alchemy.secret(
      isProd ? process.env.DATABASE_URL : previewDbUrl
    ),
    // Only used to bulk-write KV on ingest; previews get no API token.
    KV_API_TOKEN: alchemy.secret(
      isProd ? process.env.KV_API_TOKEN : 'preview-disabled'
    ),
    CF_KV_ACCOUNT_ID: alchemy.secret(
      isProd ? process.env.CF_KV_ACCOUNT_ID : 'preview-disabled'
    ),
    KV_NAMESPACE_ID: alchemy.secret(
      isProd ? process.env.KV_NAMESPACE_ID : kv.namespaceId
    ),
    HIRO_API_KEY: alchemy.secret(process.env.HIRO_API_KEY),
    MINER_COMMITS: minerCommits,
    ...authBindings,
  },
  adopt: isProd,
});

const apiUrl = isProd ? PROD_API_URL : worker.url;
if (!apiUrl) {
  throw new Error(`Worker ${worker.name} has no URL`);
}

await Exec('build', {
  command: 'bun run build:client',
  env: {
    VITE_SLOTS_API_URL: apiUrl,
  },
});

const website = await Website('slot-watch-website', {
  name: named('slot-watch-website'),
  assets: 'client/dist',
  wrangler: {
    main: 'client/worker.ts',
  },
  compatibilityFlags: ['nodejs_compat'],
  compatibilityDate: '2025-05-29',
  bindings: {
    VITE_SLOTS_API_URL: apiUrl,
    API_WORKER: worker,
  },
  adopt: isProd,
});

if (isProd) {
  await CustomDomain('slot-watch-api-domain', {
    name: 'api.slotwatch.dev',
    zoneId: SLOTWATCH_ZONE_ID,
    workerName: worker.name,
    adopt: true,
  });

  await WranglerJson({
    worker,
    path: 'server-wrangler.jsonc',
  });

  await WranglerJson({
    worker: website,
    path: 'client/wrangler.jsonc',
  });

  await CustomDomain('slot-watch-website-domain', {
    name: 'slotwatch.dev',
    zoneId: SLOTWATCH_ZONE_ID,
    workerName: website.name,
    adopt: true,
  });

  await Exec('deploy-streamer', {
    command: 'flyctl deploy --depot --depot-scope app',
    cwd: 'streamer',
    memoize: process.env.CI
      ? false
      : {
          patterns: [
            './streamer/**/*.rs',
            './streamer/Cargo.toml',
            './streamer/Cargo.lock',
            './streamer/Dockerfile',
            './streamer/fly.toml',
            './streamer/.dockerignore',
          ],
        },
  });

  await Exec('format', {
    command: 'bun run check:fix',
  });
} else {
  // e.g. https://pr-17-preview.slotwatch.dev. Kept one level deep so the
  // zone's `*.slotwatch.dev` Universal SSL cert covers it immediately, instead
  // of waiting minutes for a dedicated cert. Removed by `alchemy destroy`.
  const previewDomain = await CustomDomain(
    'slot-watch-website-preview-domain',
    {
      name: `${stage}-preview.slotwatch.dev`,
      zoneId: SLOTWATCH_ZONE_ID,
      workerName: website.name,
    }
  );
  const websiteUrl = `https://${previewDomain.name}`;
  console.log(`Preview website: ${websiteUrl}`);
  console.log(`Preview API: ${apiUrl}`);
  // Surface the URLs to the GitHub Actions job (environment URL + summary).
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `website_url=${websiteUrl}\napi_url=${apiUrl}\n`
    );
  }
}

await app.finalize();
