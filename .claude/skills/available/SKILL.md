---
name: available
description: >-
  Show features available to work on in the current Nexus project.
  Use when user says "what's available", "what can I work on",
  "show features", "any features to pick up", "what should I do
  next", "find me work", or wants to see claimable work. Requires
  .nexus.json in project root.
argument-hint: ""
metadata:
  author: Nexus Team
  version: 1.0.0
compatibility: Requires Nexus CLI (nexus command) and .nexus.json project link. Claude Code only.
---

# Show Available Features

Display features that are ready for pickup, sorted by lane priority (now > next > later) then by priority number within each lane.

## Context to Load

1. Read `.nexus.json` — confirm project is linked (has `projectId`)
2. If not linked, tell user: "Not linked to a project. Run `nexus project link <project-id>` first."
3. Note `activeFeature` — if set, remind user they already have one active

## Constraints

**CRITICAL**: Use exact CLI syntax. Do not improvise flags or output format.

## Process

Run:
```bash
nexus feature available
```

For JSON output (if needed for further processing):
```bash
nexus feature available --json
```

## Expected Output

The CLI prints a table with these columns:
```
Slug           Title                             Lane   Pri  Status
cache-layer    Implement Redis caching           next   2    available
db-migration   Migrate to PostgreSQL             now    1    blocked by schema-design
```

- Title is truncated to ~35 characters
- Status shows `available` or `blocked by <slug>` (when file paths overlap with an active feature's claims)
- Features are sorted by lane priority, then by priority number

## Error Handling

| Scenario | CLI Message | What to Tell User |
|----------|-------------|-------------------|
| Not linked | `Not linked to a project. Run: nexus project link` | Run `nexus project link <project-id>` first |
| Not logged in | `Not logged in. Run: nexus login` | Run `nexus login --token <key>` first |
| No features available | Empty table / no output | "No features are available for pickup. Try `nexus feature list` to see all features, or `nexus feature list -s draft` to see drafts that may need marking ready." |
| Server error (500) | `Error: <message> (500)` | "Server error. Check the server is running and try again." |

## Presentation

After showing the table:
- Highlight features in the `now` lane as highest priority
- Note any blocked features and why they're blocked
- If the user has no active feature, ask: "Would you like to pick one? Use `/pick <slug>`."

## Next Steps

- Pick a feature: `/pick <slug>`
- See full feature details: `nexus feature show <slug>`
- See all features (including non-available): `nexus feature list`
- For all feature commands: See `nexus` skill > [references/CLI-REFERENCE.md](../nexus/references/CLI-REFERENCE.md)
