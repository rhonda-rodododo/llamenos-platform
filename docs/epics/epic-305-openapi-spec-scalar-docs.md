# Epic 305: OpenAPI Spec Generation + Scalar API Documentation

**Status**: PENDING
**Priority**: Medium
**Depends on**: Epic 283 (Zod input validation — completed)
**Blocks**: None
**Branch**: `desktop`

## Summary

Add OpenAPI 3.1 spec generation to the Hono backend using `hono-openapi` (middleware-based, Zod 4 native via Standard Schema) and serve interactive API documentation via `@scalar/hono-api-reference`. Covers all client-facing routes (public + authenticated + hub-scoped) — 27 route files, ~80 endpoints. Response schemas are static type documentation only (no runtime response validation).

## Problem Statement

The API has ~80 endpoints across 27 route files with Zod input validation on 14 of them, but zero machine-readable documentation. Developers working on desktop, iOS, and Android clients rely on reading route source code and `docs/protocol/PROTOCOL.md` to understand request/response contracts. This slows cross-platform development and makes it impossible to auto-generate client SDKs or validate API conformance.

An OpenAPI spec solves this by providing:
1. A single source of truth for the API surface (machine-readable)
2. Interactive docs for manual exploration (Scalar UI)
3. A foundation for future client SDK generation and contract testing

## Approach: `hono-openapi` (not `@hono/zod-openapi`)

**Why `hono-openapi` v1.3.0 over `@hono/zod-openapi` v1.2.2:**

| Factor | `hono-openapi` | `@hono/zod-openapi` |
|--------|----------------|---------------------|
| Migration cost | Add middleware to existing routes | Rewrite all routes to `createRoute()` pattern |
| Hono class | Standard `new Hono()` — no changes | Requires `OpenAPIHono` subclass |
| Zod 4 support | Native via Standard Schema | Supported since v1.2.2 |
| Request schemas | Auto-extracted from `validator()` middleware | Manual in `createRoute({ request })` |
| Existing middleware | Zero changes needed | Compatible but different composition model |

`hono-openapi` is additive — we add `describeRoute()` middleware to each route and swap our custom `validateBody`/`validateQuery` for `hono-openapi`'s `validator()` (which both validates AND registers the schema in the spec). Existing route handlers, middleware chain, and DO delegation are untouched.

## Implementation

### Phase 1: Infrastructure + Schema Foundation

**Execution**: Sequential (scaffolding must exist before route migration)

#### Task 1.1: Install dependencies

```bash
bun add hono-openapi @hono/standard-validator @scalar/hono-api-reference
```

Note: `@hono/standard-validator` is a required peer dependency of `hono-openapi`. Zod 4 implements Standard Schema natively, so no additional Zod adapter is needed.

#### Task 1.2: Create OpenAPI configuration module

**File**: `apps/worker/openapi/config.ts`

Central configuration for the OpenAPI spec metadata:

```typescript
import type { OpenAPISpecInfo } from 'hono-openapi'

export const openAPIConfig = {
  documentation: {
    info: {
      title: 'Llamenos API',
      version: '1.0.0',
      description: 'Crisis response hotline backend API',
    },
    servers: [
      { url: '/api', description: 'API base' },
    ],
    tags: [
      { name: 'Auth', description: 'Authentication and session management' },
      { name: 'Config', description: 'Public configuration' },
      { name: 'Volunteers', description: 'Volunteer management (admin)' },
      { name: 'Shifts', description: 'Shift scheduling' },
      { name: 'Bans', description: 'Ban list management' },
      { name: 'Notes', description: 'Encrypted call/conversation notes' },
      { name: 'Calls', description: 'Call history and routing' },
      { name: 'Conversations', description: 'Messaging conversations' },
      { name: 'Blasts', description: 'Bulk message broadcasts' },
      { name: 'Contacts', description: 'Contact management' },
      { name: 'Reports', description: 'Reporting and analytics' },
      { name: 'Settings', description: 'Hub and system settings' },
      { name: 'Audit', description: 'Audit log (admin)' },
      { name: 'Uploads', description: 'Encrypted file uploads' },
      { name: 'Files', description: 'File retrieval and management' },
      { name: 'Devices', description: 'Multi-device management' },
      { name: 'Invites', description: 'Invite code management' },
      { name: 'Provisioning', description: 'Device provisioning rooms' },
      { name: 'Telephony', description: 'Telephony provider webhooks' },
      { name: 'Messaging', description: 'Messaging provider webhooks' },
      { name: 'WebAuthn', description: 'WebAuthn credential management' },
      { name: 'Hubs', description: 'Multi-hub management' },
      { name: 'System', description: 'System health and diagnostics' },
      { name: 'Setup', description: 'Initial hub setup' },
    ],
    components: {
      securitySchemes: {
        nostrAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Nostr session token (WebAuthn-issued)',
        },
      },
    },
  },
}
```

