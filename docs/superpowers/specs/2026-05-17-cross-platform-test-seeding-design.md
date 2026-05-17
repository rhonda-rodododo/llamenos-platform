# Cross-Platform E2E Test Seeding Service

**Date:** 2026-05-17
**Status:** Design
**Scope:** Backend seeding endpoint + Android/iOS client simplification

## Problem

Three test suites need to create identical test data (entity types, records, report types, triage reports, shifts, contacts):

1. **Desktop E2E** (Playwright BDD) — uses `tests/api-helpers.ts` directly. Works.
2. **Backend BDD** — also uses `tests/api-helpers.ts`. Works.
3. **Android E2E** (Cucumber BDD) — has its own `TestApiClient.kt` that hand-builds JSON, reimplements auth, and produces data the app can't see.
4. **iOS E2E** (XCUITest) — will need the same seeding.

The Android implementation diverges from the working desktop/backend pattern:
- Reimplements Ed25519 auth (dev-mode dummy tokens vs real signing)
- Hand-builds JSON bodies with hardcoded field names (no schema alignment)
- Uses raw status values (`"reported"`) vs the backend BDD's hash-style values (`"status_open_hash"`)
- Has its own response types that don't match the protocol schemas
- Silently swallows errors, making debugging impossible

Every schema change requires updates in `api-helpers.ts` AND `TestApiClient.kt` (and eventually Swift too).

## Solution

A **declarative test seeding endpoint** on the backend that wraps the proven `api-helpers.ts` functions. Mobile clients send a single POST describing what data they need; the backend creates it using the same code path as desktop tests.

## Architecture

```
                    POST /api/test-seed
                         |
              +----------+----------+
              |                     |
     checkResetSecret()    ENVIRONMENT=development
              |
     parseSeedSpec (Zod)
              |
     +--------+--------+--------+--------+
     |        |        |        |        |
  permissions entityTypes records reportTypes shifts
     |        |        |        |        |
  (reuses existing service layer — same code path as real API)
```

### Endpoint: `POST /api/test-seed`

**Guards** (same as all dev.ts endpoints):
- `ENVIRONMENT === 'development'` — hard 404 otherwise
- `checkResetSecret()` — requires `X-Test-Secret` or valid Bearer auth
- Route lives in `apps/worker/routes/dev.ts` alongside existing test endpoints

**Request body** (validated by Zod schema):

```typescript
const seedSpecSchema = z.object({
  hubId: z.string().uuid(),
  adminSeed: z.string().length(64).regex(/^[0-9a-f]+$/), // Ed25519 seed for envelope construction

  // Optional sections — only seed what you need
  permissions: z.object({
    grantVolunteerCms: z.boolean().optional().default(false),
    enableCaseManagement: z.boolean().optional().default(false),
  }).optional(),

  entityTypes: z.array(z.object({
    template: z.enum(['arrest_case', 'protest_event']),  // Extensible — add templates as needed
    records: z.number().int().min(0).max(50).optional().default(0),
    assignTo: z.array(z.string()).optional().default([]),
  })).optional().default([]),

  reportTypes: z.array(z.object({
    template: z.enum(['general_report']),
    triageReports: z.number().int().min(0).max(50).optional().default(0),
  })).optional().default([]),

  shifts: z.array(z.object({
    pubkey: z.string().length(64),
    allDay: z.boolean().optional().default(true),
  })).optional().default([]),

  members: z.array(z.object({
    pubkey: z.string().length(64),
    roleIds: z.array(z.string()).optional().default(['role-volunteer']),
  })).optional().default([]),

  contacts: z.array(z.object({
    displayName: z.string(),
    contactType: z.string().optional().default('person'),
  })).optional().default([]),
})
```

**Response:**

```typescript
{
  ok: boolean
  entityTypes: Array<{ id: string; name: string; category: string; defaultStatus: string }>
  records: Array<{ id: string; entityTypeId: string; caseNumber?: string }>
  reportTypes: Array<{ id: string; name: string }>
  triageReports: Array<{ id: string }>
  shifts: Array<{ id: string }>
  contacts: Array<{ id: string }>
  members: Array<{ pubkey: string }>
  errors: string[]  // Non-fatal warnings (e.g., "entity type already exists, reusing")
}
```

