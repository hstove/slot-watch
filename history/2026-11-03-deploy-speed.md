# Faster Alchemy deploys (#22)

## Baseline (2026-11-02 runs)

Prod (`alchemy-deploy.yml`, ~2m total):

| Step | Time |
| --- | --- |
| Pushover action Docker image build | ~8s |
| `bun install` (no cache) | ~13–16s |
| `bun typecheck` (no cache) | ~9–15s |
| `alchemy deploy` | ~80s |

Inside `alchemy deploy`, everything was sequential: KV → Hyperdrive → Worker (~12s) → client build (~4s) → website (~6s) → domains → **streamer (~48s)** → format. Each resource also paid ~1s of state-store round trips. The streamer redeployed to Fly on every push, because `memoize` was off in CI.

Preview (`preview.yml`, ~1m): `bun install` ~12s, deploy ~50s, also fully sequential.

## Changes

- **Streamer memoized in CI too.** Alchemy's docs suggest turning memoize off in CI for *build* commands, because a skipped build leaves no outputs on disk. `flyctl deploy` produces no local outputs, so memoizing it is safe. The old patterns (`./streamer/**`) were also resolved relative to `cwd: 'streamer'`, so they matched nothing and memoize was broken locally as well. `FORCE_STREAMER_DEPLOY=1` forces a redeploy.
- **Concurrent resources.** The streamer deploy and the prod client build start right away. KV and Hyperdrive deploy together. The API domain and server `wrangler.jsonc` overlap with the website deploy. Previews still build the client after the Worker, because the build needs the Worker's `workers.dev` URL. Resource sequence numbers are still assigned in call order, so `alchemy destroy` still tears down in reverse order.
- **`format` Exec only runs locally.** In CI its output was thrown away.
- **CI caches.** A shared `.github/actions/setup` composite action caches `~/.bun/install/cache` and `.turbo/cache` (typecheck results and client builds).
- **Pushover through `curl`.** Replaces the Docker-based action and sends the same message.

## Follow-ups not done here

- Alchemy `latest` is now the 2.0 (Effect-based) beta. Moving to it means rewriting `alchemy.run.ts`. 0.94.x is the newest 0.x release.
- `CloudflareStateStore({ forceUpdate: true })` re-uploads the state-store worker on every deploy (~1s). It can only be dropped if local and CI use the same `ALCHEMY_STATE_TOKEN`.
- The Worker deploy itself (~12–15s, esbuild bundle and upload) is now the critical path.
