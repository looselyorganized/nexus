---
name: nexus:learn
description: Append a learning to the active feature
arguments:
  - name: content
    description: The learning text to record
    required: true
---

# Record Learning

Append a learning to the currently active feature. Learnings are preserved across agent sessions and help future agents understand context.

## Command

```bash
nexus learn "{{content}}"
```

This writes to both:
- The server (source of truth)
- The local `.nexus/active/<slug>/learnings.md` file

## When to Use

Record learnings when you discover:
- Important implementation details
- Gotchas or edge cases
- Dependencies between components
- Performance considerations
- Decisions that aren't formal enough for `/nexus:decision`
