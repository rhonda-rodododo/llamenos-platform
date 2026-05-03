# Spec: Code Quality — Production Risk Fixes

**Date:** 2026-03-21
**Branch:** desktop
**Status:** Draft

---

## Goal

Fix six classes of production-risk defects found in the codebase audit. None require new features or API changes. All are self-contained fixes with clear before/after behaviour.

---

## General Notes

- **Line numbers are guidance only.** All file:line references in this spec are from the 2026-03-21 audit snapshot and may have shifted since. Implementers must use grep/search to locate the relevant code rather than jumping directly to a line number.

---

## Issue Inventory

### Issue 1 — Offline queue plaintext race condition (HIGH)

**File:** `src/client/lib/offline-queue.ts`, lines 283–299

**Current code:**

```typescript
private save(): void {
  const json = JSON.stringify(this.queue)
  // Fire-and-forget async encryption — save plaintext first for immediate reads,
  // then overwrite with encrypted version
  localStorage.setItem(STORAGE_KEY, json) // temporary plaintext
  import('./platform').then(({ encryptDraft }) =>
    encryptDraft(json).then(encrypted => {
      if (encrypted) localStorage.setItem(STORAGE_KEY, encrypted)
    }).catch(() => {})
  ).catch(() => {})
}
```

**Problem:**

The comment acknowledges this is intentional but treats it as acceptable. It is not. The queue can contain pending note submissions (which include `encryptedSummary` and envelope keys) and pending record/event creates. Between the synchronous `localStorage.setItem(json)` write and the async overwrite with the encrypted version, an application crash or forced browser close leaves plaintext data on disk. On Tauri desktop, `localStorage` maps to a file in the app data directory. This is a confidentiality breach if the device is seized or compromised between those two writes.

**Fix:**

Make `save()` async. Always encrypt first; only write to `localStorage` after encryption succeeds. If encryption fails (crypto not unlocked), do not write to `localStorage` at all — the queue lives in memory only until the key is available.

> **Accepted tradeoff — data loss on restart while offline**: While the encryption key is unavailable (crypto not yet unlocked), queued operations remain in memory only and will be lost if the app is restarted. This is an intentional and accepted tradeoff: no unencrypted data is persisted to disk. Users should be informed via UI feedback if the app is restarted while there are unsynced offline operations pending.

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

All callers of `save()` (which is called from `enqueue()`, `markComplete()`, `clear()`) must `void` the returned promise or be awaited depending on context. Since these are called from synchronous `enqueue()` which is called from the fetch interceptor in `api.ts`, the call becomes `void this.save()` — fire-and-forget is acceptable here because the write is best-effort persistence.

**Audit which items are sensitive:**

Before implementing, audit `QueuedOperation` fields to confirm which contain PII or crypto material. Items that only contain safe metadata (e.g. status updates with hashes) could legitimately be persisted as plaintext — but the queue mixes all types, so the safest policy is: encrypt or do not persist.

---

### Issue 2 — Empty catch blocks in critical paths (MEDIUM)

**Scope:** 279 bare `} catch {` blocks across `apps/worker` and `src/client` (excluding test files and already-commented intentional catches).

**Problem:**

Not all empty catches are bugs — `} catch { /* ignore malformed messages */ }` in the relay WebSocket parser is correct. But several critical paths swallow errors silently:

1. **`apps/worker/lib/auth.ts` lines 16, 41, 65, 82`** — Schnorr signature verification, session token validation. Silent failure means an invalid auth token returns as "unauthenticated" without any trace. At minimum log `warn`.

2. **`apps/worker/middleware/permission-guard.ts` line 73`** — permission check failure silently falls through. Should log so failed permission expansions are visible in audit context.

3. **`apps/worker/messaging/router.ts` lines 78, 112, 193`** — inbound message routing errors silently drop messages. Should log `error` with the message channel and error details so lost messages are traceable.

4. **`apps/worker/lib/nostr-outbox.ts` line 60`** — outbox drain failure. Should log `error` — silent failure here means Nostr events are not published and no operator knows.

