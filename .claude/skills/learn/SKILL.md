---
name: learn
description: >-
  Record a learning or discovery tied to the active feature. Use
  when user says "record a learning", "I learned that", "note this",
  "TIL", "good to know", or when Claude discovers something
  noteworthy during implementation. Requires active feature.
argument-hint: "<insight>"
metadata:
  author: Nexus Team
  version: 1.0.0
compatibility: Requires Nexus CLI (nexus command) and .nexus.json project link. Claude Code only.
---

# Record a Learning

Save a learning or discovery tied to the active feature. Learnings persist across sessions so future engineers and agents benefit from what you discovered.

**Dual write**: The CLI writes to BOTH the server (source of truth) AND appends to the local `.nexus/active/<slug>/learnings.md` file.

## Context to Load

1. Read `.nexus.json` — confirm `activeFeature` is set
2. If no active feature, tell user: "No active feature. Pick one first: nexus feature pick <slug>"

## Process

If `$ARGUMENTS` provided:
```bash
nexus learn "$ARGUMENTS"
```

If no arguments, ask the user what they learned, then run the command.

If the user provides a multi-sentence learning, join it into a single coherent string for the CLI argument.

## Expected Output

The CLI prints:
```
Learning added
```

## Error Handling

| Scenario | CLI Message | What to Tell User |
|----------|-------------|-------------------|
| No active feature | `No active feature. Pick one first: nexus feature pick <slug>` | "No active feature. Pick one first with `/pick`." |
| Not logged in | `Not logged in. Run: nexus login` | Run `nexus login --token <key>` first |
| Server error (500) | `Error: <message> (500)` | "Learning not saved to server. You can add it manually to `.nexus/active/<slug>/learnings.md`." |

## Good vs Bad Learnings

Good learnings are specific, actionable, and non-obvious:
- "Bun's test timeout in bunfig.toml doesn't work in v1.2.14 — must use --timeout CLI flag"
- "The Supabase connection pooler (port 6543) causes visibility issues in tests — use direct connection (port 5432)"
- "Hono static routes must be defined before parameterized routes or they get captured as params"

Bad learnings are too vague to be useful:
- "Tests are weird"
- "The API works"
- "Fixed a bug"

## When to Suggest This

Proactively suggest `/learn` when you:
- Discover a non-obvious behavior or gotcha
- Find that a library/API works differently than expected
- Identify a performance characteristic or limitation
- Learn something about the codebase architecture
- Find a workaround for a limitation

## Next Steps

- Continue implementation
- Record a decision: `/decision`
- Save progress: `/save`
