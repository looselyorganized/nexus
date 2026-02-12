---
name: roadmap
description: >-
  View the project roadmap organized by priority lane. Use when
  user says "show roadmap", "what's on the roadmap", "project plan",
  "feature lanes", or wants to see all features grouped by priority.
  Requires .nexus.json in project root.
argument-hint: ""
---

# Project Roadmap

View all features organized by priority lane. Shows the big picture of what's planned, what's next, and what's actively being worked on.

## Context to Load

1. Read `.nexus.json` — confirm project is linked (has `projectId`)
2. If not linked, tell user: "Not linked to a project. Run `nexus project link <project-id>` first."

## Process

Run:
```bash
nexus roadmap
```

## Expected Output

The CLI prints features grouped by lane, with a count in the header. Only lanes with features are shown (empty lanes are omitted):

```
NOW (2)
Pri  Slug          Title                                    Status
1    auth          Authentication system                    active
2    cache         Redis caching layer                      draft

NEXT (1)
Pri  Slug          Title                                    Status
1    payments      Payment processing                       ready
```

**Lane order** (highest to lowest priority): `NOW` > `NEXT` > `LATER` > `ICEBOX`

Features within each lane are sorted by priority number.

## Presentation

After showing the roadmap:
- If there are `ready` features in `now` or `next`, suggest picking one: "There are ready features in NOW — pick one with `/pick <slug>`."
- If all features are `active` or `done`, note progress: "All NOW features are in progress."
- Highlight your active feature (from `.nexus.json` `activeFeature`) if it appears

## Error Handling

| Scenario | CLI Message | What to Tell User |
|----------|-------------|-------------------|
| Not linked | `Not linked to a project. Run: nexus project link` | Run `nexus project link <project-id>` first |
| Not logged in | `Not logged in. Run: nexus login` | Run `nexus login --token <key>` first |
| No features exist | Empty output | "No features on the roadmap yet. Create one with `nexus feature create`." |
| Server error (500) | `Error: <message> (500)` | "Server error fetching roadmap. Check the server is running and try again." |

## Roadmap Management

To reorganize the roadmap:

```bash
nexus roadmap-ops promote <slug>   # Move up: icebox → later → next → now
nexus roadmap-ops defer <slug>     # Move down: now → next → later → icebox
nexus roadmap-ops move <slug> --before <other>  # Reorder within same lane
```

Short alias: `nexus rm` is equivalent to `nexus roadmap-ops`.

**Notes:**
- `promote`/`defer` move one lane at a time
- `move --before` requires both features to be in the same lane
- Already at highest/lowest lane is not an error — just a no-op

## Next Steps

- Pick an available feature: `/pick <slug>`
- Check project activity: `/status`
- See all features with filters: `nexus feature list -l <lane> -s <status>`
- For all roadmap commands: See `nexus` skill > [references/CLI-REFERENCE.md](../nexus/references/CLI-REFERENCE.md)
