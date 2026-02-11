# Nexus 2 — Build Plan

## What This Is

A simplified, feature-spec-first coordination server for multi-agent engineering teams. Engineers write feature specs, claim them, and let their agents execute. The system prevents file collisions across engineers and preserves memory (learnings, decisions) across agent sessions.

## What We're Keeping from Nexus

| Component | Source | Notes |
|---|---|---|
| Redis file claims | `redis/claims.ts` | Core collision prevention — proven, keep as-is |
| Redis pub/sub | `redis/pubsub.ts` | Real-time updates across instances |
| Redis client | `redis/client.ts` | Connection management, retry strategy |
| Auth (API keys, Argon2) | `middleware/auth.ts`, `lib/api-key.ts`, `auth.service.ts` | Simplify: drop orgs/invitations for v1 |
| Session tracking | `session.service.ts`, `redis/sessions.ts` | Heartbeat, reconnection, grace period |
| Checkpoint/recovery | `checkpoint.service.ts` | Crash recovery with claims snapshot |
| Decision logging | `decision.service.ts` | Architectural decisions, git sync |
| WebSocket broadcast | `ws/` directory | Real-time dashboard updates |
| Rate limiting | `middleware/rate-limit.ts` | Per-key limits |
| Health checks | `lib/health.ts`, health routes | Liveness + readiness probes |
| Error handling | `lib/errors.ts`, `middleware/error.ts` | Standardized error responses |
| Pagination | `lib/pagination.ts` | Cursor-based pagination |
| Metrics | `lib/prometheus.ts`, `middleware/metrics.ts` | Prometheus counters |

## What We're Dropping

| Component | Reason |
|---|---|
| Framework engine (YAML state machines) | Over-engineered. Features have 5 states, not 8. |
| Batch system (calculate, risk tiers, review) | Orchestrator owns task decomposition now |
| Epic/Task/Batch tables + services | Replaced by features + learnings |
| Task mesh coordination | Replaced by feature-level file claims |
| Quality gate webhooks | Post-MVP |
| Organizations + invitations | Post-MVP. v1 is single-team. |
| Git sync worker | Simplify: sync on write, not via background worker |

## What We're Adding

| Component | Purpose |
|---|---|
| Feature specs (Postgres + repo export) | Store specs, export to `.nexus/active/` on claim |
| Roadmap management | Ordered priority list with lanes (now/next/later) |
| Learnings (append-only log per feature) | Memory that survives agent session crashes |
| `nexus feature available` (feature-level ready queue) | Show claimable features with collision detection |
| Repo file export on claim | Dump spec + learnings + decisions to repo for agent reads |
| Claude Code plugin (simplified) | Skills for roadmap, feature, learn, decision, status, done |

---

## Data Model

### Tables