#### Task 1.3: Create response schema module

**File**: `apps/worker/schemas/responses.ts`

Response schemas used for OpenAPI documentation only (no runtime validation). These describe what the API returns so Scalar can display it:

```typescript
import { z } from 'zod'
import { pubkeySchema, errorResponseSchema, recipientEnvelopeSchema, keyEnvelopeSchema } from './common'

// --- Shared response envelopes ---

export const paginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
  })

export const cursorPaginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
  })

// --- Domain response schemas (documentation only) ---

export const noteResponseSchema = z.object({
  id: z.string().uuid(),
  callId: z.string().optional(),
  conversationId: z.string().optional(),
  contactHash: z.string().optional(),
  encryptedContent: z.string(),
  authorPubkey: pubkeySchema,
  authorEnvelope: keyEnvelopeSchema.optional(),
  adminEnvelopes: z.array(recipientEnvelopeSchema).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

// ... additional response schemas per domain, built incrementally
```

#### Task 1.4: Create `describeRoute` helper

**File**: `apps/worker/openapi/helpers.ts`

Thin helpers to reduce boilerplate when annotating routes:

```typescript
import { describeRoute as describe, resolver } from 'hono-openapi'
import { z } from 'zod'
import { errorResponseSchema } from '../schemas/common'

/** Standard error responses added to every authenticated endpoint */
export const authErrors = {
  400: { description: 'Validation error', content: { 'application/json': { schema: resolver(errorResponseSchema) } } },
  401: { description: 'Not authenticated' },
  403: { description: 'Insufficient permissions' },
}

/** Standard error responses for public endpoints */
export const publicErrors = {
  400: { description: 'Validation error', content: { 'application/json': { schema: resolver(errorResponseSchema) } } },
}
```

#### Task 1.5: Mount spec + Scalar endpoints in `app.ts`

Add two new routes to the API sub-router:

```typescript
import { openAPIRouteHandler } from 'hono-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { openAPIConfig } from './openapi/config'

// After all route mounting, before catch-all:
api.get('/openapi.json', openAPIRouteHandler(api, openAPIConfig))
api.get('/docs', Scalar({ url: '/api/openapi.json' }))
```

### Phase 2: Route Migration (incremental, per-file)

**Execution**: Tasks 2.1–2.14 can run in parallel (one per route file with Zod schemas)

The migration pattern for each route file:

1. Import `describeRoute` and `resolver` from `hono-openapi`
2. Import `validator` from `hono-openapi` (replaces our custom `validateBody`/`validateQuery`)
3. Add `describeRoute({ ... })` middleware before each handler with: tags, summary, responses
4. Replace `validateBody(schema)` with `validator('json', schema)`
5. Replace `validateQuery(schema)` with `validator('query', schema)`
6. Handler code stays exactly the same — `c.req.valid('json')` replaces `c.get('validatedBody')`

**Example migration** (`routes/notes.ts` before → after):

```typescript
// BEFORE:
notes.get('/', validateQuery(listNotesQuerySchema), async (c) => {
  const query = c.get('validatedQuery') as z.infer<typeof listNotesQuerySchema>
  // ...
})

// AFTER:
notes.get('/',
  describeRoute({
    tags: ['Notes'],
    summary: 'List notes',
    responses: {
      200: { description: 'Paginated notes list', content: { 'application/json': { schema: resolver(paginatedResponseSchema(noteResponseSchema)) } } },
      ...authErrors,
    },
  }),
  validator('query', listNotesQuerySchema),
  async (c) => {
    const query = c.req.valid('query')
    // ... handler unchanged
  }
)
```

**Route files to migrate** (14 with existing Zod validation):

| # | File | Endpoints | Tags |
|---|------|-----------|------|
| 1 | `routes/auth.ts` | ~6 | Auth |
| 2 | `routes/volunteers.ts` | ~5 | Volunteers |
| 3 | `routes/shifts.ts` | ~5 | Shifts |
| 4 | `routes/bans.ts` | ~5 | Bans |
| 5 | `routes/notes.ts` | 5 | Notes |
| 6 | `routes/calls.ts` | ~4 | Calls |
| 7 | `routes/conversations.ts` | ~6 | Conversations |
| 8 | `routes/blasts.ts` | ~5 | Blasts |
| 9 | `routes/invites.ts` | ~3 | Invites |
| 10 | `routes/settings.ts` | ~6 | Settings |
| 11 | `routes/reports.ts` | ~4 | Reports |
| 12 | `routes/uploads.ts` | ~3 | Uploads |
| 13 | `routes/hubs.ts` | ~4 | Hubs |
| 14 | `routes/contacts.ts` | ~4 | Contacts |

