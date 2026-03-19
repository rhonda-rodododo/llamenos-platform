# API Surface Simplification: CRUD Factory

**Date**: 2026-03-19
**Status**: Ready to implement
**Scope**: `apps/worker/routes/` only — no changes to schemas, services, or middleware

---

## Problem Statement

The Llamenos backend has 32 route files totalling ~11,000 lines. Approximately 60% of those lines implement the same five operations (list, get, create, update, delete) with the same auth guard / Zod validator / `c.json()` shape — just for different entities. Adding a new response field requires touching the route handler, the schema file, and the protocol type in three separate places, with no compile-time guarantee they stay in sync.

Concrete symptoms:

1. **Boilerplate repetition**: `volunteers.ts`, `shifts.ts`, `bans.ts`, `invites.ts`, `hubs.ts`, `contacts-v2.ts`, `events.ts`, and the CRUD sub-sections of `entity-schema.ts`, `settings.ts`, and `records.ts` all share a structure of: `describeRoute({ tags, summary, responses: { 200: { schema: resolver(XResponseSchema) } } })` + `requirePermission('X:read')` + `validator('json', XBodySchema)` + `const result = await services.Y.Z(...)` + `return c.json(result)`. The pattern repeats dozens of times.

2. **No enforcement of response shape**: A service method can return a different shape than the schema documents. TypeScript won't catch this because route handlers use `c.json(result)` with no explicit type constraint on `result`.

3. **High agent-edit cost**: An agent implementing a new entity type must write ~80–120 lines of route boilerplate that are structurally identical to existing entities, with many opportunities to introduce inconsistencies (wrong permission string, missing `describeRoute`, inconsistent response codes, etc.).

4. **OpenAPI snapshot divergence**: The snapshot at `packages/protocol/openapi-snapshot.json` is written by the dev server on startup. Custom routes added without `describeRoute()` produce no OpenAPI entry, causing silent spec gaps.

---

## 1. Audit: Route Classification

### 1.1 Pure-CRUD route files (high factory ROI)

These files consist almost entirely of standard list/get/create/update/delete handlers with no custom state machine or side-effect logic:

| Route file | Endpoints | CRUD shape |
|------------|-----------|------------|
| `audit.ts` | 1 (GET list only) | List with pagination + filters |
| `bans.ts` | 4 (POST, GET, POST /bulk, DELETE /:phone) | Standard + one bulk variant |
| `devices.ts` | 4 (POST /register, POST /voip-token, DELETE /voip-token, DELETE /) | All custom actions; not CRUD |
| `invites.ts` | 5 (GET /validate/:code, POST /redeem, GET /, POST /, DELETE /:code) | 3 of 5 are CRUD |
| `shifts.ts` | 6 (GET /my-status, GET /fallback, PUT /fallback, GET /, POST /, PATCH /:id, DELETE /:id) | 4 of 6 are CRUD |
| `volunteers.ts` | 7 (GET /, GET /:id, POST /, PATCH /:id, DELETE /:id, GET /:id/cases, GET /:id/metrics) | 5 of 7 are standard CRUD |
| `hubs.ts` | 8 (GET /, POST /, GET /:id, PATCH /:id, POST /:id/members, DELETE /:id/members/:pubkey, GET /:id/key, PUT /:id/key) | 4 of 8 are standard CRUD; 4 are sub-resource operations |

### 1.2 Mixed route files (partial factory ROI — CRUD sub-sections migrate, custom sections stay)

