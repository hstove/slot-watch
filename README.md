# Slot Watch

Power tools for Stacks developers.

Live at [slotwatch.dev](https://slotwatch.dev).

## Run the frontend locally

You need [Bun](https://bun.sh) (1.3+). No API keys, env files or database are needed: the frontend uses the hosted API (`https://api.slotwatch.dev`) and streamer by default, so you get real, live data.

```bash
bun install
bun dev
```

Then open **https://slotwatch.localhost**.

`bun dev` runs Vite behind [portless](https://github.com/vercel-labs/portless), which serves the app at a stable `https://slotwatch.localhost` URL. The first time it runs, portless creates a local certificate authority, trusts it, and binds port 443, so it may ask for your `sudo` password. To skip portless and use a plain Vite port instead:

```bash
PORTLESS=0 bun dev   # then open the http://localhost URL Vite prints
```

To point the frontend at a different backend, set these before `bun dev`:

| Variable                  | Default                                |
| ------------------------- | -------------------------------------- |
| `VITE_SLOTS_API_URL`      | `https://api.slotwatch.dev`            |
| `VITE_SLOTS_STREAMER_URL` | `https://slot-watch-streamer.fly.dev`  |

## How it works

1. Stacks nodes send event-observer webhooks (`/new_block`, `/new_burn_block`, `/stackerdb_chunks`) to the API server.
2. The API server decodes them, including StackerDB messages like block proposals and signer responses, and saves them to Postgres.
3. For live updates, the API forwards events to the streamer, a small server-sent events (SSE) service.
4. The frontend reads from the API and subscribes to the streamer.

## Repository layout

| Path        | What it is                                                                        |
| ----------- | --------------------------------------------------------------------------------- |
| `client/`   | Frontend: React, Vite, TanStack Router, Jotai. Deployed to Cloudflare.            |
| `server/`   | API server: Hono, Effect, Drizzle and Postgres on Cloudflare Workers.             |
| `common/`   | Shared types and utilities, including the StackerDB message codec.                |
| `streamer/` | Rust SSE service that relays live events to the frontend (Fly.io).                |
| `plugin/`   | OpenCode agent plugin with tools for querying Slot Watch.                         |
| `history/`  | Planning and design docs.                                                         |

## Checks and tests

```bash
bun check:all             # Biome lint/format (auto-fixes) + TypeScript typecheck
bun --cwd common test     # codec and utility tests
```

CI runs `bun check:all` on every pull request and fails if it leaves a diff.

## Backend development

The API server isn't useful to run locally: its data comes from a live Stacks node posting webhooks to the deployed Worker, and `.env.local` points at the production database. Backend changes are deployed with Alchemy (`alchemy.run.ts`), which needs Cloudflare and database credentials. Pull requests from contributors also get a preview deployment at `pr-<N>-preview.slotwatch.dev`.

See [`AGENTS.md`](AGENTS.md), [`server/AGENTS.md`](server/AGENTS.md) and [`client/AGENTS.md`](client/AGENTS.md) for more detail on each part.
