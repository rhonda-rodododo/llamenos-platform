---
name: backend-api-development
description: Use when adding API endpoints, Durable Object methods, auth guards, storage operations, or real-time event publishing in the Llamenos backend. Also use when the user mentions "API route", "DO method", "auth guard", "permission check", "DORouter", or needs to understand the backend request flow from Hono route to Durable Object.
---

# Backend API Development

## Request Flow

Every authenticated request follows this chain:

```
Client HTTP request
  -> Hono route (/api/*)
    -> CORS middleware
    -> auth middleware (verify Schnorr sig or WebAuthn session token)
      -> sets c.get('pubkey'), c.get('volunteer'), c.get('permissions')
    -> requirePermission('feature:action') guard
    -> route handler
      -> getDOs(c.env) or getScopedDOs(c.env, hubId)
      -> DO.fetch(new Request('http://do/path', { method, body }))
        -> DORouter.handle(request)
          -> handler reads/writes ctx.storage
          -> returns Response.json(...)
      -> audit(dos.records, 'eventName', pubkey, details)
      -> publishNostrEvent(c.env, KIND_*, { id-only payload })
    -> return Response to client
```

## The 7 Durable Objects

| DO | Singleton ID | Scope | Manages |
|----|-------------|-------|---------|
| `IdentityDO` | `global-identity` | Global | Volunteers, sessions, WebAuthn credentials, provisioning rooms |
| `SettingsDO` | `global-settings` | Global | Hub config, roles, telephony provider, spam/call/transcription settings, custom fields, IVR audio |
| `RecordsDO` | `global-records` or `{hubId}` | Hub-scoped | Notes, call records, audit log, files, reports |
| `ShiftManagerDO` | `global-shifts` or `{hubId}` | Hub-scoped | Shift schedules, ring groups, fallback group, reminders |
| `CallRouterDO` | `global-calls` or `{hubId}` | Hub-scoped | Active calls, parallel ringing, call state, presence |
| `ConversationDO` | `global-conversations` or `{hubId}` | Hub-scoped | Message threads, E2EE messages, assignments |
| `BlastDO` | `global-blasts` or `{hubId}` | Hub-scoped | Broadcast queues, delivery tracking, subscriber preferences |

Access DOs via helpers in `apps/worker/lib/do-access.ts`:

```typescript
import { getDOs, getScopedDOs } from '../lib/do-access'

// Global singletons
const dos = getDOs(c.env)

// Hub-scoped (records/shifts/calls/conversations/blasts use hubId, identity/settings stay global)
const dos = getScopedDOs(c.env, c.get('hubId'))
```

## Adding a New Route

### Step 1: Create or extend a route file

Create `apps/worker/routes/widgets.ts`:

```typescript
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'
import { publishNostrEvent } from '../lib/nostr-events'
import { KIND_SETTINGS_CHANGED } from '@shared/nostr-events'

const widgets = new Hono<AppEnv>()

// Apply base permission to all routes in this file
widgets.use('*', requirePermission('widgets:read'))

// GET — list
widgets.get('/', async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  return dos.records.fetch(new Request('http://do/widgets'))
})

// POST — create (stricter permission)
widgets.post('/', requirePermission('widgets:create'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const pubkey = c.get('pubkey')
  const body = await c.req.json()

  const res = await dos.records.fetch(new Request('http://do/widgets', {
    method: 'POST',
    body: JSON.stringify({ ...body, createdBy: pubkey }),
  }))

  if (res.ok) {
    const created = await res.clone().json()
    await audit(dos.records, 'widgetCreated', pubkey, { widgetId: created.id })
    publishNostrEvent(c.env, KIND_SETTINGS_CHANGED, {
      type: 'widget:created', id: created.id,
    })
  }
  return res
})

// DELETE — with URL param
widgets.delete('/:id', requirePermission('widgets:delete'), async (c) => {
  const dos = getScopedDOs(c.env, c.get('hubId'))
  const pubkey = c.get('pubkey')
  const id = c.req.param('id')

  const res = await dos.records.fetch(new Request(`http://do/widgets/${id}`, {
    method: 'DELETE',
  }))

  if (res.ok) {
    await audit(dos.records, 'widgetDeleted', pubkey, { widgetId: id })
  }
  return res
})

export default widgets
```

### Step 2: Mount in app.ts

In `apps/worker/app.ts`, import and mount on the `authenticated` router:

```typescript
import widgetsRoutes from './routes/widgets'

// Under the authenticated section:
authenticated.route('/widgets', widgetsRoutes)

// If hub-scoped, also mount on hubScoped:
hubScoped.route('/widgets', widgetsRoutes)
```

The final URL path is `/api/widgets` (global) or `/api/hubs/:hubId/widgets` (hub-scoped).

### Step 3: Add permissions to role definitions

Update `packages/shared/permissions.ts` to include the new permission strings in the appropriate default roles.

## Adding a DO Method

Register routes in the DO constructor. The DORouter matches method + path segments with `:param` support.

```typescript
import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../types'
import { DORouter } from '../lib/do-router'

