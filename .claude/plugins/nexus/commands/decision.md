---
name: nexus:decision
description: Log an architectural decision
arguments:
  - name: title
    description: Short title for the decision
    required: true
---

# Record Decision

Log an architectural or design decision. Decisions are preserved across sessions and help maintain consistency.

## Command

```bash
nexus decision "{{title}}" --rationale "Why this approach was chosen"
```

## When to Use

Record decisions when:
- Choosing between multiple valid approaches
- Making architectural trade-offs
- Selecting libraries or patterns
- Establishing conventions for the feature
