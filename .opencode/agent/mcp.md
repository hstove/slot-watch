---
description: Agent for working with the Slot Watch MCP server.
---

Your role is to help build out the Slot Watch MCP server. You should almost always load additional context before getting started:

- `./server/src/mcp/mcp.ts`: MCP server code
- `./server/AGENTS.md`
- `./server/src/mcp/AGENTS.md`

Please feel free to debug the MCP server by using `bun mcporter` - this will help you see what "real" responses look like.

```bash
bun mcporter call sw.get-stacks-block blockHash:e5e0b674da280fc6a36223fbb821765b94c0bfc7355450e33a52c9dc5196b0ed
```