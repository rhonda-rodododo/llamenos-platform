# Backend Dead Code Cleanup

**Date**: 2026-03-19
**Status**: Ready to implement
**Scope**: `apps/worker/` only

---

## 1. Problem Statement

Epics 357 (Bun migration) and 358 (DO architecture removal) are complete. The `apps/worker/durable-objects/` directory is gone — 10,680 lines removed. However, several files still contain DO-era code that was never deleted during the migration. This dead code causes two concrete problems:

1. **Confusion for automated agents**: `getDOs()`, `createPushDispatcher()`, `authenticateRequestLegacy()`, and `dispatchVoipPush()` (DO-based) are fully functional-looking code paths that reference CF DO namespace patterns (`env.IDENTITY_DO.get()`). An agent reading these files cannot tell from context alone which functions are live and which are dead. This has caused incorrect edits in the past.

2. **Type pollution in `types.ts`**: The `DOStub`, `DONamespace`, and 9 DO fields in `Env` make the `Env` interface appear to still need CF Worker runtime bindings. This is false — the real backend is Bun+PostgreSQL, not CF Workers. The DO fields only exist to satisfy TypeScript for the dead functions above.

The `wrangler.jsonc` DO bindings exist solely for the `demo.llamenos-hotline.com` CF deployment, which is a separate deployment target from the real backend.

---

## 2. Dead Code Inventory

All file paths are relative to `apps/worker/`.

### 2.1 `lib/do-access.ts`

| Lines | Symbol | Why Dead |
|-------|--------|----------|
| 16–24 | `IDENTITY_ID` ... `CASE_MANAGER_ID` constants | Only used by `getDOs()` / `getScopedDOs()` / `getHubDOs()` |
| 26–36 | `interface DurableObjects` | Only referenced by dead functions and `lib/voip-push.ts` (which also has a dead DO-based variant) |
| 38–50 | `getDOs()` | Calls `env.IDENTITY_DO.get()` etc. No callers in live routes. |
| 52–60 | `interface HubDurableObjects` | Only referenced by dead `getHubDOs()` |
| 62–86 | `getScopedDOs()`, `getHubDOs()` | No callers in live routes. |
| 93–112 | `getTelephony()` | Accepts `DurableObjects`, calls `dos.settings.fetch()`. No callers in live routes. |
| 140–152 | `getHubTelephony()` | Calls `getDOs()` and `getTelephony()`. No callers in live routes. |
| 179–217 | `getMessagingAdapter()` | Accepts `DurableObjects`, calls `dos.settings.fetch()`. No callers in live routes. (The comment at `routes/records.ts:1073` says this function "will be replaced" — it is already replaced by `getMessagingAdapterFromService()`.) |

**Unit test to delete**: `__tests__/unit/do-access.test.ts` — tests only `getDOs()`, `getScopedDOs()`, `getHubDOs()`.

**Note on `getNostrPublisher()`**: This function (lines 260–283) is live. `lib/nostr-events.ts` imports it from `do-access.ts`. After the rename (see section 5), the import path changes but the function stays.

### 2.2 `lib/auth.ts`

| Lines | Symbol | Why Dead |
|-------|--------|----------|
| 87–121 | `authenticateRequestLegacy()` | Marked `@deprecated`. Accepts a `identityDO: { fetch(req: Request): Promise<Response> }` parameter. Zero callers outside the file itself. `middleware/auth.ts` calls only `authenticateRequest()`. |

### 2.3 `lib/push-dispatch.ts`

| Lines | Symbol | Why Dead |
|-------|--------|----------|
| 41–49 | `createPushDispatcher()` | Accepts `identityDO: DOStub, shiftsDO: DOStub`. Zero callers in source (`.wrangler/tmp/` is a build artifact — not source). |
| 76–232 | `class LivePushDispatcher` | Instantiated only by `createPushDispatcher()`. Contains `private identityDO: DOStub` and `private shiftsDO: DOStub` fields. |

**What stays**: `createPushDispatcherFromService()` (lines 56–69) and `class ServicePushDispatcher` (lines 237–364). These are called by `routes/conversations.ts`.

### 2.4 `lib/voip-push.ts`

| Lines | Symbol | Why Dead |
|-------|--------|----------|
| 15 | `import type { Env, DOStub } from '../types'` | `DOStub` is only used by the dead `dispatchVoipPush()` |
| 16 | `import type { DurableObjects } from '../lib/do-access'` | Only used by the dead `dispatchVoipPush()` |
| 31–87 | `dispatchVoipPush()` | Accepts `dos: DurableObjects`, calls `dos.identity.fetch()`. `services/ringing.ts` imports only `dispatchVoipPushFromService`. |

**What stays**: `dispatchVoipPushFromService()` (lines 92–121) and all private helpers.

