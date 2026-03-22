# Code Quality — Production Risk Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five classes of production-risk defects (plaintext race condition, silent error swallowing, hardcoded CORS origins, placeholder base URLs, and type assertion bypasses) across the desktop client, worker backend, and asterisk bridge.

**Architecture:** Each issue is a self-contained surgical change — no new files, no API changes, no schema changes. Issues are ordered by risk: confidentiality fix first, then CORS configurability, then observability, then code clarity. All changes stay within the `desktop` branch and must leave `bun run typecheck`, `bun run build`, and `bun run test:backend:bdd` green.

**Tech Stack:** Bun, Hono, TypeScript, Drizzle ORM (bun-sql), Tauri IPC (platform.ts abstraction), Zod

---

## File Map

| File | Change |
|------|--------|
| `src/client/lib/offline-queue.ts` | Make `save()` async, remove plaintext write, encrypt-first |
| `apps/worker/lib/auth.ts` | Add `console.warn` to empty catch blocks |
| `apps/worker/middleware/permission-guard.ts` | Add `console.warn` to `requireEntityTypeAccess` catch |
| `apps/worker/messaging/router.ts` | Add `console.error` to push dispatch catch |
| `apps/worker/lib/nostr-outbox.ts` | No change needed — outbox drain already logs (audit confirmed) |
| `apps/worker/lib/service-factories.ts` | Add `console.error` to telephony config catch blocks |
| `apps/worker/middleware/cors.ts` | Refactor to `buildAllowedOrigins()` using `CORS_ALLOWED_ORIGINS` env var |
| `apps/worker/types/infra.ts` | Add `CORS_ALLOWED_ORIGINS?: string` to `Env` interface |
| `asterisk-bridge/src/webhook-sender.ts` | Replace 6 `'http://placeholder'` bases with `this.config.workerWebhookUrl` |
| `apps/worker/db/index.ts` | Replace `(db as any).$client` with explicit typed cast |
| `apps/worker/messaging/rcs/adapter.ts` | Replace `as unknown as GoogleServiceAccountKey` with typed `JSON.parse` |

---

## Task 1: Fix offline-queue plaintext race condition (Issue 1)

**Files:**
- Modify: `src/client/lib/offline-queue.ts`

**Context:** The current `save()` method writes plaintext JSON to `localStorage` immediately, then asynchronously overwrites with the encrypted version. A crash between those two writes leaves plaintext data on disk (Tauri maps `localStorage` to a file). The fix: make `save()` async, always encrypt first, never write plaintext. If encryption is unavailable (key not loaded), the queue stays in memory only — this is an accepted tradeoff documented in the spec.

The `save()` method is called from `enqueue()` (line ~119), `remove()` (line ~129), `clear()` (line ~138), and inside `replay()` (line ~218). These callers are synchronous, so `save()` will be called as `void this.save()` — fire-and-forget is acceptable (best-effort persistence).

- [ ] **Step 1: Locate the current `save()` method**

Search for the method to confirm current line numbers (spec says ~283):

```bash
grep -n "private save\(\)" src/client/lib/offline-queue.ts
```

Expected output: one match, showing the method signature.

- [ ] **Step 2: Replace `save()` with the async encrypt-first version**

In `src/client/lib/offline-queue.ts`, replace the entire `private save(): void { … }` method body (the current ~17 lines) with:

```typescript
private async save(): Promise<void> {
  const json = JSON.stringify(this.queue)
  try {
    const { encryptDraft } = await import('./platform')
    const encrypted = await encryptDraft(json)
    if (encrypted) {
      localStorage.setItem(STORAGE_KEY, encrypted)
    }
    // If encryption returned null (key not loaded), do not persist —
    // queue remains in memory only. It will be persisted on next
    // save() call after crypto is unlocked.
  } catch {
    // encryptDraft unavailable (test build or crypto not initialized)
    // Do not fall back to plaintext. Queue stays in memory.
  }
}
```

- [ ] **Step 3: Verify all `save()` call sites use `void`**

