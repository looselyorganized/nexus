---
name: nexus:pick
description: Claim a feature and export spec to repo
arguments:
  - name: slug
    description: Feature slug to claim
    required: true
---

# Pick Feature

Claim a feature for work. This:
1. Locks the feature's `touches` file paths via Redis (prevents conflicts)
2. Exports spec, learnings, and decisions to `.nexus/active/<slug>/`
3. Sets the feature as your active work item

## Command

```bash
nexus feature pick {{slug}}
```

## After Picking

The feature spec and context files are now in `.nexus/active/{{slug}}/`:
- `spec.md` - The feature specification
- `learnings.md` - Previous learnings from this feature
- `decisions.md` - Previous decisions for this feature

Read `spec.md` to understand the work, then begin implementation.

## During Work

- Log learnings: `/nexus:learn`
- Log decisions: `/nexus:decision`
- Save checkpoint: `/nexus:save`
- When done: `/nexus:done`
