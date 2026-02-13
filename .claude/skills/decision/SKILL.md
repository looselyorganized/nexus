---
name: decision
description: >-
  Record an architectural or design decision tied to the active
  feature. Use when user says "record a decision", "decided to",
  "let's go with", "architectural decision", or when an important
  technical choice is made during implementation. Requires active feature.
argument-hint: "<what> --rationale <why>"
metadata:
  author: Nexus Team
  version: 1.0.0
compatibility: Requires Nexus CLI (nexus command) and .nexus.json project link. Claude Code only.
---

# Record a Decision

Save an architectural or design decision with rationale and alternatives considered. Decisions persist across sessions for future reference.

**Dual write**: The CLI writes to BOTH the server (source of truth) AND appends to the local `.nexus/active/<slug>/decisions.md` file.

## Context to Load

1. Read `.nexus.json` — confirm `activeFeature` is set
2. If no active feature, tell user: "No active feature. Pick one first: nexus feature pick <slug>"

## Process

Three ways to call, depending on what's available:

**Title only** (rationale can be added later):
```bash
nexus decision "<title>"
```

**Title + rationale**:
```bash
nexus decision "<title>" --rationale "<why>"
```

**Title + rationale + alternatives**:
```bash
nexus decision "<title>" --rationale "<why>" --alternatives "<what else>"
```

Short flags: `-r` for `--rationale`, `-a` for `--alternatives`.

**Argument parsing**: When `$ARGUMENTS` is provided:
- If it contains `--rationale` or `-r`, pass through as-is
- If it's just a plain string, use it as the title and ask the user for rationale

If no arguments, ask the user:
1. What was decided?
2. Why? (rationale)
3. What alternatives were considered? (optional)

## Expected Output

The CLI prints:
```
Decision recorded: Use PostgreSQL
```

## Error Handling

| Scenario | CLI Message | What to Tell User |
|----------|-------------|-------------------|
| No active feature | `No active feature. Pick one first: nexus feature pick <slug>` | "No active feature. Pick one first with `/pick`." |
| Not logged in | `Not logged in. Run: nexus login` | Run `nexus login --token <key>` first |
| Server error (500) | `Error: <message> (500)` | "Decision not saved to server. You can add it manually to `.nexus/active/<slug>/decisions.md`." |

## Good Decision Examples

Good decisions capture the what, why, and what-else:
- Title: "Use PostgreSQL over MongoDB"
  Rationale: "Need ACID transactions for financial data"
  Alternatives: "MongoDB — better for unstructured data but lacks transaction support"

- Title: "Use Zod for runtime validation"
  Rationale: "TypeScript-native, composable schemas, good error messages"
  Alternatives: "Joi — more mature but no TS inference; io-ts — too verbose"

## When to Suggest This

Proactively suggest `/decision` when you:
- Choose between two viable approaches
- Select a library or framework
- Define an API shape or data model
- Set a convention (naming, structure, patterns)
- Make a tradeoff (performance vs readability, etc.)

## Next Steps

- Continue implementation
- Record a learning: `/learn`
- Save progress: `/save`
