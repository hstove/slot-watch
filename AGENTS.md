# Agent Instructions for Slot Watch

Slot watch is a project for monitoring the Stacks blockchain. It's primarily intended for core blockchain developers and others who want to dive into the nitty-gritty of blocks.

The primary focus of slot watch is around how Signers sign proposed blocks. Each signer has an assigned "slot", hence the name.

## Workspace

- `./server`: API Server. Learn more in `./server/AGENTS.md`.
- `./common`: Shared utilities and types
- `./client`: Frontend React application. Learn more in `./client/AGENTS.md`.
- `./streamer`: Rust-based event streaming service
- `./.agents/skills/cloudflare/SKILL.md`: Local Cloudflare operations skill for production management, Worker logs, deploys, KV/cache state, and incident response.
- `./.agents/skills/slot-watch-pr/SKILL.md`: `/slot-watch-pr` skill for opening and updating pull requests, including before/after screenshots and recordings for UI changes.

## Root-level Commands

- `bun typecheck`: Run TypeScript type checks across all packages.
- `bun check:fix`: Linting and formatting checks. Use the `:fix` command because it'll automatically fix most issues without any danger.
- `bun check:all`: Run both `bun check:fix` and `bun typecheck` commands - use this when you're wrapping up work and just want to check everything at once.

## Dev Workflow

> Note: `CLAUDE.md` is a symlink to `AGENTS.md`. Only edit `AGENTS.md`.

### Server: don't run it locally

The API server can't meaningfully be run locally. All of its data comes from a live Stacks node emitting event-observer webhooks at the deployed Worker, so a local server has no real data to work with. Don't waste time booting it or trying to synthesize events.

The actual loop for server changes is:

1. Make the change, then `bun check:all`.
2. Deploy to production with `bun deploy:alchemy` (defined in `alchemy.run.ts`).
3. Verify against the live API (`curl -i https://api.slotwatch.dev/...`) and by reading Worker logs.

This means server changes are deployed to prod to be tested. Keep changes resilient — a failure in diagnostic/metrics code shouldn't take down user-facing routes.

### Client: run locally against prod

Run the client with `bun dev:client:tee` from the repo root, then open `https://slotwatch.localhost` (not `localhost:<port>`). It points at the production API and streamer, so you get real data. Logs go to `client/tmp/dev-server.log`. See `./client/AGENTS.md` for more.

### Cloudflare logs & production state

Read `./.agents/skills/cloudflare/SKILL.md` first — it has the production map (Worker names, domains, KV/Hyperdrive bindings, secrets), the incident workflow, and known failure patterns.

For inspecting prod, use the `executor` MCP tool with the Cloudflare integration. Tools live under `tools.cloudflare.org.stackslabs.*`; discover them with `tools.search({ namespace: "cloudflare", query: "..." })` and inspect shapes with `tools.describe.tool({ path })`. Useful for Worker versions/deployments (confirming your deploy is actually the one serving traffic) and KV reads. Worker observability log queries go through the Cloudflare API's telemetry query endpoint — see the skill for the filters that matter (`$metadata.service`, `$metadata.trigger`, `$workers.scriptVersion.id`).

### Database migrations: never run them without permission

Non-breaking backend changes (new routes, new optional fields, new nullable columns or tables) are fine. You may edit `server/src/db/schema.ts` and generate migration files with `bun --cwd server generate-migrations`. But never run migrations (`bun migrate`, `drizzle-kit migrate`, `drizzle-kit push`, or schema-changing SQL) unless Hank explicitly gives permission in the conversation. `.env.local` points at the production database, so running one is a production change.

### Pull requests

Use the `/slot-watch-pr` skill (`./.agents/skills/slot-watch-pr/SKILL.md`) whenever you open or update a PR. UI changes need before/after screenshots, or a short recording for motion and live updates. Call out any migrations and breaking changes in the PR description.

### CI & preview deployments

CI runs `bun check:all` on every PR and fails if it leaves a diff, so run `bun check:all` before pushing. Contributors' PRs also get an Alchemy preview stage (`pr-<N>`: API + website on `workers.dev`, read-only DB, no ingest) that is destroyed when the PR closes. Any stage other than `prod` is a preview in `alchemy.run.ts`. Details and one-time setup: `history/2026-11-02-preview-deployments.md`.

### Managing Planning Documents

Often times, we'll want to create and use planning documents when working on larger features. These should live under a `./history` directory. For project-wide planning, use the root-level `./history` directory. Otherwise, use the `./${workspace}/history` directory.

## How Slot Watch works

The basic workflow for Slot Watch as an overall service is:

- Stacks Nodes emit events (essentially webhooks) to an "event observer" service. The Slot Watch API server is an event observer. This is how all data for Slot Watch is ingested.
  - `POST /stackerdb_chunks`: StackerDB messages
  - `POST /new_block`: New Stacks block
  - `POST /new_burn_block`: New Bitcoin block
- The Slot Watch API server decodes this information and saves it to a DB.
- For Realtime info, the API sends data to a "streamer" service, which is a simple SSE-based service that our client listens to.
- The client ingests data via "vanilla" API requests to the Slot Watch API server, along with SSE subscriptions to the streamer service.

### StackerDB

Part of the Stacks architecture is a service called "StackerDB", which is a networking service that only allows writes to come from Stacks miners and Stacks signers. Miners and Signers encode various messages, like block proposals and block responses, and send them to StackerDB.

StackerDB messages are encoded using a custom Rust-based codec. This codec is re-implemented in this project in the `common` workspace, primarily at `./common/src/codec/index.ts`.

At a high level, the important StackerDB messages are:

- `BlockProposal`: a Stacks miner proposes a new block
- `BlockResponse`: a Stacks signer responds (accept/reject) to a block proposal
- `StateMachineUpdate`: a Stacks signer broadcasts an update to their state machine (ie their current view of chain). This is used by Stacks signers to coordinate and determine a "global" view of the blockchain.
- `BlockPreCommit`: Stacks signers implement a two-phase commit protocol for responding to blocks.

### Signers

On Stacks, signers are responsible for approving proposed blocks by miners. Anyone can become a signer by locking their Stacks (called "Stacking") through a protocol called "Proof-of-transfer", or "PoX". Signers are selected according to their weight every 2100 Bitcoin blocks (roughly 2 weeks).
