---
name: worker-api-development
description: >
  Guide adding new API routes, Durable Object methods, and backend features in the Llamenos
  Cloudflare Worker. Use this skill when implementing new API endpoints, adding DO methods,
  modifying auth guards, adding permission checks, or when the user mentions "API route",
  "endpoint", "durable object", "DO method", "backend", "worker route", "auth guard",
  "permission check", "DORouter", "rate limit", "webhook", "server-side", or "API response".
  Also use when the user describes a feature that needs data persistence, server-side logic,
  or coordination between clients — these all imply Worker changes. If a feature requires
  storing data, enforcing permissions, or broadcasting events, this skill applies. Covers
  the DORouter pattern, auth middleware, Nostr event publishing, and Node.js compatibility.
---

# Worker API Development for Llamenos

The backend is a Cloudflare Worker with 7 Durable Objects, serving both Cloudflare and
Node.js (PostgreSQL) deployments via a platform abstraction layer. Every API change must
work on both platforms.

## Architecture

```
Client request
  → Worker fetch handler (apps/worker/index.ts)
    → Route matching (Hono-style path matching)
      → Auth middleware (authenticateRequest)
        → DO stub.fetch() (routed to the right DO)
          → DORouter.handle() (inside the DO)
            → Handler method (business logic + storage)
              → Response (JSON)
```

### Key Files

| File | Purpose |
|------|---------|
| `apps/worker/index.ts` | Worker entry point, top-level route dispatch |
| `apps/worker/routes/*.ts` | Route handlers grouped by domain |
| `apps/worker/durable-objects/*.ts` | 7 DOs with DORouter-based internal routing |
| `apps/worker/lib/do-router.ts` | Lightweight method+path router for DOs |
| `apps/worker/lib/auth.ts` | Auth: Schnorr token + WebAuthn session verification |
| `apps/worker/lib/do-access.ts` | DO stub accessors (`getIdentityDO()`, etc.) |
| `apps/worker/lib/nostr-events.ts` | `publishNostrEvent()` for real-time broadcasts |
| `apps/worker/lib/helpers.ts` | Response helpers, rate limiting, validation |
| `apps/worker/types.ts` | Env, Volunteer, and all shared backend types |
| `src/platform/` | CF vs Node.js abstraction (StorageApi, BlobStorage) |

### The 7 Durable Objects

| DO | Singleton ID | Responsibility |
|----|-------------|----------------|
| `IdentityDO` | `hub:{hubId}:identity` | Volunteers, invites, WebAuthn, sessions, devices |
| `SettingsDO` | `hub:{hubId}:settings` | Hub config, feature flags, provider settings, roles |
| `RecordsDO` | `hub:{hubId}:records` | Notes, call records, reports, custom fields |
| `ShiftManagerDO` | `hub:{hubId}:shifts` | Shift schedules, ring groups, clock in/out |
| `CallRouterDO` | `hub:{hubId}:calls` | Active call state, parallel ringing, DTMF |
| `ConversationDO` | `hub:{hubId}:conv:{contactHash}` | Per-contact conversation threads |
| `BlastDO` | `hub:{hubId}:blast` | Message broadcasts, subscriber management |

All accessed via `idFromName()` with a fixed string ID per hub.

## Adding a New API Endpoint

### Step 1: Define the Route Handler

Create or edit a file in `apps/worker/routes/`:

```typescript
// apps/worker/routes/my-feature.ts
import type { AppEnv } from '../types'
import { Hono } from 'hono'
import { authenticateRequest } from '../lib/auth'
import { getIdentityDO, getRecordsDO } from '../lib/do-access'

const app = new Hono<AppEnv>()

// Authenticated endpoint with permission check
app.get('/api/my-feature', async (c) => {
  const auth = await authenticateRequest(c.req.raw, getIdentityDO(c.env))
  if (!auth) return c.json({ error: 'Unauthorized' }, 401)

  // Permission check (if needed beyond basic auth)
  if (!auth.volunteer.roles?.some(r => r.permissions?.includes('my-feature:read'))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  // Call into the appropriate DO
  const recordsDO = getRecordsDO(c.env, auth.volunteer.hubId || 'default')
  const res = await recordsDO.fetch(new Request('http://do/my-feature'))
  const data = await res.json()

  return c.json(data)
})

export default app
```

### Step 2: Register in the Worker Entry Point