### 2.5 `types.ts`

| Lines | Symbol | Why Dead |
|-------|--------|----------|
| 22–25 | `interface DOStub` | Only needed by dead functions above. Once those are deleted, nothing in source references `DOStub`. |
| 27–31 | `interface DONamespace` | Same. |
| 34–43 | `Env.CALL_ROUTER` ... `Env.CASE_MANAGER` (9 DO fields) | Only needed by dead DO functions. The real Bun server uses `createBunEnv()` which does not set these fields. |

**What stays in `types.ts`**: Everything else — `BlobStorage`, `TranscriptionService`, `AppEnv`, `ServerSession`, `AuthPayload`, all domain types (`Volunteer`, `Shift`, `CallRecord`, etc.), push types, conversation types, etc.

### 2.6 `__tests__/integration/cloudflare-workers-mock.ts`

This file exports a `DurableObject` base class stub. It exists to satisfy imports that used to come from `cloudflare:workers` in test builds. With the DO architecture gone, nothing imports it. Delete the file.

**Check before deleting**: `grep -rn "cloudflare-workers-mock" apps/worker/` — should return zero results outside the file itself.

### 2.7 `wrangler.jsonc`

The 9 DO bindings and the `migrations` block exist for the CF demo deployment. These are not dead in that context — they configure a real (separate) CF deployment at `demo.llamenos-hotline.com`. However, they are misleading when reading the codebase because they make it look like the backend still needs CF DOs.

**Action**: Add a top-of-file comment making the purpose explicit. Do NOT remove the DO bindings — removing them would break the demo deployment. This is documentation-only.

---

## 3. What Must Not Be Deleted

The following are live and must be preserved exactly as-is:

**`lib/do-access.ts` (after rename to `lib/service-factories.ts`)**:
- `getTelephonyFromService()` — called by `routes/telephony.ts`, `routes/calls.ts`
- `getHubTelephonyFromService()` — called by `services/ringing.ts`, `routes/records.ts`
- `getMessagingAdapterFromService()` — called by `routes/conversations.ts`, `routes/records.ts`
- `getNostrPublisher()` — called by `lib/nostr-events.ts`
- `createAdapterFromConfig()` (private helper) — used by the above
- All imports that support the above functions

**`lib/auth.ts`**:
- `parseAuthHeader()`, `parseSessionHeader()`, `validateToken()`, `verifyAuthToken()` — called by `middleware/auth.ts`
- `authenticateRequest()` — called by `middleware/auth.ts`

**`lib/push-dispatch.ts`**:
- `PushDispatcher` interface
- `createPushDispatcherFromService()`
- `class ServicePushDispatcher`
- `class NoopPushDispatcher`
- All notification content helpers at the bottom of the file

**`lib/voip-push.ts`**:
- `dispatchVoipPushFromService()`
- `sendApnsVoipPush()`, `sendFcmVoipPush()` (private helpers)

**`types.ts`**:
- All of it except the 9 DO fields in `Env` and the `DOStub`/`DONamespace` interfaces.

---

## 4. Migration Strategy (Dependency Order)

Execute in this order to avoid breaking intermediate states:

### Step 1: Delete `authenticateRequestLegacy()` from `lib/auth.ts`

Delete lines 87–121. No other changes needed — the function has no callers.

### Step 2: Delete `createPushDispatcher()` and `LivePushDispatcher` from `lib/push-dispatch.ts`

Delete:
- Lines 41–49: `createPushDispatcher()` function
- Lines 76–232: `class LivePushDispatcher`

Also remove the `DOStub` from the import on line 10:
```
// Before
import type { Env, DeviceRecord, WakePayload, FullPushPayload, DOStub } from '../types'
// After
import type { Env, DeviceRecord, WakePayload, FullPushPayload } from '../types'
```

### Step 3: Delete `dispatchVoipPush()` from `lib/voip-push.ts`

Delete:
- Lines 15–16: `DOStub` and `DurableObjects` imports
- Lines 31–87: `dispatchVoipPush()` function

The `DOStub` type import was the only reference to `types.ts` DO types from this file. After deletion, the `DurableObjects` interface import from `do-access.ts` is also gone.

### Step 4: Delete dead functions from `lib/do-access.ts`

Delete:
- Lines 16–24: DO ID constants
- Lines 26–36: `interface DurableObjects`
- Lines 38–50: `getDOs()`
- Lines 52–60: `interface HubDurableObjects`
- Lines 62–86: `getScopedDOs()`, `getHubDOs()`
- Lines 93–112: `getTelephony()`
- Lines 140–152: `getHubTelephony()`
- Lines 179–217: `getMessagingAdapter()`

After deletion, update line 1:
```typescript
// Before
import type { Env, DOStub } from '../types'
// After
import type { Env } from '../types'
```

