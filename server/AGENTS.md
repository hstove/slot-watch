# Slot Watch API Agent Instructions

This workspace is an API server for Slot Watch.

## Stack

- Hono as the web framework
- Hosted on Cloudflare
- Postgres & Drizzle for the DB
- Effect for more complex backend logic

## Key files & folders

- `src/server.ts`: server entry point
- `src/routes/`: routes for the server
  - `events.routes.ts`
  - `blocks.routes.ts`
  - `signers.routes.ts`
  - `state-machine.routes.ts`
  - `miners.routes.ts`
  - `health.routes.ts`
  - `metrics.routes.ts`
- `src/db/`: Database schema and "model" files
  - `schema.ts`: DB Schema
  - `db.ts`: Database connection and client
  - `serializers.ts`: Serializers to turn DB models into API types
  - `block-responses.ts`: Functions for working with block responses
  - `block-proposals.ts`: Functions for working with block proposals
- `src/better-auth.ts`: Google sign-in via better-auth, mounted at `/api/auth/*` with credentialed CORS for `slotwatch.dev` and `slotwatch.localhost`. Tables are the `auth_*` tables in `schema.ts`. Needs the `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` secrets; without them (and always in previews) the auth routes return 503. The Google OAuth redirect URI is `https://api.slotwatch.dev/api/auth/callback/google`.
- `src/miner-commits/`: `MinerCommitsWatcher` Durable Object. Holds the mempool.space WebSocket for recent miners' commit txs (first-seen, RBFs, drops), compact fee snapshots and Bitcoin block stats, and writes them to `miner_commit_txs`, `mempool_fee_snapshots` and `bitcoin_blocks` through a durable outbox in the DO's SQLite storage. All writes are idempotent so restarts/deploys replay safely; a per-block reconcile job backfills missed RBF versions from mempool.space's RBF tree. Status: `GET /miner-commits/status`.
- `src/metrics.ts`, `src/metrics-miners.ts`: Prometheus gauges for `GET /metrics`. Per-miner economics (wins, spend, revenue/profit by `expected`/`matured` basis) come from `src/db/miner-economics.ts` (queries shared with the miner-economics routes) and `src/metrics-miners-calc.ts` (pure math)
- `src/bitcoin.ts`: Resolves a block commit's miner from its Bitcoin input key (Esplora APIs); the derived STX address keys miners. Rewards paid to a different `miner_address` are re-keyed to it by `rewardAddressMap` in `src/db/miner-economics.ts`
- `scripts/backfill-miner-economics.ts`, `scripts/backfill-miner-spends.ts`: Backfill/repair miner spend and revenue from a local Hiro DB dump plus Bitcoin APIs

## Understanding the data flow

All of Slot Watch's data comes from a Stacks Node's "event dispatcher" service. As such, this workspace is set up to listen to the various event dispatcher endpoints, which are essentially webhooks. The HTTP handlers for this are in `src/routes/events.routes.ts`.

Part of the Stacks architecture is a service called "StackerDB", which is a networking service that only allows writes to come from Stacks miners and Stacks signers. Miners and Signers encode various messages, like block proposals and block responses, and send them to StackerDB. The Stacks node aggregates these various P2P messages and emits them to the `POST /stackerdb_chunks` endpoint.

All of the codec-related code for StackerDB messages is in the `common` workspace, primarily at `../common/src/codec/index.ts`.

Once event dispatcher messages are received, our codebase handles them in various Effect-based handlers. All StackerDB messages are handled in `src/events/stackerdb.ts`, which is where messages are decoded and handled. The handlers for the various message types are in `src/events/block-events.ts`, which is primarily for handling events for new Stacks blocks and new burn (Bitcoin) blocks.