```
engineers
  id           UUID PK
  name         TEXT NOT NULL
  email        TEXT UNIQUE NOT NULL
  role         TEXT NOT NULL DEFAULT 'engineer'  -- admin | engineer | readonly
  created_at   TIMESTAMPTZ
  updated_at   TIMESTAMPTZ

api_keys
  id           UUID PK
  engineer_id  UUID FK → engineers
  key_hash     TEXT NOT NULL
  key_prefix   TEXT NOT NULL          -- first 16 chars for O(1) lookup
  last_used_at TIMESTAMPTZ
  created_at   TIMESTAMPTZ

projects
  id           UUID PK
  name         TEXT NOT NULL
  slug         TEXT UNIQUE NOT NULL
  repo_url     TEXT
  repo_path    TEXT                   -- local path to repo root
  default_branch TEXT DEFAULT 'main'
  created_at   TIMESTAMPTZ
  updated_at   TIMESTAMPTZ

project_members
  project_id   UUID FK → projects
  engineer_id  UUID FK → engineers
  role         TEXT DEFAULT 'member'  -- lead | member
  PRIMARY KEY (project_id, engineer_id)

features
  id           UUID PK
  project_id   UUID FK → projects
  slug         TEXT NOT NULL          -- 'webhook-retry'
  title        TEXT NOT NULL
  spec         TEXT NOT NULL          -- markdown body
  status       TEXT NOT NULL DEFAULT 'draft'
                                      -- draft | ready | claimed | active | done | cancelled
  lane         TEXT NOT NULL DEFAULT 'next'
                                      -- now | next | later | icebox
  priority     INTEGER NOT NULL       -- sort order within lane
  touches      TEXT[] NOT NULL DEFAULT '{}'
                                      -- file/dir paths this feature affects
  created_by   UUID FK → engineers
  claimed_by   UUID FK → engineers    -- NULL until claimed
  claimed_at   TIMESTAMPTZ
  completed_at TIMESTAMPTZ
  created_at   TIMESTAMPTZ
  updated_at   TIMESTAMPTZ
  UNIQUE (project_id, slug)

learnings
  id           UUID PK
  feature_id   UUID FK → features
  engineer_id  UUID FK → engineers
  content      TEXT NOT NULL
  created_at   TIMESTAMPTZ           -- append-only, no updated_at

decisions
  id           UUID PK
  project_id   UUID FK → projects
  feature_id   UUID FK → features    -- nullable (project-level decisions)
  engineer_id  UUID FK → engineers
  title        TEXT NOT NULL
  decision     TEXT NOT NULL
  rationale    TEXT
  alternatives TEXT
  supersedes   UUID FK → decisions   -- nullable
  created_at   TIMESTAMPTZ

sessions
  id           UUID PK
  project_id   UUID FK → projects
  engineer_id  UUID FK → engineers
  feature_id   UUID FK → features    -- which feature they're working on
  status       TEXT DEFAULT 'active'  -- active | disconnected
  last_heartbeat TIMESTAMPTZ
  metadata     JSONB                  -- git branch, working dir, etc.
  created_at   TIMESTAMPTZ

checkpoints
  id           UUID PK
  session_id   UUID FK → sessions
  feature_id   UUID FK → features
  engineer_id  UUID FK → engineers
  type         TEXT NOT NULL          -- auto_periodic | manual | crash_recovery
  state_hash   TEXT                   -- deduplication
  active_claims JSONB                 -- snapshot of claimed files
  context      JSONB                  -- git branch, commit, working dir
  notes        TEXT
  is_latest    BOOLEAN DEFAULT false
  created_at   TIMESTAMPTZ
```

### Redis Keys

```
# File claims (from existing Nexus)
project:{projectId}:claims              HASH  { filePath: JSON{engineerId, claimedAt, featureId} }
engineer:{engineerId}:claims:{projectId} SET  { filePath, ... }

# Sessions (from existing Nexus)
session:{sessionId}:heartbeat           STRING  timestamp
```

### Feature Status Transitions

```
draft → ready → claimed → active → done
                  ↓                   ↓
               (release)          cancelled
                  ↓
                ready (back to pool)
```

- `draft`: Spec is being written. Not available for pickup.
- `ready`: Spec is complete. Available for any engineer to claim.
- `claimed`: Engineer has claimed it. File paths locked via Redis. Spec exported to repo.
- `active`: Agent work in progress (auto-transitions from claimed on first agent activity, or same as claimed for simplicity — can merge these two states).
- `done`: Work complete. Claims released. Learnings/decisions preserved.
- `cancelled`: Abandoned. Claims released.

Note: We can simplify to 5 states by merging claimed+active into just `active`. An engineer picks it, it's active. Simpler.

```
draft → ready → active → done
                  ↓
               cancelled
```

If released without finishing, status goes back to `ready`.

---

## API Endpoints

### Auth
```
POST   /api/auth/register              Register engineer (returns API key)
GET    /api/auth/me                    Get current engineer
```

### Projects
```
POST   /api/projects                   Create project
GET    /api/projects                   List projects
GET    /api/projects/:id               Get project details
POST   /api/projects/:id/members       Add member
```

