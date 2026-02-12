# Nexus: Getting Started Guide

Nexus is a multi-agent engineering coordination system. It lets multiple engineers and AI agents work on the same codebase safely — preventing file conflicts, preserving knowledge across sessions, and tracking feature progress through a structured lifecycle.

## Architecture Overview

```
                    ┌─────────────┐
                    │  Supabase   │
                    │ (PostgreSQL)│
                    └──────┬──────┘
                           │
┌──────────┐      ┌───────┴────────┐      ┌───────┐
│ nexus CLI ├─────►│  nexus-server  │◄─────┤ Redis │
│ (agents) │ REST │  (Hono + Bun)  │      │       │
└──────────┘  +WS └────────────────┘      └───────┘
```

| Component | Purpose |
|-----------|---------|
| **Server** | REST API + WebSocket for real-time updates |
| **CLI** | Command-line tool for engineers and AI agents |
| **PostgreSQL** | Features, decisions, learnings, sessions, checkpoints |
| **Redis** | File claims (collision prevention), session heartbeats, pub/sub |

## Prerequisites

- [Bun](https://bun.sh) v1.2+
- A running Nexus server (see [Deployment](#deployment) or [Local Development](#local-development))

---

## Quick Start (5 minutes)

### 1. Install the CLI

```bash
cd apps/cli
bun install
bun link
```

This makes the `nexus` command available globally.

### 2. Point at the server

```bash
export NEXUS_SERVER_URL=https://nexus-server-production-88c3.up.railway.app
```

Or for local development:

```bash
export NEXUS_SERVER_URL=http://localhost:3001
```

### 3. Register an account

```bash
nexus login --register --name "Alice" --email "alice@company.com"
```

Output:

```
Registered as Alice
API Key: sk_live_abc123...
Save this key - it won't be shown again!
```

The key is stored in `~/.nexus/config.json` automatically.

### 4. Create a project

```bash
nexus project create -n "My App" -s my-app
```

### 5. Link your repo

```bash
cd /path/to/your/repo
nexus project link <project-id>
```

This creates `.nexus.json` in your repo root, connecting it to the server.

### 6. Create a feature

```bash
nexus feature create
```

This opens your `$EDITOR` with a template:

```markdown
---
slug: cache-layer
title: Add Redis Caching
lane: next
touches:
  - src/cache.ts
  - src/services/api.ts
---

## Goal
Add caching to reduce database load.

## Approach
Use ioredis with a 5-minute TTL on read-heavy endpoints.

## Acceptance Criteria
- [ ] Cache hit rate > 80% on product endpoints
- [ ] Cache invalidation on writes
- [ ] Tests cover cache miss and hit paths
```

**Frontmatter fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `slug` | Yes | Unique kebab-case identifier |
| `title` | Yes | Human-readable name |
| `lane` | No | Priority: `now`, `next`, `later`, `icebox` (default: `next`) |
| `touches` | No | File paths this feature will modify (used for conflict detection) |

### 7. Mark it ready

```bash
nexus feature ready cache-layer
```

The feature is now available for pickup.

### 8. Pick and work

```bash
nexus feature pick cache-layer
```

This:
- Locks the `touches` file paths in Redis (no one else can claim them)
- Exports the spec to `.nexus/active/cache-layer/spec.md`
- Sets your active feature in `.nexus.json`

Now do your work. As you go:

```bash
# Record discoveries
nexus learn "Redis SCAN is O(N) - use KEYS only for small keyspaces"

# Record decisions
nexus decision "Use per-route TTL" \
  --rationale "Different endpoints have different freshness needs" \
  --alternatives "Global TTL - simpler but wastes cache on static data"

# Save progress checkpoints
nexus save --notes "Routes done, starting invalidation logic"
```

### 9. Mark done

```bash
nexus feature done
```

This releases all file claims, clears your active feature, and marks it complete.

---

## The Feature Lifecycle

```
  draft ──► ready ──► active ──► done
              ▲          │
              └──────────┘  (release)
                   │
                   ▼
               cancelled
```

| Status | Meaning |
|--------|---------|
| `draft` | Spec written, not yet available for pickup |
| `ready` | Available for any engineer/agent to claim |
| `active` | Claimed and being worked on (file paths locked) |
| `done` | Completed (terminal) |
| `cancelled` | Abandoned (terminal) |

---

## Multi-Agent Coordination

The key problem Nexus solves: **two agents editing the same file at the same time**.

### File Claims

When you `pick` a feature, its `touches` paths are locked in Redis:

```
Agent 1: nexus feature pick cache-layer
  → Locks: src/cache.ts, src/services/api.ts

Agent 2: nexus feature pick auth-system
  → touches: src/services/api.ts   ← CONFLICT!
  → Error: 409 - src/services/api.ts claimed by Agent 1
```

Agent 2 sees this in `nexus feature available`:

```
Slug           Title              Lane   Status
auth-system    Auth System        now    blocked by cache-layer (src/services/api.ts)
cache-layer    Redis Caching      next   claimed by Agent 1
```

Claims auto-expire (default: 5 minutes TTL) and are refreshed by active sessions.

### Session Heartbeats

Active sessions send heartbeats every 30 seconds. If an agent crashes:

1. Heartbeat stops
2. After 90 seconds, session marked `disconnected`
3. After 5-minute grace period, claims can be reclaimed

### Checkpoints

Checkpoints capture work state for crash recovery:

```bash
nexus save --notes "Implemented routes, tests passing"
```

The next agent picking up the feature sees prior checkpoints, learnings, and decisions — no lost context.

---

## Using Nexus with Claude Code

Nexus includes Claude Code skills that provide a natural language interface. When `.nexus.json` exists in your project root, these slash commands are available:

| Command | What it does |
|---------|-------------|
| `/available` | Show claimable features |
| `/pick <slug>` | Claim a feature (with confirmation) |
| `/done` | Mark feature complete (with confirmation) |
| `/learn <insight>` | Record a discovery |
| `/decision <title>` | Record an architectural choice |
| `/save <message>` | Save a progress checkpoint |
| `/status` | Show project activity overview |
| `/roadmap` | View features by priority lane |

The skills are proactive — Claude will suggest recording learnings when it discovers gotchas, and suggest decisions when choosing between approaches.

---

## CLI Command Reference

### Authentication

```bash
nexus login --register --name "Name" --email "email@co.com"  # New account
nexus login --token sk_live_abc123                            # Existing key
nexus logout                                                   # Clear credentials
nexus whoami                                                   # Show current identity
```

### Projects

```bash
nexus project create -n "Name" -s slug            # Create project
nexus project link <project-id>                    # Link repo to project
nexus project unlink                               # Remove link
nexus project list                                 # List your projects
nexus project info                                 # Show linked project details
```

### Features

```bash
nexus feature create                               # Create (opens editor)
nexus feature create --from spec.md                # Create from file
nexus feature list                                 # List all features
nexus feature list -s ready -l now                 # Filter by status and lane
nexus feature show <slug>                          # Show full details
nexus feature edit <slug>                          # Edit spec in editor
nexus feature ready <slug>                         # Mark as ready for pickup
nexus feature available                            # Show claimable features
nexus feature pick <slug>                          # Claim and start working
nexus feature release                              # Unclaim (back to ready)
nexus feature done                                 # Mark complete
nexus feature delete <slug>                        # Delete draft feature
```

### Roadmap

```bash
nexus roadmap                                      # View by lane (now/next/later/icebox)
nexus roadmap-ops promote <slug>                   # Move to higher priority lane
nexus roadmap-ops defer <slug>                     # Move to lower priority lane
nexus rm move <slug> --before <other>              # Reorder within lane
```

### Knowledge

```bash
nexus learn "<insight>"                            # Record a learning
nexus decision "<title>"                           # Record a decision
nexus decision "<title>" -r "<rationale>"          # With rationale
nexus decision "<title>" -r "<why>" -a "<alts>"    # With alternatives
```

### Progress

```bash
nexus save                                         # Checkpoint (auto-captures git state)
nexus save -n "message"                            # Checkpoint with notes
```

### Activity

```bash
nexus status                                       # Project dashboard
nexus watch                                        # Real-time WebSocket stream
```

### Global Options

```bash
nexus <command> --json                             # JSON output (for scripting)
nexus --version                                    # CLI version
nexus --help                                       # Help
```

---

## API Reference

All endpoints require `Authorization: Bearer <api-key>` unless noted.

### Health (no auth)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Full health check (DB + Redis status) |
| GET | `/api/health/live` | Liveness probe |
| GET | `/api/health/ready` | Readiness probe |
| GET | `/api/metrics` | Prometheus metrics |

### Auth

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` | Register engineer, get API key |
| GET | `/api/auth/me` | Get current engineer profile |

### Projects

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/projects` | Create project |
| GET | `/api/projects` | List your projects |
| GET | `/api/projects/:id` | Get project details + members |
| POST | `/api/projects/:id/members` | Add member to project |

### Features

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/projects/:id/features` | Create feature |
| GET | `/api/projects/:id/features` | List features (filterable) |
| GET | `/api/projects/:id/features/available` | Claimable features |
| GET | `/api/projects/:id/features/:slug` | Get feature details |
| PATCH | `/api/projects/:id/features/:slug` | Update feature spec |
| DELETE | `/api/projects/:id/features/:slug` | Delete feature |
| POST | `/api/projects/:id/features/:slug/ready` | draft -> ready |
| POST | `/api/projects/:id/features/:slug/pick` | ready -> active |
| POST | `/api/projects/:id/features/:slug/release` | active -> ready |
| POST | `/api/projects/:id/features/:slug/done` | active -> done |
| POST | `/api/projects/:id/features/:slug/cancel` | -> cancelled |

### Roadmap

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects/:id/roadmap` | Features grouped by lane |
| PATCH | `/api/projects/:id/roadmap/reorder` | Reorder features |
| PATCH | `/api/projects/:id/features/:slug/lane` | Move feature to lane |

### Knowledge

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/projects/:id/features/:slug/learnings` | Add learning |
| GET | `/api/projects/:id/features/:slug/learnings` | List learnings |
| POST | `/api/projects/:id/decisions` | Add decision |
| GET | `/api/projects/:id/decisions` | List decisions |

### Claims

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects/:id/claims` | All active file claims |
| GET | `/api/projects/:id/claims/mine` | My file claims |
| POST | `/api/projects/:id/claims/refresh` | Extend claim TTLs |

### Sessions & Checkpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/projects/:id/sessions` | Create/get session |
| GET | `/api/projects/:id/sessions/active` | Active sessions |
| POST | `/api/projects/:id/sessions/:sid/heartbeat` | Keep session alive |
| POST | `/api/projects/:id/checkpoints` | Save checkpoint |
| GET | `/api/projects/:id/checkpoints/latest` | Latest checkpoint |

### Status

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/projects/:id/status` | Dashboard (features + claims + sessions) |

### WebSocket

Connect to `/ws` with `Authorization` header for real-time feature/session events.

---

## Configuration

### Environment Variables (Server)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `NODE_ENV` | development | Environment |
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `REDIS_URL` | (required) | Redis connection string |
| `API_KEY_SALT` | (required) | Salt for API key hashing (min 16 chars) |
| `LOG_LEVEL` | info | `trace\|debug\|info\|warn\|error\|fatal` |
| `ALLOWED_ORIGINS` | localhost | CORS origins (comma-separated) |
| `TRUST_PROXY` | false | Set `true` behind reverse proxy |
| `CLAIM_TTL_SECONDS` | 300 | File claim expiry |
| `HEARTBEAT_TIMEOUT_SECONDS` | 90 | Session timeout |
| `SESSION_GRACE_PERIOD_SECONDS` | 300 | Grace period before disconnect |

### Environment Variables (CLI)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXUS_SERVER_URL` | http://localhost:3001 | Server URL |

---

## Deployment

### Railway (Production)

The project includes a `Dockerfile` for Railway deployment:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project + link
railway init --name nexus
railway link

# Add Redis
# (use Railway dashboard or CLI to add Redis template)

# Set environment variables
# DATABASE_URL, API_KEY_SALT, etc. via Railway dashboard

# Deploy
railway up
```

The Dockerfile:
- Multi-stage build (deps -> build -> runtime)
- Runs database migrations automatically on startup
- Exposes port 3000 with `/api/health` healthcheck

### Local Development

```bash
# Clone the repo
git clone <repo-url>
cd nexus-2

# Install dependencies
bun install

# Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL, REDIS_URL, API_KEY_SALT

# Run migrations
bun run db:migrate

# Start server
bun run dev
```

The server starts at `http://localhost:3001` (or whatever `PORT` is set to).

---

## Project Structure

```
nexus-2/
├── apps/
│   ├── server/                    # Hono.js REST API + WebSocket
│   │   ├── src/
│   │   │   ├── routes/            # API endpoints
│   │   │   ├── services/          # Business logic
│   │   │   ├── redis/             # Claims, sessions, pub/sub
│   │   │   ├── db/                # Drizzle schema + migrations
│   │   │   ├── middleware/        # Auth, rate limiting
│   │   │   ├── ws/                # WebSocket handler + broadcast
│   │   │   └── index.ts           # Entry point
│   │   └── package.json
│   └── cli/                       # Commander.js CLI
│       ├── src/
│       │   ├── commands/          # CLI command implementations
│       │   ├── client.ts          # HTTP client for server
│       │   └── config.ts          # Global + project config
│       └── package.json
├── packages/
│   └── shared/                    # Shared TypeScript types (Zod schemas)
├── .claude/
│   └── skills/                    # Claude Code skill definitions
├── Dockerfile                     # Production container
├── .nexus.json                    # Project link config (per-repo)
└── package.json                   # Workspace root
```

---

## Typical Workflow

```
  1. Team lead creates features with specs
     nexus feature create → nexus feature ready <slug>

  2. Agents check what's available
     nexus feature available

  3. Agent claims a feature
     nexus feature pick <slug>
     → File paths locked, spec exported locally

  4. Agent works, recording knowledge along the way
     nexus learn "..."
     nexus decision "..." --rationale "..."
     nexus save --notes "..."

  5. Agent completes the feature
     nexus feature done
     → Claims released, feature marked done

  6. Next agent picks a different feature
     → Sees prior learnings and decisions from step 4
```

---

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `VALIDATION_ERROR` | 400 | Bad request body |
| `INVALID_STATUS_TRANSITION` | 400 | Invalid feature state change |
| `FILE_ALREADY_CLAIMED` | 409 | File locked by another engineer |
| `RATE_LIMITED` | 429 | Too many requests |
| `SERVICE_UNAVAILABLE` | 503 | Database or Redis down |
