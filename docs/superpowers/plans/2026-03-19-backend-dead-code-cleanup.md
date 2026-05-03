# Backend Dead Code Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all DO-era dead code from `apps/worker/` — dead functions, dead types, dead tests — so automated agents can no longer mistake the graveyard for live code paths.
**Architecture:** Eight sequential tasks in dependency order: delete dead function bodies first (removing all `DOStub`/`DurableObjects` references), then delete the types themselves, then delete dead test files, then rename `do-access.ts` → `service-factories.ts` updating all import sites, then add the performance caching fix for `getRoles()`, and finally annotate `wrangler.jsonc`. Each task ends with `bunx tsc --noEmit` to verify no TypeScript regressions before committing.
**Tech Stack:** TypeScript, Bun, Vitest, `apps/worker/` only — no client, no mobile, no Rust changes.

---

### Task 1: Delete `authenticateRequestLegacy()` from `lib/auth.ts`

**Files:**
- Modify: `apps/worker/lib/auth.ts`

**Context:** Lines 87–121 are the entire `authenticateRequestLegacy()` function. It accepts a `identityDO: { fetch(req: Request): Promise<Response> }` parameter and has zero callers in source. `middleware/auth.ts` calls only `authenticateRequest()`. The function is self-contained — no helper functions are defined inside it.

- [ ] Delete lines 87–121 (the `@deprecated` JSDoc comment block through the closing `}` of `authenticateRequestLegacy()`). The file should end at line 85 after deletion.
- [ ] Verify no other file imports `authenticateRequestLegacy`:
  ```bash
  grep -rn "authenticateRequestLegacy" apps/worker/ --include="*.ts" | grep -v "\.wrangler"
  ```
  Expected: zero results.
- [ ] Run `bunx tsc --noEmit` — must pass.
- [ ] Commit: `git commit -m "remove: delete authenticateRequestLegacy() — DO-era dead code, zero callers"`

---

### Task 2: Delete `createPushDispatcher()` and `class LivePushDispatcher` from `lib/push-dispatch.ts`

**Files:**
- Modify: `apps/worker/lib/push-dispatch.ts`

**Context:**
- Line 10: `import type { Env, DeviceRecord, WakePayload, FullPushPayload, DOStub } from '../types'` — `DOStub` must be removed from this import.
- Lines 41–49: `createPushDispatcher()` function — accepts `identityDO: DOStub, shiftsDO: DOStub`. Zero callers in source.
- Lines 71–74: `class NoopPushDispatcher` — **KEEP** (live, used by both `createPushDispatcher` and `createPushDispatcherFromService`; after deletion only `createPushDispatcherFromService` uses it, but it must remain).
- Lines 76–232: `class LivePushDispatcher` — instantiated only by `createPushDispatcher()`. The class has private `identityDO: DOStub` and `shiftsDO: DOStub` fields. Delete the entire class.

- [ ] On line 10, remove `DOStub` from the import destructuring:
  ```typescript
  // Before
  import type { Env, DeviceRecord, WakePayload, FullPushPayload, DOStub } from '../types'
  // After
  import type { Env, DeviceRecord, WakePayload, FullPushPayload } from '../types'
  ```
- [ ] Delete lines 41–49: the `createPushDispatcher()` function (from `export function createPushDispatcher(` through the closing `}`).
- [ ] Delete lines 76–232: `class LivePushDispatcher` (from `class LivePushDispatcher implements PushDispatcher {` through the closing `}`). Note: `NoopPushDispatcher` at lines 71–74 is immediately before `LivePushDispatcher` — do not delete it.
- [ ] Verify no references to `createPushDispatcher` or `LivePushDispatcher` remain:
  ```bash
  grep -rn "createPushDispatcher\b\|LivePushDispatcher" apps/worker/ --include="*.ts" | grep -v "\.wrangler\|FromService"
  ```
  Expected: zero results.
- [ ] Run `bunx tsc --noEmit` — must pass.
- [ ] Commit: `git commit -m "remove: delete createPushDispatcher() and LivePushDispatcher — DO-era dead code"`

---

### Task 3: Delete `dispatchVoipPush()` from `lib/voip-push.ts`

**Files:**
- Modify: `apps/worker/lib/voip-push.ts`