Run:

```bash
grep -n "this\.save()" src/client/lib/offline-queue.ts
```

Every call site that is synchronous (inside `enqueue`, `remove`, `clear`, `replay`) must call `void this.save()` or `void this.save()`. If any call site is just `this.save()` without `void` or `await`, add `void ` prefix. The `replay()` method is itself async and calls `this.save()` at line ~218 — it can use `void this.save()` (fire-and-forget is acceptable for replay).

- [ ] **Step 4: Run typecheck to verify**

```bash
bun run typecheck
```

Expected: no errors related to `offline-queue.ts`. The `void` on an async call is valid TypeScript.

- [ ] **Step 5: Run build to verify**

```bash
bun run build
```

Expected: clean build, no `offline-queue` errors.

- [ ] **Step 6: Commit**

```bash
git add src/client/lib/offline-queue.ts
git commit -m "fix(security): offline queue save() — encrypt-first, never write plaintext to localStorage

Queue now stays in memory if crypto is not yet unlocked.
Accepted tradeoff: queued ops lost on restart while locked.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Fix CORS hardcoded origins — add `CORS_ALLOWED_ORIGINS` env var (Issue 3)

**Files:**
- Modify: `apps/worker/middleware/cors.ts`
- Modify: `apps/worker/types/infra.ts`

**Context:** The `ALLOWED_ORIGINS` set in `cors.ts` hardcodes `https://app.llamenos.org` and `https://demo.llamenos-hotline.com`. Self-hosters cannot override without editing source. The fix adds a `CORS_ALLOWED_ORIGINS` env var (comma-separated). When set, it replaces the hardcoded production defaults. The development localhost fallback (`http://localhost:5173`, `http://localhost:1420`) is only active when `ENVIRONMENT=development` AND `CORS_ALLOWED_ORIGINS` is unset.

The BDD test suite runs with `ENVIRONMENT=development` and does not set `CORS_ALLOWED_ORIGINS`, so the localhost fallback will continue to work for tests without any change.

- [ ] **Step 1: Add `CORS_ALLOWED_ORIGINS` to `Env` interface**

In `apps/worker/types/infra.ts`, locate the `Env` interface (currently around line 35). After the line for `ENVIRONMENT: string`, add:

```typescript
CORS_ALLOWED_ORIGINS?: string   // Comma-separated allowed origins (overrides hardcoded defaults)
```

- [ ] **Step 2: Refactor `cors.ts` to use `buildAllowedOrigins`**

Replace the entire contents of `apps/worker/middleware/cors.ts` with:

