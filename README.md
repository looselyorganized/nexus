# Nexus

A coordination server for codebases with N coding agents (Claude Code and similar) across Y engineers.

## The Problem

Once N × Y grows past 2 or 3, merge conflicts stop being rare — one agent rebases onto changes another just pushed mid-edit, terminals crash and silently keep their locks, nobody knows who's working on what.

**A real moment, captured from my own Claude Code session:**

````
You're right — we're in telemetry-exporter but this merge conflict might be from
work happening elsewhere. Let me just commit the park file and push what's there.

⏺ Bash(git add .lo/park/cr-review-pipeline.md && git commit -m "$(cat <<'EOF'
      docs: park CR review pipeline feature for new project…)
  ⎿ [main 27c1019] docs: park CR review pipeline feature for new project
      1 file changed, 105 insertions(+)
      create mode 100644 .lo/park/cr-review-pipeline.md
````

Two Claude Code terminals, one codebase. The terminal above noticed the conflict came from *somewhere else*, shrugged, committed what it had, and pushed. The other terminal's in-flight work was already rebased over — silently. Git doesn't see this as a problem; the operator only discovers it when tests fail or a reviewer asks why a change vanished.

## Why Not Git Worktrees?

Worktrees solve *file isolation* (each agent in its own checkout) but defer every conflict to merge time and give no visibility into what the other agents are doing mid-task. Nexus is the coordination layer worktrees don't give you:

- **Pick-time conflict detection** — Redis-backed atomic file claims. An agent either gets the files it needs before it starts, or it picks a different feature. No 30-minute rework cycles at rebase.
- **Shared-infrastructure coordination** — the places worktrees give you nothing: root `package.json`, `tsconfig.json`, DB migrations, shared schemas.
- **Visibility primitives** — session heartbeat + crash recovery. A dead terminal doesn't silently hold locks; a crashed agent's in-flight work is surfaced, not lost.
- **Feature lifecycle** — clear draft → ready → active → done states, picked atomically, released on completion.

## How It Works

```
   Draft            Ready            Active              Done
  ┌──────┐       ┌──────┐        ┌──────────┐        ┌──────┐
  │ Write │──────>│ Spec │──pick──>│ Working  │──done──>│  ✓   │
  │ spec  │       │ ready│<─release─│ (claimed)│        └──────┘
  └──────┘       └──────┘        └──────────┘
                                   │
                                   ├─ Files claimed in Redis (no collisions)
                                   ├─ Heartbeat keeps session alive
                                   ├─ Learnings appended as you go
                                   └─ Checkpoints saved for crash recovery
```

1. **Create** a feature spec with the files it will touch
2. **Mark ready** when the spec is complete
3. **Pick** the feature — Nexus atomically claims the file paths in Redis. If another agent already holds a conflicting file, you get an error with details
4. **Work** — send heartbeats, record learnings and decisions, save checkpoints
5. **Done** — claims released, knowledge preserved for future reference

## Project Structure

```
nexus-2/
├── apps/
│   ├── server/          # Hono.js API server (Bun runtime)
│   └── cli/             # Commander.js CLI tool
├── packages/
│   └── shared/          # TypeScript types & Zod schemas
├── .env.example         # Environment variable template
└── package.json         # Bun workspace root
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Server | [Hono](https://hono.dev) |
| Database | PostgreSQL via [Drizzle ORM](https://orm.drizzle.team) + [postgres.js](https://github.com/porsager/postgres) |
| Cache / Claims | [Redis](https://redis.io) via [ioredis](https://github.com/redis/ioredis) |
| Validation | [Zod](https://zod.dev) |
| Auth | API keys with [Argon2](https://github.com/ranisalt/node-argon2) hashing |
| CLI | [Commander.js](https://github.com/tj/commander.js) |
| Logging | [Pino](https://getpino.io) |
| Metrics | [prom-client](https://github.com/siimon/prom-client) (Prometheus) |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.1+
- PostgreSQL (e.g. [Supabase](https://supabase.com))
- Redis (e.g. [Railway](https://railway.com), [Upstash](https://upstash.com))

### Setup

```bash
# Clone and install
git clone <repo-url>
cd nexus-2
bun install

# Configure environment
cp .env.example .env
# Edit .env with your database and Redis connection strings

# Run database migrations
bun run db:migrate

# Start the server
bun run dev
```

### Connecting to an Existing Server

If someone else is hosting the Nexus server and you just need to connect:

```bash
bun install
nexus setup    # walks you through server URL, auth, and project linking
```

### Environment Variables

```bash
# Required
DATABASE_URL=postgres://...    # PostgreSQL connection string
REDIS_URL=redis://...          # Redis connection string
API_KEY_SALT=<random-hex-32>   # openssl rand -hex 32

# Optional
PORT=3000                      # Server port (default: 3000)
NODE_ENV=development           # development | production | test
ALLOWED_ORIGINS=http://localhost:3000  # CORS origins (comma-separated)
TRUST_PROXY=false              # Set true behind nginx/cloudflare
```

## CLI

The CLI is the primary interface for engineers and agents.

```bash
# Quick start — interactive wizard handles server, auth, and project setup
nexus setup