5. **`apps/worker/lib/service-factories.ts` lines 27, 53`** — factory construction failures. Should re-throw or log `error` — silent failure here can result in `null` services that crash later with opaque errors.

**Fix policy:**

- `} catch {` in JSON/message parsing where malformed input is expected: keep as-is, add a comment if one is missing
- `} catch {` in auth, crypto, note submission, messaging, outbox: add `console.error('[module] description:', e)` at minimum, passing the caught error as a named variable
- Never change throw/return behaviour to fix catches — only add logging

**Concrete changes:**

| File | Line | Action |
|------|------|--------|
| `apps/worker/lib/auth.ts` | 16, 41, 65, 82 | Add `console.warn('[auth] …:', e)` to each |
| `apps/worker/middleware/permission-guard.ts` | 73 | Add `console.warn('[permission-guard] …:', e)` |
| `apps/worker/messaging/router.ts` | 78, 112, 193 | Add `console.error('[messaging-router] …:', e)` |
| `apps/worker/lib/nostr-outbox.ts` | 60 | Add `console.error('[nostr-outbox] drain error:', e)` |
| `apps/worker/lib/service-factories.ts` | 27, 53 | Add `console.error('[service-factories] …:', e)` |

Pattern: change `} catch {` to `} catch (e) {` and add the log line. Do not add `e` if it cannot be named (TypeScript 4 `catch` binding restrictions do not apply here — Bun targets ES2022+).

---

### Issue 3 — Hardcoded localhost in CORS middleware (MEDIUM)

**File:** `apps/worker/middleware/cors.ts`, lines 14–17

**Current code:**

```typescript
if (env.ENVIRONMENT === 'development') {
  if (origin === 'http://localhost:5173' || origin === 'http://localhost:1420') return true
}
```

**Problem:**

The localhost ports are hardcoded. If a developer changes the Vite port (e.g. to avoid a conflict), or if an E2E test harness runs on a non-standard port, CORS blocks the frontend. More critically: the production `ALLOWED_ORIGINS` set hardcodes `https://app.llamenos.org` and `https://demo.llamenos-platform.com`. Deployers who run the app under a different hostname (self-hosting is explicitly supported) cannot override these without editing source code.

**Fix:**

Add a `CORS_ALLOWED_ORIGINS` env var (comma-separated list of origins). In production, `ALLOWED_ORIGINS` is built from this env var. In development, the localhost fallbacks are retained only when `ENVIRONMENT === 'development'` and `CORS_ALLOWED_ORIGINS` is not set.

```typescript
function buildAllowedOrigins(env: { ENVIRONMENT: string; CORS_ALLOWED_ORIGINS?: string }): Set<string> {
  const base = new Set([
    'tauri://localhost',
    'https://tauri.localhost',
  ])
  if (env.CORS_ALLOWED_ORIGINS) {
    for (const origin of env.CORS_ALLOWED_ORIGINS.split(',')) {
      const trimmed = origin.trim()
      if (trimmed) base.add(trimmed)
    }
  } else {
    // Default production origins when env var not set
    base.add('https://app.llamenos.org')
    base.add('https://demo.llamenos-platform.com')
  }
  return base
}

function isAllowedOrigin(origin: string, env: { ENVIRONMENT: string; CORS_ALLOWED_ORIGINS?: string }): boolean {
  if (buildAllowedOrigins(env).has(origin)) return true
  if (env.ENVIRONMENT === 'development' && !env.CORS_ALLOWED_ORIGINS) {
    if (origin === 'http://localhost:5173' || origin === 'http://localhost:1420') return true
  }
  return false
}
```

Add `CORS_ALLOWED_ORIGINS?: string` to the `Env` interface in `apps/worker/types/infra.ts`.

---

### Issue 4 — Startup env var validation

> **This issue is covered in `2026-03-21-hardening-final.md` Gap 4, which is the canonical implementation.**
>
> Startup env var validation is defined there as `validateConfig()` in `apps/worker/lib/config.ts`, called from `apps/worker/app.ts`. The required var list, hex-length assertions, and warning policy are all specified in that gap.
>
> Do not create a second validation system here. Skip this issue — it is fully covered by hardening-final Gap 4.

---

### Issue 5 — Asterisk bridge placeholder URLs (MEDIUM)

**File:** `asterisk-bridge/src/webhook-sender.ts`

**Current code (5 instances):**

```typescript
const actionUrl = new URL(action, 'http://placeholder')
const waitUrlParsed = new URL(waitUrl, 'http://placeholder')
// etc.
```

**Problem:**

`new URL(relativeUrl, base)` requires a valid base to resolve relative paths. Using `'http://placeholder'` works correctly for path extraction (`actionUrl.pathname`, `actionUrl.searchParams`) because `URL` resolves the pathname relative to the base. The placeholder hostname is never sent in a network request. However, if `action` is ever an absolute URL (e.g. the TwiML returns a full `https://` callback), `new URL('https://worker.example.com/path', 'http://placeholder')` correctly uses the full URL — the base is ignored. So this is not a functional bug.

The issue is that `'http://placeholder'` is misleading: it implies the code might accidentally send requests to `placeholder`, and it suppresses URL validation. If `action` is empty or malformed, `new URL('', 'http://placeholder')` resolves to `'http://placeholder/'` silently rather than surfacing the parsing error.

**Fix:**

Replace `'http://placeholder'` with `'http://localhost'` as the fallback base. This is semantically correct (we are resolving paths relative to the local server), self-documenting, and does not change behaviour. Add a guard that logs a warning when the resolved hostname is `localhost` but the action string contained an absolute URL — this surfaces the case where a non-relative callback URL was passed.

Alternatively, if `WORKER_URL` is available in `BridgeConfig` (it already is as `workerWebhookUrl`), use that as the base:

```typescript
const actionUrl = new URL(action, this.config.workerWebhookUrl)
```

This is the correct fix: it resolves relative paths against the actual worker URL, which is what the TwiML callbacks intend. Use `this.config.workerWebhookUrl` as the base for all five `new URL(…, 'http://placeholder')` calls.

---

### Issue 6 — Type assertion bypasses (LOW-MEDIUM)

**Files and locations:**

**a) `apps/worker/db/index.ts` line 48:**

