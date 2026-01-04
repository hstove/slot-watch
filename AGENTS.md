# Agent Instructions for Slot Watch

Slot watch is a project for monitoring the Stacks blockchain. It's primarily intended for core blockchain developers and others who want to dive into the nitty-gritty of blocks.

The primary focus of slot watch is around how Signers sign proposed blocks. Each signer has an assigned "slot", hence the name.

## Root-level Commands

- `bun typecheck`: Run TypeScript type checks across all packages.
- `bun check:fix`: Linting and formatting checks. Use the `:fix` command because it'll automatically fix most issues without any danger.
- `bun check:all`: Run both `bun check:fix` and `bun typecheck` commands - use this when you're wrapping up work and just want to check everything at once.

## Issue Tracking with bd (beads)

Use the MCP tool `beads` to manage issues.

- Check for ready work
- Update the status of your task
- Create tasks
- Close them when you're done

### Managing Planning Documents

Often times, we'll want to create and use planning documents when working on larger features. These should live under a `./history` directory. For project-wide planning, use the root-level `./history` directory. Otherwise, use the `./${workspace}/history` directory.
