---
title: "Nexus"
description: "Coordination server for multi-agent engineering teams — prevents file collisions, preserves knowledge across sessions, and manages feature lifecycles."
status: "build"
classification: "public"
topics:
  - multi-agent-coordination
  - ai-engineering
  - developer-tooling
repo: "https://github.com/looselyorganized/nexus.git"
stack:
  - TypeScript
  - Bun
  - Hono.js
  - Drizzle ORM
  - PostgreSQL
  - Redis
  - Zod
  - Commander.js
  - Pino
infrastructure:
  - Docker
  - Railway
  - Supabase
agents:
  - name: "claude-code"
    role: "AI coding agent (Claude Code)"
---

Nexus is a coordination server that lets multiple AI coding agents work on the same codebase without stepping on each other. It tracks who owns which files, preserves what agents learn between sessions, and manages features from draft to done.

## Capabilities

- **File Claims** — Redis-backed distributed locks on file paths with TTL-based lease expiration
- **Learnings** — Append-only knowledge base for AI agents across sessions and features
- **Checkpoints** — Session state snapshots for crash recovery and progress tracking
- **Real-Time** — Redis pub/sub + WebSocket broadcast across all connected instances
- **Feature Lifecycle** — Draft, ready, active, done workflow with slug-based routing and ownership
- **CLI** — Nexus CLI allows agents to claim, checkpoint, learn, and manage features from the terminal

## Architecture

Bun monorepo: Hono.js HTTP + WebSocket server, Commander.js CLI, shared types package. Routes validate with Zod, call service layer, return JSON. Redis handles claims and pub/sub. Postgres via Drizzle for persistent state.

## Infrastructure

- **Docker** — Multi-stage Bun image for containerized server deployment
- **Railway** — Hosts Redis instance and the production server container
- **Supabase** — Managed PostgreSQL via connection pooler
- **Redis (ioredis)** — Distributed file-claim locks and pub/sub event broadcast
- **Prometheus (prom-client)** — Server metrics endpoint