```typescript
await (db as any).$client.close()
```

`BunSQLDatabase` (from `drizzle-orm/bun-sql`) does not expose `$client` in its public type. This casts to `any` to access it. The actual `db` object at runtime does have `$client` because it is the internal Drizzle property, but this will break silently if Drizzle renames the property in a future version.

**Fix:** Look up the correct type. As of `drizzle-orm` 0.39+, `BunSQLDatabase` exposes a `$client` property typed as the underlying `SQL` instance (from `bun`). The cast to `any` can be replaced with an explicit type cast that communicates intent without hiding the type relationship:

```typescript
// Access the underlying Bun SQL client. $client is the internal
// BunSQLDatabase property holding the SQL instance.
const bunDb = db as BunSQLDatabase<typeof schema> & { $client: import('bun').SQL }
await bunDb.$client.close()
```

If the Drizzle type already exposes `$client` (check with `bun run typecheck`), remove the cast entirely.

**b) `apps/worker/messaging/rcs/adapter.ts` line 22:**

```typescript
: config.serviceAccountKey as unknown as GoogleServiceAccountKey
```

`as unknown as X` is a double-cast that bypasses TypeScript's type checker entirely — it is equivalent to `any`. This exists because `config.serviceAccountKey` is typed as `string` (JSON text from env var), but `GoogleServiceAccountKey` is an object type.

**Fix:** Parse the JSON properly with a Zod schema or typed `JSON.parse`:

```typescript
const keyData = typeof config.serviceAccountKey === 'string'
  ? (JSON.parse(config.serviceAccountKey) as GoogleServiceAccountKey)
  : config.serviceAccountKey as GoogleServiceAccountKey
```

Or define a narrow schema for `GoogleServiceAccountKey` and use `z.parse()` to validate the structure at runtime rather than trusting the cast.

---

## File Map

| File | Issues |
|------|--------|
| `src/client/lib/offline-queue.ts` | Issue 1 |
| `apps/worker/lib/auth.ts` | Issue 2 |
| `apps/worker/middleware/permission-guard.ts` | Issue 2 |
| `apps/worker/messaging/router.ts` | Issue 2 |
| `apps/worker/lib/nostr-outbox.ts` | Issue 2 |
| `apps/worker/lib/service-factories.ts` | Issue 2 |
| `apps/worker/middleware/cors.ts` | Issue 3 |
| `apps/worker/types/infra.ts` | Issue 3 (add `CORS_ALLOWED_ORIGINS` to `Env`) |
| *(see hardening-final Gap 4)* | Issue 4 — deferred to hardening-final spec |
| `asterisk-bridge/src/webhook-sender.ts` | Issue 5 |
| `apps/worker/db/index.ts` | Issue 6a |
| `apps/worker/messaging/rcs/adapter.ts` | Issue 6b |

---

## Verification Gates

1. `bun run typecheck` passes — no `as any` regressions introduced, `$client` cast resolves cleanly
2. `bun run build` passes — no dead imports from the `events.tsx` records import removal (that is in the other spec; listed here for awareness that typecheck covers both specs)
3. `bun run test:backend:bdd` passes — CORS changes must not break the BDD test server (tests run with `ENVIRONMENT=development`, fallback localhost origins still work)
4. Offline queue: manual test — lock the desktop, enqueue an operation (note draft), kill the process before the async encryption completes, reopen app, confirm `localStorage` does not contain plaintext JSON
5. *(Issue 4 startup validation gates are in hardening-final Gap 4)*
6. CORS: start server with `CORS_ALLOWED_ORIGINS=https://custom.example.com`; confirm that origin receives CORS headers and `http://localhost:5173` does not (when `ENVIRONMENT=production`)
7. `cd asterisk-bridge && bun run typecheck` (if available) or confirm no runtime errors in webhook-sender tests with the `workerWebhookUrl` base change

---

## Priority Order

Execute in this order to de-risk:

1. **Issue 1** (offline queue plaintext) — highest confidentiality risk, self-contained change
2. **Issue 3** (CORS) — enables self-hosted deployments; requires `Env` type update
3. **Issue 2** (empty catches) — systematic; audit each file individually before changing
4. **Issue 5** (placeholder URLs) — low risk, one-line replacements
5. **Issue 6** (type assertions) — lowest risk, clean-up only
6. ~~**Issue 4**~~ — deferred to `hardening-final` Gap 4 (canonical startup validation)

---

## Notes

- Do not change the semantics of any existing catch block — only add logging. Silent swallowing is sometimes intentional (e.g. JSON parse probes). The goal is observability, not error propagation changes.
- Issue 2 catch blocks in `apps/worker/routes/dev.ts` (lines 148, 178, 209, 245, 267, 358) are in test/dev-only code and can be left as-is or given comments — they are not critical path.
- The `(c as any).env = env` and `(c as any).set(...)` casts in `src/server/index.ts` are structural limitations of the Hono Bun adapter and are out of scope for this spec.
