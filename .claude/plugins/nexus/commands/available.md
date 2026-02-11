---
name: nexus:available
description: Show features ready to pick up (with collision detection)
arguments: []
---

# Available Features

Show features that are ready for pickup, with file collision detection.

## Command

```bash
nexus feature available --json
```

## Display Format

List features sorted by priority (now > next > later). For each feature show:
- slug, title, lane, priority
- Whether it's available or blocked by another engineer's file claims

## Next Steps

- Pick an available feature: `/nexus:pick <slug>`
