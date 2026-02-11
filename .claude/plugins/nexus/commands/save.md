---
name: nexus:save
description: Create a checkpoint for crash recovery
arguments: []
---

# Save Checkpoint

Create a manual checkpoint that captures your current progress. Checkpoints include:
- Git branch and commit info
- Active file claims
- Custom notes

## Command

```bash
nexus save --notes "Completed auth middleware, starting routes"
```

## When to Use

Save checkpoints:
- Before risky operations
- At natural stopping points
- Before context switches
- Periodically during long work sessions
