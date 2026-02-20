---
id: "h001"
statement: "File-level distributed locking with TTL expiration is sufficient to eliminate edit conflicts when 3+ AI agents work concurrently on the same repository, without requiring git-level merge resolution."
status: "proposed"
date: "2026-02-19"
---

## Context

Nexus uses Redis-backed file claims with TTL-based lease expiration as its primary coordination primitive. The core assumption is that preventing two agents from editing the same file simultaneously — at the application layer — is enough to avoid merge conflicts entirely, without needing git-level conflict detection or resolution.

## How to Test

1. Deploy Nexus with 3+ concurrent agent sessions on the same project
2. Assign overlapping feature scopes where agents would naturally touch shared files
3. Measure: number of git merge conflicts, claim contention events, and TTL expirations over a sustained work session (1+ hours)
4. Compare against a control run with the same agents and scopes but no claim enforcement
5. Threshold: zero merge conflicts with claims active vs. measurable conflicts without

## Evidence

[No evidence gathered yet.]

## Notes

- Edge case: agents may need to edit the same file for different reasons (e.g., shared config, barrel exports). Current claim model is all-or-nothing per file path — may need granularity refinement.
- TTL duration matters: too short and agents lose claims mid-edit, too long and abandoned claims block others. Current implementation relies on heartbeat renewal.
- Does not address semantic conflicts (two agents changing different files that break each other's logic).
