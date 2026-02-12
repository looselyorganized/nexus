---
name: done
description: >-
  Mark the current feature as complete. Releases claims, cleans up
  exported files, and clears active feature. Use when user says
  "mark done", "feature complete", "finished with this feature",
  "ship it", or "done with <slug>". Requires active feature in
  .nexus.json.
argument-hint: ""
---

# Complete Feature

Mark the active feature as done. This releases all file claims in Redis, cleans up `.nexus/active/<slug>/`, and clears `activeFeature` from `.nexus.json`.

## Context to Load

1. Read `.nexus.json` — get `activeFeature`
2. If no active feature, tell user: "No active feature. Nothing to complete. Pick one first with `/pick`."
3. Read `.nexus/active/<slug>/learnings.md` and `.nexus/active/<slug>/decisions.md` to remind the user what's been recorded

## Constraints

**CRITICAL: Always ask the user before marking done.** Present a checklist including recorded learnings/decisions and get explicit confirmation.

## Process

1. Summarize what was recorded during this feature:
   - Number of learnings in `learnings.md`
   - Number of decisions in `decisions.md`

2. Present completion checklist:
   ```
   Before completing <slug>, confirm:
   - [ ] Implementation is complete
   - [ ] Tests pass
   - [ ] Key learnings recorded (/learn) — X recorded so far
   - [ ] Important decisions documented (/decision) — X recorded so far
   ```

3. Wait for explicit user confirmation.

4. After confirmation, run:
   ```bash
   nexus feature done
   ```

## Expected Output

The CLI prints:
```
Feature completed: cache-layer
```

The CLI automatically:
- Releases all file claims in Redis
- Removes `.nexus/active/<slug>/` directory
- Clears `activeFeature` from `.nexus.json`

## Error Handling

| Scenario | CLI Message | What to Tell User |
|----------|-------------|-------------------|
| No active feature | `No active feature. Pick one first: nexus feature pick <slug>` | "No active feature. Nothing to complete." |
| Not logged in | `Not logged in. Run: nexus login` | Run `nexus login --token <key>` first |
| Server error (500) | `Error: <message> (500)` | "Server error completing feature. Your local work is safe. Try again or check the server." |

## If Not Ready

If the user isn't ready to complete but wants to stop working:
- Suggest `/save` to checkpoint progress before leaving
- Suggest `nexus feature release` to let someone else take over (returns feature to `ready`)

## Next Steps

After completion:
- See what's next: `/available`
- View the roadmap: `/roadmap`
- For all feature commands: See `nexus` skill > [references/CLI-REFERENCE.md](../nexus/references/CLI-REFERENCE.md)