| Route file | CRUD endpoints | Custom endpoints |
|------------|----------------|-----------------|
| `settings.ts` | ~20 (roles CRUD, report-types CRUD, custom-fields CRUD) | ~17 (spam settings, telephony config, WebAuthn, IVR audio, migrations, TTL overrides — each has unique side effects) |
| `entity-schema.ts` | ~12 (entity-types CRUD, relationship-types CRUD, report-types CRUD) | ~8 (template apply, template updates, roles-from-template, feature toggles — each has complex transaction logic) |
| `records.ts` | ~6 (GET /, GET /:id, POST /, PATCH /:id, DELETE /:id) | ~19 (assign, link contact, envelope recipients, interactions sub-resource, notify contacts, report links, suggest assignees — all have custom business logic) |
| `blasts.ts` | ~5 (GET /, GET /:id, POST /, PATCH /:id, DELETE /:id) | ~8 (subscribers sub-resource, send, schedule, cancel, settings — all have unique semantics) |
| `events.ts` | ~4 (GET /, GET /:id, POST /, PATCH /:id, DELETE /:id) | ~9 (record links, report links, sub-resource listing) |
| `contacts-v2.ts` | ~5 (GET /, GET /:hash, POST /, PATCH /:hash, DELETE /:hash) | ~17 (lookup by identifier hash, trigram search, relationship CRUD, affinity groups CRUD, group member management) |
| `notes.ts` | ~3 (GET /, POST /, PATCH /:id) | ~2 (reply thread, DELETE with audit) |
| `reports.ts` | ~4 (GET /, GET /:id, POST /, PATCH /:id, DELETE /:id) | ~9 (report messages, assign, categories, files, case-link — each has side effects or access-control layering) |

### 1.3 Custom-only route files (do NOT apply factory — hand-written only)

| Route file | Why |
|------------|-----|
| `telephony.ts` | Twilio webhook state machine (incoming call, status callback, recording, IVR digit, voicemail). Webhook signature validation. No auth middleware. |
| `auth.ts` | Login/logout/me/profile — crypto operations, session management, rate limiting. |
| `webauthn.ts` | WebAuthn ceremony state (challenge/register/login/credentials). |
| `provisioning.ts` | ECDH device linking rooms — mixed auth, rate limiting, ephemeral state. |
| `webrtc.ts` | Token generation for Twilio/SignalWire/Vonage — pure compute, no CRUD. |
| `conversations.ts` | Send message (triggers push dispatch, Nostr event, circuit breaker), assign, claim — all have transactional side effects. The GET list is standard but too interleaved with custom logic to extract cleanly without a larger refactor. |
| `calls.ts` | Call presence, redaction logic (volunteer vs admin), ban-caller side effects, history query. |
| `uploads.ts` | Presigned URL generation, multipart coordination — storage-layer protocol, not CRUD. |
| `files.ts` | File retrieval with blob storage, presigned URLs, deletion with R2 coordination. |
| `config.ts` | Assembles public config from multiple sources — complex aggregation, no CRUD. |
| `setup.ts` | First-run wizard multi-step state machine. |
| `system.ts` | Diagnostics and debug endpoints. |
| `health.ts` | Liveness / readiness probes. |
| `metrics.ts` | Prometheus metrics registry and JSON metrics export. |
| `dev.ts` | Development / test reset endpoints (E2E_TEST_SECRET gated). |
| `contacts.ts` | Hash-based contact timeline (aggregate of notes + conversations). Not an entity store. |

### 1.4 The Exact Repeating Pattern

Every CRUD-category handler in the current codebase follows this structure:

```typescript
router.get('/',
  describeRoute({
    tags: ['EntityName'],
    summary: 'List ...',
    responses: {
      200: {
        description: '...',
        content: { 'application/json': { schema: resolver(listResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('entity:read'),
  validator('query', listQuerySchema),        // optional — not all list endpoints have query params
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId')              // optional — hub-scoped endpoints only
    const query = c.req.valid('query')         // optional
    const result = await services.entityService.list(hubId, query)
    return c.json(result)
  },
)
```

The POST / PATCH / DELETE variants follow the same shape with `requirePermission('entity:create' | 'entity:update' | 'entity:delete')` and `validator('json', createBodySchema)`.

Three variations exist within "CRUD":
1. **No pagination** — simple list returns `{ items: T[] }` with no total/page/limit.
2. **Offset pagination** — `{ items: T[], total: number, page: number, limit: number }`. The offset is calculated at the route layer: `(query.page - 1) * query.limit`.
3. **Cursor pagination** — used by `contacts-v2.ts` contact listing. Less common; not worth folding into the factory initially.

---

## 2. CRUD Factory Design

### 2.1 Factory function signature

