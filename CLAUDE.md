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
- `turbo dev` - Run development servers for all packages
- `turbo build` - Build all packages
- `turbo typecheck` - Run TypeScript checks across all packages

**Client development:**
- `bun run dev:client` - Start Vite dev server
- `bun run build:client` - Build React app for production

**Server development:**
- `bun run dev:server` - Start API server with file watching
- `bun run dev:worker` - Run Cloudflare worker locally
- `bun run migrate` - Run database migrations

**Package-specific commands:**
- Client: `cd client && bun run lint` for ESLint checks
- Server: `cd server && bun run test:watch` for Vitest testing
- Common: `cd common && bun test` for shared utilities testing

## Database & Infrastructure

**Database management:**
- Uses Drizzle ORM with PostgreSQL
- Migrations in `server/drizzle/` directory
- Schema defined in `server/src/db/schema.ts`
- Run `bun run migrate` to apply migrations

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