```typescript
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'

/** Tauri origins are always allowed (desktop client). */
const TAURI_ORIGINS = new Set([
  'tauri://localhost',
  'https://tauri.localhost',
])

/**
 * Build the allowed origins set from env config.
 *
 * When CORS_ALLOWED_ORIGINS is set (comma-separated), those origins are used
 * instead of the hardcoded production defaults. This enables self-hosters to
 * configure their own deployment hostname without editing source code.
 *
 * Tauri origins are always included regardless of env config.
 */
function buildAllowedOrigins(env: { CORS_ALLOWED_ORIGINS?: string }): Set<string> {
  const base = new Set(TAURI_ORIGINS)
  if (env.CORS_ALLOWED_ORIGINS) {
    for (const origin of env.CORS_ALLOWED_ORIGINS.split(',')) {
      const trimmed = origin.trim()
      if (trimmed) base.add(trimmed)
    }
  } else {
    // Default production origins when env var not set
    base.add('https://app.llamenos.org')
    base.add('https://demo.llamenos-hotline.com')
  }
  return base
}

function isAllowedOrigin(
  origin: string,
  env: { ENVIRONMENT: string; CORS_ALLOWED_ORIGINS?: string },
): boolean {
  if (buildAllowedOrigins(env).has(origin)) return true
  // Development fallback: localhost ports — only when CORS_ALLOWED_ORIGINS is not explicitly set
  if (env.ENVIRONMENT === 'development' && !env.CORS_ALLOWED_ORIGINS) {
    if (origin === 'http://localhost:5173' || origin === 'http://localhost:1420') return true
  }
  return false
}

export const cors = createMiddleware<AppEnv>(async (c, next) => {
  const requestOrigin = c.req.header('Origin') || ''
  const allowed = isAllowedOrigin(requestOrigin, c.env)
  const allowedOrigin = allowed ? requestOrigin : ''

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Version',
        'Vary': 'Origin',
      },
    })
  }

  await next()

  if (allowedOrigin) {
    c.header('Access-Control-Allow-Origin', allowedOrigin)
    // Expose version negotiation headers to client JS (Epic 288)
    c.header('Access-Control-Expose-Headers', 'X-Min-Version, X-Current-Version')
  }
  c.header('Vary', 'Origin')
})
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors. The `AppEnv` bindings type flows through `c.env` which is typed as `Env`, and `CORS_ALLOWED_ORIGINS` is now declared there.

- [ ] **Step 4: Run BDD tests to confirm no CORS regression**

The BDD tests run with `ENVIRONMENT=development` and don't set `CORS_ALLOWED_ORIGINS`, so the localhost fallback applies. Start the dev backend first (see CLAUDE.md dev setup), then:

```bash
bun run test:backend:bdd
```

Expected: all tests pass (same count as before this change).

- [ ] **Step 5: Manual CORS verification**

To manually verify the new env var works, start the server with:

```bash
CORS_ALLOWED_ORIGINS=https://custom.example.com bun run dev:server
```

Then confirm with curl that `https://custom.example.com` gets the header and `http://localhost:5173` does not (in production mode):

```bash
curl -s -H "Origin: https://custom.example.com" -I http://localhost:3000/api/health | grep -i "access-control"
```

Expected: `Access-Control-Allow-Origin: https://custom.example.com`

- [ ] **Step 6: Commit**

