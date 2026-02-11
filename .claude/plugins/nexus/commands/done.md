---
name: nexus:done
description: Mark the active feature as complete
arguments: []
---

# Complete Feature

Mark the currently active feature as done. This:
1. Releases all file claims in Redis
2. Sets feature status to 'done'
3. Cleans up `.nexus/active/<slug>/` directory
4. Clears the active feature from project config

## Command

```bash
nexus feature done
```

## Before Completing

Ensure:
- All implementation is complete
- Tests pass
- Key learnings have been recorded with `/nexus:learn`
- Important decisions documented with `/nexus:decision`
