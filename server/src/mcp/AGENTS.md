# Slot Watch MCP Server

This folder contains the code for the Slot Watch MCP server. This includes various tools that agents can use to interact with Slot Watch. The goal is to utilize Slot Watch's database to provide relevant information to agents when they are debugging the state of the Stacks Blockchain.

A key goal of the Slot Watch MCP server is to allow an agent to quickly answer a question like "why is the Stacks blockchain stalled"?

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