export class RecordsDO extends DurableObject<Env> {
  private router: DORouter

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.router = new DORouter()

    // Register routes
    this.router.get('/widgets', () => this.listWidgets())
    this.router.post('/widgets', async (req) => this.createWidget(await req.json()))
    this.router.get('/widgets/:id', (_req, { id }) => this.getWidget(id))
    this.router.delete('/widgets/:id', (_req, { id }) => this.deleteWidget(id))
  }

  async fetch(request: Request): Promise<Response> {
    return this.router.handle(request)
  }

  // --- Handler implementations ---

  private async listWidgets(): Promise<Response> {
    const map = await this.ctx.storage.list<Widget>({ prefix: 'widget:' })
    const items = [...map.values()]
    return Response.json(items)
  }

  private async createWidget(data: unknown): Promise<Response> {
    const id = crypto.randomUUID()
    const widget = { id, ...data, createdAt: Date.now() }
    await this.ctx.storage.put(`widget:${id}`, widget)
    return Response.json(widget, { status: 201 })
  }

  private async getWidget(id: string): Promise<Response> {
    const widget = await this.ctx.storage.get<Widget>(`widget:${id}`)
    if (!widget) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(widget)
  }

  private async deleteWidget(id: string): Promise<Response> {
    await this.ctx.storage.delete(`widget:${id}`)
    return Response.json({ ok: true })
  }
}
```

DORouter handler signature: `(req: Request, params: Record<string, string>) => Promise<Response> | Response`

## Auth and Permission Patterns

### Dual authentication (apps/worker/middleware/auth.ts)

The `auth` middleware tries WebAuthn session token first (`Session <token>`), then falls back to Schnorr signature (`Bearer <json>`). On success it sets context variables:

| Context Variable | Type | Description |
|-----------------|------|-------------|
| `c.get('pubkey')` | `string` | Authenticated user's Nostr pubkey (hex) |
| `c.get('volunteer')` | `Volunteer` | Full volunteer record |
| `c.get('permissions')` | `string[]` | Resolved permission strings from all roles |
| `c.get('hubId')` | `string \| undefined` | Hub ID (set by `hubContext` middleware) |

### Permission guards (apps/worker/middleware/permission-guard.ts)

```typescript
import { requirePermission, checkPermission } from '../middleware/permission-guard'

// Middleware — rejects with 403 if missing
widgets.post('/', requirePermission('widgets:create'), handler)

// Multiple permissions — ALL must be present
widgets.post('/admin-action', requirePermission('widgets:create', 'settings:manage'), handler)

// Inline check — for conditional logic within a handler
const permissions = c.get('permissions')
const canReadAll = checkPermission(permissions, 'notes:read-all')
if (!canReadAll) params.set('author', pubkey) // filter to own notes
```

### Common permission strings

| Permission | Used By |
|-----------|---------|
| `settings:manage` | Admin settings, setup wizard |
| `settings:manage-spam` | Spam settings |
| `settings:manage-messaging` | Messaging channel config |
| `calls:read-active` | View active calls |
| `calls:answer` | Answer incoming calls |
| `calls:read-presence` | View volunteer presence |
| `notes:read-own` | Read own notes |
| `notes:read-all` | Read all notes (admin) |
| `notes:create` | Create notes |
| `notes:update-own` | Edit own notes |
| `notes:reply` | Reply to notes |
| `audit:read` | View audit log |
| `shifts:read`, `shifts:create`, `shifts:update`, `shifts:delete` | Shift management |
| `bans:read`, `bans:report`, `bans:delete` | Ban list management |
| `contacts:view` | View contacts |
| `blasts:read`, `blasts:create`, `blasts:send` | Broadcast messaging |
| `reports:create`, `reports:manage` | Report generation |
| `system:manage-hubs` | Multi-hub administration |

## Storage Patterns

All storage operations use the Durable Object `this.ctx.storage` API.

### Key conventions

| Pattern | Example | Usage |
|---------|---------|-------|
| `settings:{feature}` | `settings:spam`, `settings:telephony-provider` | Singleton config |
| `{entity}:{id}` | `widget:abc-123`, `volunteer:pubkey` | Entity by ID |
| `{entity}:{scope}:{id}` | `note:hubId:noteId` | Hub-scoped entity |
| `role:{id}` | `role:admin` | Role definitions |

### Storage operations

```typescript
// Single value
const spam = await this.ctx.storage.get<SpamSettings>('settings:spam')
await this.ctx.storage.put('settings:spam', updatedSpam)
await this.ctx.storage.delete('settings:spam')

// Collection listing (prefix scan)
const map = await this.ctx.storage.list<Note>({ prefix: 'note:' })
const notes = [...map.values()]

// Batch write
await this.ctx.storage.put({
  [`widget:${id}`]: widget,
  [`index:widget:${widget.name}`]: id,
})

// Batch delete
await this.ctx.storage.delete([`widget:${id}`, `index:widget:${name}`])
```

## Audit Logging

Call `audit()` after every mutation. Located at `apps/worker/services/audit.ts`.

```typescript
import { audit } from '../services/audit'

