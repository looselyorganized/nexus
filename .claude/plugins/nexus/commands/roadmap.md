---
name: nexus:roadmap
description: View the project roadmap grouped by lane
arguments: []
---

# Nexus Roadmap

View the project roadmap - features organized by lane (now/next/later/icebox).

## Command

```bash
nexus roadmap --json
```

## Display Format

Group features by lane, sorted by priority within each lane:
- **NOW** - actively being worked on or next up
- **NEXT** - upcoming work
- **LATER** - planned but not soon
- **ICEBOX** - ideas, not prioritized

Show: slug, title, status, priority for each feature.

## Next Steps

- Pick an available feature: `/nexus:pick <slug>`
- Promote a feature: `nexus roadmap-ops promote <slug>`
- Defer a feature: `nexus roadmap-ops defer <slug>`
