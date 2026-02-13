# Webhook System for Nexus-2

## Context

Nexus has a rich internal event system (Redis pub/sub + WebSocket broadcast) but no way for external systems to receive events. This means frameworks like Spec Kit, GSD, or any HTTP-capable tool can't react to Nexus lifecycle events without maintaining a persistent WebSocket connection. Webhooks solve this by delivering events as HTTP POST callbacks — the universal integration primitive.

## Goal

Add per-project webhook registrations with event filtering, HMAC-SHA256 signing, and async delivery. Hook into the existing `publish()` pipeline in `apps/server/src/redis/pubsub.ts` so every event that already broadcasts to WebSocket also fires webhooks — zero changes to existing services.

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/server/src/db/schema.ts` | Add `webhooks` + `webhookDeliveries` tables (edit existing) |
| `apps/server/src/services/webhook.service.ts` | CRUD + delivery logic |
| `apps/server/src/routes/webhook.routes.ts` | REST endpoints |
| `apps/server/src/app.ts` | Mount webhook routes (edit existing) |
| `packages/shared/src/types/webhook.ts` | Shared types |
| `packages/shared/src/types/index.ts` | Re-export webhook types (edit existing) |
| `packages/shared/src/types/api.ts` | Add webhook error codes (edit existing) |
| `apps/server/src/__tests__/integration/routes/webhook.routes.test.ts` | Route tests |
| `apps/server/src/__tests__/integration/services/webhook.service.test.ts` | Service tests |

## Files to Modify

| File | Change |
|------|--------|
| `apps/server/src/redis/pubsub.ts` | After publish, call webhook dispatcher |
| `apps/server/src/__tests__/setup/test-helpers.ts` | Add `webhooks`, `webhook_deliveries` to `truncateAll()`, add `seedWebhook()` |

---

## Phase A: Schema & Types

### A1. Database Schema — `webhooks` table

Add to `apps/server/src/db/schema.ts`:

```typescript
// ─── Webhooks ───
export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    secret: text('secret').notNull(),           // HMAC-SHA256 signing key
    events: text('events').array().notNull(),    // e.g. ['feature_claimed','feature_completed']
    active: boolean('active').notNull().default(true),
    description: text('description'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => engineers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('webhooks_project_idx').on(table.projectId),
    index('webhooks_active_idx').on(table.projectId, table.active),
  ]
);

// ─── Webhook Deliveries ───
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    webhookId: uuid('webhook_id')
      .notNull()
      .references(() => webhooks.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    responseStatus: integer('response_status'),
    responseBody: text('response_body'),
    success: boolean('success').notNull().default(false),
    attempts: integer('attempts').notNull().default(1),
    durationMs: integer('duration_ms'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('webhook_deliveries_webhook_idx').on(table.webhookId),
    index('webhook_deliveries_created_idx').on(table.createdAt),
  ]
);
```

Add type exports at bottom:
```typescript
export type WebhookRecord = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type WebhookDeliveryRecord = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
```

### A2. Shared Types — `packages/shared/src/types/webhook.ts`

```typescript
import type { ServerEventType } from './ws';

/** Events that can trigger webhooks (subset of ServerEventType, excluding connection events) */
export type WebhookEventType = Extract<
  ServerEventType,
  | 'feature_created'
  | 'feature_updated'
  | 'feature_claimed'
  | 'feature_released'
  | 'feature_completed'
  | 'files_claimed'
  | 'files_released'
  | 'learning_added'
  | 'decision_added'
  | 'session_started'
  | 'session_ended'
>;

export const WebhookEventTypes: WebhookEventType[] = [
  'feature_created', 'feature_updated', 'feature_claimed',
  'feature_released', 'feature_completed',
  'files_claimed', 'files_released',
  'learning_added', 'decision_added',
  'session_started', 'session_ended',
];

export interface WebhookPayload {
  id: string;          // delivery ID
  webhookId: string;
  event: WebhookEventType;
  projectId: string;
  timestamp: number;
  payload: unknown;
}
```

### A3. Error Codes

Add to `ErrorCodes` in `packages/shared/src/types/api.ts`:

```typescript
WEBHOOK_NOT_FOUND: 'WEBHOOK_NOT_FOUND',
WEBHOOK_DELIVERY_FAILED: 'WEBHOOK_DELIVERY_FAILED',
```

### A4. Migration

Generate via `bunx drizzle-kit generate` after schema changes, which creates a SQL migration file in `apps/server/src/db/migrations/`. Then apply with `bun run db:migrate`.

---

## Phase B: Service Layer

### B1. `apps/server/src/services/webhook.service.ts`

Functions following the existing service pattern (functional, uses `db` import, throws AppError subclasses):

**CRUD:**
- `createWebhook({ projectId, url, secret, events, description, createdBy })` — validate URL is HTTPS, validate events against `WebhookEventTypes`, insert
- `listWebhooks(projectId)` — return all webhooks for project (no pagination needed, low cardinality)
- `getWebhook(projectId, webhookId)` — fetch or throw NotFoundError
- `updateWebhook({ projectId, webhookId, url?, events?, active?, description? })` — partial update
- `deleteWebhook(projectId, webhookId)` — hard delete (cascade removes deliveries)

**Delivery:**
- `dispatchWebhooks(projectId, eventType, eventPayload)` — core dispatch function:
  1. Query active webhooks for this project where `events` array contains `eventType`
  2. For each matching webhook, fire-and-forget `deliverWebhook()` (no await — non-blocking)
  3. Return immediately (do not slow down the publish pipeline)

- `deliverWebhook(webhook, eventType, eventPayload)` — single delivery:
  1. Build `WebhookPayload` envelope
  2. Sign with HMAC-SHA256: `X-Nexus-Signature-256: sha256=<hex>`
  3. POST to `webhook.url` with headers:
     - `Content-Type: application/json`
     - `X-Nexus-Event: <eventType>`
     - `X-Nexus-Signature-256: sha256=<hex>`
     - `X-Nexus-Delivery: <deliveryId>`
  4. Timeout: 10 seconds
  5. Record delivery in `webhook_deliveries` (success/fail, status, duration)
  6. On failure: log, no retry in v1 (retry is future enhancement)

- `listDeliveries(webhookId, { limit, cursor })` — paginated delivery log
- `redeliverWebhook(webhookId, deliveryId)` — replay a past delivery

**Test helper:**
- `pingWebhook(webhookId)` — sends a test `{ event: 'ping' }` payload

### B2. Hook into Pub/Sub

In `apps/server/src/redis/pubsub.ts`, modify the `publish()` function:

```typescript
// At the end of publish(), after the Redis publish:
import { dispatchWebhooks } from '../services/webhook.service';

