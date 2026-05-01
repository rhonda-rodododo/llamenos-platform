# In-App Tauri Updater UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Tauri v2 updater plugin into the desktop frontend with a complete update notification UI: banner, detail dialog with release notes, download progress, "Restart to apply" flow, skip-version persistence, and anti-rollback version floor enforcement.

**Architecture:** A thin `updater.ts` service wraps the Tauri updater plugin and exposes a scheduler + download/install API. `UpdateChecker.tsx` consumes the service and renders the full UI in the authenticated layout. All `@tauri-apps/*` access goes through `platform.ts` or is aliased to JS mocks for test builds.

**Tech Stack:** React, TanStack Router, shadcn/ui (Dialog, Progress, Button), `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`, `@tauri-apps/api/event`, `@tauri-apps/plugin-store`, Playwright.

**Current state (Epic E289 — already merged):** The core UI and service are implemented. Remaining gaps are: (1) `@tauri-apps/plugin-process` and `@tauri-apps/api/event` are not mocked for test builds, meaning tests that trigger relaunch or tray events will fail; (2) anti-rollback version floor check is missing; (3) test coverage is incomplete; (4) error state is silently suppressed in the UI.

---

## File Structure

### Files to Create

- `tests/mocks/tauri-process.ts` — mock for `@tauri-apps/plugin-process` (records relaunch calls, exposes flag to tests)
- `tests/mocks/tauri-event.ts` — mock for `@tauri-apps/api/event` (lets tests dispatch fake tray events)

### Files to Modify

- `src/client/lib/platform.ts` — add `platformListen()` and `platformRelaunch()` wrappers; add version floor export
- `src/client/lib/updater.ts` — import `platformListen`/`platformRelaunch` from platform.ts; add anti-rollback version floor check
- `src/client/components/UpdateChecker.tsx` — surface error state with a toast; minor robustness fixes
- `vite.config.ts` — add aliases for `@tauri-apps/plugin-process` and `@tauri-apps/api/event` in test builds
- `tests/updater.spec.ts` — add tests: relaunch click, failed download, skip-version persistence, tray event trigger
- `packages/i18n/locales/en.json` — add missing `updates.errorRetry` key

### Files to Delete

None.

---

## Decisions to Review

| Decision | Chosen option | Alternative |
|----------|--------------|-------------|
| How to handle Tauri-only imports in test builds | Add JS mocks + vite aliases (matching existing pattern for plugin-updater/plugin-store) | Route everything through platform.ts IPC wrappers (more complex, cleaner long-term) |
| Anti-rollback floor storage | Compile-time constant `__VERSION_FLOOR__` injected by vite.config.ts from `package.json` | Runtime JSON fetch from update endpoint — rejected (network dependency on startup) |
| Error state feedback | Sonner toast via `useToast` / `toast()` from `@/lib/toast` | Inline error banner (clutters the layout for a non-critical error) |
| Tray event mock | In-memory pub/sub in `tests/mocks/tauri-event.ts` that exposes `dispatchTrayEvent(name)` on `window` | Skip testing tray integration (lower coverage) |

---

## Phase 1: Platform wrappers and test mocks

### Task 1.1 — Add `platformListen` and `platformRelaunch` to platform.ts

The two remaining `@tauri-apps/*` direct imports in `updater.ts` are:
- `@tauri-apps/api/event` for `listen` (tray "Check for Updates" event)
- `@tauri-apps/plugin-process` for `relaunch`

Move these to `platform.ts` so they follow the same abstraction pattern as crypto IPC.

- [ ] In `src/client/lib/platform.ts`, append after the last function block:

```typescript
// ── Updater platform support ────────────────────────────────────────

/**
 * Listen for a Tauri event from the native side (e.g. tray menu events).
 * Returns an unlisten function. No-op in non-Tauri / test contexts.
 */
export async function platformListen(
  event: string,
  handler: () => void,
): Promise<() => void> {
  if (useTauri && !import.meta.env.PLAYWRIGHT_TEST) {
    const { listen } = await import('@tauri-apps/api/event')
    return listen(event, handler)
  }
  // In test builds: handled by the tauri-event mock (see tests/mocks/tauri-event.ts)
  // which registers handlers on window.__TAURI_EVENT_LISTENERS__.
  if (import.meta.env.PLAYWRIGHT_TEST) {
    const map: Record<string, Array<() => void>> =
      (window as Record<string, unknown>).__TAURI_EVENT_LISTENERS__ as Record<string, Array<() => void>> ?? {}
    ;(window as Record<string, unknown>).__TAURI_EVENT_LISTENERS__ = map
    if (!map[event]) map[event] = []
    map[event].push(handler)
    return () => {
      map[event] = map[event].filter(h => h !== handler)
    }
  }
  return () => {}
}

/**
 * Relaunch the application (used post-update install).
 * No-op in test builds — tests assert on the button click instead.
 */
export async function platformRelaunch(): Promise<void> {
  if (useTauri && !import.meta.env.PLAYWRIGHT_TEST) {
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
    return
  }
  if (import.meta.env.PLAYWRIGHT_TEST) {
    // Signal to tests that relaunch was requested
    ;(window as Record<string, unknown>).__RELAUNCH_CALLED__ = true
    return
  }
  throw new Error('platformRelaunch: not in Tauri context')
}
```

### Task 1.2 — Update `updater.ts` to use platform wrappers

Replace the two direct Tauri imports with the new platform functions.

- [ ] In `src/client/lib/updater.ts`, update the import block at the top to add:

```typescript
import { platformListen, platformRelaunch } from '@/lib/platform'
```

- [ ] Replace `relaunchApp()`:

```typescript
/**
 * Relaunch the application after update installation.
 * Routes through platform.ts — never imports from @tauri-apps/* directly.
 */
export async function relaunchApp(): Promise<void> {
  await platformRelaunch()
}
```

- [ ] In `startUpdateScheduler()`, replace the `listen` block:

```typescript
// Listen for tray "Check for Updates" event from Rust
;(async () => {
  try {
    unlistenFn = await platformListen('check-for-updates', () => {
      doCheck({ ignoreSkipped: true })
    })
  } catch {
    // Not in Tauri context — no-op
  }
})()
```

- [ ] Remove the now-unused `@tauri-apps/api/event` dynamic import inside `startUpdateScheduler`.

### Task 1.3 — Add `@tauri-apps/plugin-process` mock

The `relaunchApp()` path no longer imports from this package directly (platform.ts handles it), but if any code still imports it, the test build will break. Add a stub for safety.

- [ ] Create `tests/mocks/tauri-process.ts`:

```typescript
/**
 * Mock @tauri-apps/plugin-process for Playwright test builds.
 *
 * Aliased via vite.config.ts when PLAYWRIGHT_TEST=true.
 * Records relaunch calls on window.__RELAUNCH_CALLED__ so tests can assert
 * that the restart flow was triggered.
 */

if (!import.meta.env.PLAYWRIGHT_TEST) {
  throw new Error('FATAL: Tauri process mock loaded outside test environment.')
}

export async function relaunch(): Promise<void> {
  ;(window as Record<string, unknown>).__RELAUNCH_CALLED__ = true
}

export async function exit(_code?: number): Promise<void> {
  // No-op in tests
}
```

### Task 1.4 — Add vite aliases for process and event packages

- [ ] In `vite.config.ts`, extend the test-build alias map:

```typescript
...(isTestBuild ? {
  '@tauri-apps/api/core': path.resolve(__dirname, 'tests/mocks/tauri-core.ts'),
  '@tauri-apps/plugin-store': path.resolve(__dirname, 'tests/mocks/tauri-store.ts'),
  '@tauri-apps/plugin-updater': path.resolve(__dirname, 'tests/mocks/tauri-updater.ts'),
  '@tauri-apps/plugin-process': path.resolve(__dirname, 'tests/mocks/tauri-process.ts'),
  // Note: @tauri-apps/api/event is handled inline by platformListen in platform.ts
  // for PLAYWRIGHT_TEST builds — no separate mock file needed.
} : {}),
```

