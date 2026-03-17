# Epic 363: Wire Schema Coverage — All Endpoints Validated

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 362 (permissions)
**Blocks**: None
**Branch**: `desktop`

## Summary

Add Zod response schemas to ~130 endpoints missing them, add request validation to 3 unvalidated PUT/POST endpoints, and add query parameter validation to 5 GET endpoints with raw query reads. When complete, every endpoint will have `describeRoute()` with `resolver(zodSchema)` for responses and `validator()` for all inputs. This enables accurate OpenAPI generation, client codegen, and runtime validation.

## Problem Statement

The audit found ~130 of ~230 endpoints have no response schema in their `describeRoute()` declaration. This means:
- The OpenAPI spec is incomplete — mobile clients can't auto-generate types for these endpoints
- No runtime response validation — malformed responses silently pass
- The API contract is implicit (whatever the code happens to return) rather than explicit (what the schema declares)

Route files with complete coverage: `auth.ts`, `notes.ts`, `conversations.ts`, `volunteers.ts` (gold-standard examples).
Route files excluded from scope: `telephony.ts` (webhook handlers, TwiML/XML responses), `dev.ts` (test-only, no public contract), `devices.ts` (all 204 no-body responses).

## Approach

### Step 1: Define missing response schemas in `packages/protocol/schemas/`

Many response shapes already have Zod schemas (e.g., `callRecordResponseSchema`, `shiftResponseSchema`). The missing pieces are:
- List response wrappers using the established inline spread pattern: `z.object({ calls: z.array(callRecordResponseSchema), total: z.number(), ... })`
- Settings responses: `spamSettingsSchema`, `callSettingsSchema` already exist as request schemas — reuse for responses
- Simple responses: `okResponseSchema` already exists in `common.ts` for delete/update-with-no-body operations

**Important**: Do NOT use a generic `paginatedResponseSchema` helper — Zod's `z.object()` doesn't support computed keys. Use the established inline pattern from `notes.ts` and `conversations.ts`: `z.object({ specificKey: z.array(schema), ...paginatedMeta })`.

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

3 mutating endpoints need `validator('json', schema)`:
- `PUT /cms/case-management` — define `z.object({ enabled: z.boolean() })` inline
- `PUT /cms/cross-hub` — define `z.object({ enabled: z.boolean() })` inline
- `POST /cms/templates/apply` — define `z.object({ templateId: z.string() })` inline

(These are one-off toggle schemas — inline is fine, no need for protocol schema files.)

5 GET endpoints need `validator('query', schema)`:
- `GET /records/envelope-recipients` — validate `entityTypeId`, `assignedTo`
- `GET /records/:id/suggest-assignees` — validate `language`
- `GET /directory/search` — validate `tokens`
- `GET /blasts/subscribers` — validate pagination + filters
- `GET /provisioning/rooms/:id` — validate `token`

## Files to Modify (by priority)

### Tier 1 — High-traffic API endpoints (clients depend on these)
| File | Missing Response Schemas | Priority |
|------|------------------------|----------|
| `routes/calls.ts` | ~8 (excludes binary recording endpoint) | HIGH |
| `routes/shifts.ts` | 3 | HIGH |
| `routes/bans.ts` | 1 | HIGH |
| `routes/invites.ts` | 3 | HIGH |
| `routes/hubs.ts` | ~5 | HIGH |
| `routes/reports.ts` | ~4 | HIGH |
| `routes/webauthn.ts` | 6 | HIGH |

### Tier 2 — CMS and settings (admin features)
| File | Missing Response Schemas | Other | Priority |
|------|------------------------|-------|----------|
| `routes/settings.ts` | ~31 | — | MEDIUM |
| `routes/entity-schema.ts` | ~20 | + 3 request validators | MEDIUM |
| `routes/records.ts` | ~23 | + 2 query validators | MEDIUM |
| `routes/contacts-v2.ts` | ~19 | + 1 query validator | MEDIUM |
| `routes/events.ts` | 12 | — | MEDIUM |
| `routes/evidence.ts` | 6 | — | MEDIUM |

