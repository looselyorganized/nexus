# Nexus Architecture

## System Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Server | Hono.js + Bun | REST API + WebSocket |
| Database | PostgreSQL via Drizzle ORM | Persistent state (features, sessions, etc.) |
| Redis | ioredis | File claims, session heartbeats, pub/sub |
| CLI | Commander.js | Developer/agent interface |

## Redis Claims (File Locking)

Prevents file conflicts across concurrent engineers/agents.

**Data structures:**
- `project:${projectId}:claims` (hash) — maps `filePath` to claim JSON
- `engineer:${engineerId}:claims:${projectId}` (set) — files claimed by engineer

**Operations:**
- `claimFiles()` — Atomically claim multiple file paths; fails if conflicts detected
- `releaseFiles()` — Release specific files
- `releaseAllFiles()` — Release all files for an engineer
- `checkConflicts()` — Non-blocking conflict check
- `refreshClaims()` — Extend TTL on existing claims
- `cleanupExpiredClaims()` — Remove stale claims

**Claim metadata:**
```typescript
{
  filePath: string
  projectId: string
  engineerId: string
  engineerName?: string
  featureId: string
  claimedAt: Date
  expiresAt: Date | null  // default TTL: 3600s
}
```

When a feature is picked, its `touches` paths are locked. On release/done,
all claims are released atomically.

## Sessions & Heartbeats

Dual-layer architecture: Redis for speed, PostgreSQL for persistence.

**Redis layer (fast):**
- `session:heartbeat:${sessionId}` — timestamp with 120s TTL
- Used for real-time WebSocket connection tracking

**Database layer (persistent):**
- Sessions table: id, projectId, engineerId, featureId, status, lastHeartbeat, metadata
- Status: `active` | `disconnected`

**Timing constants:**
- Heartbeat interval: 30s (client sends)
- Heartbeat timeout: 90s (session dead if missed)
- Cleanup interval: 60s
- Grace period: 300s (5 min before full disconnect)

## WebSocket (`/ws`)

Real-time project activity streaming with Redis pub/sub for cross-instance support.

**Client messages:** `join { projectId }`, `heartbeat {}`, `leave {}`

**Server events:**
- Connection: `connected`, `joined`, `left`
- Features: `feature_created`, `feature_updated`, `feature_claimed`, `feature_released`, `feature_completed`
- Files: `files_claimed`, `files_released`
- Knowledge: `learning_added`, `decision_added`
- Sessions: `session_started`, `session_ended`

**Flow:**
1. Client connects, server validates API key
2. Client sends `join { projectId }` to enter project room
3. Server broadcasts events to all room members
4. Redis pub/sub propagates events across server instances

## Local File Structure

```
.nexus.json                          # Project link config
.nexus/
  active/
    <feature-slug>/
      spec.md                        # Feature specification
      learnings.md                   # Cumulative learnings
      decisions.md                   # Cumulative decisions
```

- Created by `nexus feature pick <slug>`
- Cleaned up by `nexus feature release` or `nexus feature done`
- `.nexus/active/` is auto-added to `.gitignore`

## Feature Pick Flow

```
nexus feature pick <slug>
  → Server: verify feature is 'ready'
  → Server: claimFiles() for feature.touches (Redis)
  → Server: transition to 'active', set claimedBy
  → Server: publish 'feature_claimed' event
  → CLI: exportFeatureToRepo() — write spec.md, learnings.md, decisions.md
  → CLI: updateProjectConfig({ activeFeature: slug })
```

## Feature Done Flow

```
nexus feature done
  → Server: verify engineer owns feature
  → Server: releaseAllFiles() (Redis)
  → Server: transition to 'done', set completedAt
  → Server: publish 'feature_completed' event
  → CLI: cleanupFeatureExport() — delete .nexus/active/<slug>/
  → CLI: updateProjectConfig({ activeFeature: undefined })
```