**Route files to annotate** (13 without Zod — add `describeRoute()` only, no validator change):

| # | File | Endpoints | Tags |
|---|------|-----------|------|
| 15 | `routes/config.ts` | 1 | Config |
| 16 | `routes/webauthn.ts` | ~3 | WebAuthn |
| 17 | `routes/provisioning.ts` | ~3 | Provisioning |
| 18 | `routes/telephony.ts` | ~4 | Telephony |
| 19 | `messaging/router.ts` | ~3 | Messaging |
| 20 | `routes/webrtc.ts` | ~2 | Calls |
| 21 | `routes/files.ts` | ~3 | Files |
| 22 | `routes/devices.ts` | ~3 | Devices |
| 23 | `routes/setup.ts` | ~2 | Setup |
| 24 | `routes/system.ts` | ~2 | System |
| 25 | `routes/health.ts` | 1 | System |
| 26 | `routes/metrics.ts` | 1 | System |
| 27 | `routes/dev.ts` | ~2 | System |

### Phase 3: Validation middleware retirement

After all routes are migrated:

1. Remove `apps/worker/middleware/validate.ts` (replaced by `hono-openapi` validator)
2. Remove all `validateBody`/`validateQuery`/`validateParam` imports
3. Update `apps/worker/types.ts` — remove `validatedBody`/`validatedQuery` from AppEnv Variables (now accessed via `c.req.valid()`)

**Important**: All imports come from `'hono-openapi'` — there are no sub-path exports like `hono-openapi/zod`.

### Phase 4: Dev-only gating (optional)

The `/docs` and `/openapi.json` endpoints should be available in development but can optionally be gated in production:

```typescript
if (c.env.ENVIRONMENT === 'development' || c.env.ENVIRONMENT === 'test') {
  api.get('/openapi.json', openAPIRouteHandler(api, openAPIConfig))
  api.get('/docs', Scalar({ url: '/api/openapi.json' }))
}
```

This is a decision point — for a pre-production app, serving docs in production is fine and useful.

## Files to Create

| File | Purpose |
|------|---------|
| `apps/worker/openapi/config.ts` | OpenAPI spec metadata, tags, security schemes |
| `apps/worker/openapi/helpers.ts` | Shared response descriptors (authErrors, publicErrors) |
| `apps/worker/schemas/responses.ts` | Response Zod schemas (documentation only, no runtime validation) |

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `hono-openapi`, `@scalar/hono-api-reference` dependencies |
| `apps/worker/app.ts` | Mount `/openapi.json` and `/docs` endpoints |
| `apps/worker/types.ts` | Remove `validatedBody`/`validatedQuery` from AppEnv Variables |
| `apps/worker/routes/notes.ts` | Migrate to `describeRoute()` + `validator()` |
| `apps/worker/routes/auth.ts` | Migrate to `describeRoute()` + `validator()` |
| `apps/worker/routes/volunteers.ts` | Migrate to `describeRoute()` + `validator()` |
| `apps/worker/routes/shifts.ts` | Migrate to `describeRoute()` + `validator()` |
| `apps/worker/routes/bans.ts` | Migrate to `describeRoute()` + `validator()` |
| `apps/worker/routes/calls.ts` | Migrate to `describeRoute()` + `validator()` |
| `apps/worker/routes/conversations.ts` | Migrate to `describeRoute()` + `validator()` |
| `apps/worker/routes/blasts.ts` | Migrate to `describeRoute()` + `validator()` |
| `apps/worker/routes/invites.ts` | Migrate to `describeRoute()` + `validator()` |
| `apps/worker/routes/settings.ts` | Migrate to `describeRoute()` + `validator()` |
| `apps/worker/routes/reports.ts` | Migrate to `describeRoute()` + `validator()` |
| `apps/worker/routes/uploads.ts` | Migrate to `describeRoute()` + `validator()` |
| `apps/worker/routes/hubs.ts` | Migrate to `describeRoute()` + `validator()` |
| `apps/worker/routes/contacts.ts` | Migrate to `describeRoute()` + `validator()` |
| `apps/worker/routes/config.ts` | Add `describeRoute()` annotations |
| `apps/worker/routes/webauthn.ts` | Add `describeRoute()` annotations |
| `apps/worker/routes/provisioning.ts` | Add `describeRoute()` annotations |
| `apps/worker/routes/telephony.ts` | Add `describeRoute()` annotations |
| `apps/worker/messaging/router.ts` | Add `describeRoute()` annotations |
| `apps/worker/routes/webrtc.ts` | Add `describeRoute()` annotations |
| `apps/worker/routes/files.ts` | Add `describeRoute()` annotations |
| `apps/worker/routes/devices.ts` | Add `describeRoute()` annotations |
| `apps/worker/routes/setup.ts` | Add `describeRoute()` annotations |
| `apps/worker/routes/system.ts` | Add `describeRoute()` annotations |
| `apps/worker/routes/health.ts` | Add `describeRoute()` annotations |
| `apps/worker/routes/metrics.ts` | Add `describeRoute()` annotations |
| `apps/worker/routes/dev.ts` | Add `describeRoute()` annotations |