---

## Phase 2: Anti-rollback version floor

### Task 2.1 — Add version floor constant to vite.config.ts

The version floor prevents installing a release that is older than the minimum supported version. This guards against rollback attacks where a tampered update endpoint serves an old build with known vulnerabilities.

- [ ] In `vite.config.ts`, read the version floor from `package.json`. The floor is the same as the current version at build time (every release advances the floor):

```typescript
const buildVersionFloor = buildVersion  // floor matches current build
```

- [ ] Add to the `define` block:

```typescript
'__VERSION_FLOOR__': JSON.stringify(buildVersionFloor),
```

- [ ] In `src/globals.d.ts`, add the declaration alongside the existing build constants:

```typescript
declare const __VERSION_FLOOR__: string
```

### Task 2.2 — Enforce version floor in `checkForUpdate()`

- [ ] In `src/client/lib/updater.ts`, add a `compareVersions` helper and version floor check:

```typescript
// ── Version comparison ────────────────────────────────────────────

/**
 * Returns true if `a` is semantically >= `b`.
 * Supports standard semver (MAJOR.MINOR.PATCH) and ignores pre-release tags.
 */
function semverGte(a: string, b: string): boolean {
  const parse = (v: string) =>
    v.split(/[.-]/)[0]?.split('.').map(Number) ?? [0, 0, 0]
  const [aMaj, aMin, aPat] = parse(a)
  const [bMaj, bMin, bPat] = parse(b)
  if (aMaj !== bMaj) return (aMaj ?? 0) > (bMaj ?? 0)
  if (aMin !== bMin) return (aMin ?? 0) > (bMin ?? 0)
  return (aPat ?? 0) >= (bPat ?? 0)
}
```

- [ ] In `checkForUpdate()`, add the floor check after the update is returned from `check()`:

```typescript
if (!update) return null

// Anti-rollback: reject updates below the compiled-in version floor.
// Prevents a compromised update endpoint from serving an older, vulnerable build.
if (!semverGte(update.version, __VERSION_FLOOR__)) {
  console.warn(
    `[updater] Rejected update v${update.version} — below version floor v${__VERSION_FLOOR__}`,
  )
  return null
}
```

---

## Phase 3: Error state UI feedback

### Task 3.1 — Surface update errors via toast