**Context:**
- Line 15: `import type { Env, DOStub } from '../types'` — `DOStub` is only used by `dispatchVoipPush()`. After deletion, this becomes `import type { Env } from '../types'`.
- Line 16: `import type { DurableObjects } from '../lib/do-access'` — only used by `dispatchVoipPush()`. Delete the entire import line.
- Line 17: `import type { IdentityService } from '../services/identity'` — **KEEP** (used by `dispatchVoipPushFromService`).
- Lines 31–87: `dispatchVoipPush()` function — accepts `dos: DurableObjects`, calls `dos.identity.fetch()`. Delete it.

- [ ] Change line 15 from `import type { Env, DOStub } from '../types'` to `import type { Env } from '../types'`.
- [ ] Delete line 16: `import type { DurableObjects } from '../lib/do-access'` entirely.
- [ ] Delete lines 31–87: `dispatchVoipPush()` (from the JSDoc comment `/** Dispatch VoIP push...` through the closing `}`).
- [ ] Verify no references remain:
  ```bash
  grep -rn "dispatchVoipPush\b\|DurableObjects" apps/worker/ --include="*.ts" | grep -v "\.wrangler\|FromService\|service-factories"
  ```
  Expected: zero results for `dispatchVoipPush\b` outside `FromService` callers; zero results for `DurableObjects`.
- [ ] Run `bunx tsc --noEmit` — must pass.
- [ ] Commit: `git commit -m "remove: delete dispatchVoipPush() — DO-era dead code, only FromService variant is live"`

---

### Task 4: Delete all DO-era dead code from `lib/do-access.ts`

**Files:**
- Modify: `apps/worker/lib/do-access.ts`

**Context:** After tasks 2 and 3, no code in source references `DurableObjects`, `HubDurableObjects`, `getDOs()`, `getScopedDOs()`, `getHubDOs()`, `getTelephony()`, `getHubTelephony()`, or `getMessagingAdapter()`. The file currently has 311 lines. After this task it will contain only the `*FromService` variants and `getNostrPublisher()`.

Blocks to delete (line ranges as of the current file):
- Line 1: `import type { Env, DOStub } from '../types'` → change to `import type { Env } from '../types'` (DOStub is only used by the dead interfaces/functions).
- Lines 16–24: DO ID constants (`IDENTITY_ID` through `CASE_MANAGER_ID`).
- Lines 26–36: `export interface DurableObjects { ... }`.
- Lines 38–50: `export function getDOs(env: Env): DurableObjects { ... }`.
- Lines 52–60: `export interface HubDurableObjects { ... }`.
- Lines 62–86: `export function getScopedDOs(...)` and `export function getHubDOs(...)`.
- Lines 88–112: `export async function getTelephony(env: Env, dos: DurableObjects): Promise<TelephonyAdapter | null> { ... }` (includes the JSDoc at line 88).
- Lines 140–152: `export async function getHubTelephony(env: Env, hubId: string): Promise<TelephonyAdapter | null> { ... }` (includes the JSDoc).
- Lines 179–217: `export async function getMessagingAdapter(channel, dos, hmacSecret)` (includes the JSDoc). Note: the comment at `routes/records.ts:1073` referencing this function will remain as documentation — that is fine.

**What must remain in the file (verify before editing):**
- Lines 114–134: `getTelephonyFromService()` — live, called by `routes/telephony.ts`, `routes/calls.ts`, `services/ringing.ts`, `services/transcription.ts`.
- Lines 154–173: `getHubTelephonyFromService()` — live, called by `services/ringing.ts`, `routes/records.ts`.
- Lines 219–258: `getMessagingAdapterFromService()` — live, called by `routes/conversations.ts`, `routes/records.ts`, `messaging/router.ts`.
- Lines 260–283: `getNostrPublisher()` — live, called by `lib/nostr-events.ts`.
- Lines 285–311: `createAdapterFromConfig()` (private) — used by both `getTelephonyFromService` and `getMessagingAdapterFromService`.
- All imports that support the above (lines 2–14: telephony/messaging adapters, nostr-publisher).