### Entity Type Templates

Templates are server-side definitions of common entity types used in tests. They match exactly what the current `buildArrestCaseEntityType()` and `buildProtestEventEntityType()` in `TestApiClient.kt` produce, but defined once in TypeScript.

Templates live in `apps/worker/routes/dev.ts` (or a `test-seed-templates.ts` adjacent file) and use the `createEntityTypeBodySchema` from `packages/protocol/schemas/entity-schema.ts` for type safety.

New templates can be added without changing any mobile code — the mobile client just references the template name.

### Envelope Construction

The endpoint constructs dummy HPKE envelopes using the provided `adminSeed`, matching the proven `dummyEnvelope()` pattern from `api-helpers.ts`:

```typescript
function dummyEnvelope(seedHex: string) {
  const pubkey = seedHexToPubkey(seedHex)
  return { pubkey, ct: 'a'.repeat(64), enc: pubkey }
}
```

The backend does NOT validate envelope crypto on create — it stores the blob as-is. This is safe for test data.

### Implementation Reuse

The endpoint calls the same service layer as the real API routes:
- `services.cases.create()` for records
- `services.cases.createEntityType()` for entity types
- Entity type creation goes through the real route handler logic (validation, deduplication)

This means test data exercises the same validation, permission checks, and database writes as production data.

## Mobile Client Changes

### Android: `TestApiClient.kt` becomes thin

Replace the current 642-line `TestApiClient.kt` with ~80 lines:

```kotlin
class TestApiClient(
    private val baseUrl: String,
    private val testSecret: String,
) {
    fun seed(spec: SeedSpec): SeedResult {
        val body = Json.encodeToString(spec)
        val response = post("/api/test-seed", body)
        return Json.decodeFromString(response)
    }

    // SeedSpec/SeedResult use protocol-generated Kotlin types
    // (or simple @Serializable data classes mirroring the Zod schema)
}
```

All the entity type JSON builders, envelope construction, multi-step orchestration, and error handling moves server-side.

### iOS: Same pattern

```swift
struct TestApiClient {
    func seed(_ spec: SeedSpec) async throws -> SeedResult {
        // Single POST to /api/test-seed
    }
}
```

### Desktop: Can use either path

Desktop tests can continue using `api-helpers.ts` directly (already works) or switch to `POST /api/test-seed` for consistency. No migration required.

## Security

- **Dev-only**: `ENVIRONMENT !== 'development'` guard — returns 404 in staging/production
- **Secret-gated**: `checkResetSecret()` requires `E2E_TEST_SECRET` or `DEV_RESET_SECRET`
- **No new attack surface**: Reuses existing service layer, doesn't bypass validation
- **adminSeed stays in request body**: Only transmitted over localhost/test network, never stored

## Testing

The endpoint itself is tested by backend BDD scenarios:
- "Seed spec creates entity types and records in the correct hub"
- "Seed spec with invalid hubId returns 400"
- "Seed spec in non-development environment returns 404"

Android E2E tests become the integration test — if the app sees the seeded data, the endpoint works.

## Files Changed

| File | Change |
|------|--------|
| `apps/worker/routes/dev.ts` | Add `POST /test-seed` endpoint + seed spec schema + template definitions |
| `tests/api-helpers.ts` | Extract `dummyEnvelope()` and seed templates if reusable (may stay in dev.ts) |
| `apps/android/.../TestApiClient.kt` | Replace with thin HTTP client calling `/api/test-seed` |
| `apps/android/.../ScenarioHooks.kt` | Simplify setup to single `testApiClient.seed(spec)` call |
| `apps/android/.../steps/*Steps.kt` | Update Given steps to use seed results (entity type IDs, record IDs) |

## Out of Scope

- iOS E2E integration (future — same pattern, different PR)
- Desktop migration to `/api/test-seed` (optional, `api-helpers.ts` already works)
- Custom entity type definitions in seed spec (templates only for now — extensible later)
- Real HPKE envelope construction (dummy envelopes are sufficient for E2E visibility tests)