The `DurableObjects` interface is now gone, so `lib/voip-push.ts`'s import of it (already deleted in step 3) no longer causes issues.

### Step 5: Delete `DOStub`, `DONamespace`, and 9 DO fields from `types.ts`

Delete lines 22–31 (`DOStub` and `DONamespace` interfaces) and lines 34–43 (the 9 DO fields in `Env`).

At this point `typecheck` should pass — nothing in source should reference these types anymore.

### Step 6: Delete test files

- Delete `__tests__/unit/do-access.test.ts` — tests only the dead DO functions.
- Delete `__tests__/integration/cloudflare-workers-mock.ts` — DO mock for the old test harness.

Verify no other test file imports from either before deleting:
```bash
grep -rn "do-access.test\|cloudflare-workers-mock" apps/worker/
```

### Step 7: Rename `lib/do-access.ts` to `lib/service-factories.ts`

The file now contains only service-layer factory functions: `getTelephonyFromService()`, `getHubTelephonyFromService()`, `getMessagingAdapterFromService()`, `getNostrPublisher()`. The name `do-access.ts` is actively misleading — it was named for DO access patterns that no longer exist.

Update all import sites:
```bash
# Files that currently import from do-access
grep -rn "from.*do-access\|from.*lib/do-access" apps/worker/ --include="*.ts"
```

Expected current importers (verify before renaming):
- `lib/nostr-events.ts`: `import { getNostrPublisher } from './do-access'`
- Any test files (check after step 6)

### Step 8: Add clarifying comment to `wrangler.jsonc`

Add a comment block before the `durable_objects` section:

```jsonc
// NOTE: These DO bindings are for the demo.llamenos-hotline.com CF deployment ONLY.
// The production backend runs as Bun+PostgreSQL (self-hosted via Docker/Helm).
// The real backend does NOT use Durable Objects — they were removed in Epic 358.
```

---

## 5. The `lib/do-access.ts` → `lib/service-factories.ts` Rename

After step 4 removes all DO-related code, the file contains:

- `getTelephonyFromService()` — creates a `TelephonyAdapter` from a settings service
- `getHubTelephonyFromService()` — creates a hub-scoped `TelephonyAdapter`
- `getMessagingAdapterFromService()` — creates a `MessagingAdapter` for a given channel
- `getNostrPublisher()` — gets/creates the cached Nostr event publisher
- `createAdapterFromConfig()` (private) — telephony adapter factory

These are all service-layer factory functions. The file has nothing to do with DO access. Renaming it to `service-factories.ts` makes it immediately legible to any reader.

Import path change:
```typescript
// lib/nostr-events.ts — before
import { getNostrPublisher } from './do-access'
// after
import { getNostrPublisher } from './service-factories'
```

---

## 6. Performance Fix: Request-Scoped Roles Caching

**Location**: `middleware/auth.ts`, line 59

```typescript
// Current — called on EVERY authenticated request
const { roles: allRoles } = await services.settings.getRoles()
```

This loads all role definitions from PostgreSQL for every API call. The roles table is small and changes rarely, but there is no caching at any layer. As role count grows (custom roles per hub, per template), this becomes a consistent overhead per request.

**Fix**: Add in-memory request-scoped caching inside `SettingsService.getRoles()`. Since Hono middleware runs once per request, the roles are already stored in `c.set('allRoles', allRoles)` after the auth middleware fires — but the initial load always hits the DB.

The correct fix is a short-lived module-level cache (e.g., 30 seconds) in `services/settings.ts`:

```typescript
// In services/settings.ts — add a simple TTL cache
let rolesCache: { roles: Role[]; expiresAt: number } | null = null
const ROLES_TTL_MS = 30_000 // 30 seconds

async getRoles(): Promise<{ roles: Role[] }> {
  const now = Date.now()
  if (rolesCache && rolesCache.expiresAt > now) {
    return { roles: rolesCache.roles }
  }
  const result = await this.fetchRolesFromDb()
  rolesCache = { roles: result.roles, expiresAt: now + ROLES_TTL_MS }
  return result
}
```

The 30-second TTL means role changes propagate within 30 seconds without requiring a service restart. Invalidate explicitly on `PUT /settings/roles` by clearing `rolesCache = null` after a successful update in the settings route handler.

**Scope**: This is a one-file change in `apps/worker/services/settings.ts` plus a cache invalidation call in `apps/worker/routes/settings.ts` where roles are mutated.

---

## 7. `/contacts` Route Investigation

**Current state**: Two routes exist at the same path prefix — both are active:

- `apps/worker/routes/contacts.ts` → mounted at `/contacts` (both authenticated and hub-scoped)
- `apps/worker/routes/contacts-v2.ts` → mounted at `/directory` (both authenticated and hub-scoped)