- [ ] Change line 1: `import type { Env, DOStub } from '../types'` → `import type { Env } from '../types'`.
- [ ] Delete lines 16–24 (DO ID constants block).
- [ ] Delete lines 26–36 (`interface DurableObjects`).
- [ ] Delete lines 38–50 (`getDOs()`).
- [ ] Delete lines 52–60 (`interface HubDurableObjects`).
- [ ] Delete lines 62–86 (`getScopedDOs()` and `getHubDOs()`).
- [ ] Delete lines 88–112 (`getTelephony()` with its JSDoc).
- [ ] Delete lines 140–152 (`getHubTelephony()` with its JSDoc).
- [ ] Delete lines 179–217 (`getMessagingAdapter()` with its JSDoc).
- [ ] Verify dead symbols are gone:
  ```bash
  grep -rn "getDOs\|getScopedDOs\|getHubDOs\|getTelephony\b\|getHubTelephony\b\|getMessagingAdapter\b\|DurableObjects\|HubDurableObjects\|DOStub" \
    apps/worker/ --include="*.ts" | grep -v "\.wrangler\|FromService\|service-factories"
  ```
  Expected: zero results (except any remaining `DOStub` in `types.ts` which is the next task).
- [ ] Run `bunx tsc --noEmit` — must pass.
- [ ] Commit: `git commit -m "remove: delete all DO accessor functions from do-access.ts — only service-layer factories remain"`

---

### Task 5: Delete `DOStub`, `DONamespace`, and 9 DO fields from `types.ts`; update `helpers.ts`

**Files:**
- Modify: `apps/worker/types.ts`
- Modify: `apps/worker/__tests__/integration/helpers.ts`

**Context:** After task 4, `DOStub` and `DONamespace` are referenced only in `types.ts` itself and in `__tests__/integration/helpers.ts` (line 13: `import type { Env, DONamespace, DOStub } from '@worker/types'`, lines 104–112 setting the 9 DO namespace fields on `Env`, lines 130–137 the `createMockDONamespace()` function). The `Env` interface's 9 DO fields must go. The `helpers.ts` mock env must be updated to stop creating DO namespaces.

**In `types.ts`:**
- Lines 22–25: delete `interface DOStub { ... }` (4 lines including the JSDoc comment at line 22).
- Lines 27–31: delete `interface DONamespace { ... }` (5 lines).
- Lines 34–43: delete the 9 DO namespace fields from `interface Env` (`CALL_ROUTER` through `CASE_MANAGER`). Keep everything after line 43 (`AI`, `R2_BUCKET`, etc.).

**In `__tests__/integration/helpers.ts`:**
- Line 13: change `import type { Env, DONamespace, DOStub } from '@worker/types'` → `import type { Env } from '@worker/types'`.
- Lines 104–112: remove the 9 DO namespace lines from `createMockEnv()` (the `CALL_ROUTER:`, `SHIFT_MANAGER:`, `IDENTITY_DO:`, `SETTINGS_DO:`, `RECORDS_DO:`, `CONVERSATION_DO:`, `BLAST_DO:`, `CONTACT_DIRECTORY:`, `CASE_MANAGER:` properties).
- Lines 130–137: delete `function createMockDONamespace(): DONamespace { ... }` entirely.

**In `__tests__/unit/do-access.test.ts`:** This file also constructs a mock `Env` with the 9 DO fields (`createMockEnv()` at lines 23–44). However, this entire test file is deleted in Task 6 — so no edits needed here.