```typescript
// apps/worker/lib/entity-router.ts

import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import { authErrors, notFoundError } from '../openapi/helpers'
import type { ZodTypeAny, ZodSchema } from 'zod'

interface EntityRouterConfig<
  TList extends ZodTypeAny,
  TItem extends ZodTypeAny,
  TCreate extends ZodTypeAny,
  TUpdate extends ZodTypeAny,
  TListQuery extends ZodTypeAny = ZodTypeAny,
> {
  /** OpenAPI tag and prefix used for summary strings */
  tag: string

  /** Permission domain prefix: 'volunteers' → checks 'volunteers:read', 'volunteers:create', etc. */
  domain: string

  /** Which service object holds the CRUD methods — e.g. 'identity', 'shifts', 'cases' */
  service: keyof Services

  /** Schema for the list response — used for describeRoute + response type enforcement */
  listResponseSchema: TList

  /** Schema for a single-item response */
  itemResponseSchema: TItem

  /** Schema for POST body validation — omit to disable POST */
  createBodySchema?: TCreate

  /** Schema for PATCH body validation — omit to disable PATCH */
  updateBodySchema?: TUpdate

  /** Schema for GET list query params — omit if no query filtering */
  listQuerySchema?: TListQuery

  /**
   * Whether list endpoint is hub-scoped — if true, passes `hubId` to service.list().
   * Default: false (global scope)
   */
  hubScoped?: boolean

  /**
   * Whether to emit audit log entries for mutations.
   * If provided, uses these event type strings.
   */
  auditEvents?: {
    created?: string
    updated?: string
    deleted?: string
  }

  /**
   * Override the service method names if they don't match the defaults.
   * Defaults: list, get, create, update, delete
   */
  methods?: {
    list?: string
    get?: string
    create?: string
    update?: string
    delete?: string
  }

  /**
   * ID parameter name in the URL.
   * Default: 'id'
   * Use 'targetPubkey' for volunteer-style routes.
   */
  idParam?: string
}

/**
 * Creates a Hono router with standard CRUD endpoints from a config object.
 * Returns a Hono<AppEnv> router that can be mounted at any path.
 */
export function createEntityRouter<
  TList extends ZodTypeAny,
  TItem extends ZodTypeAny,
  TCreate extends ZodTypeAny,
  TUpdate extends ZodTypeAny,
  TListQuery extends ZodTypeAny = ZodTypeAny,
>(config: EntityRouterConfig<TList, TItem, TCreate, TUpdate, TListQuery>): Hono<AppEnv>
```

### 2.2 Factory output: standard endpoints

The factory emits only the following five endpoint shapes. Any entity needing a sixth endpoint writes it by hand and registers it on the returned router or on a separate router.

```
GET    /            → list (paginated if listQuerySchema present)
GET    /:id         → get by ID
POST   /            → create (only if createBodySchema provided)
PATCH  /:id         → update (only if updateBodySchema provided)
DELETE /:id         → delete
```

The `GET /` endpoint implementation:

```typescript
router.get('/',
  describeRoute({
    tags: [config.tag],
    summary: `List ${config.tag.toLowerCase()}`,
    responses: {
      200: {
        description: `Paginated list of ${config.tag.toLowerCase()}`,
        content: { 'application/json': { schema: resolver(config.listResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission(`${config.domain}:read`),
  ...(config.listQuerySchema ? [validator('query', config.listQuerySchema)] : []),
  async (c) => {
    const services = c.get('services')
    const hubId = config.hubScoped ? c.get('hubId') : undefined
    const query = config.listQuerySchema ? c.req.valid('query') : undefined
    const service = services[config.service] as Record<string, Function>
    const listMethod = config.methods?.list ?? 'list'
    const result = await service[listMethod](hubId, query)
    return c.json(result)
  },
)
```

The `POST /` endpoint implementation:

```typescript
if (config.createBodySchema) {
  router.post('/',
    describeRoute({
      tags: [config.tag],
      summary: `Create ${config.tag.toLowerCase().replace(/s$/, '')}`,
      responses: {
        201: {
          description: 'Created',
          content: { 'application/json': { schema: resolver(config.itemResponseSchema) } },
        },
        ...authErrors,
      },
    }),
    requirePermission(`${config.domain}:create`),
    validator('json', config.createBodySchema),
    async (c) => {
      const services = c.get('services')
      const pubkey = c.get('pubkey')
      const hubId = config.hubScoped ? c.get('hubId') : undefined
      const body = c.req.valid('json')
      const service = services[config.service] as Record<string, Function>
      const createMethod = config.methods?.create ?? 'create'
      const result = await service[createMethod](hubId, body)
      if (config.auditEvents?.created) {
        await audit(services.audit, config.auditEvents.created, pubkey, {})
      }
      return c.json(result, 201)
    },
  )
}
```

`PATCH /:id` and `DELETE /:id` follow the same pattern.

### 2.3 Handling entity-specific ID parameters

Volunteers use `/:targetPubkey` as the ID param; most others use `/:id`. The `idParam` config option covers this:

```typescript
const idParam = config.idParam ?? 'id'
router.get(`/:${idParam}`, ...)
router.patch(`/:${idParam}`, ...)
router.delete(`/:${idParam}`, ...)
```

### 2.4 Concrete before/after example: entity types (from `entity-schema.ts`)

**Before** (current, 90 lines for entity-types CRUD):

```typescript
entitySchema.get('/entity-types', describeRoute({ ... }), requireAnyPermission(...), async (c) => {
  const result = await services.settings.getEntityTypes()
  return c.json(result)
})
entitySchema.post('/entity-types', describeRoute({ ... }), requirePermission('cases:manage-types'),
  validator('json', createEntityTypeBodySchema),
  async (c) => {
    const body = c.req.valid('json')
    const created = await services.settings.createEntityType(body as Record<string, unknown>)
    await audit(services.audit, 'entityTypeCreated', c.get('pubkey'), { ... })
    return c.json(created, 201)
  },
)
entitySchema.patch('/entity-types/:id', ...)  // 30 more lines
entitySchema.delete('/entity-types/:id', ...)  // 20 more lines
```

**After** (factory approach, registered on the parent `entitySchema` router):

```typescript
// In entity-schema.ts
const entityTypeRouter = createEntityRouter({
  tag: 'Case Management',
  domain: 'cases-entity-types',             // permission prefix
  service: 'settings',
  listResponseSchema: entityTypeListResponseSchema,
  itemResponseSchema: entityTypeDefinitionSchema,
  createBodySchema: createEntityTypeBodySchema,
  updateBodySchema: updateEntityTypeBodySchema,
  auditEvents: {
    created: 'entityTypeCreated',
    updated: 'entityTypeUpdated',
    deleted: 'entityTypeDeleted',
  },
  methods: {
    list: 'getEntityTypes',
    create: 'createEntityType',
    update: 'updateEntityType',
    delete: 'deleteEntityType',
  },
})
entitySchema.route('/entity-types', entityTypeRouter)
```

The 90 lines of boilerplate collapse to 18 lines of config that is structurally verifiable at compile time.

### 2.5 Service method calling convention

A key design constraint: service methods don't all have the same arity. Some take `(hubId, body)`, some take just `(id, body)`, some take `(hubId)`. The factory must not impose a rigid calling convention on service methods.

The implementation uses a thin adapter that passes through whatever arguments the service method accepts. The `hubScoped` flag controls whether `hubId` is prepended:

```typescript
// Internally — the factory builds args as:
const args = [
  ...(config.hubScoped && hubId !== undefined ? [hubId] : []),
  ...(id !== undefined ? [id] : []),
  ...(body !== undefined ? [body] : []),
].filter(a => a !== undefined)

const result = await (service[methodName] as Function)(...args)
```

This is the one place where `Function` typing is acceptable — it's isolated to a single line inside the factory implementation, not exposed in the factory's public API surface.

### 2.6 Permission domain naming convention

The current codebase uses inconsistent permission prefixes: `volunteers:create`, `cases:manage-types`, `cases:read-all`, `hubs:manage-members`. The factory does not attempt to rename or normalize these — it takes `domain` as a literal string prefix and appends the standard CRUD suffixes (`:read`, `:create`, `:update`, `:delete`).