```bash
git add apps/worker/middleware/cors.ts apps/worker/types/infra.ts
git commit -m "feat(cors): add CORS_ALLOWED_ORIGINS env var for self-hosted deployments

Replaces hardcoded production origin set with configurable comma-separated
list. Tauri origins always allowed. Dev localhost fallback retained when
CORS_ALLOWED_ORIGINS is unset and ENVIRONMENT=development.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Add logging to empty catch blocks in critical paths (Issue 2)

**Files:**
- Modify: `apps/worker/lib/auth.ts`
- Modify: `apps/worker/middleware/permission-guard.ts`
- Modify: `apps/worker/lib/service-factories.ts`
- Modify: `apps/worker/messaging/router.ts`

**Context:** The spec identifies several `} catch {` blocks in critical paths that swallow errors silently. Reading the actual code, the picture is:

- `apps/worker/lib/auth.ts`: Two `} catch {` blocks in `authenticateRequest()` — one for session token validation (line ~65), one for user lookup (line ~82). Both correctly return `null`, but don't log the error. Add `console.warn`.
- `apps/worker/lib/service-factories.ts`: Two `} catch {` blocks — one in `getTelephonyFromService()` (line ~27) falling through to env var defaults, one in `getHubTelephonyFromService()` (line ~53) falling through to global config. Both are intentional fall-throughs, but deserve logging so failed config reads are visible.
- `apps/worker/messaging/router.ts`: The push dispatch catch block at line ~193 is already commented `// Push dispatch failure should not affect webhook response` — it should log the error.
- `apps/worker/middleware/permission-guard.ts`: The `requireEntityTypeAccess` catch at line ~73 returns 404 when `getEntityTypeById` throws. This is correct for not-found errors, but a DB error would also be silently turned into a 404. Add `console.warn` so operators can distinguish the cases.
- `apps/worker/lib/nostr-outbox.ts`: Confirmed — the catch at line ~60 is inside `parseJsonbValue()`, an intentional JSON probe (`// Not valid JSON`). The drain function itself already logs with `console.error`. No change needed.

**Policy:** Change `} catch {` to `} catch (e) {` and add the log line. Do NOT change any throw/return behaviour.

### 3a: Fix `apps/worker/lib/auth.ts`

- [ ] **Step 1: Locate and update the session validation catch**

In `apps/worker/lib/auth.ts`, find `authenticateRequest`. The first `} catch {` (around line 65) is inside the session token path. Change:

```typescript
    } catch {
      return null
    }
```

to:

```typescript
    } catch (e) {
      console.warn('[auth] Session token validation failed:', e)
      return null
    }
```

- [ ] **Step 2: Locate and update the user lookup catch**

The second `} catch {` (around line 82) is inside the Schnorr auth path. Change:

```typescript
  } catch {
    return null
  }
```

to:

```typescript
  } catch (e) {
    console.warn('[auth] User lookup failed:', e)
    return null
  }
```

### 3b: Fix `apps/worker/middleware/permission-guard.ts`

- [ ] **Step 3: Update entity type lookup catch in `requireEntityTypeAccess`**

In `apps/worker/middleware/permission-guard.ts`, find `requireEntityTypeAccess`. The `} catch {` after `getEntityTypeById` (around line 73) returns 404. A genuine not-found is expected, but a DB error would be silently turned into a 404. Change:

```typescript
    } catch {
      return c.json({ error: 'Entity type not found' }, 404)
    }
```

to:

```typescript
    } catch (e) {
      console.warn('[permission-guard] getEntityTypeById failed for', entityTypeId, e)
      return c.json({ error: 'Entity type not found' }, 404)
    }
```

### 3d: Fix `apps/worker/lib/service-factories.ts`

- [ ] **Step 4: Update telephony config catch in `getTelephonyFromService`**

In `apps/worker/lib/service-factories.ts`, find `getTelephonyFromService`. The `} catch {` after the settings service call (around line 27) silently falls through to env var defaults. Change:

```typescript
  } catch {
    // Fall through to env var defaults
  }
```

to:

```typescript
  } catch (e) {
    console.warn('[service-factories] getTelephonyProvider failed, falling back to env vars:', e)
  }
```

- [ ] **Step 5: Update hub telephony catch in `getHubTelephonyFromService`**

The `} catch {` in `getHubTelephonyFromService` (around line 53) falls through to global config. Change:

```typescript
  } catch {
    // Fall through to global
  }
```

to:

```typescript
  } catch (e) {
    console.warn('[service-factories] getHubTelephonyProvider failed for hub, falling back to global:', e)
  }
```

### 3e: Fix `apps/worker/messaging/router.ts`

- [ ] **Step 6: Update push dispatch catch**

In `apps/worker/messaging/router.ts`, find the `waitUntil` block for push dispatch (around line 175). The inner `} catch {` (around line 193) has a comment but no logging. Change:

```typescript
      } catch {
        // Push dispatch failure should not affect webhook response
      }
```

to:

```typescript
      } catch (e) {
        // Push dispatch failure should not affect webhook response
        console.error('[messaging] Push dispatch failed for conversation:', convResult.conversationId, e)
      }
```

- [ ] **Step 6: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors. Adding `(e)` and `console.warn/error` is pure additive.

- [ ] **Step 7: Run build**

```bash
bun run build
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/worker/lib/auth.ts apps/worker/middleware/permission-guard.ts apps/worker/lib/service-factories.ts apps/worker/messaging/router.ts
git commit -m "fix(observability): add logging to silent catch blocks in critical paths

auth: session/user-lookup failures now warn. permission-guard: DB errors
behind getEntityTypeById no longer silently become 404. service-factories:
telephony config fallbacks log the underlying error. messaging: push dispatch
failures log with conversation ID. No throw/return behaviour changed.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Replace placeholder base URLs in asterisk-bridge (Issue 5)

**Files:**
- Modify: `asterisk-bridge/src/webhook-sender.ts`

**Context:** `webhook-sender.ts` uses `'http://placeholder'` as the base for `new URL(action, base)` in 6 places (lines 148, 179, 180, 221, 248, 249, 271). `BridgeConfig.workerWebhookUrl` is already present on `this.config` (the constructor receives it). Replace all 6 occurrences with `this.config.workerWebhookUrl` so relative TwiML callback paths resolve against the actual worker URL.

- [ ] **Step 1: Verify the 6 placeholder occurrences**

```bash
grep -n "http://placeholder" asterisk-bridge/src/webhook-sender.ts
```

Expected: 6 matches at the line numbers above.

- [ ] **Step 2: Replace all occurrences**

In `asterisk-bridge/src/webhook-sender.ts`, replace every:

```typescript
new URL(someVar, 'http://placeholder')
```

with:

```typescript
new URL(someVar, this.config.workerWebhookUrl)
```

There are 6 such calls. Do a global replace across the file. The exact variable names differ per call (`action`, `waitUrl`, `recordingCallback`, `statusCallback`, `redirectPath`) — use the `replace_all` approach for just the base string:

Replace `'http://placeholder'` with `this.config.workerWebhookUrl` (replace_all: true).

- [ ] **Step 3: Verify the change**

```bash
grep -n "placeholder\|workerWebhookUrl" asterisk-bridge/src/webhook-sender.ts
```

Expected: zero `placeholder` matches; multiple `workerWebhookUrl` matches (the existing `let url = \`...\`` line plus the 6 new ones).