# Auth
nexus login --register         # Create account, get API key
nexus login --token <key>      # Log in with API key

# Projects
nexus project create           # Create a new project
nexus project list             # List your projects
nexus project add-member       # Add a team member

# Features
nexus feature create           # Write a feature spec (opens $EDITOR)
nexus feature list             # List features (--status, --lane filters)
nexus feature show <slug>      # View feature details
nexus feature available        # Show claimable features (no conflicts)
nexus feature pick <slug>      # Claim a feature and start working
nexus feature done             # Mark current feature complete
nexus feature release          # Release feature back to ready

# Roadmap
nexus roadmap show             # View features by priority lane
nexus roadmap reorder          # Reorder features within a lane

# Knowledge
nexus learn <message>          # Record a learning for current feature
nexus decision <message>       # Record an architectural decision
nexus save                     # Save a progress checkpoint

# Monitoring
nexus watch                    # Stream real-time project events (WebSocket)
nexus status                   # Show project health and active sessions
```

## API

All routes are prefixed with `/api`. Authentication is via `Authorization: Bearer <api-key>` header.

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/auth/register` | Register engineer, returns API key |
| GET | `/auth/me` | Get current engineer |

### Projects
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/projects` | Create project |
| GET | `/projects` | List projects |
| GET | `/projects/:id` | Get project details |
| POST | `/projects/:id/members` | Add member |

### Features
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/projects/:id/features` | Create feature (draft) |
| GET | `/projects/:id/features` | List features |
| GET | `/projects/:id/features/available` | Show claimable features |
| GET | `/projects/:id/features/:slug` | Get feature |
| PATCH | `/projects/:id/features/:slug` | Update feature |
| DELETE | `/projects/:id/features/:slug` | Delete (draft only) |
| POST | `/projects/:id/features/:slug/ready` | Mark ready |
| POST | `/projects/:id/features/:slug/pick` | Claim and start |
| POST | `/projects/:id/features/:slug/release` | Release back to ready |
| POST | `/projects/:id/features/:slug/done` | Mark complete |
| POST | `/projects/:id/features/:slug/cancel` | Cancel feature |

### Learnings & Decisions
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/projects/:id/features/:slug/learnings` | Add learning |
| GET | `/projects/:id/features/:slug/learnings` | List learnings |
| POST | `/projects/:id/decisions` | Record decision |
| GET | `/projects/:id/decisions` | List decisions |

### Roadmap
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/projects/:id/roadmap` | Get roadmap by lanes |
| PATCH | `/projects/:id/roadmap/reorder` | Reorder features |

### Sessions & Checkpoints
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/projects/:id/sessions` | Create/get session |
| GET | `/projects/:id/sessions/active` | List active sessions |
| POST | `/projects/:id/sessions/:sid/heartbeat` | Send heartbeat |
| POST | `/projects/:id/sessions/checkpoints` | Save checkpoint |
| GET | `/projects/:id/sessions/checkpoints/latest` | Get latest checkpoint |

### Claims & Status
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/projects/:id/claims` | List all file claims |
| GET | `/projects/:id/claims/mine` | List my claims |
| POST | `/projects/:id/claims/refresh` | Refresh claim TTL |
| GET | `/projects/:id/status` | Project health overview |
| GET | `/health` | Server liveness probe |

### WebSocket
| Route | Description |
|-------|-------------|
| `/ws` | Real-time events (feature changes, claims, sessions) |

## Key Concepts

### File Claims

When an agent picks a feature, Nexus claims every file path listed in the feature's `touches` array in Redis with a TTL. Other agents attempting to pick features with overlapping files get a conflict error showing exactly who holds what. Claims auto-expire if heartbeats stop, preventing permanent locks from crashed agents.

### Roadmap Lanes

Features are organized into priority lanes: **now**, **next**, **later**, and **icebox**. This gives teams a clear view of what to work on and in what order.

### Learnings & Decisions

Learnings are append-only notes tied to a feature — things the agent discovers during implementation. Decisions are architectural choices that can be scoped to a feature or an entire project, and can supersede previous decisions. Both persist after the feature is done, building institutional knowledge.

### Session Checkpoints

Agents periodically save checkpoints containing their current context and active claims. If an agent crashes, the next session can restore from the latest checkpoint and resume where it left off.

## Testing

```bash
# Run the full suite (444 tests)
bun run test

# Run server tests only
cd apps/server && bun test

# Run a specific test file
cd apps/server && bun test src/__tests__/unit/feature.service.test.ts
```

The test suite covers unit tests, service integration (real DB + Redis), route integration (via `app.request()`), CLI tests, WebSocket handler tests, and end-to-end multi-step flows. Tests run serialized with a 60-second timeout.

## Development

```bash
bun run dev            # Start server with hot reload
bun run build          # Build all packages
bun run typecheck      # Type-check all packages
bun run lint           # Lint
bun run lint:fix       # Lint and fix
bun run db:generate    # Generate Drizzle migrations
bun run db:push        # Push schema directly to database
bun run db:studio      # Open Drizzle Studio
```