- [ ] In `apps/worker/types.ts`, delete lines 22–25 (the `/** Minimal DurableObjectStub... */` comment and `interface DOStub { ... }`).
- [ ] In `apps/worker/types.ts`, delete lines 27–31 (the `/** Minimal DurableObjectNamespace... */` comment and `interface DONamespace { ... }`).
- [ ] In `apps/worker/types.ts`, delete lines 34–43 (the 9 DO namespace fields from `interface Env`, from `// Durable Object namespaces...` comment through `CASE_MANAGER: DONamespace`).
- [ ] In `apps/worker/__tests__/integration/helpers.ts`, change line 13's import to remove `DONamespace` and `DOStub`.
- [ ] In `apps/worker/__tests__/integration/helpers.ts`, remove the 9 DO namespace property assignments from `createMockEnv()`'s `defaultEnv` object (lines 104–112).
- [ ] In `apps/worker/__tests__/integration/helpers.ts`, delete `function createMockDONamespace()` and its body.
- [ ] Verify no remaining references to `DOStub` or `DONamespace` in source:
  ```bash
  grep -rn "DOStub\|DONamespace" apps/worker/ --include="*.ts" | grep -v "\.wrangler\|do-access.test.ts"
  ```
  Expected: zero results (the `do-access.test.ts` file is also deleted next but might still be present; it's excluded from this check).
- [ ] Run `bunx tsc --noEmit` — must pass.
- [ ] Commit: `git commit -m "remove: delete DOStub, DONamespace, and 9 DO Env fields — Env now reflects Bun+PostgreSQL backend"`

---

### Task 6: Delete dead test files

**Files:**
- Delete: `apps/worker/__tests__/unit/do-access.test.ts`
- Delete: `apps/worker/__tests__/integration/cloudflare-workers-mock.ts`

**Context:**
- `do-access.test.ts`: Tests only `getDOs()`, `getScopedDOs()`, `getHubDOs()` mock patterns and the now-deleted `DOStub`/`DONamespace` types from `Env`. All 127 lines test the dead DO patterns. The `Env type structure` tests at lines 107–126 are redundant — the integration `helpers.ts` mock already exercises this.
- `cloudflare-workers-mock.ts`: Exports a `DurableObject` base class stub. As confirmed by `grep -rn "cloudflare-workers-mock" apps/worker/` returning zero results outside the file itself, nothing imports it.

- [ ] Confirm `do-access.test.ts` has no outside importers:
  ```bash
  grep -rn "do-access.test" apps/worker/ --include="*.ts" | grep -v "\.wrangler"
  ```
  Expected: zero results.
- [ ] Confirm `cloudflare-workers-mock.ts` has no outside importers:
  ```bash
  grep -rn "cloudflare-workers-mock" apps/worker/ --include="*.ts" | grep -v "\.wrangler"
  ```
  Expected: zero results.
- [ ] Delete `apps/worker/__tests__/unit/do-access.test.ts`.
- [ ] Delete `apps/worker/__tests__/integration/cloudflare-workers-mock.ts`.
- [ ] Run `bunx tsc --noEmit` — must pass.
- [ ] Run `bun run test:backend:bdd` or the unit test suite — must pass.
- [ ] Commit: `git commit -m "remove: delete do-access.test.ts and cloudflare-workers-mock.ts — DO test artifacts"`

---

### Task 7: Rename `lib/do-access.ts` → `lib/service-factories.ts` and update all import sites

**Files:**
- Rename: `apps/worker/lib/do-access.ts` → `apps/worker/lib/service-factories.ts`
- Modify: `apps/worker/lib/nostr-events.ts` (line 2)
- Modify: `apps/worker/lib/voip-push.ts` (line 16 — deleted in task 3, so no longer present; skip)
- Modify: `apps/worker/messaging/router.ts` (line 5)
- Modify: `apps/worker/routes/records.ts` (line 4)
- Modify: `apps/worker/routes/telephony.ts` (line 3)
- Modify: `apps/worker/routes/conversations.ts` (line 5)
- Modify: `apps/worker/routes/calls.ts` (line 5)
- Modify: `apps/worker/services/ringing.ts` (line 3)
- Modify: `apps/worker/services/transcription.ts` (line 3)
- Modify: `apps/worker/__tests__/unit/nostr-events.test.ts` (line 4 and line 14 — mock path and import)

**Context:** After tasks 1–6, all import sites for `do-access` import only from the `*FromService` functions and `getNostrPublisher`. The file name `do-access` is now actively misleading. The rename is a mechanical file rename + sed across 9 source files and 1 test file.

Confirmed importers (from grep in Task 4 verification step):
1. `apps/worker/lib/nostr-events.ts:2` — `import { getNostrPublisher } from './do-access'`
2. `apps/worker/messaging/router.ts:5` — `import { getMessagingAdapterFromService } from '../lib/do-access'`
3. `apps/worker/routes/records.ts:4` — `import { getMessagingAdapterFromService } from '../lib/do-access'`
4. `apps/worker/routes/telephony.ts:3` — `import { getTelephonyFromService, getHubTelephonyFromService } from '../lib/do-access'`
5. `apps/worker/routes/conversations.ts:5` — `import { getMessagingAdapterFromService } from '../lib/do-access'`
6. `apps/worker/routes/calls.ts:5` — `import { getTelephonyFromService } from '../lib/do-access'`
7. `apps/worker/services/ringing.ts:3` — `import { getTelephonyFromService, getHubTelephonyFromService } from '../lib/do-access'`
8. `apps/worker/services/transcription.ts:3` — `import { getTelephonyFromService } from '../lib/do-access'`
9. `apps/worker/__tests__/unit/nostr-events.test.ts:4,14` — `vi.mock('@worker/lib/do-access', ...)` and `import { getNostrPublisher } from '@worker/lib/do-access'`

- [ ] Re-confirm the import sites list is still accurate after tasks 1–6:
  ```bash
  grep -rn "from.*do-access\|mock.*do-access" apps/worker/ --include="*.ts" | grep -v "\.wrangler"
  ```
- [ ] Rename the file:
  ```bash
  mv apps/worker/lib/do-access.ts apps/worker/lib/service-factories.ts
  ```
- [ ] Update each import site — replace `./do-access` or `../lib/do-access` or `@worker/lib/do-access` with the new path:
  - `apps/worker/lib/nostr-events.ts:2`: `'./do-access'` → `'./service-factories'`
  - `apps/worker/messaging/router.ts:5`: `'../lib/do-access'` → `'../lib/service-factories'`
  - `apps/worker/routes/records.ts:4`: `'../lib/do-access'` → `'../lib/service-factories'`
  - `apps/worker/routes/telephony.ts:3`: `'../lib/do-access'` → `'../lib/service-factories'`
  - `apps/worker/routes/conversations.ts:5`: `'../lib/do-access'` → `'../lib/service-factories'`
  - `apps/worker/routes/calls.ts:5`: `'../lib/do-access'` → `'../lib/service-factories'`
  - `apps/worker/services/ringing.ts:3`: `'../lib/do-access'` → `'../lib/service-factories'`
  - `apps/worker/services/transcription.ts:3`: `'../lib/do-access'` → `'../lib/service-factories'`
  - `apps/worker/__tests__/unit/nostr-events.test.ts:4`: `'@worker/lib/do-access'` → `'@worker/lib/service-factories'`
  - `apps/worker/__tests__/unit/nostr-events.test.ts:14`: `'@worker/lib/do-access'` → `'@worker/lib/service-factories'`
- [ ] Verify no remaining references to `do-access`:
  ```bash
  grep -rn "do-access" apps/worker/ --include="*.ts" | grep -v "\.wrangler"
  ```
  Expected: zero results.
- [ ] Run `bunx tsc --noEmit` — must pass.
- [ ] Run full verification suite (see Task 8 below for commands).
- [ ] Commit: `git commit -m "rename: do-access.ts → service-factories.ts — name now reflects actual contents"`

---

### Task 8: Add `getRoles()` TTL cache in `services/settings.ts` with invalidation in `routes/settings.ts`

**Files:**
- Modify: `apps/worker/services/settings.ts`
- Modify: `apps/worker/routes/settings.ts`

**Context:** `middleware/auth.ts` calls `services.settings.getRoles()` on every authenticated request (line 59). The roles table is small and infrequently mutated. A 30-second module-level TTL cache eliminates the per-request DB round-trip. Cache must be invalidated after successful `createRole`, `updateRole`, and `deleteRole` mutations.

`SettingsService` is a class at line 159 of `services/settings.ts`. The cache lives at module level (outside the class) so it persists across instances. The `getRoles()` method is at line 1101.

The mutation endpoints that need cache invalidation (all in `routes/settings.ts`):
- `POST /roles` (line 810) — calls `services.settings.createRole()`, then `audit(...)`.
- `PATCH /roles/:id` (line 838) — calls `services.settings.updateRole()`.
- `DELETE /roles/:id` (line 867) — calls `services.settings.deleteRole()`.

**Implementation:**

In `services/settings.ts`, add before the `SettingsService` class definition (before line 159):
```typescript
// Module-level TTL cache for roles (30s TTL — roles change rarely, auth runs every request)
let _rolesCache: { roles: import('@shared/permissions').Role[]; expiresAt: number } | null = null
const ROLES_CACHE_TTL_MS = 30_000

export function invalidateRolesCache(): void {
  _rolesCache = null
}
```

Replace the `getRoles()` method body (currently lines 1101–1115):
```typescript
async getRoles(): Promise<{ roles: Role[] }> {
  const now = Date.now()
  if (_rolesCache && _rolesCache.expiresAt > now) {
    return { roles: _rolesCache.roles }
  }
  const rows = await this.db.select().from(rolesTable)
  const rolesList: Role[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    permissions: r.permissions,
    isDefault: r.isDefault ?? false,
    isSystem: r.isSystem ?? false,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))
  _rolesCache = { roles: rolesList, expiresAt: now + ROLES_CACHE_TTL_MS }
  return { roles: rolesList }
}
```

In `routes/settings.ts`, import `invalidateRolesCache` and call it after each mutation:
```typescript
// Add to existing import from '@worker/services/settings' or add a new import:
import { invalidateRolesCache } from '../services/settings'
```
Then in each mutation handler after the service call succeeds:
- After `services.settings.createRole(body)` — add `invalidateRolesCache()`.
- After `services.settings.updateRole(id, body)` — add `invalidateRolesCache()`.
- After `services.settings.deleteRole(id)` — add `invalidateRolesCache()`.

- [ ] In `apps/worker/services/settings.ts`, add the module-level cache variables and `invalidateRolesCache()` export directly above the `SettingsService` class definition (line 159).
- [ ] Replace the body of `getRoles()` with the cache-checking version (lines 1101–1115). Keep the method signature identical.
- [ ] In `apps/worker/routes/settings.ts`, add an import for `invalidateRolesCache` from `'../services/settings'`.
- [ ] In the `POST /roles` handler (line 828–835), call `invalidateRolesCache()` after `services.settings.createRole(body)` succeeds (before the `return c.json(result, 201)`).
- [ ] In the `PATCH /roles/:id` handler (line 856–864), call `invalidateRolesCache()` after `services.settings.updateRole(id, body)` succeeds.
- [ ] In the `DELETE /roles/:id` handler (line 883–891), call `invalidateRolesCache()` after `services.settings.deleteRole(id)` succeeds.
- [ ] Run `bunx tsc --noEmit` — must pass.
- [ ] Commit: `git commit -m "perf: add 30s TTL cache for getRoles() — eliminates per-request DB round-trip in auth middleware"`

---

### Task 9: Annotate `wrangler.jsonc` with purpose comment

**Files:**
- Modify: `apps/worker/wrangler.jsonc`

**Context:** The DO bindings and `migrations` block exist for the `demo.llamenos-platform.com` CF deployment. The real production backend (Bun+PostgreSQL, Docker/Helm) does not use them. A reader unfamiliar with the history cannot tell this from the file. The spec says: documentation only, do not remove the bindings.

- [ ] Add a comment block before the `// Durable Object bindings` comment on line 16 of `wrangler.jsonc`:
  ```jsonc
  // NOTE: The DO bindings and migrations below are for the demo.llamenos-platform.com
  // Cloudflare Workers deployment ONLY. The production backend runs as Bun+PostgreSQL
  // (self-hosted via Docker/Helm) and does NOT use Durable Objects — they were removed
  // in Epic 358. Do not add DO patterns to the main codebase.
  ```
  Also add the same note at the start of the `"env": { "next": ... }` block's `durable_objects` section (line 133).
- [ ] Run `bunx tsc --noEmit` — must pass (this is a `.jsonc` change, should have no TS impact).
- [ ] Commit: `git commit -m "docs: clarify wrangler.jsonc DO bindings are for CF demo deployment only"`

---

### Final Verification

After all 9 tasks are complete, run the full success criteria check:

```bash
# 1. No DOStub/DONamespace in source
grep -rn "DOStub\|DONamespace" apps/worker/ --include="*.ts" | grep -v "\.wrangler"

# 2. No dead DO function calls
grep -rn "getDOs\|getScopedDOs\|getHubDOs\|authenticateRequestLegacy\|createPushDispatcher\b\|dispatchVoipPush\b" \
  apps/worker/ --include="*.ts" | grep -v "\.wrangler\|service-factories"

# 3. Old import path is gone
grep -rn "from.*do-access\|mock.*do-access" apps/worker/ --include="*.ts" | grep -v "\.wrangler"

# 4. Old file is gone
ls apps/worker/lib/do-access.ts 2>&1 | grep "No such file"

# 5. New file exists
ls apps/worker/lib/service-factories.ts

# 6. Deleted test files are gone
ls apps/worker/__tests__/unit/do-access.test.ts 2>&1 | grep "No such file"
ls apps/worker/__tests__/integration/cloudflare-workers-mock.ts 2>&1 | grep "No such file"

# 7. TypeScript clean
bunx tsc --noEmit

# 8. Build passes
bun run build

# 9. Backend BDD tests pass
bun run test:backend:bdd

# 10. Playwright E2E passes
bun run test
```
