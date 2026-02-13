---
name: status
description: >-
  Show the current Nexus project status including active features,
  file claims, and sessions. Use when user says "nexus status",
  "project status", "what's going on", "who's working on what",
  "show claims", "who has what files", "active engineers", or wants
  an overview of project activity. Requires .nexus.json. Do NOT use
  for general project questions unrelated to Nexus coordination.
argument-hint: ""
metadata:
  author: Nexus Team
  version: 1.0.0
compatibility: Requires Nexus CLI (nexus command) and .nexus.json project link. Claude Code only.
---

# Project Status

Show an aggregate view of the project's current state: who's working on what, which files are claimed, and who has active sessions.

## Context to Load

1. Read `.nexus.json` — confirm project is linked (has `projectId`)
2. If not linked, tell user: "Not linked to a project. Run `nexus project link <project-id>` first."
3. Note `activeFeature` — this is YOUR feature, highlight it in the output

## Process

Run:
```bash
nexus status
```

## Expected Output

The CLI prints three sections:

```
ACTIVE FEATURES
Slug          Title                          Engineer
ui-redesign   Modernize user interface       abc12def

FILE CLAIMS
File                    Engineer  Feature
src/components/Button   dev1      abc12def

ACTIVE SESSIONS
Engineer  Feature   Since
Alice     abc12def  2/11/2026, 3:45:30 PM
```

**Empty states** — when a section has no data:
- `No active features`
- `No file claims`
- `No active sessions`

## Presentation

After showing the raw CLI output, provide a human-readable summary:

- If there's activity: "2 engineers are actively working. Jane has `ui-redesign`, Bob has `api-auth`. 3 files are claimed across 2 features."
- If quiet: "The project is quiet — no active features or sessions."
- If you have an active feature: highlight it — "You're working on `<slug>`."

Cross-reference with `.nexus.json` `activeFeature` to identify which feature is yours in the output.

## Error Handling

| Scenario | CLI Message | What to Tell User |
|----------|-------------|-------------------|
| Not linked | `Not linked to a project. Run: nexus project link` | Run `nexus project link <project-id>` first |
| Not logged in | `Not logged in. Run: nexus login` | Run `nexus login --token <key>` first |
| Server error (500) | `Error: <message> (500)` | "Server error fetching status. Check the server is running and try again." |

## Next Steps

Based on the current state:
- If you have no active feature: "Run `/available` to see what to work on"
- If you have an active feature: "Continue working on `<slug>`, or `/done` when finished"
- To see the full roadmap: `/roadmap`
- For all status details: See `nexus` skill > [references/CLI-REFERENCE.md](../nexus/references/CLI-REFERENCE.md)
