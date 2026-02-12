---
name: save
description: >-
  Save a progress checkpoint for the active session. Use when user
  says "save progress", "checkpoint", "save checkpoint", "save my
  work", or at natural stopping points during implementation.
  Requires active feature.
argument-hint: "<message>"
---

# Save Checkpoint

Save a progress checkpoint for the active session. The checkpoint captures your current git state (branch, commit hash, dirty state) and optional notes, stored server-side for crash recovery and session continuity.

## Context to Load

1. Read `.nexus.json` — confirm `activeFeature` is set
2. If no active feature, tell user: "No active feature. Pick one first: nexus feature pick <slug>"

## Process

If `$ARGUMENTS` provided:
```bash
nexus save --notes "$ARGUMENTS"
```

Short flag: `-n` is equivalent to `--notes`.
```bash
nexus save -n "$ARGUMENTS"
```

If no arguments, ask the user for a brief description of current progress, then run the command.

Bare save (no notes):
```bash
nexus save
```

## Expected Output

The CLI prints:
```
Checkpoint saved
```

If nothing changed since the last checkpoint:
```
No changes since last checkpoint
```

## What It Captures

Each checkpoint stores:
- Git branch name
- Current commit hash
- Dirty state (whether there are uncommitted changes)
- Optional notes describing progress
- Timestamp

This data is stored server-side and used for crash recovery — if a session is interrupted, the next engineer/agent can see exactly where work left off.

## Error Handling

| Scenario | CLI Message | What to Tell User |
|----------|-------------|-------------------|
| No active feature | `No active feature. Pick one first: nexus feature pick <slug>` | "No active feature. Pick one first with `/pick`." |
| No changes since last checkpoint | `No changes since last checkpoint` | "Nothing new to save. This is fine — your last checkpoint is still current." |
| Not logged in | `Not logged in. Run: nexus login` | Run `nexus login --token <key>` first |
| Server error (500) | `Error: <message> (500)` | "Checkpoint not saved to server. Your local work is safe. Try again." |

## When to Suggest This

Suggest `/save` at meaningful boundaries:
- A logical unit of work is complete (e.g., "routes done, starting tests")
- Before switching to a different part of the feature
- Before ending a session
- After passing a significant milestone

**When NOT to suggest**: Don't suggest saving after every small change. Save at meaningful boundaries, not after every file edit.

## Next Steps

- Continue implementation
- Record a learning: `/learn`
- Record a decision: `/decision`
- Mark complete when done: `/done`
