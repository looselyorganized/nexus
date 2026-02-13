---
name: pick
description: >-
  Claim a feature and begin working on it. Exports the spec,
  learnings, and decisions to the local repo. Use when user says
  "pick a feature", "claim this feature", "start working on",
  "grab <slug>", or "let me take <slug>". Requires .nexus.json
  in project root.
argument-hint: "<slug>"
metadata:
  author: Nexus Team
  version: 1.0.0
compatibility: Requires Nexus CLI (nexus command) and .nexus.json project link. Claude Code only.
---

# Pick a Feature

Claim a feature for work. This locks its file paths via Redis, exports the spec and prior context to `.nexus/active/<slug>/`, and sets it as your active feature in `.nexus.json`.

## Context to Load

1. Read `.nexus.json` — check `activeFeature`
2. If a feature is already active, warn the user and ask if they want to release it first (`nexus feature release`)
3. If not linked, tell user: "Not linked to a project. Run `nexus project link <project-id>` first."

## Constraints

**CRITICAL: Always ask the user before picking.** Show them what will be claimed and get explicit confirmation. Never auto-pick.

**CRITICAL**: Use `$ARGUMENTS` for the slug, not `$1`.

## Process

1. If no slug provided via `$ARGUMENTS`, first run `nexus feature available` and present options. Wait for user choice.

2. Confirm with the user:
   "Pick feature `<slug>`? This will claim it and lock its file paths."

3. After confirmation, run:
   ```bash
   nexus feature pick $ARGUMENTS
   ```

4. Read ALL three exported files and summarize:
   - `.nexus/active/<slug>/spec.md` — the feature specification (goal, approach, acceptance criteria)
   - `.nexus/active/<slug>/learnings.md` — prior learnings from previous sessions (may be empty)
   - `.nexus/active/<slug>/decisions.md` — prior architectural decisions (may be empty)

5. Present a summary:
   - What the feature is and its goal
   - Key acceptance criteria
   - Any prior learnings or decisions to be aware of
   - "Ready to start implementation."

## Expected Output

The CLI prints:
```
Picked feature: cache-layer
Spec exported to .nexus/active/cache-layer/
```

## Error Handling

| Scenario | CLI Message | What to Tell User |
|----------|-------------|-------------------|
| Already have active feature | (check `.nexus.json` before running) | "You already have `<slug>` active. Release it first with `nexus feature release`, or `/done` if it's complete." |
| Feature not found | `Error: <message> (404)` | "Feature not found. Check the slug with `/available`." |
| Feature already claimed | `Error: <message> (409)` | "Someone else has this feature. Run `/available` to see what's free." |
| File claim conflicts | `Error: <message> (409)` | "File paths overlap with another active feature's claims. Run `/status` to see who has conflicting files." |
| Not linked | `Not linked to a project. Run: nexus project link` | Run `nexus project link <project-id>` first |
| Not logged in | `Not logged in. Run: nexus login` | Run `nexus login --token <key>` first |

## During Work

After picking, remind the user of available tools:
- `/learn` — record discoveries and gotchas
- `/decision` — record architectural choices
- `/save` — save progress checkpoints
- `/done` — when implementation is complete

For the full pick flow: See `nexus` skill > [references/ARCHITECTURE.md](../nexus/references/ARCHITECTURE.md)
