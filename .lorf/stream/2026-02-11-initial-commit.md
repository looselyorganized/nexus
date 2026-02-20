---
type: "milestone"
date: "2026-02-11"
title: "Initial commit — full monorepo with 524 tests"
---

Nexus-2 monorepo stood up with Hono.js server, Commander.js CLI, and shared types package. 524 tests across 38 files covering unit, integration, Redis, route, WebSocket, and E2E layers. Key fixes: Hono route ordering for static vs parameterized paths, Supabase pooler port rewrite for test visibility.