### Tier 3 — Supporting endpoints
| File | Missing Response Schemas | Other | Priority |
|------|------------------------|-------|----------|
| `routes/blasts.ts` | 14 | + 1 query validator | LOW |
| `routes/uploads.ts` | 4 | — | LOW |
| `routes/files.ts` | 3 | — | LOW |
| `routes/setup.ts` | 5 | — | LOW |
| `routes/webrtc.ts` | 4 | — | LOW |
| `routes/provisioning.ts` | 3 | + 1 query validator | LOW |
| `routes/config.ts` | 2 | — | LOW |
| `routes/system.ts` | 1 | — | LOW |
| `routes/health.ts` | 3 | — | LOW |
| `routes/metrics.ts` | 1 | — | LOW |
| `routes/audit.ts` | 1 | — | LOW |
| `routes/contacts.ts` | 2 (legacy) | — | LOW |

## New Protocol Schemas Needed

Some response shapes don't have Zod schemas yet. Create in `packages/protocol/schemas/`:

```typescript
// packages/protocol/schemas/calls.ts — add:
export const activeCallsResponseSchema = z.object({
  calls: z.array(callRecordResponseSchema),
})
export const todayCountResponseSchema = z.object({ count: z.number() })
// NOTE: callPresenceResponseSchema ALREADY EXISTS — just wire into route

// packages/protocol/schemas/common.ts — add:
export const deletedResponseSchema = z.object({ ok: z.literal(true) })
```

Most other response shapes can be defined inline in `describeRoute()` using the existing schemas as building blocks — no new schema file entries needed.

**Schema registry**: Any new named schemas that should appear in the codegen output must be registered in `packages/protocol/tools/schema-registry.ts`. Check existing registrations before adding duplicates (e.g., `callPresenceResponseSchema` is already registered at line 43).

## Implementation

### Phase 1: Define any missing schemas
- Check `packages/protocol/schemas/` for existing schemas that just need wiring
- Create only genuinely new schemas (likely 2-3 total)
- Register in `schema-registry.ts` if they need codegen output
- Run `bun run codegen`

### Phase 2: Add schemas to routes (parallel by tier)
- Tier 1 routes (high-traffic) — one agent
- Tier 2 routes (CMS/settings) — one agent
- Tier 3 routes (supporting) — one agent

Each agent follows the same pattern:
1. Read the route file
2. For each endpoint without `resolver()`, add it to `describeRoute()`
3. Use existing schemas from `@protocol/schemas/*` where available
4. Define inline schemas for simple responses (e.g., `z.object({ bans: z.array(banResponseSchema) })`)
5. Add `validator('json', ...)` or `validator('query', ...)` where noted

### Phase 3: Validate
- Run `bun run codegen` — verify OpenAPI snapshot updates correctly
- Run `bun run typecheck`
- Run `bun run test:backend:bdd`

## Acceptance Criteria

- [ ] Every POST/PATCH/PUT endpoint has `validator('json', schema)` (except binary uploads)
- [ ] Every GET endpoint with query params has `validator('query', schema)`
- [ ] Every JSON endpoint (except webhook/dev) has `describeRoute()` with `resolver(schema)` for 200/201 responses
- [ ] `bun run codegen` produces updated types from any new schemas
- [ ] OpenAPI snapshot reflects all endpoint schemas
- [ ] All BDD tests still pass (537+)
- [ ] Zero `c.req.json()` without validation in non-dev routes
- [ ] Zero `c.req.query()` without validation in non-dev routes

## Self-Review Fixes Applied

- Removed `devices.ts` from gold-standard list (all 204 responses — N/A)
- Added `volunteers.ts` to gold-standard list (already has full coverage)
- Removed `callPresenceResponseSchema` from "New Schemas" — already exists in `calls.ts`
- Fixed `paginatedResponseSchema` — removed broken generic helper, noted to use inline spread pattern
- Corrected counts: calls (9→8), reports (8→4), hubs (6→5), entity-schema (25→20), settings (34→31)
- Added `telephony.ts` to exclusion list with explanation (webhook handlers, not JSON API)
- Clarified toggle schemas (case-management/cross-hub) should be inline, not protocol schemas
- Added note about checking `schema-registry.ts` for existing registrations before adding
- Fixed HTTP method attribution (3 PUT/POST, not 3 PUT)
- Removed `volunteers.ts` from Tier 3 (already has full coverage)