// Basic audit (most common)
await audit(dos.records, 'widgetCreated', pubkey, { widgetId: id })

// With IP/UA metadata (for sensitive operations)
await audit(dos.records, 'loginAttempt', pubkey, { method: 'webauthn' }, {
  request: c.req.raw,
  hmacSecret: c.env.HMAC_SECRET,
})
```

The audit function proxies to RecordsDO which stores a hash-chained log entry (SHA-256 chain with `previousEntryHash` + `entryHash`).

## Real-Time Event Publishing

After mutations, notify connected clients via Nostr relay. Events are **ID-only notifications** -- never include full data.

```typescript
import { publishNostrEvent } from '../lib/nostr-events'
import { KIND_SETTINGS_CHANGED } from '@shared/nostr-events'

// Fire-and-forget (errors are swallowed)
publishNostrEvent(c.env, KIND_SETTINGS_CHANGED, {
  type: 'widget:created',
  id: widget.id,
})
```

### Available event kinds (`packages/shared/nostr-events.ts`)

| Constant | Kind | Purpose |
|----------|------|---------|
| `KIND_CALL_RING` | 1000 | Incoming call ring |
| `KIND_CALL_UPDATE` | 1001 | Call state change (answered, ended) |
| `KIND_CALL_VOICEMAIL` | 1002 | New voicemail |
| `KIND_MESSAGE_NEW` | 1010 | New message in conversation |
| `KIND_CONVERSATION_ASSIGNED` | 1011 | Conversation assignment changed |
| `KIND_SHIFT_UPDATE` | 1020 | Shift schedule changed |
| `KIND_SETTINGS_CHANGED` | 1030 | Settings/config updated |
| `KIND_PRESENCE_UPDATE` | 20000 | Volunteer online/offline (ephemeral) |
| `KIND_CALL_SIGNAL` | 20001 | WebRTC signaling (ephemeral) |

Reuse existing kinds with a `type` discriminator in content when possible. Add new kinds to `packages/shared/nostr-events.ts` only when the event semantics are fundamentally different.

## Node.js Compatibility Checklist

Every route and DO must work on both Cloudflare Workers and Node.js (self-hosted):

- Use only standard Web APIs: `Request`, `Response`, `crypto.randomUUID()`, `URL`, `Headers`
- Storage operations go through `this.ctx.storage` which is shimmed automatically for PostgreSQL
- DO fetch uses `new Request('http://do/path')` -- the `http://do` base URL is a convention, never hits the network
- Never use CF-specific APIs (`ctx.waitUntil`, `env.ASSETS`) in DO or route logic
- If adding a NEW Durable Object, update all of: `apps/worker/types.ts` (Env interface), `apps/worker/wrangler.jsonc` (DO bindings), `apps/worker/lib/do-access.ts` (singleton ID + accessor)

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting `await` on `storage.get/put/delete` | Always await -- storage ops are async |
| Not calling `audit()` after mutations | Add audit call for every POST/PATCH/DELETE that succeeds |
| Putting full data in Nostr event payloads | Events are ID-only notifications; clients fetch via API |
| Using `volunteer.isAdmin` instead of `requirePermission()` | Use permission guards for granular access control |
| Calling `this.ctx.storage` directly from a route handler | Route handlers proxy to DOs via `dos.records.fetch(...)` |
| Returning plain objects from DO handlers | Always return `Response.json(...)` |
| Forgetting to mount on `hubScoped` for hub-aware routes | Mount on both `authenticated` and `hubScoped` in `app.ts` |
| Using `c.env.RECORDS_DO` directly | Use `getDOs(c.env)` or `getScopedDOs(c.env, hubId)` helpers |
| Adding a new DO without updating `wrangler.jsonc` | Also update `types.ts` (Env) and `do-access.ts` |

## File Reference

| File | Purpose |
|------|---------|
| `apps/worker/app.ts` | Hono app, route mounting (public, authenticated, hub-scoped) |
| `apps/worker/routes/*.ts` | Route files (one per resource) |
| `apps/worker/durable-objects/*.ts` | DO implementations with DORouter |
| `apps/worker/middleware/auth.ts` | Auth middleware (Schnorr + WebAuthn) |
| `apps/worker/middleware/permission-guard.ts` | `requirePermission()` and `checkPermission()` |
| `apps/worker/lib/do-access.ts` | `getDOs()`, `getScopedDOs()`, `getNostrPublisher()` |
| `apps/worker/lib/do-router.ts` | Lightweight method+path router for DOs |
| `apps/worker/lib/nostr-events.ts` | `publishNostrEvent()` helper |
| `apps/worker/services/audit.ts` | `audit()` helper for hash-chained audit log |
| `apps/worker/types.ts` | `Env`, `AppEnv`, `Volunteer`, `DOStub` types |
| `packages/shared/nostr-events.ts` | `KIND_*` constants |
| `packages/shared/permissions.ts` | Role/permission definitions, `resolvePermissions()` |
