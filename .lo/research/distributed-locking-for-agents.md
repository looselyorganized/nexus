---
title: "Distributed Locking for AI Agent Coordination"
date: "2026-02-10"
description: "How Redis-backed file claims solve the coordination problem when multiple AI agents work on the same codebase simultaneously."
topics: [distributed-systems, redis, agent-coordination]
status: "published"
author: "Michael Hofweller"
readingTime: "12 min read"
---

# Distributed Locking for AI Agent Coordination

When multiple AI agents work on the same codebase simultaneously, they need a way to avoid stepping on each other's toes. This is the distributed coordination problem — and it's one of the oldest problems in computer science, now showing up in an entirely new context.

## The Problem

Imagine three Claude Code agents working on a feature branch. Agent A is refactoring the authentication module. Agent B is updating the API routes that depend on auth. Agent C is writing tests for both. Without coordination, Agent B might read a file that Agent A is halfway through rewriting. Agent C might test against a state that no longer exists.

This isn't hypothetical. It's what happens in every multi-agent engineering setup that lacks coordination primitives.

## Redis-Backed File Claims

The solution we implemented in Nexus uses Redis as a distributed lock manager with file-level granularity. When an agent needs to modify a file, it "claims" it:

```
CLAIM file:src/auth/login.ts agent:agent-a ttl:30000
```

The claim is a Redis key with a TTL (time-to-live). This gives us several properties for free:

- **Mutual exclusion**: Only one agent can hold a claim on a file at a time
- **Crash tolerance**: If an agent dies, the TTL expires and the lock is automatically released
- **Visibility**: Any agent can query Redis to see who holds what

## Pipeline Pattern for Atomic Operations

A single file claim is simple, but real work often requires claiming multiple files atomically. You don't want to claim `auth/login.ts` but fail on `auth/types.ts` — that leaves you in a half-locked state.

We use Redis pipelines to make multi-file claims atomic:

```typescript
const pipeline = redis.pipeline();
for (const file of files) {
  pipeline.set(`claim:${file}`, agentId, "PX", ttl, "NX");
}
const results = await pipeline.exec();
```

The `NX` flag means "only set if not exists." If any claim fails, we roll back all of them. This is the all-or-nothing guarantee that makes the system reliable.

## Heartbeat-Based Liveness

TTLs handle the crash case, but what about an agent that's alive but slow? A 30-second TTL might expire while a legitimate operation is still in progress.

The solution is heartbeats. Every agent with active claims sends periodic heartbeat signals that extend the TTL:

```
PEXPIRE claim:src/auth/login.ts 30000
```

If heartbeats stop — because the agent crashed, lost network, or was terminated — the claims expire naturally. No manual cleanup required.

## Conflict Resolution

What happens when two agents try to claim the same file? The first one wins (Redis `NX` guarantees this). The second agent gets a rejection and must decide:

1. **Wait and retry** — poll until the claim is released
2. **Request release** — send a message to the holding agent asking it to finish up
3. **Escalate** — flag the conflict for human review

In practice, option 2 works best for AI agents. They're cooperative by nature and can often reorganize their work to avoid the conflict entirely.

## Lessons Learned

Building this system taught us several things about distributed coordination for AI agents:

**Agents are more cooperative than processes.** Traditional distributed locking assumes adversarial or at least independent actors. AI agents can actually communicate about their intentions, which makes conflict resolution much smoother.

**TTLs should be generous.** AI agents doing code generation can take unpredictable amounts of time. Short TTLs cause spurious expirations. We settled on 30 seconds with heartbeat renewal every 10 seconds.

**Visibility matters more than speed.** The ability for any agent (or human) to see who holds what locks is incredibly valuable for debugging. We built a dashboard view of all active claims that updates in real-time via WebSocket.

The full implementation lives in the [Nexus coordination server](https://github.com/mhofwell/nexus-2), where it's battle-tested across multi-agent engineering sessions.
