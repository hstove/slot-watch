# Block Pre-Commits Support

Tracking issue: [#4](https://github.com/hstove/slot-watch/issues/4) — sub-issues #5–#11.

## Protocol summary (source of truth: `stacks-core`, signer release 3.2.0.0.2.0)

Stacks signers use a two-phase commit when responding to block proposals:

1. Miner broadcasts `BlockProposal` (as before).
2. Each signer validates the block; if valid, it broadcasts a **`BlockPreCommit`** message announcing intent to sign. Signers that reject send `BlockResponse::Rejected` directly and never pre-commit.
3. Each signer tallies pre-commits (stake-weighted). Once `ceil(total_weight * 7/10)` is reached — the same 70% bar as final approval — the signer signs and broadcasts `BlockResponse::Accepted`.

### Wire format

The payload is not a struct — it's `SignerMessage::BlockPreCommit(Sha512Trunc256Sum)`:

| offset | len | field |
|---|---|---|
| 0 | 1 | type prefix `0x07` (`SignerMessageTypePrefix::BlockPreCommit = 7`) |
| 1 | 32 | `signer_signature_hash` (raw bytes, no length prefix) |

33 bytes total. No signature/metadata/version trailer inside; signer identity is recovered from the outer StackerDB chunk signature (same `recoverChunkPublicKey` path we already use).

### Transport

New StackerDB lane: `MessageSlotID::BlockPreCommit = 3` → contract `SP...2Q6VF78.signers-{rc%2}-3` (BlockResponse is `-1`, StateMachineUpdate `-2`). Arrives via the same `POST /stackerdb_chunks` event-observer payload we already ingest — no node/observer config change needed.

### Facts that shape our implementation

- **Backwards compat**: upgraded signers treat a `BlockAccepted` from a signer with no prior pre-commit as an *implicit* pre-commit. Old-version signers may never send explicit pre-commits — absence is a version signal, not misbehavior.
- **No version gating**: rollout is by binary upgrade only.
- **Miners ignore pre-commits** — only signers consume them.
- A pre-commit can arrive before we've seen the proposal → `latencyMs`/`blockHeight` nullable.

## Decisions

- **Verdict unchanged**: the block accept/reject verdict stays a function of `BlockResponse` only (matches miner behavior). Neither `mapSignerDataToResponses` (server) nor `responseOutcomeForBlockAtomFamily` (client) changes.
- **Store only explicit pre-commits**; "effective pre-commit" (implicit via acceptance) is derived at display time.
- **No KV "latest pre-commit per signer"** initially — latest-response already covers signer recency.
- **API shape**: pre-commits are folded into the existing `GET /blocks/:networkKey/:blockId/responses` payload additively (`{ responses, preCommits }`) rather than a new endpoint.

## Plan / status

| # | Issue | Scope | Status |
|---|---|---|---|
| #5 | Codec | rename `blockHash` → `signerSignatureHash`, real fixture | ✅ b1eb62f |
| #6 | DB | `block_pre_commits` table + migration + `DbService.insertBlockPreCommits` | ✅ 86156cd, migration applied to prod |
| #7 | Ingestion | `processChunk` tagged-union return + `BlockPreCommit` branch, batched proposal join for latency | ✅ aa72e71, verified live (rows + SSE) |
| #8 | API | `ApiBlockPreCommit` schema, serializer, fold into `/responses`, client bindings | ✅ a2451f3, verified live |
| #9 | Realtime | `block_pre_commits` SSE event, `WSPayload` union, client store wiring (no visual components) | ✅ aa72e71 (server) + 4bd9409 (client) |
| #10 | UI | per-signer bar state, popover, timeline series | ⏳ open — the only remaining work |
| #11 | Metrics + MCP | pre-commit latency + phase-gap gauges, MCP fields | ✅ fe1658c, gauges live on /metrics |

Production observations at rollout (2026-08-05, cycle 140): ~20-21 of 25 signers emit explicit pre-commits (4 on older binaries at 0% participation), avg pre-commit latency ~4s, avg 70%-pre-commit → 70%-acceptance gap ~3.8s.