// Inside publish() function, after the try/catch for publisher.publish:
// Fire webhooks (non-blocking)
dispatchWebhooks(projectId, type, payload).catch((err) => {
  logger.error({ err, projectId, type }, 'Webhook dispatch error');
});
```

This is the **only integration point**. Every existing service that calls `publish()` or `broadcastToProject()` automatically triggers webhooks.

---

## Phase C: Routes

### C1. `apps/server/src/routes/webhook.routes.ts`

Mount at `/api/projects/:projectId/webhooks` in `app.ts`.

```
POST   /                      -> createWebhook (lead/admin only)
GET    /                      -> listWebhooks
GET    /:webhookId            -> getWebhook
PATCH  /:webhookId            -> updateWebhook (lead/admin only)
DELETE /:webhookId            -> deleteWebhook (lead/admin only)
GET    /:webhookId/deliveries -> listDeliveries
POST   /:webhookId/ping       -> pingWebhook
POST   /:webhookId/deliveries/:deliveryId/redeliver -> redeliverWebhook
```

**Validation schemas (Zod):**

```typescript
const createWebhookSchema = z.object({
  url: z.string().url().startsWith('https://'),
  secret: z.string().min(16).max(256),
  events: z.array(z.enum(WebhookEventTypes as [string, ...string[]])).min(1),
  description: z.string().max(500).optional(),
});

const updateWebhookSchema = z.object({
  url: z.string().url().startsWith('https://').optional(),
  events: z.array(z.enum(WebhookEventTypes as [string, ...string[]])).min(1).optional(),
  active: z.boolean().optional(),
  description: z.string().max(500).optional(),
});
```

### C2. Mount in `apps/server/src/app.ts`

Add after existing routes:

```typescript
import { webhookRoutes } from './routes/webhook.routes';
// ...
app.route('/api/projects/:projectId/webhooks', webhookRoutes);
```

---

## Phase D: Tests

### D1. Route Tests — `apps/server/src/__tests__/integration/routes/webhook.routes.test.ts`

Follow existing pattern from `feature.routes.test.ts`:
- Use `seedEngineer()`, `seedProject()`, `postJson()`, `authRequest()` from test-helpers
- `beforeEach` -> `truncateAll()` + `flushTestRedis()`

**Test cases (~20 tests):**
- POST create: valid webhook, missing URL, non-HTTPS URL, empty events, invalid event type
- GET list: returns all project webhooks, empty list
- GET single: found, 404
- PATCH update: toggle active, change events, change URL
- DELETE: success, 404
- GET deliveries: empty, with entries, pagination
- POST ping: creates delivery record
- HMAC verification: correct signature computation

### D2. Service Tests — `apps/server/src/__tests__/integration/services/webhook.service.test.ts`

- `dispatchWebhooks()`: matches only active webhooks with matching events
- `deliverWebhook()`: records success delivery, records failure delivery, handles timeout
- HMAC signing produces correct signature

### D3. Test Helper Updates

In `test-helpers.ts`:
- Add `webhooks, webhook_deliveries` to the TRUNCATE statement (before `features` in FK order)
- Add `seedWebhook(projectId, engineerId, overrides?)` factory + seeder
- Add `webhookFactory()`

---

## Phase E: HMAC Signing Detail

The signing follows GitHub's webhook pattern for familiarity:

```typescript
import { createHmac } from 'crypto';

function signPayload(secret: string, body: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(body, 'utf-8');
  return `sha256=${hmac.digest('hex')}`;
}
```

Consumers verify like:
```typescript
const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
const received = req.headers['x-nexus-signature-256'].replace('sha256=', '');
if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
  throw new Error('Invalid signature');
}
```

---

## Verification

1. **Schema migration**: `cd apps/server && bunx drizzle-kit generate` then `bun run db:migrate`
2. **Run new tests**: `cd apps/server && bun test --timeout 60000 src/__tests__/integration/routes/webhook.routes.test.ts`
3. **Run full suite**: `cd apps/server && bun test --timeout 60000` — all 444+ tests pass
4. **Manual smoke test**:
   - Register engineer + create project
   - Create webhook: `POST /api/projects/:id/webhooks` with a RequestBin URL
   - Create + pick a feature
   - Verify RequestBin received `feature_claimed` event with valid HMAC signature
5. **Verify non-blocking**: Feature pick response time should not increase noticeably (webhook delivery is fire-and-forget)

---

## Scope Boundaries (NOT in this plan)

- Retry logic (exponential backoff) — future enhancement
- Webhook secret rotation — future enhancement
- Rate limiting per-webhook — future enhancement
- Inbound event bridge — separate feature
- Adapter interface for external frameworks — separate feature
- CLI commands for webhook management — separate feature