- [ ] **Step 4: Typecheck the asterisk-bridge (if a tsconfig exists)**

```bash
ls asterisk-bridge/tsconfig.json 2>/dev/null && cd asterisk-bridge && bun run typecheck 2>/dev/null || echo "no tsconfig — skipping"
```

If typecheck is available, run it. If not, the change is a string literal replacement with no type impact.

- [ ] **Step 5: Run root typecheck**

```bash
bun run typecheck
```

Expected: clean (asterisk-bridge may not be in the root tsconfig, but verify no regressions).

- [ ] **Step 6: Commit**

```bash
git add asterisk-bridge/src/webhook-sender.ts
git commit -m "fix(asterisk-bridge): replace placeholder base URL with actual workerWebhookUrl

new URL(path, 'http://placeholder') was misleading and would silently
resolve to http://placeholder/ if action was empty. Using
this.config.workerWebhookUrl resolves relative TwiML callbacks against
the real worker endpoint.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Fix type assertion bypasses (Issue 6)

**Files:**
- Modify: `apps/worker/db/index.ts`
- Modify: `apps/worker/messaging/rcs/adapter.ts`

**Context:**

**6a** — `apps/worker/db/index.ts` uses `(db as any).$client.close()`. The file already imports `BunSQLDatabase` from `drizzle-orm/bun-sql` and `SQL` from `bun`. Replace the `as any` cast with a typed intersection cast that documents the intent without hiding the type relationship.

**6b** — `apps/worker/messaging/rcs/adapter.ts` uses `as unknown as GoogleServiceAccountKey` to cast a `string | GoogleServiceAccountKey` union. The `string` branch should use `JSON.parse` with an explicit type annotation. The `unknown as X` double-cast bypasses the type checker entirely.

### 5a: Fix `$client` cast in `apps/worker/db/index.ts`

- [ ] **Step 1: Verify current `closeDb` function**

```bash
grep -n "as any\|closeDb\|\$client" apps/worker/db/index.ts
```

Expected: one match for `as any` on the `$client` line.

- [ ] **Step 2: Replace the `as any` cast**

In `apps/worker/db/index.ts`, find `closeDb()`. Replace:

```typescript
    await (db as any).$client.close()
```

with:

```typescript
    // Access the underlying Bun SQL client. $client is the internal
    // BunSQLDatabase property holding the SQL instance.
    const bunDb = db as BunSQLDatabase<typeof schema> & { $client: SQL }
    await bunDb.$client.close()
