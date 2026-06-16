---
name: cloudflare
description: Investigate and manage Slot Watch production on Cloudflare, including Workers, deployed versions, observability logs, KV cache state, Alchemy deploys, and endpoint verification. Use for prod incidents, API 500s, Worker 1101s, failed frontend routes, Cloudflare bindings, or deployment checks.
---

# Slot Watch Cloudflare Operations

Use this skill for production management and incident response involving Cloudflare-hosted Slot Watch services.

## Production Map

- API Worker: `slot-watch-worker`
- Website Worker: `slot-watch-website`
- API domain: `https://api.slotwatch.dev`
- Website domain: `https://slotwatch.dev`
- Stacks signer page: `https://slotwatch.dev/signers`
- Reported signer API dependency: `https://api.slotwatch.dev/signer-recency/mainnet`
- KV namespace binding: `CACHE`
- KV namespace id: `4d65a9f9771f4b2d8887dc2c89cf766f`
- Hyperdrive binding: `DB`
- Hyperdrive id: `0d80e28aec7241daa9692ec6f7d0e409`
- Streamer URL: `https://slot-watch-streamer.fly.dev`

Important Worker secrets/bindings:

- `HIRO_API_KEY`: used for Hiro API requests. If Hiro returns plain-text rate limit bodies, make sure code paths pass this key.
- `KV_API_TOKEN`, `CF_KV_ACCOUNT_ID`, `KV_NAMESPACE_ID`: used by server code for Cloudflare KV bulk writes.
- `DATABASE_URL`, `DB`: Postgres/Hyperdrive access.
- `OBSERVER_TOKEN`: event observer auth.

## Fast Incident Workflow

1. Reproduce the failing public URL with `curl -i --max-time 30`.
2. If the response is Cloudflare `error code: 1101`, inspect Worker logs before changing code.
3. Use Cloudflare Workers observability for the relevant service:
   - Filter `$metadata.service = slot-watch-worker` for API incidents.
   - Filter `$metadata.service = slot-watch-website` for frontend/asset incidents.
   - Filter `$metadata.trigger` by route, such as `signer-recency`.
4. Check whether requests are served by the newest deployed Worker version:
   - List versions for the script.
   - List deployments for the script.
   - Compare log `$workers.scriptVersion.id` to the active deployment version id.
5. Read the route code and its upstream/cache dependencies. For signer recency, useful files are:
   - `server/src/routes/signers.routes.ts`
   - `server/src/db/block-responses.ts`
   - `server/src/metrics.ts`
   - `server/src/stacks-api.ts`
   - `common/src/stacks-api.ts`
6. Prefer resilient fixes for diagnostic/metrics code. Metrics warmup should not take down user-facing API routes.
7. Verify locally with `bun typecheck` and `bun check:fix`.
8. Deploy with `bun deploy:alchemy` when prod changes are intended.
9. Re-verify public endpoints and Cloudflare logs after deploy.

## Cloudflare MCP Notes

The Cloudflare MCP account id is `d16d6f5618beae9f5e92cee6a50a103d`.

Useful Cloudflare MCP actions:

- List Workers:
  - `GET /accounts/{accountId}/workers/scripts`
- Worker versions:
  - `GET /accounts/{accountId}/workers/scripts/slot-watch-worker/versions`
  - `GET /accounts/{accountId}/workers/scripts/slot-watch-website/versions`
- Worker deployments:
  - `GET /accounts/{accountId}/workers/scripts/slot-watch-worker/deployments`
  - `GET /accounts/{accountId}/workers/scripts/slot-watch-website/deployments`
- Worker settings and bindings:
  - `GET /accounts/{accountId}/workers/scripts/{scriptName}/settings`
- Observability query:
  - `POST /accounts/{accountId}/workers/observability/telemetry/query`
- KV key listing:
  - `GET /accounts/{accountId}/storage/kv/namespaces/{namespaceId}/keys`
- KV value reads:
  - `GET /accounts/{accountId}/storage/kv/namespaces/{namespaceId}/values/{encodedKey}`

Cloudflare MCP may be read-capable without write permission for KV; if KV writes fail with auth error `10000`, switch to a code/deploy fix or use a credential with KV edit permission.

## Alchemy Deploy

Normal production deploy command:

```sh
bun deploy:alchemy
```

If deploy auth is broken, re-authenticate first:

```sh
bunx alchemy login cloudflare
```

The deploy is defined in `alchemy.run.ts`. It can update the API Worker, website Worker/assets, Wrangler config files, and Fly streamer. Generated Wrangler config formatting changes are expected after Alchemy deploys.

## Known Failure Pattern: Signer Recency 1101

Symptoms:

- `https://api.slotwatch.dev/signer-recency/mainnet` returns `500` with `error code: 1101`.
- Worker logs show an exception like `#<Response>`.
- Related endpoints may show `Unexpected token 'P', "Per-minute"... is not valid JSON`.

Likely causes:

- Hiro API rate limiting returns text that code parses as JSON.
- A metrics warmup dependency fails, especially `stxCommittedCache.get()`.
- Cached signer/PoX data may hide part of the problem until a cache miss.

Fix patterns:

- Ensure server Hiro calls pass `env.HIRO_API_KEY`.
- In shared Hiro fetch helpers, check `response.ok` before parsing JSON and include status/body in errors.
- Do not let metrics-only warmup failures break user-facing JSON endpoints.

Verification:

```sh
curl -sS -D /tmp/slotwatch-api-headers.txt --max-time 30 \
  https://api.slotwatch.dev/signer-recency/mainnet \
  -o /tmp/slotwatch-recency.json

awk 'NR==1{print $2}' /tmp/slotwatch-api-headers.txt
head -c 300 /tmp/slotwatch-recency.json
```

Expected result: HTTP `200` and JSON with `networkKey`, `rewardCycle`, `totalWeight`, and `signers`.