Entities that use non-standard permission names (e.g. `cases:manage-types` instead of `entity-types:create`) must register those endpoints manually, not through the factory.

---

## 3. Migration Plan

### 3.1 Migration order: most-tested first

Migrate entities that have the best BDD test coverage first. This gives immediate validation that the factory produces identical behavior to the hand-written handlers. Least-tested entities (those added in recent epics without complete BDD coverage) migrate last.

| Priority | Entity | File | Rationale |
|----------|--------|------|-----------|
| 1 | Shifts | `shifts.ts` | Core functionality; BDD test suite. Well-defined permissions. Only `GET /my-status` and `/fallback` stay hand-written. |
| 2 | Volunteers (CRUD core) | `volunteers.ts` | BDD tests. Custom `/cases` and `/metrics` sub-resources stay hand-written. |
| 3 | Invites (CRUD core) | `invites.ts` | BDD tests. Public `/validate` and `/redeem` stay hand-written. |
| 4 | Audit | `audit.ts` | Simplest case: one endpoint. Zero risk. |
| 5 | Bans (CRUD core) | `bans.ts` | BDD tests. Only `POST /bulk` stays hand-written. |
| 6 | Hubs (CRUD core) | `hubs.ts` | BDD tests. Member management and key endpoints stay hand-written. |
| 7 | Entity types sub-section | `entity-schema.ts` | Recent but stable. Reduces 90-line boilerplate to config block. |
| 8 | Relationship types sub-section | `entity-schema.ts` | Same file, same pattern. Migrate simultaneously with entity types. |
| 9 | CMS Report types sub-section | `entity-schema.ts` | Same file. Final cleanup pass. |

### 3.2 Entities that stay hand-written (no migration)

| Entity | File | Why |
|--------|------|-----|
| Telephony webhooks | `telephony.ts` | Webhook validation, state machine, no auth middleware |
| Auth flows | `auth.ts` | Crypto operations, session management, rate limiting |
| WebAuthn | `webauthn.ts` | Ceremony state (challenge → register/login) |
| Device provisioning | `provisioning.ts` | Mixed auth, ephemeral room protocol |
| WebRTC tokens | `webrtc.ts` | Pure compute, no CRUD |
| Calls | `calls.ts` | Business logic (redaction by role, real-time presence, ban side effects) |
| Conversations | `conversations.ts` | Push dispatch, circuit breaker, Nostr events on every mutation |
| Notes | `notes.ts` | E2EE semantics; complex auth layering (read-own vs read-all); reply threads |
| Reports | `reports.ts` | Access-control layering (reporter vs assigned vs admin), messaging side effects |
| Records | `records.ts` | Assignment logic, envelope recipients, Nostr events, interaction sub-resource |
| Blasts | `blasts.ts` | Subscriber management, send/schedule/cancel state machine |
| Events | `events.ts` | Timeline linkage, Nostr publish on create/update |
| Contacts (v1) | `contacts.ts` | Not a CRUD entity — hash-based timeline aggregation |
| Contacts (v2) | `contacts-v2.ts` | Blind index lookup, trigram search, complex relationship graph |
| Evidence | `evidence.ts` | Chain-of-custody logic, integrity verification |
| Settings | `settings.ts` | Complex per-endpoint side effects (telephony reload, IVR audio re-render) |
| Uploads | `uploads.ts` | Storage-layer protocol (presigned URLs, multipart) |
| Files | `files.ts` | Blob retrieval, R2 coordination |
| Config | `config.ts` | Multi-source aggregation |
| Setup | `setup.ts` | First-run wizard state machine |
| System | `system.ts` | Diagnostics |
| Health | `health.ts` | Liveness probes |
| Metrics | `metrics.ts` | Prometheus registry |
| Dev | `dev.ts` | E2E_TEST_SECRET gated reset endpoints |

### 3.3 Migration execution steps

For each entity in the migration order:

1. Create the factory config object for the entity.
2. Register the factory router on the parent router at the same path.
3. Delete the CRUD handler blocks that the factory now covers.
4. Keep any custom endpoints (sub-resources, custom actions) as hand-written handlers registered on the same parent router.
5. Run `bun run typecheck` — zero new errors.
6. Run `bun run test:backend:bdd` — all BDD scenarios pass.
7. Verify the OpenAPI snapshot is unchanged: `bun run dev:server` in development mode writes the snapshot; diff against the committed snapshot.
8. Commit.