These serve different purposes:

| Route | File | What it Does |
|-------|------|--------------|
| `GET /contacts` | `contacts.ts` | Hash-based contact timeline. Aggregates note counts + conversation counts from `services.records.listContacts()` and `services.conversations.getContactSummaries()`. Returns a merged timeline view keyed by `contactHash`. |
| `GET /contacts/:hash` | `contacts.ts` | Unified timeline for one contact — notes + conversations by hash. |
| `GET /directory` | `contacts-v2.ts` | Paginated contact directory with E2EE profiles, blind index search, type filtering. Manages structured `Contact` entities via `services.contacts`. |
| `GET /directory/lookup/:hash` | `contacts-v2.ts` | Lookup by identifier hash. |
| `GET /directory/search` | `contacts-v2.ts` | Trigram token search. |

**Client usage**:

- The **desktop client** (`src/client/lib/api.ts` lines 481, 485) calls `GET /contacts` and `GET /contacts/:hash` — these are the hash-based timeline endpoints.
- The **iOS client** (`apps/ios/Sources/ViewModels/ContactsViewModel.swift`) calls `/api/contacts`, `/api/contacts/search`, `/api/contacts/:hash`, `/api/contacts/:hash/relationships`, `/api/contacts/:hash/timeline` — the search and relationships endpoints are not in `contacts.ts`, they are in `contacts-v2.ts` but mounted at `/directory` (not `/contacts`). This suggests the iOS client may be hitting the wrong mount point for some of these, or `contacts-v2.ts` was originally intended to replace `/contacts` entirely but the rename never happened.
- The **Android client** calls `/api/contacts/:hash`, `/api/contacts/:hash/relationships`, `/api/contacts/:hash/timeline` and `/api/contacts?page=...`.

**Ambiguity to resolve**: `contacts-v2.ts` has `/:hash`, `/lookup/:identifierHash`, `/search`, `/:hash/relationships`, `/:hash/timeline` endpoints but is mounted at `/directory`. The iOS and Android clients are calling `/api/contacts/:hash/relationships` and `/api/contacts/:hash/timeline` — paths that exist in `contacts-v2.ts` but would only be served if that router is also mounted at `/contacts`. They are NOT — only `contacts.ts` is at `/contacts`, and it does not have `/relationships` or `/timeline` sub-routes.

**Recommendation**: Before removing anything, add a test for `GET /contacts/:hash/relationships` to confirm it returns 404. If it does, the mobile clients are broken for these endpoints and this needs to be fixed as part of a separate epic, not this cleanup. The safe action for this spec is: **do not remove `/contacts`** until the mobile client endpoint mapping is fully audited and reconciled with the route structure.

**Action item for this spec**: Document the discrepancy. Create a follow-up investigation task. The `/contacts` route itself is actively used by the desktop client for the hash-based timeline view and should not be removed.

---

## 8. Success Criteria

All of the following must be true after this cleanup is merged:

1. `bun run typecheck` passes with zero errors.
2. `bun run build` passes.
3. `bun run test` (Playwright E2E) passes — no regressions.
4. `bun run test:backend:bdd` passes.
5. No TypeScript source file in `apps/worker/` (excluding `.wrangler/`) references `DOStub` or `DONamespace`.
6. No TypeScript source file in `apps/worker/` calls `getDOs()`, `getScopedDOs()`, `getHubDOs()`, `getTelephony()` (non-`FromService`), `getHubTelephony()` (non-`FromService`), `getMessagingAdapter()` (non-`FromService`), `createPushDispatcher()` (non-`FromService`), `authenticateRequestLegacy()`, or `dispatchVoipPush()` (non-`FromService`).
7. `apps/worker/lib/do-access.ts` does not exist — replaced by `apps/worker/lib/service-factories.ts`.
8. `apps/worker/__tests__/unit/do-access.test.ts` does not exist.
9. `apps/worker/__tests__/integration/cloudflare-workers-mock.ts` does not exist.
10. `apps/worker/wrangler.jsonc` has a comment explaining the DO bindings are for the CF demo deployment only.

### Verification commands

```bash
# Check for DOStub/DONamespace references in source
grep -rn "DOStub\|DONamespace" apps/worker/ --include="*.ts" | grep -v "\.wrangler"

# Check for dead DO function calls
grep -rn "getDOs\|getScopedDOs\|getHubDOs\|authenticateRequestLegacy\|createPushDispatcher\b\|dispatchVoipPush\b" \
  apps/worker/ --include="*.ts" | grep -v "\.wrangler\|service-factories"

# Check old import path is gone
grep -rn "from.*do-access" apps/worker/ --include="*.ts" | grep -v "\.wrangler"

# Full typecheck
bun run typecheck
```
