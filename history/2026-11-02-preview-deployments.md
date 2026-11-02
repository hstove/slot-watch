# CI & preview deployments

Tracking issue: #16.

## What runs where

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `.github/workflows/ci.yml` | every PR, pushes to `main` | `bun check:all`, then fails if that produced a diff (unformatted / auto-fixable code). |
| `.github/workflows/preview.yml` | PR opened / reopened / synchronize | `alchemy deploy --stage pr-<N>`: a preview API Worker and website on `workers.dev`. |
| `.github/workflows/preview.yml` | PR closed (merged or not) | `alchemy destroy --stage pr-<N>`. |
| `.github/workflows/alchemy-deploy.yml` | push to `main` | Prod deploy (`--stage prod`), unchanged otherwise. |

Previews only deploy when all of these hold:

- the repo variable `PREVIEW_DEPLOYMENTS` is `true` (master switch);
- the PR branch lives in this repo (fork PRs never receive secrets);
- the PR author is an `OWNER`, `MEMBER` or `COLLABORATOR`.

The deploy job's GitHub environment (`preview`) links the preview website from
the PR, and the job summary lists both URLs.

## How a preview stage differs from prod (`alchemy.run.ts`)

Any stage other than `prod` is a preview:

- Resources are suffixed with the stage (`slot-watch-worker-pr-12`, a fresh KV
  namespace, Hyperdrive config, Durable Object namespace) and never adopt prod
  resources.
- The website is served at `https://<stage>-preview.slotwatch.dev` (e.g.
  `pr-12-preview.slotwatch.dev`). It's kept one level deep so the zone's
  `*.slotwatch.dev` Universal SSL cert covers it right away. A deeper name
  like `pr-12.preview.slotwatch.dev` waited about 3 minutes for a dedicated
  cert. The deploy job also waits for HTTPS before it publishes the link.
  The API stays on `workers.dev`. No prod
  domains, no `WranglerJson` rewrites, no streamer deploy.
- The client is built with `VITE_SLOTS_API_URL` set to the preview Worker URL.
  It reads realtime data from the prod streamer, which is read-only SSE.
- The database connection uses the read-only `slot_watch_readonly` role.
  Previews never receive `DATABASE_PASSWORD` / `DATABASE_URL`.
- Event-observer ingest is disabled: `OBSERVER_TOKEN` is a random throwaway,
  `STREAMER_URL` points at `streamer.invalid`, and there's no KV API token.
- No cron. `/miner-commits/status` returns 503 and `scheduled()` is a no-op
  (`SLOT_WATCH_STAGE !== 'prod'`), so the writer-side miner-commits Durable
  Object never starts.
- `alchemy destroy` refuses to run against `prod`.

## One-time setup (Hank)

1. Create the read-only Postgres role. **This is a production DB change**; run
   it in the Supabase SQL editor:

   ```sql
   create role slot_watch_readonly with login password '<generate-a-password>';
   alter role slot_watch_readonly set default_transaction_read_only = on;
   grant connect on database postgres to slot_watch_readonly;
   grant usage on schema public to slot_watch_readonly;
   grant select on all tables in schema public to slot_watch_readonly;
   grant select on all sequences in schema public to slot_watch_readonly;
   -- Tables created by future migrations (run as postgres) stay readable:
   alter default privileges for role postgres in schema public
     grant select on tables to slot_watch_readonly;
   ```

2. Put `PREVIEW_DATABASE_PASSWORD=<that password>` in `.env.local` and run
   `bun setup:github`. This Alchemy script creates the `preview` GitHub
   environment and stores the password as an environment secret.
3. Previews also use these existing repo secrets: `ALCHEMY_PASSWORD`,
   `ALCHEMY_STATE_TOKEN`, `CLOUDFLARE_API_TOKEN`, `HIRO_API_KEY`.
4. Turn previews on: `gh variable set PREVIEW_DEPLOYMENTS --body true --repo hstove/slot-watch`.

## Caveats

- `alchemy destroy` exits 0 even when a resource fails to delete (alchemy
  swallows the error in the destroy phase), so check the job log if a preview
  looks orphaned. Leftover previews can be removed with
  `bun alchemy destroy --stage pr-<N> --env-file .env.local --profile stackslabs`.
- Read paths that write as a side effect fail on the read-only role. That's
  expected in previews.
