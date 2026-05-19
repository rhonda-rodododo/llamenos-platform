/**
 * Desktop auto-update logic (Epic 289).
 *
 * Wraps @tauri-apps/plugin-updater with:
 * - Configurable check interval (default 6h)
 * - "Skip this version" persistence via Tauri Store
 * - Tray icon "Check for Updates" event listener
 * - Self-hosted fallback URL chain support
 *
 * The updater config (endpoints, pubkey) lives in tauri.conf.json.
 * This module only controls _when_ and _how_ the frontend reacts.
 *
 * ## Update Threat Model
 *
 * The app protects volunteers and callers from nation-state adversaries.
 * The auto-update channel is a high-value target: a compromised update
 * can backdoor every installation silently.
 *
 * Defense layers:
 *
 * 1. **Artifact signatures (minisign)**: Every updater artifact (.tar.gz,
 *    .nsis.zip) has a .sig file signed with a minisign Ed25519 key. The
 *    public key is compiled into the binary (tauri.conf.json → pubkey).
 *    Tauri's updater plugin verifies the signature before applying. A
 *    compromised endpoint serving unsigned/mis-signed payloads is rejected.
 *
 * 2. **Dual update endpoints**: tauri.conf.json lists two endpoints —
 *    updates.llamenos.org (CDN/proxy) and releases.llamenos.org (RustFS
 *    origin). Tauri tries them in order. If the primary is compromised or
 *    down, the secondary is used. Both serve the same manifest; the
 *    minisign signature (not the endpoint) is the trust anchor.
 *
 * 3. **Anti-rollback (__VERSION_FLOOR__)**: The build-time constant
 *    __VERSION_FLOOR__ is set to the current version at compile time
 *    (vite.config.ts). Any update whose version is < __VERSION_FLOOR__ is
 *    rejected. This prevents downgrade attacks where a compromised endpoint
 *    serves an older, vulnerable build. The floor is per-binary, not
 *    per-endpoint, so it cannot be bypassed by switching sources.
 *
 * 4. **CHECKSUMS.txt + cosign + SLSA provenance**: CI generates
 *    SHA-256 checksums, cosign keyless signatures, and SLSA build
 *    provenance attestations for all release artifacts. These are
 *    published to the llamenos-releases repo and GitHub Releases for
 *    independent out-of-band verification.
 *
 * What is NOT defended here (accepted risks):
 * - Manifest content (latest.json) is not separately signed — the
 *   manifest can be tampered to point to a different version, but the
 *   artifact signature check will reject any payload not signed with
 *   the embedded minisign key.
 * - A compromised build environment (CI runner) could sign malicious
 *   artifacts with the real key. This is mitigated by SLSA provenance
 *   and reproducible builds (SOURCE_DATE_EPOCH, content-hashed names).
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

// ── Version comparison ────────────────────────────────────────────

/**
 * Returns true if `a` is semantically >= `b`.
 * Supports standard semver (MAJOR.MINOR.PATCH) and ignores pre-release tags.
 */
function semverGte(a: string, b: string): boolean {
  const parse = (v: string) =>
    v.split('-')[0].split('.').map(Number)
  const [aMaj = 0, aMin = 0, aPat = 0] = parse(a)
  const [bMaj = 0, bMin = 0, bPat = 0] = parse(b)
  if (aMaj !== bMaj) return aMaj > bMaj
  if (aMin !== bMin) return aMin > bMin
  return aPat >= bPat
}
const STARTUP_DELAY_MS = 5_000 // 5 seconds after launch
const SKIPPED_VERSIONS_KEY = 'skipped-update-versions'

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

/**
 * Check for an available update. Returns the Update object if one is
 * available and not skipped, or null otherwise.
 */
export async function checkForUpdate(opts?: {
  ignoreSkipped?: boolean
}): Promise<{ update: Update; info: UpdateInfo } | null> {
  const { check } = await import('@tauri-apps/plugin-updater')
  const update = await check()

  if (!update) return null

  // Anti-rollback: reject updates below the compiled-in version floor.
  // Prevents a compromised update endpoint from serving an older, vulnerable build.
  if (!semverGte(update.version, __VERSION_FLOOR__)) {
    console.warn(
      `[updater] Rejected update v${update.version} — below version floor v${__VERSION_FLOOR__}`,
    )
    return null
  }

  // Respect skipped versions unless explicitly overridden (e.g. manual check from tray)
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

/**
 * Download and install an update with progress reporting.
 */
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

/**
 * Relaunch the application after update installation.
 * Routes through platform.ts — never imports from @tauri-apps/* directly.
 */
export async function relaunchApp(): Promise<void> {
  await platformRelaunch()
}

// ── Scheduled checker ────────────────────────────────────────────

export interface UpdateScheduler {
  /** Stop the periodic checker and clean up listeners */
  stop: () => void
  /** Trigger an immediate check (e.g. from tray menu) */
  checkNow: (opts?: { ignoreSkipped?: boolean }) => Promise<void>
}

/**
 * Start a periodic update checker that calls `onUpdate` when a new
 * version is found. Also listens for the Rust-side `check-for-updates`
 * event emitted by the system tray "Check for Updates" menu item.
 */
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

  // Initial check after startup delay
  timeoutId = setTimeout(() => {
    doCheck()
    // Then check every CHECK_INTERVAL_MS
    intervalId = setInterval(() => doCheck(), CHECK_INTERVAL_MS)
  }, STARTUP_DELAY_MS)

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