### Features (core CRUD + lifecycle)
```
POST   /api/projects/:id/features                Create feature (status=draft)
GET    /api/projects/:id/features                 List features (filter by status, lane)
GET    /api/projects/:id/features/:slug           Get feature with learnings count
PATCH  /api/projects/:id/features/:slug           Update feature (spec, touches, lane, priority)
DELETE /api/projects/:id/features/:slug           Delete feature (only if draft)

POST   /api/projects/:id/features/:slug/ready     Mark as ready for pickup
POST   /api/projects/:id/features/:slug/pick      Claim feature (locks touches via Redis)
POST   /api/projects/:id/features/:slug/release   Release claim (back to ready)
POST   /api/projects/:id/features/:slug/done      Mark complete (releases claims)
POST   /api/projects/:id/features/:slug/cancel    Cancel feature (releases claims)
```

### Feature-Level Ready Queue
```
GET    /api/projects/:id/features/available       Features that are ready + no collision
```

This endpoint:
1. Queries features where `status = 'ready'`
2. For each, checks `touches` against current Redis claims
3. Returns uncollided features sorted by lane priority (now > next > later) then priority number
4. Marks collided features with `blocked_by: { engineer, feature }` info

### Roadmap
```
GET    /api/projects/:id/roadmap                  Get roadmap (features grouped by lane, sorted by priority)
PATCH  /api/projects/:id/roadmap/reorder          Reorder features (accepts ordered list of slugs per lane)
PATCH  /api/projects/:id/features/:slug/lane      Move feature between lanes
```

### Learnings
```
POST   /api/projects/:id/features/:slug/learnings     Append learning
GET    /api/projects/:id/features/:slug/learnings      List learnings for feature
```

### Decisions
```
POST   /api/projects/:id/decisions                     Record decision (optionally linked to feature)
GET    /api/projects/:id/decisions                     List decisions (filter by feature)
```

### Claims (direct access — mostly used internally)
```
GET    /api/projects/:id/claims                   All active claims
GET    /api/projects/:id/claims/mine              Current engineer's claims
POST   /api/projects/:id/claims/refresh           Extend claim TTL
```

### Sessions + Checkpoints
```
POST   /api/projects/:id/sessions                 Create/resume session
GET    /api/projects/:id/sessions/active           List active sessions
POST   /api/projects/:id/checkpoints              Create checkpoint
GET    /api/projects/:id/checkpoints/latest        Get latest checkpoint for recovery
```

### Status (aggregate view)
```
GET    /api/projects/:id/status                   Active features, claims, sessions — the dashboard data
```

### Health
```
GET    /api/health                                Full health check
GET    /api/health/live                           Liveness probe
GET    /api/health/ready                          Readiness probe
```

---

## CLI Commands

### Auth
```bash
nexus login                    # Authenticate with API key
nexus logout                   # Clear stored credentials
nexus whoami                   # Show current engineer
```

### Project
```bash
nexus project create <name>    # Create project
nexus project link             # Link current directory to project
nexus project unlink           # Unlink current directory
```

### Feature Specs
```bash
nexus feature create                    # Open $EDITOR with template, save to server
nexus feature create --from <file.md>   # Create from existing markdown file
nexus feature edit <slug>               # Open spec in $EDITOR, save changes
nexus feature show <slug>               # Display spec + learnings + decisions
nexus feature ready <slug>              # Mark as ready for pickup
nexus feature list                      # List all features (filter: --status, --lane)
nexus feature delete <slug>             # Delete draft feature
```

### Roadmap
```bash
nexus roadmap                               # Display roadmap (lanes + priorities)
nexus roadmap move <slug> --before <slug>   # Reorder within lane
nexus roadmap promote <slug>                # Move to higher lane (later→next→now)
nexus roadmap defer <slug>                  # Move to lower lane (now→next→later)
```

### Picking Up Work
```bash
nexus feature available                 # Show claimable features (ready + no collision)
nexus feature pick <slug>               # Claim feature, lock paths, export spec to repo
nexus feature release                   # Release current feature back to ready
nexus feature done                      # Mark complete, release claims
```

### During Execution
```bash
nexus learn "<text>"                    # Append learning to active feature
nexus decision "<text>"                 # Log decision for active feature
nexus save                              # Create checkpoint
```

### Status
```bash
nexus status                            # Show active features, claims, sessions across team
nexus watch                             # Real-time WebSocket activity stream
```

