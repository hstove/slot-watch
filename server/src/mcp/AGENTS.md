# Slot Watch MCP Server

This folder contains the code for the Slot Watch MCP server. This includes various tools that agents can use to interact with Slot Watch. The goal is to utilize Slot Watch's database to provide relevant information to agents when they are debugging the state of the Stacks Blockchain.

A key goal of the Slot Watch MCP server is to allow an agent to quickly answer a question like "why is the Stacks blockchain stalled"?

## The two-phase signer commit (pre-commits)

Several tools expose pre-commit data, and it's easy to misread. Signers approve a block in two phases:

1. A signer validates the proposed block. If it's valid, the signer broadcasts a **`BlockPreCommit`** — an announcement of intent to sign, carrying nothing but the block's `signerSignatureHash`. A signer that rejects the block skips this and sends `BlockResponse::Rejected` directly.
2. Each signer tallies pre-commits by stake weight. Once `ceil(total_weight * 7/10)` — the same 70% bar as final approval — has pre-committed, the signer signs and broadcasts `BlockResponse::Accepted`.

Consequences for how tools present this:

- **The verdict is a function of `BlockResponse` only.** Pre-commits never change whether a block is accepted or rejected; that matches how miners behave. Tool output keeps them in a separate `preCommits` object so an agent can't confuse the two.
- **A missing pre-commit is usually a version signal, not misbehavior.** Upgraded signers treat an `Accepted` with no prior pre-commit as an *implicit* pre-commit, so signers on older binaries never send explicit ones and function normally. On mainnet today roughly 4 of 25 signers emit no pre-commits at all. Never report a null `preCommittedAt` or a low `preCommitRate` as a fault — describe it as an older binary. Only `participationRate`/`degradationRate` indicate a real problem.
- **We store only explicit pre-commits.** Implicit ones are derived at display time if needed.
- **The useful signal is the gap between the phases.** A block whose pre-commit weight crossed 70% but whose acceptance weight did not is stuck between phases — that's the operational payoff, and it's what `slot_watch_pre_commit_to_acceptance_gap` in `src/metrics.ts` alerts on.

## Usage

With a dev server running, you can debug the MCP server with `mcporter`.

```bash
# with cwd as the root of the repo
bun mcporter list sw # list tools
bun mcporter call sw.get-stacks-block blockHash:e5e0b674da280fc6a36223fbb821765b94c0bfc7355450e33a52c9dc5196b0ed
```

## Writing tools

Tools use `zod` for argument input validation.

For the context of the tool, use `runMcpEffect`. This is a wrapper function for running an Effect and returning the result as an MCP response.

## Concision

When working with LLMs, tokens are a precious resource. All LLMs degrade in quality when too many tokens are in context, and it's wasteful. As such, it's critical that any text-based responses that are provided to agents utilize concision to the greatest extent possible, while still providing helpful information. When possible, provide tools to fetch "follow up" data instead of including everything in one response.

For example, when fetching recent Stacks blocks, we shouldn't ever include _all_ signer responses with every block. Rather, we should provide the state of signer responses for a block, and provide tools for agents to fetch responses for a block if needed.
