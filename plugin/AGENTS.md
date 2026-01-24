# Slot Watch Agent Plugin

This folder holds the code for a Slot Watch Agent plugin. This includes various tools, prompts, and plugins that agents can use to interact with Slot Watch. The goal is to utilize Slot Watch's APIs to provide relevant information to agents when they are debugging the state of the Stacks Blockchain.

A key goal of the Slot Watch plugin is to allow an agent to quickly answer a question like "why is the Stacks blockchain stalled"?

## Concision

When working with LLMs, tokens are a precious resource. All LLMs degrade in quality when too many tokens are in context, and it's wasteful. As such, it's critical that any text-based responses that are provided to agents utilize concision to the greatest extent possible, while still providing helpful information. When possible, provide tools to fetch "follow up" data instead of including everything in one response.

For example, when fetching recent Stacks blocks, we shouldn't ever include _all_ signer responses with every block. Rather, we should provide the state of signer responses for a block, and provide tools for agents to fetch responses for a block if needed.

## OpenCode plugin and tools API

Full docs are available at:

- [Custom Tools](https://opencode.ai/docs/custom-tools.md)
- [Plugins](https://opencode.ai/docs/plugins.md)

Here is a short summary.

### OpenCode Tools

#### Multiple tools per file

You can export multiple tools from a single file. Each export becomes **a separate tool** with the name **`<filename>_<exportname>`**:

```ts title=".opencode/tools/math.ts"
import { tool } from "@opencode-ai/plugin"

export const add = tool({
  description: "Add two numbers",
  args: {
    a: tool.schema.number().describe("First number"),
    b: tool.schema.number().describe("Second number"),
  },
  async execute(args) {
    return args.a + args.b
  },
})

export const multiply = tool({
  description: "Multiply two numbers",
  args: {
    a: tool.schema.number().describe("First number"),
    b: tool.schema.number().describe("Second number"),
  },
  async execute(args) {
    return args.a * args.b
  },
})
```

This creates two tools: `math_add` and `math_multiply`.

#### Arguments

You can use `tool.schema`, which is just [Zod](https://zod.dev), to define argument types.

```ts "tool.schema"
args: {
  query: tool.schema.string().describe("SQL query to execute")
}
```

---

#### Context

Tools receive context about the current session:

```ts title=".opencode/tools/project.ts" {8}
import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Get project information",
  args: {},
  async execute(args, context) {
    // Access context information
    const { agent, sessionID, messageID } = context
    return `Agent: ${agent}, Session: ${sessionID}, Message: ${messageID}`
  },
})
```

### OpenCode Plugins

#### Basic structure

```js title=".opencode/plugins/example.js"
export const MyPlugin = async ({ project, client, $, directory, worktree }) => {
  console.log("Plugin initialized!")

  return {
    // Hook implementations go here
  }
}
```

The plugin function receives:

- `project`: The current project information.
- `directory`: The current working directory.
- `worktree`: The git worktree path.
- `client`: An opencode SDK client for interacting with the AI.
- `$`: Bun's [shell API](https://bun.com/docs/runtime/shell) for executing commands.

#### Custom tools

Plugins can also add custom tools to opencode:

```ts title=".opencode/plugins/custom-tools.ts"
import { type Plugin, tool } from "@opencode-ai/plugin"

export const CustomToolsPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      mytool: tool({
        description: "This is a custom tool",
        args: {
          foo: tool.schema.string(),
        },
        async execute(args, ctx) {
          return `Hello ${args.foo}!`
        },
      }),
    },
  }
}
```

The `tool` helper creates a custom tool that opencode can call. It takes a Zod schema function and returns a tool definition with:

- `description`: What the tool does
- `args`: Zod schema for the tool's arguments
- `execute`: Function that runs when the tool is called