The migration of each entity is a self-contained commit. No "big-bang" migration.

---

## 4. OpenAPI Alignment

### 4.1 Current snapshot mechanism

`src/server/index.ts` writes `packages/protocol/openapi-snapshot.json` on startup when `ENVIRONMENT=development`. The snapshot is generated by `openAPIRouteHandler(api, openAPIConfig)` from `hono-openapi`.

The factory generates `describeRoute()` calls on every endpoint it creates, using the same `resolver(schema)` pattern as hand-written routes. This means factory-generated routes populate the OpenAPI spec identically to hand-written routes — no additional wiring required.

### 4.2 Schema name alignment

`hono-openapi`'s `resolver(schema)` derives the component schema name from the Zod schema object. Currently, schema names in the snapshot match the variable names in `@protocol/schemas/*.ts` files (e.g., `volunteerResponseSchema` → `VolunteerResponse` in the OpenAPI components).

The factory config takes `listResponseSchema` and `itemResponseSchema` as Zod schema objects — the same schema objects that the protocol package exports. The snapshot names therefore stay identical to what the hand-written routes produce.

**Requirement**: The factory must pass the schema object directly to `resolver()`, not wrap it in a new `z.object()`. Any wrapping would generate a new anonymous schema in the OpenAPI components, breaking the name alignment.

### 4.3 Verifying snapshot stability

After migrating each entity, verify that the OpenAPI snapshot diff is empty:

```bash
bun run dev:server &
sleep 3
diff packages/protocol/openapi-snapshot.json packages/protocol/openapi-snapshot.json.backup
```

Add `packages/protocol/openapi-snapshot.json.backup` to `.gitignore`. The snapshot diff check catches any case where the factory generates different `operationId`, `summary`, or schema reference than the hand-written handler.

### 4.4 OperationId convention

`hono-openapi` generates `operationId` from the HTTP method + path. The factory produces the same paths as the hand-written routes (since it's mounted at the same path prefix), so `operationId` values are unchanged. No client code that references `operationId` from the snapshot will break.

---

## 5. Success Criteria

- [ ] `apps/worker/lib/entity-router.ts` exists with the `createEntityRouter()` factory function.
- [ ] All 9 entities in the migration order (section 3.1) are migrated to the factory.
- [ ] Route files for migrated entities have no residual CRUD boilerplate — only custom endpoints remain as hand-written handlers.
- [ ] Total line count of migrated route files is reduced by at least 40% versus pre-migration.
- [ ] `bun run typecheck` passes with zero errors.
- [ ] `bun run build` passes.
- [ ] `bun run test:backend:bdd` passes — zero regressions.
- [ ] `bun run test` (Playwright E2E) passes — zero regressions.
- [ ] `packages/protocol/openapi-snapshot.json` diff is empty after each entity migration (same paths, same schema refs, same operationIds).
- [ ] No `Function` type or `as any` usage escapes the factory's internal implementation — the factory's exported API surface is fully typed.
- [ ] Custom endpoints in route files that the factory does NOT cover are not modified by this work.
- [ ] `apps/worker/lib/entity-router.ts` has unit tests covering: correct permission guard wiring, correct schema resolution, audit event emission, hub-scoped vs global scope, missing `createBodySchema` disables POST.

### Verification commands

```bash
# Type check
bun run typecheck

# Route line count before/after
wc -l apps/worker/routes/shifts.ts apps/worker/routes/volunteers.ts apps/worker/routes/invites.ts \
  apps/worker/routes/audit.ts apps/worker/routes/bans.ts apps/worker/routes/hubs.ts \
  apps/worker/routes/entity-schema.ts

# OpenAPI snapshot integrity
ENVIRONMENT=development bun run dev:server &
sleep 3 && curl -s http://localhost:3000/api/openapi.json | diff - packages/protocol/openapi-snapshot.json

# BDD + E2E
bun run test:backend:bdd
bun run test
```