```

Note: `SQL` is already imported from `bun` at the top of the file (`import { SQL } from 'bun'`), and `BunSQLDatabase` is already imported from `drizzle-orm/bun-sql`. No new imports needed.

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: clean. If `BunSQLDatabase` already exposes `$client: SQL` as a public property in the installed version, the cast is redundant but still valid. If it doesn't, the intersection cast satisfies TypeScript without `any`.

### 5b: Fix `as unknown as` cast in `apps/worker/messaging/rcs/adapter.ts`

- [ ] **Step 4: Locate the double-cast**

```bash
grep -n "as unknown as\|serviceAccountKey" apps/worker/messaging/rcs/adapter.ts | head -10
```

Expected: the `as unknown as GoogleServiceAccountKey` on the non-string branch (around line 22).

- [ ] **Step 5: Replace the double-cast with typed JSON.parse**

In `apps/worker/messaging/rcs/adapter.ts`, the constructor currently has:

```typescript
    const serviceAccountKey = typeof config.serviceAccountKey === 'string'
      ? JSON.parse(config.serviceAccountKey) as GoogleServiceAccountKey
      : config.serviceAccountKey as unknown as GoogleServiceAccountKey
```

Replace with:

```typescript
    const serviceAccountKey: GoogleServiceAccountKey =
      typeof config.serviceAccountKey === 'string'
        ? (JSON.parse(config.serviceAccountKey) as GoogleServiceAccountKey)
        : config.serviceAccountKey
```

If the TypeScript type of `config.serviceAccountKey` is `string | GoogleServiceAccountKey` (i.e. already a union), the non-string branch narrows to `GoogleServiceAccountKey` directly and needs no cast at all. If it is typed as just `string`, the entire expression collapses to the `JSON.parse` branch. Inspect the `RCSConfig` type from `@shared/types` to determine which case applies — either way, remove the `as unknown as` pattern.

- [ ] **Step 6: Check `RCSConfig.serviceAccountKey` type**

```bash
grep -n "serviceAccountKey\|RCSConfig" packages/shared/types.ts packages/protocol/schemas/*.ts 2>/dev/null | head -20
```

Use this to determine the declared type. Adjust the cast in Step 5 to match — the goal is to remove `as unknown as` without introducing `any`.

- [ ] **Step 7: Run typecheck**

```bash
bun run typecheck
```

Expected: clean.

- [ ] **Step 8: Run build**

```bash
bun run build
```

Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add apps/worker/db/index.ts apps/worker/messaging/rcs/adapter.ts
git commit -m "fix(types): replace as-any and as-unknown-as type assertion bypasses

db/index.ts: typed intersection cast for $client instead of 'as any'
rcs/adapter.ts: typed JSON.parse instead of double-cast workaround

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Final verification pass

- [ ] **Step 1: Full typecheck**

```bash
bun run typecheck
```

Expected: zero errors.

- [ ] **Step 2: Full build**

```bash
bun run build
```

Expected: zero errors.

- [ ] **Step 3: Backend BDD test suite**

Start the dev backing services and server (see CLAUDE.md):

```bash
docker compose -f deploy/docker/docker-compose.dev.yml up -d
bun run dev:server &
bun run test:backend:bdd
```

Expected: all BDD scenarios pass (same count as before these changes).

- [ ] **Step 4: Confirm no `as any` regressions**

```bash
grep -rn " as any" apps/worker/ src/client/lib/ asterisk-bridge/src/ --include="*.ts" | grep -v ".test.\|spec\.\|// " | grep -v "as any\)" | head -20
```

Expected: only pre-existing `as any` usages (Hono adapter structural limitations noted in spec), not the ones we fixed.

- [ ] **Step 5: Confirm no plaintext localStorage write**

```bash
grep -n "localStorage.setItem" src/client/lib/offline-queue.ts
```

Expected: exactly one match inside the `if (encrypted)` guard in the async `save()` method. No bare `localStorage.setItem(STORAGE_KEY, json)` outside of that guard.