---

## Repo Export (on `nexus feature pick`)

When an engineer claims a feature, the CLI:

1. Calls `POST /api/projects/:id/features/:slug/pick`
2. Server claims the `touches` paths in Redis
3. Server returns the full feature spec + existing learnings + decisions
4. CLI writes to the repo:

```
.nexus/
└── active/
    └── webhook-retry/
        ├── spec.md            # The feature spec (frozen copy)
        ├── learnings.md       # Existing learnings (if any)
        └── decisions.md       # Existing decisions (if any)
```

5. CLI adds `.nexus/active/` to `.gitignore` if not already there

Agents read these files directly. No API calls needed for context.

During execution, `nexus learn` and `nexus decision` both:
- POST to the server (source of truth)
- Append to the local `.nexus/active/<slug>/learnings.md` or `decisions.md`

On `nexus feature done`:
- Server marks feature as done, releases Redis claims
- CLI deletes `.nexus/active/<slug>/` directory

---

## Claude Code Plugin

### Skills
```
/nexus:roadmap       → nexus roadmap
/nexus:available     → nexus feature available
/nexus:pick          → nexus feature pick <slug>
/nexus:status        → nexus status
/nexus:learn         → nexus learn "<text>"
/nexus:decision      → nexus decision "<text>"
/nexus:save          → nexus save
/nexus:done          → nexus feature done
```

### Hooks
```
file-guard:  Before file edit, check if file path is claimed by another engineer.
             If claimed by someone else, warn and block.
             Uses: GET /api/projects/:id/claims → check against current engineer.
```

---

## WebSocket Events

```
feature_created      { feature }
feature_updated      { feature, field, oldValue, newValue }
feature_claimed      { feature, engineer }
feature_released     { feature, engineer }
feature_completed    { feature, engineer }
files_claimed        { paths, engineer, feature }
files_released       { paths, engineer, feature }
learning_added       { feature, learning }
decision_added       { feature, decision }
session_started      { engineer, feature }
session_ended        { engineer, feature }
```

---

## Directory Structure