Currently `UpdateChecker.tsx` silently suppresses errors (scheduler's `onError` is `() => {}`). Add a non-intrusive toast so users know if the update check failed persistently.

- [ ] In `src/client/components/UpdateChecker.tsx`, import the toast function:

```typescript
import { toast } from '@/lib/toast'
```

- [ ] Replace the silent error handler in the `useEffect` that starts the scheduler:

```typescript
const scheduler = startUpdateScheduler(
  onUpdateAvailable,
  (err) => {
    // Update errors are non-critical — log and show a one-time toast.
    // Don't show a toast on every periodic check failure; only on user-triggered checks.
    console.warn('[updater] Check failed:', err)
    // No toast for background check failures — silent for periodic checks.
    // The tray "Check for Updates" path sets ignoreSkipped=true, which we
    // distinguish via an onError signature extension if needed in future.
  },
)
```

> **Note:** For tray-triggered checks (user explicitly requested), extend `startUpdateScheduler` to accept a separate `onUserCheckError` callback in a future iteration. The current silent handling is acceptable for background checks.

- [ ] Add an i18n key to `packages/i18n/locales/en.json` under the `updates` section:

```json
"errorRetry": "Update check failed. Try again from the tray menu."
```

---

## Phase 4: Complete Playwright test coverage

### Task 4.1 — Test: "Restart Now" button triggers relaunch

- [ ] In `tests/updater.spec.ts`, add:

```typescript
test('clicking restart relaunch calls platformRelaunch', async ({ page }) => {
  const mockUpdate = {
    version: '99.0.0',
    body: 'Test',
    downloadSize: 512 * 1024,
  }

  await reloadWithMockUpdate(page, mockUpdate)

  const banner = page.locator('[data-testid="update-banner"]')
  await expect(banner).toBeVisible({ timeout: 15000 })

  // Trigger download
  await page.locator('[data-testid="update-download-btn"]').click()
  await expect(page.locator('[data-testid="update-restart-btn"]')).toBeVisible({ timeout: 10000 })

  // Clear any previous relaunch flag
  await page.evaluate(() => {
    delete (window as Record<string, unknown>).__RELAUNCH_CALLED__
  })

  // Click restart
  await page.locator('[data-testid="update-restart-btn"]').click()

  // platform.ts sets __RELAUNCH_CALLED__ = true in test builds
  const relaunched = await page.evaluate(() =>
    (window as Record<string, unknown>).__RELAUNCH_CALLED__ === true
  )
  expect(relaunched).toBe(true)
})
```

### Task 4.2 — Test: Failed download reverts to "available" state

- [ ] In `tests/updater.spec.ts`, add:

```typescript
test('failed download reverts banner to "available" state', async ({ page }) => {
  const mockUpdate = {
    version: '99.0.0',
    body: 'Test release',
    failDownload: true,
  }

  await reloadWithMockUpdate(page, mockUpdate)

  const banner = page.locator('[data-testid="update-banner"]')
  await expect(banner).toBeVisible({ timeout: 15000 })

  // Trigger download (will fail)
  await page.locator('[data-testid="update-download-btn"]').click()

  // After failure, banner should revert — download button should reappear
  await expect(page.locator('[data-testid="update-download-btn"]')).toBeVisible({ timeout: 10000 })

  // Restart button must NOT appear after a failed download
  await expect(page.locator('[data-testid="update-restart-btn"]')).not.toBeVisible()
})
```

### Task 4.3 — Test: Skip version persists — skipped update not shown on next check

- [ ] In `tests/updater.spec.ts`, add:

```typescript
test('skipped version is not shown again after reload', async ({ page }) => {
  const mockUpdate = {
    version: '99.0.0',
    body: 'Security release',
  }

  await reloadWithMockUpdate(page, mockUpdate)

  const banner = page.locator('[data-testid="update-banner"]')
  await expect(banner).toBeVisible({ timeout: 15000 })

  // Open dialog and skip
  await page.locator('[data-testid="update-details-btn"]').click()
  await page.locator('[data-testid="update-skip-btn"]').click()
  await expect(banner).not.toBeVisible()

  // Reload with same version — should NOT reappear
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate((update) => {
    ;(window as Record<string, unknown>).__MOCK_UPDATE = update
  }, mockUpdate)
  await reenterPinAfterReload(page)
  await page.waitForSelector('[data-testid="nav-sidebar"]', { timeout: 30000 })
  await page.evaluate((update) => {
    ;(window as Record<string, unknown>).__MOCK_UPDATE = update
  }, mockUpdate)

  // Wait for the startup delay + check to run, then assert banner absent
  await page.waitForTimeout(8000)
  await expect(page.locator('[data-testid="update-banner"]')).not.toBeVisible()
})
```

### Task 4.4 — Test: Anti-rollback floor rejects downgrade

- [ ] In `tests/updater.spec.ts`, add:

```typescript
test('update below version floor is silently rejected', async ({ page }) => {
  // Set a version far below the current app version — should be rejected by floor check
  const mockUpdate = {
    version: '0.0.1',
    body: 'Rollback attempt',
  }

  await reloadWithMockUpdate(page, mockUpdate)

  // Wait longer than the startup delay + one check interval
  await page.waitForTimeout(8000)

  // Banner must NOT appear — floor check rejected the downgrade
  await expect(page.locator('[data-testid="update-banner"]')).not.toBeVisible()
})
```

---

## Phase 5: Verification

### Task 5.1 — Type check and build

- [ ] Run `bun run typecheck` — no errors.
- [ ] Run `bun run test:build` — Vite builds with mocks; no import errors for `@tauri-apps/plugin-process`.

### Task 5.2 — Run updater test suite

- [ ] Run `bun run test -- tests/updater.spec.ts` — all tests pass.
- [ ] Verify `no update banner shown when no update available` — still passes.
- [ ] Verify `shows update banner when update is available` — still passes.
- [ ] Verify `can dismiss update banner` — still passes.
- [ ] Verify `shows update dialog with release notes` — still passes.
- [ ] Verify `download progress shows in banner` — still passes.
- [ ] Verify new tests: `clicking restart relaunch calls platformRelaunch` — passes.
- [ ] Verify new tests: `failed download reverts banner` — passes.
- [ ] Verify new tests: `skipped version is not shown again` — passes.
- [ ] Verify new tests: `update below version floor is silently rejected` — passes.

---

## Reference: Complete `updater.ts` after modifications

The final file structure of `src/client/lib/updater.ts` after Tasks 1.2 and 2.2:

```typescript
/**
 * Desktop auto-update logic (Epic 289).
 *
 * Wraps @tauri-apps/plugin-updater with:
 * - Configurable check interval (default 6h)
 * - "Skip this version" persistence via Tauri Store
 * - Tray icon "Check for Updates" event listener (via platformListen)
 * - Self-hosted fallback URL chain support
 * - Anti-rollback version floor (semverGte check against __VERSION_FLOOR__)
 *
 * All @tauri-apps/* access routes through platform.ts or vite aliases.
 * The updater config (endpoints, pubkey) lives in tauri.conf.json.
 */

import type { Update } from '@tauri-apps/plugin-updater'
import { platformListen, platformRelaunch } from '@/lib/platform'

// ── Types ────────────────────────────────────────────────────────

export interface UpdateInfo {
  version: string
  notes: string
  date: string | null
  currentVersion: string
}

export type DownloadEvent =
  | { event: 'Started'; data: { contentLength: number | null } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' }

export type UpdateStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; info: UpdateInfo }
  | { status: 'downloading'; progress: number; total: number }
  | { status: 'ready' }
  | { status: 'error'; message: string }
  | { status: 'dismissed' }

// ── Constants ────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours
const STARTUP_DELAY_MS = 5_000 // 5 seconds after launch
const SKIPPED_VERSIONS_KEY = 'skipped-update-versions'

// ── Version comparison ────────────────────────────────────────────

/**
 * Returns true if `a` is semantically >= `b`.
 */
function semverGte(a: string, b: string): boolean {
  const parse = (v: string) =>
    v.split(/[.-]/)[0]?.split('.').map(Number) ?? [0, 0, 0]
  const [aMaj, aMin, aPat] = parse(a)
  const [bMaj, bMin, bPat] = parse(b)
  if (aMaj !== bMaj) return (aMaj ?? 0) > (bMaj ?? 0)
  if (aMin !== bMin) return (aMin ?? 0) > (bMin ?? 0)
  return (aPat ?? 0) >= (bPat ?? 0)
}

// ── Skip version persistence ─────────────────────────────────────

let skippedVersionsCache: Set<string> | null = null

async function loadSkippedVersions(): Promise<Set<string>> {
  if (skippedVersionsCache) return skippedVersionsCache
  try {
    const { Store } = await import('@tauri-apps/plugin-store')
    const store = await Store.load('updater.json')
    const raw = await store.get<string[]>(SKIPPED_VERSIONS_KEY)
    skippedVersionsCache = new Set(raw ?? [])
  } catch {
    skippedVersionsCache = new Set()
  }
  return skippedVersionsCache
}

export async function skipVersion(version: string): Promise<void> {
  const skipped = await loadSkippedVersions()
  skipped.add(version)
  try {
    const { Store } = await import('@tauri-apps/plugin-store')
    const store = await Store.load('updater.json')
    await store.set(SKIPPED_VERSIONS_KEY, [...skipped])
    await store.save()
  } catch {
    // Best-effort persistence
  }
}

async function isVersionSkipped(version: string): Promise<boolean> {
  const skipped = await loadSkippedVersions()
  return skipped.has(version)
}

export async function clearSkippedVersions(): Promise<void> {
  skippedVersionsCache = new Set()
  try {
    const { Store } = await import('@tauri-apps/plugin-store')
    const store = await Store.load('updater.json')
    await store.delete(SKIPPED_VERSIONS_KEY)
    await store.save()
  } catch {
    // Best-effort
  }
}

// ── Core check ───────────────────────────────────────────────────

export async function checkForUpdate(opts?: {
  ignoreSkipped?: boolean
}): Promise<{ update: Update; info: UpdateInfo } | null> {
  const { check } = await import('@tauri-apps/plugin-updater')
  const update = await check()

  if (!update) return null

  // Anti-rollback: reject updates below the compiled-in version floor
  if (!semverGte(update.version, __VERSION_FLOOR__)) {
    console.warn(
      `[updater] Rejected update v${update.version} — below version floor v${__VERSION_FLOOR__}`,
    )
    return null
  }

  if (!opts?.ignoreSkipped && (await isVersionSkipped(update.version))) {
    return null
  }

  const info: UpdateInfo = {
    version: update.version,
    notes: update.body ?? '',
    date: update.date ?? null,
    currentVersion: __BUILD_VERSION__,
  }

  return { update, info }
}

export async function downloadAndInstall(
  update: Update,
  onProgress: (downloaded: number, total: number) => void,
): Promise<void> {
  let downloaded = 0
  let contentLength = 0

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        contentLength = event.data.contentLength ?? 0
        onProgress(0, contentLength)
        break
      case 'Progress':
        downloaded += event.data.chunkLength
        onProgress(downloaded, contentLength)
        break
      case 'Finished':
        onProgress(contentLength, contentLength)
        break
    }
  })
}

export async function relaunchApp(): Promise<void> {
  await platformRelaunch()
}

// ── Scheduled checker ────────────────────────────────────────────

export interface UpdateScheduler {
  stop: () => void
  checkNow: (opts?: { ignoreSkipped?: boolean }) => Promise<void>
}

export function startUpdateScheduler(
  onUpdate: (info: UpdateInfo, update: Update) => void,
  onError?: (err: unknown) => void,
): UpdateScheduler {
  let stopped = false
  let intervalId: ReturnType<typeof setInterval> | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let unlistenFn: (() => void) | null = null

  async function doCheck(opts?: { ignoreSkipped?: boolean }) {
    if (stopped) return
    try {
      const result = await checkForUpdate(opts)
      if (result && !stopped) {
        onUpdate(result.info, result.update)
      }
    } catch (err) {
      onError?.(err)
    }
  }

  timeoutId = setTimeout(() => {
    doCheck()
    intervalId = setInterval(() => doCheck(), CHECK_INTERVAL_MS)
  }, STARTUP_DELAY_MS)

  ;(async () => {
    try {
      unlistenFn = await platformListen('check-for-updates', () => {
        doCheck({ ignoreSkipped: true })
      })
    } catch {
      // Not in Tauri context — no-op
    }
  })()

  return {
    stop() {
      stopped = true
      if (timeoutId) clearTimeout(timeoutId)
      if (intervalId) clearInterval(intervalId)
      unlistenFn?.()
    },
    checkNow: doCheck,
  }
}
```

---

## Reference: `platform.ts` additions (Task 1.1)

Append to end of `src/client/lib/platform.ts`:

```typescript
// ── Updater platform support ────────────────────────────────────────

/**
 * Listen for a Tauri event emitted by the native side (e.g. tray menu items).
 * Returns an unlisten function. Registers in-process in test builds.
 */
export async function platformListen(
  event: string,
  handler: () => void,
): Promise<() => void> {
  if (useTauri && !import.meta.env.PLAYWRIGHT_TEST) {
    const { listen } = await import('@tauri-apps/api/event')
    return listen(event, handler)
  }
  if (import.meta.env.PLAYWRIGHT_TEST) {
    const map = (
      (window as Record<string, unknown>).__TAURI_EVENT_LISTENERS__ ??= {}
    ) as Record<string, Array<() => void>>
    if (!map[event]) map[event] = []
    map[event].push(handler)
    return () => {
      map[event] = (map[event] ?? []).filter(h => h !== handler)
    }
  }
  return () => {}
}

/**
 * Relaunch the application (used after update installation).
 * Sets window.__RELAUNCH_CALLED__ = true in test builds for assertion.
 */
export async function platformRelaunch(): Promise<void> {
  if (useTauri && !import.meta.env.PLAYWRIGHT_TEST) {
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
    return
  }
  if (import.meta.env.PLAYWRIGHT_TEST) {
    ;(window as Record<string, unknown>).__RELAUNCH_CALLED__ = true
    return
  }
  throw new Error('platformRelaunch: not in Tauri context')
}
```

---

## Reference: vite.config.ts diff (Task 1.4)

```typescript
// BEFORE:
...(isTestBuild ? {
  '@tauri-apps/api/core': path.resolve(__dirname, 'tests/mocks/tauri-core.ts'),
  '@tauri-apps/plugin-store': path.resolve(__dirname, 'tests/mocks/tauri-store.ts'),
  '@tauri-apps/plugin-updater': path.resolve(__dirname, 'tests/mocks/tauri-updater.ts'),
} : {}),

// AFTER:
...(isTestBuild ? {
  '@tauri-apps/api/core': path.resolve(__dirname, 'tests/mocks/tauri-core.ts'),
  '@tauri-apps/plugin-store': path.resolve(__dirname, 'tests/mocks/tauri-store.ts'),
  '@tauri-apps/plugin-updater': path.resolve(__dirname, 'tests/mocks/tauri-updater.ts'),
  '@tauri-apps/plugin-process': path.resolve(__dirname, 'tests/mocks/tauri-process.ts'),
} : {}),
```

---

## Reference: vite.config.ts `define` diff (Task 2.1)

```typescript
// BEFORE:
'__BUILD_TIME__': JSON.stringify(buildTime),
'__BUILD_COMMIT__': JSON.stringify(buildCommit),
'__BUILD_VERSION__': JSON.stringify(buildVersion),

// AFTER:
'__BUILD_TIME__': JSON.stringify(buildTime),
'__BUILD_COMMIT__': JSON.stringify(buildCommit),
'__BUILD_VERSION__': JSON.stringify(buildVersion),
'__VERSION_FLOOR__': JSON.stringify(buildVersion),
```

---

## Gotchas

- **`useTauri` check**: In test builds, `PLAYWRIGHT_TEST=true` but `window.__TAURI_INTERNALS__` is also shimmed (`true`). The `platformListen` / `platformRelaunch` guards must check `PLAYWRIGHT_TEST` explicitly to select the test path before checking `useTauri`.
- **`@tauri-apps/api/event` is NOT in the vite alias map** — `platformListen` only imports it in the `!PLAYWRIGHT_TEST` branch, so the test build never hits the real module.
- **`skippedVersionsCache` is module-level** — tests that test skip-version persistence must reload the page (which reinitializes the module). The existing `reloadWithMockUpdate` helper handles this.
- **Semver floor** — the floor is set to the current build version at compile time. A security-sensitive deployment may want to set a higher floor via a build flag to force past a critical patch. Document this in `tauri.conf.json` comments.
- **Type declarations** — `__VERSION_FLOOR__` must be declared in `src/globals.d.ts` alongside the existing `__BUILD_VERSION__` declaration. This file already exists with the other build constants.
