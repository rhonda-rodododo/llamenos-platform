# Epic 363: Wire Schema Coverage — All Endpoints Validated

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 362 (permissions)
**Blocks**: None
**Branch**: `desktop`

## Summary

Add Zod response schemas to ~160 endpoints missing them, add request validation to 3 unvalidated PUT endpoints, and add query parameter validation to 5 GET endpoints with raw query reads. When complete, every endpoint will have `describeRoute()` with `resolver(zodSchema)` for responses and `validator()` for all inputs. This enables accurate OpenAPI generation, client codegen, and runtime validation.

## Problem Statement

The audit found ~160 of ~230 endpoints have no response schema in their `describeRoute()` declaration. This means:
- The OpenAPI spec is incomplete — mobile clients can't auto-generate types for these endpoints
- No runtime response validation — malformed responses silently pass
- The API contract is implicit (whatever the code happens to return) rather than explicit (what the schema declares)

Only 4 route files have complete coverage: `auth.ts`, `notes.ts`, `conversations.ts`, `devices.ts`.

## Approach

### Step 1: Define missing response schemas in `packages/protocol/schemas/`

Many response shapes already have Zod schemas (e.g., `callRecordResponseSchema`, `shiftResponseSchema`). The missing pieces are:
- List response wrappers: `{ items: z.array(itemSchema), total: z.number(), ... }`
- Settings responses: `spamSettingsSchema`, `callSettingsSchema` already exist as request schemas — reuse for responses
- Simple responses: `okResponseSchema` for delete/update-with-no-body operations

### Step 2: Add `resolver()` to `describeRoute()` in each route file

Pattern (from the gold-standard `notes.ts`):
```typescript
notes.get('/',
  describeRoute({
    tags: ['Notes'],
    summary: 'List notes',
    responses: {
      200: {
        description: 'Notes list',
        content: {
          'application/json': {
            schema: resolver(z.object({
              notes: z.array(noteResponseSchema),
              total: z.number(),
              page: z.number(),
              limit: z.number(),
            })),
          },
        },
      },
      ...authErrors,
    },
  }),
  // ... handler
)
```

### Step 3: Add `validator()` for unvalidated inputs

3 PUT endpoints need `validator('json', schema)`:
- `PUT /cms/case-management` — `z.object({ enabled: z.boolean() })`
- `PUT /cms/cross-hub` — `z.object({ enabled: z.boolean() })`
- `POST /cms/templates/apply` — `z.object({ templateId: z.string() })`

5 GET endpoints need `validator('query', schema)`:
- `GET /records/envelope-recipients` — validate `entityTypeId`, `assignedTo`
- `GET /records/:id/suggest-assignees` — validate `language`
- `GET /directory/search` — validate `tokens`
- `GET /blasts/subscribers` — validate pagination + filters
- `GET /provisioning/rooms/:id` — validate `token`

## Files to Modify (by priority)

### Tier 1 — High-traffic API endpoints (clients depend on these)
| File | Missing Schemas | Priority |
|------|----------------|----------|
| `routes/calls.ts` | 9 response schemas | HIGH |
| `routes/shifts.ts` | 3 response schemas | HIGH |
| `routes/bans.ts` | 1 response schema | HIGH |
| `routes/invites.ts` | 3 response schemas | HIGH |
| `routes/hubs.ts` | 6 response schemas | HIGH |
| `routes/reports.ts` | 8 response schemas | HIGH |
| `routes/webauthn.ts` | 6 response schemas | HIGH |

### Tier 2 — CMS and settings (admin features)
| File | Missing Schemas | Priority |
|------|----------------|----------|
| `routes/settings.ts` | 34 response schemas | MEDIUM |
| `routes/entity-schema.ts` | 25 response schemas + 3 request schemas | MEDIUM |
| `routes/records.ts` | 23 response schemas + 2 query schemas | MEDIUM |
| `routes/contacts-v2.ts` | 19 response schemas + 1 query schema | MEDIUM |
| `routes/events.ts` | 12 response schemas | MEDIUM |
| `routes/evidence.ts` | 6 response schemas | MEDIUM |

### Tier 3 — Supporting endpoints
| File | Missing Schemas | Priority |
|------|----------------|----------|
| `routes/blasts.ts` | 14 response schemas + 1 query schema | LOW |
| `routes/uploads.ts` | 4 response schemas | LOW |
| `routes/files.ts` | 3 response schemas | LOW |
| `routes/setup.ts` | 5 response schemas | LOW |
| `routes/webrtc.ts` | 4 response schemas | LOW |
| `routes/provisioning.ts` | 3 response schemas + 1 query schema | LOW |
| `routes/config.ts` | 2 response schemas | LOW |
| `routes/system.ts` | 1 response schema | LOW |
| `routes/health.ts` | 3 response schemas | LOW |
| `routes/metrics.ts` | 1 response schema | LOW |
| `routes/audit.ts` | 1 response schema | LOW |
| `routes/contacts.ts` | 2 response schemas (legacy) | LOW |
| `routes/volunteers.ts` | 1 response schema | LOW |

## New Protocol Schemas Needed

Some response shapes don't have Zod schemas yet. Create in `packages/protocol/schemas/`:

```typescript
// packages/protocol/schemas/calls.ts — add:
export const activeCallsResponseSchema = z.object({
  calls: z.array(callRecordResponseSchema),
})
export const callPresenceResponseSchema = z.object({
  activeCalls: z.number(),
  availableVolunteers: z.number(),
  volunteers: z.array(z.object({ pubkey: z.string(), status: z.string() })),
})
export const todayCountResponseSchema = z.object({ count: z.number() })

// packages/protocol/schemas/settings.ts — response wrappers for GET endpoints
// Most settings schemas already exist for request validation — reuse for responses

// packages/protocol/schemas/common.ts — add generic wrappers
export const deletedResponseSchema = z.object({ ok: z.literal(true) })
export const paginatedResponseSchema = <T>(itemSchema: z.ZodType<T>, key: string) =>
  z.object({ [key]: z.array(itemSchema), total: z.number() })
```

## Implementation

### Phase 1: Define missing schemas (parallel)
- Create/update schema files in `packages/protocol/schemas/`
- Register new schemas in `schema-registry.ts`
- Run `bun run codegen` to generate TS/Swift/Kotlin types

### Phase 2: Add schemas to routes (parallel by tier)
- Tier 1 routes (high-traffic) — one agent
- Tier 2 routes (CMS/settings) — one agent
- Tier 3 routes (supporting) — one agent

### Phase 3: Validate
- Run `bun run codegen` — verify OpenAPI snapshot updates
- Run `bun run typecheck`
- Run `bun run test:backend:bdd`

## Acceptance Criteria

- [ ] Every POST/PATCH/PUT endpoint has `validator('json', schema)`
- [ ] Every GET endpoint with query params has `validator('query', schema)`
- [ ] Every endpoint (except binary/webhook/dev) has `describeRoute()` with `resolver(schema)` for responses
- [ ] `bun run codegen` produces updated types from new schemas
- [ ] OpenAPI snapshot reflects all endpoint schemas
- [ ] All BDD tests still pass
- [ ] Zero `c.req.json()` without validation in non-dev routes
- [ ] Zero `c.req.query()` without validation in non-dev routes
