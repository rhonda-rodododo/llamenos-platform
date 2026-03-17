# Epic 361: Mobile Client Compatibility — Drizzle Backend Validation

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 360 (BDD test parity)
**Blocks**: None
**Branch**: `desktop`

## Summary

Validate and update iOS and Android clients for compatibility with the Drizzle ORM backend (Epics 357-358). The API contract is defined by protocol Zod schemas — codegen ensures type parity. This epic verifies end-to-end compatibility and fixes any edge cases.

## Problem Statement

Epics 357-358 replaced the backend architecture (Node.js + Durable Objects → Bun + Drizzle ORM). The API contract (HTTP endpoints, request/response shapes) is defined by Zod schemas in `packages/protocol/schemas/` and enforced by hono-openapi validators. The protocol codegen pipeline generates matching types for Swift and Kotlin.

However, subtle differences may exist:
- **Date format**: DOs returned ISO strings from `new Date().toISOString()`. Drizzle returns `Date` objects from `timestamp()` columns — routes must `.toISOString()` them.
- **Null vs undefined**: DOs stored JSONB and returned `null` for missing optional fields. Drizzle may return `undefined` (omitted from JSON) instead of `null`.
- **Array types**: PostgreSQL arrays via Drizzle return `string[]` directly. DOs stored JSON arrays in JSONB — same wire format but verify.
- **JSONB column types**: Drizzle JSONB columns return parsed objects. DOs returned the same. Verify no double-serialization.

## Implementation

### Phase 1: Protocol Schema Validation (Backend)

Run the OpenAPI snapshot diff to detect any response shape changes:

```bash
# Start the Drizzle backend
bun run dev:server

# Generate fresh OpenAPI snapshot
curl -s http://localhost:3000/api/openapi.json > /tmp/new-openapi.json

# Diff against the checked-in snapshot
diff packages/protocol/openapi-snapshot.json /tmp/new-openapi.json
```

If the snapshot differs, the API contract changed. Fix the routes to match the schema, then update the snapshot.

### Phase 2: Codegen Verification

```bash
# Regenerate all platform types from protocol schemas
bun run codegen

# Check for codegen drift
bun run codegen:check   # exits non-zero if generated files differ
```

If codegen produces different output, the protocol schemas changed. Verify the changes are intentional, then commit the regenerated files.

### Phase 3: iOS Client Verification

```bash
# On Mac M4:
ssh mac 'cd ~/projects/llamenos && git pull && bun run codegen'

# Rebuild iOS
bun run ios:build

# Run unit tests (includes crypto interop)
bun run ios:test

# Run UI tests against local backend
bun run ios:uitest
```

**Files that may need updates** (if response shapes changed):
- `apps/ios/Sources/Services/APIService.swift` — HTTP client, response parsing
- `apps/ios/Sources/Generated/LlamenosTypes.swift` — auto-generated from codegen (should match)
- `apps/ios/Sources/ViewModels/*.swift` — if they access response fields that changed

**Key areas to test**:
- Auth login flow (Schnorr signature → session token)
- Volunteer list and profile display
- Note creation with E2EE envelopes
- Shift display and on-shift status
- Settings management (admin)
- CMS case/event/contact views

### Phase 4: Android Client Verification

```bash
# Build and test Android
bun run test:android

# E2E on emulator
bun run test:android:e2e
```

**Files that may need updates**:
- `apps/android/app/src/main/kotlin/*/api/ApiClient.kt` — HTTP client
- `apps/android/app/src/main/kotlin/*/Generated.kt` — auto-generated from codegen
- `apps/android/app/src/main/kotlin/*/ui/screens/*.kt` — if they access changed fields

**Key areas to test**:
- Same as iOS (auth, volunteers, notes, shifts, settings, CMS)
- Offline queue behavior (queued requests must match new API contract)
- Push notification handling (device registration endpoint)

### Phase 5: Desktop Client Verification

```bash
# Desktop E2E (Playwright against Drizzle backend)
bun run test:desktop
```

The desktop client uses the same TypeScript types from codegen. The Playwright BDD tests (Epics 359-360) already validate the API contract.

## Key Principle: Codegen Drives Everything

```
packages/protocol/schemas/*.ts (Zod)
  ↓ bun run codegen
  ├── packages/protocol/generated/typescript/*.ts  → Desktop
  ├── packages/protocol/generated/swift/*.swift     → iOS
  └── packages/protocol/generated/kotlin/*.kt       → Android
```

If the API responses conform to the protocol schemas, and codegen runs clean, the mobile clients automatically have the correct types. The work in this epic is **verification**, not implementation — unless codegen reveals a schema drift.

## Acceptance Criteria

- [ ] `bun run codegen:check` passes (no drift)
- [ ] OpenAPI snapshot matches the running Drizzle backend
- [ ] iOS builds and unit tests pass (`bun run ios:build && bun run ios:test`)
- [ ] Android builds and unit tests pass (`bun run test:android`)
- [ ] Desktop BDD tests pass (covered by Epics 359-360)
- [ ] No `null` vs `undefined` issues in mobile response parsing
- [ ] Date fields are ISO 8601 strings (not raw Date objects)

## Risk Assessment

- **Low risk**: The protocol schemas haven't changed — this is a verification pass
- **Low risk**: Codegen is already part of CI — any drift would be caught
- **Medium risk**: Date serialization — Drizzle `timestamp` columns return `Date` objects; routes must call `.toISOString()` before returning. Spot-check all timestamp fields in route responses.
