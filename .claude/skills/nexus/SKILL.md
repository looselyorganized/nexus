---
name: nexus
description: >-
  Multi-agent engineering coordination system. Provides background
  knowledge about the Nexus architecture, workflow lifecycle, and
  CLI tooling. Auto-loads when .nexus.json exists in the project
  root. Not directly invocable — use the action skills instead.
user-invocable: false
metadata:
  author: Nexus Team
  version: 1.0.0
---

# Nexus — Multi-Agent Engineering Coordination

Nexus coordinates multiple engineers and AI agents working on the same codebase.
It tracks features, claims file paths to prevent conflicts, manages sessions with
heartbeats, and preserves learnings and decisions across agent sessions.

The CLI (`nexus`) is the primary interface. The server (Hono.js + Bun) provides
the REST API and WebSocket for real-time updates. Redis handles file claims and
session heartbeats. PostgreSQL (via Drizzle ORM) stores persistent state.

## Detecting Nexus Projects

Check for `.nexus.json` in the project root. If it exists, the project is linked.

```json
{
  "projectId": "uuid",
  "projectName": "My Project",
  "projectSlug": "my-project",
  "linkedAt": "2025-01-01T00:00:00Z",
  "activeFeature": "feature-slug"   // present when a feature is picked
}
```

If `activeFeature` is set, the engineer is actively working on that feature.
Read `.nexus/active/<slug>/spec.md` for the feature specification.

## Feature Lifecycle

```
draft  ──>  ready  ──>  in_progress  ──>  done
                 ↑            │
                 └── release ─┘
```

- **draft**: Feature spec created, not yet ready for pickup
- **ready**: Marked ready — appears in `nexus feature available`
- **in_progress**: Claimed by an engineer — file paths locked via Redis
- **done**: Implementation complete, claims released, spec cleaned up

Only one engineer can hold a feature at a time. Picking a feature locks its
`touches` file paths in Redis. Releasing or completing returns the feature to
the pool and releases all claims.

### Lanes (Priority Buckets)

Features are organized into lanes: `icebox` < `later` < `next` < `now`.
Within each lane, features are sorted by priority number.

## Available Action Skills

| Skill | Slash Command | Purpose |
|-------|--------------|---------|
| available | `/available` | See claimable features |
| pick | `/pick <slug>` | Claim a feature and export spec |
| done | `/done` | Mark feature complete |
| learn | `/learn <insight>` | Record a learning |
| decision | `/decision <what>` | Record an architectural decision |
| save | `/save <message>` | Save a progress checkpoint |
| status | `/status` | Show project status overview |
| roadmap | `/roadmap` | View features by priority lane |

## Proactive Behaviors

When working in a Nexus project with an active feature:

- **Discoveries**: When you learn something non-obvious (a gotcha, edge case,
  performance characteristic), suggest recording it with `/learn`.
- **Decisions**: When an architectural or design choice is made (library selection,
  API shape, pattern choice, tradeoff), suggest recording it with `/decision`.
- **Checkpoints**: At natural stopping points (completed a logical unit, before
  switching focus, before ending session), suggest saving with `/save`.
- **Completion**: When implementation is finished and tests pass, suggest marking
  done with `/done` — but **always ask the user first**.

## Constraints

- **NEVER** pick a feature without showing options and getting explicit user confirmation
- **NEVER** mark done without explicit user confirmation
- **ALWAYS** read the spec after picking a feature
- **ALWAYS** check `.nexus.json` for `activeFeature` before suggesting pick
- **ALWAYS** use exact CLI syntax from the reference — do not improvise flags
- Record learnings and decisions as you discover them during implementation

## References

- For complete CLI syntax and all flags: See [references/CLI-REFERENCE.md](references/CLI-REFERENCE.md)
- For system architecture details: See [references/ARCHITECTURE.md](references/ARCHITECTURE.md)
