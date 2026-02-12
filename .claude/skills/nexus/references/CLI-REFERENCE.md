# Nexus CLI Reference

Complete command reference for the `nexus` CLI.

## Global Options

All commands support:
- `--json` — Output in JSON format
- `--version` — Show version
- `--help` — Show help

---

## Auth

| Command | Description |
|---------|-------------|
| `nexus login --token <key>` | Authenticate with API key |
| `nexus login --register --name <name> --email <email>` | Register new account |
| `nexus login --server <url>` | Specify server URL |
| `nexus logout` | Clear stored credentials |
| `nexus whoami` | Show current engineer info |

---

## Projects

| Command | Description |
|---------|-------------|
| `nexus project create -n <name> -s <slug>` | Create project |
| `nexus project create -n <name> -s <slug> --repo-url <url>` | Create with repo URL |
| `nexus project create -n <name> -s <slug> --repo-path <path>` | Create with repo path (default: cwd) |
| `nexus project link <project-id>` | Link current directory to project |
| `nexus project unlink` | Unlink current directory |
| `nexus project list` | List all projects |
| `nexus project info` | Show current project info |

---

## Features

| Command | Description |
|---------|-------------|
| `nexus feature create` | Create feature spec (opens editor) |
| `nexus feature create --from <file>` | Create from markdown file |
| `nexus feature create -s <slug> -t <title>` | Create with slug and title |
| `nexus feature edit <slug>` | Edit feature spec in $EDITOR |
| `nexus feature show <slug>` | Show complete feature details |
| `nexus feature list` | List all features |
| `nexus feature list -s <status>` | Filter by status |
| `nexus feature list -l <lane>` | Filter by lane |
| `nexus feature list --limit <n>` | Limit results |
| `nexus feature ready <slug>` | Mark feature as ready for pickup |
| `nexus feature delete <slug>` | Delete a draft feature |
| `nexus feature available` | Show claimable features |
| `nexus feature pick <slug>` | Claim feature, export spec to repo |
| `nexus feature release` | Release active feature back to ready |
| `nexus feature done` | Mark active feature as complete |

### `nexus feature available` — Example Output

```
Slug           Title                             Lane   Pri  Status
cache-layer    Implement Redis caching           next   2    available
db-migration   Migrate to PostgreSQL             now    1    blocked by schema-design
```

### `nexus feature pick <slug>` — Example Output

```
Picked feature: cache-layer
Spec exported to .nexus/active/cache-layer/
```

### `nexus feature done` — Example Output

```
Feature completed: cache-layer
```

### Feature Spec Format (for `--from`)

```markdown
---
slug: my-feature
title: My Feature Title
lane: next
touches: ["src/routes/foo.ts", "src/services/foo.ts"]
---

# Feature Spec
## Goal
...
## Approach
...
## Acceptance Criteria
...
```

---

## Learnings

| Command | Description |
|---------|-------------|
| `nexus learn "<content>"` | Record a learning for active feature |

Requires an active feature (via `nexus feature pick`).

### Example Output

```
Learning added
```

---

## Decisions

| Command | Description |
|---------|-------------|
| `nexus decision "<title>"` | Record a decision |
| `nexus decision "<title>" --rationale "<why>"` | With rationale |
| `nexus decision "<title>" -r "<why>" -a "<alternatives>"` | With alternatives |

**Flags:**
- `-r, --rationale <text>` — Why this decision was made
- `-a, --alternatives <text>` — Alternatives considered

Requires an active feature.

### Example Output

```
Decision recorded: Use PostgreSQL
```

---

## Checkpoints

| Command | Description |
|---------|-------------|
| `nexus save` | Save checkpoint (captures git state) |
| `nexus save --notes "<text>"` | Save with notes |
| `nexus save -n "<text>"` | Save with notes (short flag) |

Captures: git branch, commit hash, dirty state. Requires an active feature.

### Example Output

```
Checkpoint saved
```

No-op output:
```
No changes since last checkpoint
```

---

## Status

| Command | Description |
|---------|-------------|
| `nexus status` | Show project status (features, claims, sessions) |

### Example Output

```
ACTIVE FEATURES
Slug          Title                          Engineer
ui-redesign   Modernize user interface       abc12def

FILE CLAIMS
File                    Engineer  Feature
src/components/Button   dev1      abc12def

ACTIVE SESSIONS
Engineer  Feature   Since
Alice     abc12def  2/11/2026, 3:45:30 PM
```

---

## Roadmap

| Command | Description |
|---------|-------------|
| `nexus roadmap` | Display roadmap by lane |
| `nexus roadmap-ops move <slug> --before <other>` | Reorder within lane |
| `nexus roadmap-ops promote <slug>` | Move to higher lane |
| `nexus roadmap-ops defer <slug>` | Move to lower lane |

**Aliases:** `nexus rm move`, `nexus rm promote`, `nexus rm defer`

**Lane order:** `icebox` < `later` < `next` < `now`

### Example Output

```
NOW (2)
Pri  Slug          Title                                    Status
1    auth          Authentication system                    active
2    cache         Redis caching layer                      draft

NEXT (1)
Pri  Slug          Title                                    Status
1    payments      Payment processing                       ready
```

---

## Watch

| Command | Description |
|---------|-------------|
| `nexus watch` | Real-time activity stream via WebSocket |

Event icons: `+` created, `~` updated, `>` claimed, `<` released,
`*` completed, `#` files, `L` learning, `D` decision, `S` session start,
`X` session end, `.` connection events, `!` error.

Press `Ctrl+C` to stop.

---

## Configuration Files

| File | Purpose |
|------|---------|
| `~/.nexus/config.json` | Global config (token, server, engineer info) |
| `.nexus.json` | Project link (projectId, slug, activeFeature) |
| `.nexus/active/<slug>/spec.md` | Exported feature spec |
| `.nexus/active/<slug>/learnings.md` | Exported learnings |
| `.nexus/active/<slug>/decisions.md` | Exported decisions |

---

## Common Error Messages

| Error | Meaning | Resolution |
|-------|---------|------------|
| `Not logged in. Run: nexus login` | No auth token in ~/.nexus/config.json | Run `nexus login --token <key>` |
| `Not linked to a project. Run: nexus project link` | No .nexus.json in project root | Run `nexus project link <project-id>` |
| `No active feature. Pick one first: nexus feature pick <slug>` | Command requires active feature | Run `nexus feature pick <slug>` first |
| `Error: <message> (401)` | API token invalid or expired | Run `nexus login --token <new-key>` |
| `Error: <message> (404)` | Resource not found | Check slug/ID is correct |
| `Error: <message> (409)` | Conflict (e.g., slug exists, feature already claimed) | Use different slug or release first |
| `Error: <message> (500)` | Server error | Check server is running, retry |