```typescript
// apps/worker/index.ts
import myFeature from './routes/my-feature'
app.route('/', myFeature)
```

### Step 3: Add the DO Method

Inside the relevant Durable Object, register a route in the constructor:

```typescript
// In the DO constructor:
this.router.get('/my-feature', () => this.getMyFeature())
this.router.post('/my-feature', async (req) => this.createMyFeature(await req.json()))
this.router.patch('/my-feature/:id', async (req, { id }) =>
  this.updateMyFeature(id, await req.json()))
this.router.delete('/my-feature/:id', (_req, { id }) => this.deleteMyFeature(id))
```

Then implement the handler methods:

```typescript
private async getMyFeature(): Promise<Response> {
  const data = await this.ctx.storage.get<MyFeatureData>('my-feature') || {}
  return Response.json(data)
}

private async createMyFeature(body: unknown): Promise<Response> {
  // Validate input
  if (!body || typeof body !== 'object') {
    return new Response('Invalid request body', { status: 400 })
  }

  // Store data
  const existing = await this.ctx.storage.get<Record<string, MyFeature>>('my-feature') || {}
  const id = crypto.randomUUID()
  existing[id] = { ...body as MyFeature, id, createdAt: Date.now() }
  await this.ctx.storage.put('my-feature', existing)

  // Broadcast real-time update (if needed)
  publishNostrEvent(this.env, 20001, {
    type: 'my-feature:created',
    hubId: this.hubId,
    id,
  })

  return Response.json(existing[id], { status: 201 })
}
```

### Step 4: Add Client API Method

**Desktop** (`src/client/lib/api.ts`):
```typescript
export async function getMyFeature(): Promise<MyFeature[]> {
  return apiGet('/api/my-feature')
}
```

**iOS** (`apps/ios/Sources/Services/APIService.swift`):
```swift
func getMyFeature() async throws -> [MyFeature] {
    return try await get("/api/my-feature")
}
```

**Android** (`apps/android/.../api/ApiClient.kt`):
```kotlin
suspend fun getMyFeature(): List<MyFeature> =
    get("/api/my-feature")
```

## DORouter Pattern

The DORouter is a minimal path-matching router inside each DO:

```typescript
// Pattern matching:
router.get('/items', handler)           // Exact match
router.get('/items/:id', handler)       // Named param → params.id
router.post('/items/:id/action', handler) // Nested path with param
```

- Params are extracted from `:name` segments and passed as `Record<string, string>`
- No query string parsing — use `new URL(req.url).searchParams` in the handler
- No middleware — auth is handled at the Worker route level before reaching the DO
- Returns 404 for unmatched routes

## Authentication Patterns

### Dual Auth: Schnorr + WebAuthn Sessions

```typescript
// The authenticateRequest function tries both:
// 1. Session token: "Authorization: Session <token>"
// 2. Schnorr signature: "Authorization: Bearer {pubkey, timestamp, token}"

const auth = await authenticateRequest(request, identityDO)
if (!auth) return new Response('Unauthorized', { status: 401 })
// auth.pubkey — the authenticated user's public key
// auth.volunteer — full Volunteer record with roles, permissions, etc.
```

### Permission Checks

Permissions are checked against the volunteer's roles:

```typescript
// Simple role check
if (auth.volunteer.role !== 'admin') {
  return c.json({ error: 'Admin only' }, 403)
}

// Permission-based check (RBAC)
const hasPermission = auth.volunteer.roles?.some(
  r => r.permissions?.includes('notes:write')
)
if (!hasPermission) {
  return c.json({ error: 'Insufficient permissions' }, 403)
}
```

### Public Endpoints (no auth)

Some endpoints don't need auth (config, login, health):

```typescript
app.get('/api/config', async (c) => {
  // No authenticateRequest call — public endpoint
  const settingsDO = getSettingsDO(c.env)
  // ...
})
```

## Storage Patterns

DO storage is key-value with structured data:

```typescript
// Single value
await this.ctx.storage.get<MyType>('key')
await this.ctx.storage.put('key', value)
await this.ctx.storage.delete('key')

// Map of records (common pattern — store all items under one key)
const items = await this.ctx.storage.get<Record<string, Item>>('items') || {}
items[newId] = newItem
await this.ctx.storage.put('items', items)

// Prefixed keys (for large collections)
await this.ctx.storage.put(`note:${noteId}`, noteData)
const notes = await this.ctx.storage.list<NoteData>({ prefix: 'note:' })

// Atomic multi-key operations
await this.ctx.storage.transaction(async (txn) => {
  const count = await txn.get<number>('count') || 0
  await txn.put('count', count + 1)
})
```

