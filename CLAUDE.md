# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Nexus?

A coordination server for multi-agent engineering teams. Prevents file collisions via Redis-backed claims, preserves knowledge (learnings/decisions) across sessions, manages feature lifecycles (draft → ready → active → done), and enables crash recovery through session checkpoints.

## Commands

```bash
# Development
bun run dev              # Start server with hot reload
bun run build            # Build all packages
bun run typecheck        # Type-check all packages
bun run lint             # ESLint
bun run lint:fix         # ESLint with autofix

# Database (Drizzle ORM)
bun run db:migrate       # Run migrations
bun run db:generate      # Generate new migration from schema changes
bun run db:push          # Push schema directly (skip migrations)
bun run db:studio        # Open Drizzle Studio

# Testing — run from apps/server/
cd apps/server && bun test                                        # All server tests
cd apps/server && bun test src/__tests__/unit/                    # Unit tests only
cd apps/server && bun test src/__tests__/integration/routes/      # Route tests only
cd apps/server && bun test src/__tests__/e2e/                     # E2E tests only
cd apps/server && bun test src/__tests__/unit/lib/errors.test.ts  # Single file
```

## Architecture

Bun monorepo with three packages:

- **`apps/server`** — Hono.js HTTP + WebSocket server (Bun runtime)
- **`apps/cli`** — Commander.js CLI (`nexus` command)
- **`packages/shared`** — TypeScript types, Zod schemas, error codes (re-exported via `@nexus/shared`)

### Server layering

```
routes/*.routes.ts     → HTTP handlers (Zod validation, call services, return JSON)
services/*.service.ts  → Business logic (DB queries via Drizzle, Redis calls for claims)
middleware/            → auth (API key + Argon2), project (membership check), error, rate-limit, metrics
db/schema.ts           → Drizzle table definitions (source of truth for DB schema)
db/connection.ts       → postgres.js client + Drizzle instance (exported as `db`)
redis/claims.ts        → File claim operations (hash per project, set per engineer)
redis/sessions.ts      → Session heartbeats in Redis
redis/pubsub.ts        → Pub/sub for real-time WebSocket broadcast
ws/                    → WebSocket handler, connection tracking, broadcast batching
lib/errors.ts          → AppError hierarchy (ValidationError, NotFoundError, ConflictError, etc.)
config.ts              → Zod-validated env vars → typed config object
```

### Route → service pattern

Every route file creates a `new Hono()`, applies `authMiddleware` + `projectMiddleware`, validates input with Zod, calls the corresponding service function, and returns `{ data: ... }`. Errors are thrown as `AppError` subclasses and caught by the global `errorHandler`.

### Hono context variables

After middleware runs, `c.get('engineer')` and `c.get('project')` are available in all authenticated/project-scoped routes. Types are extended via `declare module 'hono' { interface ContextVariableMap }`.

### Redis data model

- **Claims**: `project:{id}:claims` (hash: filePath → claim JSON), `engineer:{id}:claims:{projectId}` (set of file paths)
- **Sessions**: heartbeats stored in Redis, synced to Postgres periodically
- **Pub/sub**: channels for real-time event broadcast to WebSocket clients

### CLI structure

`NexusClient` (`apps/cli/src/client.ts`) wraps all API calls. Three constructors: `.unauthenticated()`, `.authenticated()`, `.withProject()`. Commands in `commands/*.ts` use Commander.js.

## Critical Gotchas

### Hono route ordering

Static routes MUST be defined before parameterized routes. In `feature.routes.ts`, `/available` must come before `/:slug` — otherwise "available" is captured as a slug parameter.

### Supabase connection pooler in tests

`DATABASE_URL` uses port 6543 (Supabase Supavisor pooler) which causes **transaction isolation issues** in tests — INSERTs on one pooled connection aren't visible to SELECTs on another. The preload script `apps/server/src/__tests__/setup/env.ts` rewrites port 6543 → 5432 (direct connection). This is configured in `apps/server/bunfig.toml` via `preload`.

### Test configuration

- Tests require real PostgreSQL and Redis connections (`.env` at repo root)
- `apps/server/bunfig.toml`: `concurrency = 1`, `timeout = 60000`, preload for env rewrite
- The `--timeout 60000` CLI flag is also set in `package.json` because `bunfig.toml [test] timeout` is unreliable in some Bun versions
- Test Redis uses database index 1 (`/1` suffix) to isolate from development data
- Test helpers in `apps/server/src/__tests__/setup/test-helpers.ts` provide: factories (`engineerFactory`, `featureFactory`, etc.), seeders (`seedEngineer`, `seedProject`, etc.), and HTTP wrappers (`authRequest`, `postJson`, `patchJson`)
- Route integration tests use `app.request()` — no running server needed

### Environment

`.env` lives at repo root and is referenced via `--env-file ../../.env` from `apps/server`. The `.env` is also symlinked or copied so the server working directory can find it during `bun run dev`.

## DB Schema

Tables: `engineers`, `api_keys`, `projects`, `project_members`, `features`, `learnings`, `decisions`, `sessions`, `checkpoints`. Schema defined in `apps/server/src/db/schema.ts`, migrations in `apps/server/src/db/migrations/`. All IDs are UUIDs with `defaultRandom()`.