## Files to Delete

| File | Reason |
|------|--------|
| `apps/worker/middleware/validate.ts` | Replaced by `hono-openapi` validator (Phase 3) |

## Dependencies

| Package | Version | Why |
|---------|---------|-----|
| `hono-openapi` | ^1.3.0 | Middleware-based OpenAPI spec generation, Zod 4 native via Standard Schema |
| `@hono/standard-validator` | latest | Required peer dependency of `hono-openapi` |
| `@scalar/hono-api-reference` | ^0.10.0 | Interactive API documentation UI |

## Testing

### BDD Scenarios

Backend BDD tests already exercise the API surface — they validate behavior, not documentation. The OpenAPI integration must not break existing tests.

**Verification approach:**

1. `bun run test:backend:bdd` — all existing 413+ tests must still pass (validates the validator swap didn't change behavior)
2. Manual verification: `GET /api/openapi.json` returns valid OpenAPI 3.1 JSON
3. Manual verification: `GET /api/docs` renders Scalar UI
4. Typecheck: `bun run typecheck` passes (validates `c.req.valid()` type inference)

### New test scenarios

```gherkin
# packages/test-specs/features/core/openapi.feature

Feature: OpenAPI Specification
  The API provides a machine-readable OpenAPI specification and interactive documentation.

  @backend
  Scenario: OpenAPI spec is accessible
    When I request "GET /api/openapi.json"
    Then the response status should be 200
    And the response should contain valid JSON
    And the response should have "openapi" field starting with "3."
    And the response should have "info.title" equal to "Llamenos API"

  @backend
  Scenario: OpenAPI spec includes all documented routes
    When I request "GET /api/openapi.json"
    Then the response should have paths including "/auth/login"
    And the response should have paths including "/notes"
    And the response should have paths including "/volunteers"
    And the response should have paths including "/shifts"

  @backend
  Scenario: Scalar documentation UI is accessible
    When I request "GET /api/docs"
    Then the response status should be 200
    And the response content-type should contain "text/html"

  @backend
  Scenario: OpenAPI spec documents request validation schemas
    When I request "GET /api/openapi.json"
    Then the path "/notes" POST operation should have a requestBody schema
    And the path "/notes" GET operation should have query parameters
```

## Acceptance Criteria & Test Scenarios

- [ ] `GET /api/openapi.json` returns a valid OpenAPI 3.1 spec covering all client-facing routes
  -> `packages/test-specs/features/core/openapi.feature: "OpenAPI spec is accessible"`
- [ ] `GET /api/docs` serves the Scalar interactive documentation UI
  -> `packages/test-specs/features/core/openapi.feature: "Scalar documentation UI is accessible"`
- [ ] All 14 route files with Zod validation use `hono-openapi` validator instead of custom middleware
  -> `packages/test-specs/features/core/openapi.feature: "OpenAPI spec documents request validation schemas"`
- [ ] All 27 route files have `describeRoute()` annotations with tags and summaries
  -> `packages/test-specs/features/core/openapi.feature: "OpenAPI spec includes all documented routes"`
- [ ] Response schemas documented (static types, no runtime validation) for all major endpoints
  -> Manual verification via Scalar UI
- [ ] Custom `validate.ts` middleware removed, `c.req.valid()` used everywhere
  -> `bun run typecheck` passes
- [ ] All existing backend BDD tests pass unchanged
  -> `bun run test:backend:bdd` (413+ scenarios)
- [ ] Backlog files updated

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/core/openapi.feature` | New | OpenAPI spec and docs accessibility |
| `tests/steps/backend/openapi.steps.ts` | New | Backend step definitions for OpenAPI scenarios |

## Risk Assessment

- **Low risk**: Adding `describeRoute()` annotations — purely additive, no behavior change
- **Low risk**: Scalar UI — standalone HTML page, no frontend build integration
- **Medium risk**: Swapping `validateBody`/`validateQuery` for `hono-openapi/zod` `validator()` — same Zod schemas, different middleware wrapper. Must verify `c.req.valid('json')` provides identical parsed output to `c.get('validatedBody')`. If the shape differs, handlers break. Mitigated by: running full BDD suite after each route file migration.
- **Low risk**: Response schemas — documentation only, no runtime behavior change