```
nexus-2/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts                 # Server entry + lifecycle
│   │   │   ├── config.ts                # Environment config
│   │   │   ├── db/
│   │   │   │   ├── schema.ts            # Drizzle schema (all tables)
│   │   │   │   ├── connection.ts        # Postgres connection
│   │   │   │   └── migrate.ts           # Migration runner
│   │   │   ├── redis/
│   │   │   │   ├── client.ts            # Redis connection (from nexus)
│   │   │   │   ├── claims.ts            # File claims (from nexus)
│   │   │   │   ├── pubsub.ts            # Pub/sub (from nexus)
│   │   │   │   └── sessions.ts          # Session heartbeats (from nexus)
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts      # Registration, API key verification
│   │   │   │   ├── feature.service.ts   # Feature CRUD + lifecycle + available query
│   │   │   │   ├── roadmap.service.ts   # Roadmap ordering + lane management
│   │   │   │   ├── learning.service.ts  # Append-only learning log
│   │   │   │   ├── decision.service.ts  # Decision logging (from nexus, simplified)
│   │   │   │   ├── claim.service.ts     # File claim management (from nexus)
│   │   │   │   ├── session.service.ts   # Session tracking (from nexus, simplified)
│   │   │   │   └── checkpoint.service.ts # Checkpoint/recovery (from nexus, simplified)
│   │   │   ├── routes/
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── project.routes.ts
│   │   │   │   ├── feature.routes.ts    # Features + available + lifecycle
│   │   │   │   ├── roadmap.routes.ts
│   │   │   │   ├── learning.routes.ts
│   │   │   │   ├── decision.routes.ts
│   │   │   │   ├── claim.routes.ts
│   │   │   │   ├── session.routes.ts
│   │   │   │   ├── status.routes.ts     # Aggregate status endpoint
│   │   │   │   └── health.routes.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts              # API key verification (from nexus)
│   │   │   │   ├── project.ts           # Project scoping (from nexus)
│   │   │   │   ├── error.ts             # Error handling (from nexus)
│   │   │   │   ├── rate-limit.ts        # Rate limiting (from nexus)
│   │   │   │   ├── request-id.ts        # Correlation IDs (from nexus)
│   │   │   │   └── metrics.ts           # Prometheus (from nexus)
│   │   │   ├── ws/
│   │   │   │   ├── handler.ts           # WebSocket upgrade + routing (from nexus)
│   │   │   │   ├── connections.ts       # Connection registry (from nexus)
│   │   │   │   ├── broadcast.ts         # Debounced broadcast (from nexus)
│   │   │   │   └── messages.ts          # Event serialization (simplified)
│   │   │   └── lib/
│   │   │       ├── errors.ts            # Error classes (from nexus)
│   │   │       ├── pagination.ts        # Cursor pagination (from nexus)
│   │   │       ├── api-key.ts           # Key generation (from nexus)
│   │   │       └── health.ts            # Health checks (from nexus)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── cli/
│       ├── src/
│       │   ├── index.ts                 # CLI entry point
│       │   ├── config.ts                # ~/.nexus/config.json management
│       │   ├── client.ts                # HTTP client for server API
│       │   ├── helpers.ts               # withAuth, withProject, withActiveFeature
│       │   ├── editor.ts                # $EDITOR integration for spec editing
│       │   ├── export.ts                # Write spec/learnings/decisions to .nexus/active/
│       │   └── commands/
│       │       ├── auth.ts              # login, logout, whoami
│       │       ├── project.ts           # create, link, unlink
│       │       ├── feature.ts           # create, edit, show, ready, list, delete,
│       │       │                        # available, pick, release, done
│       │       ├── roadmap.ts           # show, move, promote, defer
│       │       ├── learn.ts             # nexus learn "<text>"
│       │       ├── decision.ts          # nexus decision "<text>"
│       │       ├── save.ts              # nexus save (checkpoint)
│       │       ├── status.ts            # nexus status
│       │       └── watch.ts             # nexus watch (WebSocket stream)
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── types/
│       │   │   ├── feature.ts           # Feature, FeatureStatus, Lane
│       │   │   ├── learning.ts          # Learning
│       │   │   ├── decision.ts          # Decision
│       │   │   ├── claim.ts             # FileClaim, ClaimResult
│       │   │   ├── engineer.ts          # Engineer, ApiKey
│       │   │   ├── project.ts           # Project, ProjectMember
│       │   │   ├── session.ts           # Session, Checkpoint
│       │   │   ├── roadmap.ts           # Roadmap, RoadmapLane
│       │   │   ├── ws.ts               # WebSocket event types
│       │   │   ├── api.ts              # ErrorCodes, pagination
│       │   │   └── index.ts            # Re-exports
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── .claude/
│   └── plugins/
│       └── nexus/
│           ├── plugin.json
│           ├── commands/                # /nexus:roadmap, /nexus:pick, etc.
│           ├── skills/                  # Skill definitions
│           └── hooks/
│               └── file-guard.sh        # Block edits to files claimed by others
│
├── drizzle/                             # Migration files
├── package.json                         # Workspace root (Bun workspaces)
├── tsconfig.json                        # Base TS config
├── bunfig.toml                          # Bun configuration
└── PLAN.md                              # This file
```

---

## Build Phases

### Phase 1: Foundation (server boots, auth works, features CRUD)
1. Scaffold monorepo (bun workspaces, tsconfig, packages/shared)
2. Copy + simplify from nexus: Redis client/claims/pubsub, auth middleware, error handling, pagination, health, metrics, rate limiting, request-id
3. Write Drizzle schema (engineers, api_keys, projects, project_members, features, learnings, decisions, sessions, checkpoints)
4. Run migrations
5. Implement services: auth, feature (CRUD only), decision, learning
6. Implement routes: auth, project, feature CRUD, health
7. Server entry point with lifecycle management
8. **Test**: Server starts, register engineer, create project, create/list/update features

