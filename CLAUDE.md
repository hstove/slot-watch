# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Slot-watch is a Stacks blockchain monitoring application built as a monorepo with multiple workspaces. It tracks block proposals, signers, state machines, and various blockchain metrics in real-time.

## Architecture

**Monorepo Structure:**
- `client/` - React frontend (Vite + TypeScript + TanStack Router)
- `server/` - Hono API backend with Cloudflare Workers support
- `common/` - Shared TypeScript utilities and types
- `streamer/` - Rust-based event streaming service
- `proxy/` - Rust proxy service

**Key Technologies:**
- Frontend: React, TanStack Router, Jotai state management, Tailwind CSS, Recharts
- Backend: Hono framework, Drizzle ORM with PostgreSQL, Redis caching
- Build system: Turbo monorepo, Bun package manager
- Code quality: Biome formatter/linter, TypeScript

## Development Commands

**Root level commands:**
- `bun install` - Install all dependencies
- `bun dev:client` - Run the front-end server locally
- `bun run build` - Build all packages
- `bun typecheck` - Run TypeScript checks across all packages

**Client development:**
- `bun dev:client` - Start Vite dev server
- `bun build:client` - Build React app for production

**Server development:**
- `bun dev:server` - Start API server with file watching
- `bun dev:worker` - Run Cloudflare worker locally
- `bun migrate` - Run database migrations

**Package-specific commands:**
- Common: `bunx turbo run test --filter=slot-watch-common` to run unit tests in `slot-watch-common`

## Database & Infrastructure

**Database management:**
- Uses Drizzle ORM with PostgreSQL
- Migrations in `server/drizzle/` directory
- Schema defined in `server/src/db/schema.ts`

**Cloudflare Workers:**
- Server configured for Cloudflare Workers deployment
- Wrangler config in `server-wrangler.jsonc`
- Local development: `cd server && bun run dev` (uses Wrangler)

## Key Components

**State Management:**
- Client uses Jotai for atomic state management
- Store modules in `client/src/store/` for different data domains
- WebSocket connections managed via custom hooks

**API Structure:**
- RESTful API with route handlers in `server/src/routes/`
- Real-time event streaming via Server-Sent Events
- Metrics and health check endpoints

**Data Flow:**
- Blockchain events → Rust streamer → API server → PostgreSQL
- Real-time updates via WebSocket/SSE → React components
- Cached responses using Redis for performance

## Testing Strategy

- Server: Vitest with Cloudflare Workers test environment
- Common: Bun test runner for utility functions
- Client: No specific test setup currently configured

## Code Style

- Biome for formatting and linting (configured in `biome.json`)
- Single quotes, semicolons, 2-space indentation
- TypeScript strict mode across all packages