### Node.js Compatibility

The Node.js platform shim maps DO storage to PostgreSQL:
- `storage.get/put/delete` → `kv_store` table (namespace + key → JSONB)
- `storage.list` → `SELECT WHERE key LIKE prefix%`
- `storage.transaction` → `pg_advisory_xact_lock`

All DO code automatically works on both platforms. No platform-specific code needed.

## Real-Time Broadcasts

When a mutation occurs, broadcast via Nostr:

```typescript
import { publishNostrEvent } from '../lib/nostr-events'

// Inside a DO method:
publishNostrEvent(this.env, 20001, {
  type: 'volunteer:updated',
  hubId: this.hubId,
  pubkey: volunteerPubkey,
})
```

Event content is automatically encrypted with the server event key before relay publication.
See the `nostr-realtime-events` skill for adding new event types.

## Input Validation

Validate all inputs at the route handler level:

```typescript
// Length limits
if (typeof body.name !== 'string' || body.name.length > 200) {
  return new Response('Invalid name', { status: 400 })
}

// Enum validation
const validStatuses = ['active', 'inactive', 'pending'] as const
if (!validStatuses.includes(body.status)) {
  return new Response('Invalid status', { status: 400 })
}

// SSRF protection (for URLs)
import { isAllowedUrl } from '../lib/ssrf-guard'
if (!isAllowedUrl(body.webhookUrl)) {
  return new Response('Invalid URL', { status: 400 })
}
```

## Rate Limiting

```typescript
import { checkRateLimit } from '../lib/helpers'

// In route handler:
const rateLimited = await checkRateLimit(c.env, `my-feature:${auth.pubkey}`, {
  maxRequests: 10,
  windowMs: 60_000, // 1 minute
})
if (rateLimited) return c.json({ error: 'Rate limited' }, 429)
```

## Testing

### Worker Integration Tests (Vitest)

```typescript
// apps/worker/tests/my-feature.test.ts
import { describe, it, expect } from 'vitest'
// Tests use DO stubs — no external services needed

describe('my-feature', () => {
  it('returns 401 without auth', async () => {
    const res = await fetch('/api/my-feature')
    expect(res.status).toBe(401)
  })
})
```

### E2E Tests (Playwright)

Desktop tests exercise the full stack: UI → API → DO → storage → response.

```bash
bun run test:worker    # Worker integration tests
bun run test:desktop   # Full E2E with Playwright
```

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| Forgetting auth on new endpoint | Data exposed to unauthenticated users | Always call `authenticateRequest` first |
| Missing permission check | Volunteer can access admin-only data | Check `auth.volunteer.role` or permissions |
| Not broadcasting Nostr event | Other clients don't see the change | Call `publishNostrEvent` after mutations |
| Using `fetch()` for external URLs without SSRF check | SSRF vulnerability | Use `isAllowedUrl()` guard |
| Returning PII in response | Data exposure | Redact phone numbers, mask sensitive fields |
| Not handling missing storage keys | Null pointer in DO | Always default: `get('key') \|\| {}` |
| Breaking Node.js compatibility | Self-hosted deployment fails | Don't use CF-specific APIs directly — use platform abstraction |

## File Locations Quick Reference

```
apps/worker/
  index.ts                    # Entry point, route registration
  types.ts                    # All backend types (Env, Volunteer, etc.)
  routes/                     # Route handler files
  durable-objects/            # 7 DO implementations
  lib/
    auth.ts                   # authenticateRequest, verifyAuthToken
    do-router.ts              # DORouter class
    do-access.ts              # getIdentityDO, getRecordsDO, etc.
    nostr-events.ts           # publishNostrEvent
    nostr-publisher.ts        # CF + Node.js Nostr relay clients
    hub-event-crypto.ts       # Event content encryption
    helpers.ts                # Rate limiting, response helpers
    ssrf-guard.ts             # URL validation for external requests
    crypto.ts                 # Server-side crypto operations
    logger.ts                 # Structured JSON logging
  telephony/                  # TelephonyAdapter + 5 provider implementations
  messaging/                  # MessagingAdapter + SMS/WhatsApp/Signal
```