### Phase 2: Roadmap + Feature Lifecycle
1. Implement roadmap.service.ts (lane ordering, reorder, promote/defer)
2. Implement feature lifecycle (ready, pick, release, done, cancel)
3. Wire `pick` to Redis claims (lock touches paths)
4. Wire `done`/`cancel`/`release` to release Redis claims
5. Implement `available` endpoint (ready features with collision detection)
6. Implement routes: roadmap, feature lifecycle endpoints
7. Implement session.service.ts + checkpoint.service.ts (simplified from nexus)
8. **Test**: Full feature lifecycle — create → ready → pick (claims locked) → done (claims released). Available endpoint filters collisions correctly.

### Phase 3: CLI
1. Scaffold CLI app (Commander.js, config management)
2. Implement HTTP client for server API
3. Implement commands: auth (login/logout/whoami), project (create/link/unlink)
4. Implement commands: feature (create with $EDITOR, create --from, edit, show, ready, list, delete, available, pick, release, done)
5. Implement commands: roadmap (show with table formatting, move, promote, defer)
6. Implement commands: learn, decision, save, status, watch
7. Implement repo export: on `pick`, write .nexus/active/<slug>/ with spec.md, learnings.md, decisions.md
8. Implement local file append: `learn` and `decision` write to server AND append to local files
9. Implement cleanup: on `done`, delete .nexus/active/<slug>/
10. **Test**: Full workflow via CLI — login → link project → create feature → ready → pick (files appear in repo) → learn → decision → done (files cleaned up)

### Phase 4: Real-time + Status
1. Copy + simplify WebSocket layer from nexus (handler, connections, broadcast, messages)
2. Wire feature/claim/session events to WebSocket broadcast
3. Implement status endpoint (aggregate view of active features, claims, sessions)
4. Implement `nexus status` CLI command with table output
5. Implement `nexus watch` CLI command (WebSocket stream)
6. **Test**: Two engineers, one claims a feature, other sees it in status and watch. Available endpoint shows collision.

### Phase 5: Claude Code Plugin
1. Write plugin.json manifest
2. Implement skills: roadmap, available, pick, status, learn, decision, save, done
3. Implement file-guard hook (check claims before file edit)
4. **Test**: Use plugin in Claude Code session — pick feature, work on it, log learnings, complete it.

---

## Migration Checklist (files to copy from nexus-full)

### Copy directly (minor edits):
- `apps/server/src/redis/client.ts`
- `apps/server/src/redis/claims.ts` — add `featureId` to claim data
- `apps/server/src/redis/pubsub.ts`
- `apps/server/src/redis/sessions.ts`
- `apps/server/src/middleware/auth.ts`
- `apps/server/src/middleware/error.ts`
- `apps/server/src/middleware/rate-limit.ts`
- `apps/server/src/middleware/request-id.ts`
- `apps/server/src/middleware/metrics.ts`
- `apps/server/src/lib/errors.ts`
- `apps/server/src/lib/pagination.ts`
- `apps/server/src/lib/api-key.ts`
- `apps/server/src/lib/health.ts`
- `apps/server/src/services/claim.service.ts` — simplify, add feature context
- `apps/server/src/services/session.service.ts` — simplify, add feature_id
- `apps/server/src/services/checkpoint.service.ts` — simplify
- `apps/server/src/services/decision.service.ts` — simplify, add feature_id FK
- `apps/server/src/ws/handler.ts` — simplify events
- `apps/server/src/ws/connections.ts`
- `apps/server/src/ws/broadcast.ts`
- `apps/server/src/config.ts` — strip unused config

### Write new:
- `apps/server/src/db/schema.ts` — new Drizzle schema
- `apps/server/src/services/feature.service.ts` — feature CRUD + lifecycle + available
- `apps/server/src/services/roadmap.service.ts` — lane management + ordering
- `apps/server/src/services/learning.service.ts` — append-only learnings
- `apps/server/src/services/auth.service.ts` — simplified (no orgs)
- All route files — new endpoints
- `apps/server/src/ws/messages.ts` — new event types
- `apps/server/src/index.ts` — new server entry
- Entire CLI app — new commands, editor integration, repo export
- Entire shared types package — new type definitions
- Claude Code plugin — new skills and hooks
