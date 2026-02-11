---
name: nexus:status
description: Show project status (active features, claims, sessions)
arguments: []
---

# Project Status

Show an aggregate view of the project's current state.

## Command

```bash
nexus status --json
```

## Display Format

Show three sections:
1. **Active Features** - features currently being worked on, who claimed them
2. **File Claims** - which files are locked and by whom
3. **Active Sessions** - which engineers are currently connected
