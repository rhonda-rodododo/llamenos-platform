/**
 * Desktop backend address configuration (Epic #738).
 *
 * A packaged Tauri build loads the webview over the `tauri://` asset protocol,
 * where a relative `/api` path resolves to nothing — there is no HTTP server
 * behind `tauri://`. This module is the single source of truth for "which
 * backend does this installed app talk to": it persists a user-chosen,
 * absolute server address (via the Tauri Store, mirrored to `localStorage`
 * outside Tauri) and every other module derives its URLs from it.
 *
 * - `src/client/lib/api.ts` and `webauthn.ts` build request URLs via `getApiUrl()`.
 * - `src/client/lib/net.ts` reads `getApiBase()`/`isAbsoluteUrl()` to decide whether
 *   a request must be routed through the Rust-enforced network proxy (#739) instead
 *   of a same-origin browser `fetch`.
 * - `src/client/lib/relay/context.tsx` derives the WebSocket origin via `deriveWsBase()`
 *   instead of `window.location.host`, which is meaningless under `tauri://`.
 *
 * In dev (`bun run tauri:dev`) and Playwright test builds, Vite's own proxy
 * (`vite.config.ts`) forwards relative `/api`/`/ws` to a real backend, so the
 * default relative base is intentionally preserved there — see `needsServerAddress()`.
 *
 * IMPORTANT: `cachedApiBase` stores an ORIGIN only (`https://host:port`, no
 * path) — or `''` for the relative dev/test default. `getApiUrl()` always
 * appends `/api` explicitly so the stored value never needs a hardcoded path
 * baked in. Auth token signing (`api.ts`/`webauthn.ts`) uses `getApiPath()`
 * instead of `getApiUrl()` — it must always sign the request's *pathname*
 * (`/api/...`), never the full origin, because the server verifies the
 * signature against `url.pathname`, which is the same regardless of which
 * host served the request.
 */

const useTauri = typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || !!import.meta.env.PLAYWRIGHT_TEST)

const STORE_KEY = 'llamenos-api-config'
const API_BASE_KEY = 'apiBaseUrl'

/** Same-origin default — dev/test builds reach the backend via Vite's proxy. */
const DEFAULT_API_BASE = ''

let cachedApiBase: string = DEFAULT_API_BASE
let initialized = false

async function getStore() {
  if (useTauri) {
    const { Store } = await import('@tauri-apps/plugin-store')
    return Store.load(`${STORE_KEY}.json`)
  }
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = localStorage.getItem(`llamenos:${key}`)
      if (raw === null) return null
      return JSON.parse(raw) as T
    },
    async set(key: string, value: unknown): Promise<void> {
      localStorage.setItem(`llamenos:${key}`, JSON.stringify(value))
    },
    async delete(key: string): Promise<void> {
      localStorage.removeItem(`llamenos:${key}`)
    },
    async save(): Promise<void> {
      // No-op — localStorage persists automatically
    },
  }
}

/** True for an absolute `http(s)://` address — false for the relative dev/test default. */
export function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

export async function initApiBase(): Promise<void> {
  if (initialized) return
  if (!useTauri) {
    cachedApiBase = DEFAULT_API_BASE
    initialized = true
    return
  }
  try {
    const store = await getStore()
    const stored = await store.get<string>(API_BASE_KEY)
    cachedApiBase = stored || DEFAULT_API_BASE
  } catch {
    cachedApiBase = DEFAULT_API_BASE
  }
  initialized = true
}

export function getApiBase(): string {
  return cachedApiBase
}

export async function setApiBase(url: string): Promise<void> {
  const normalized = url.trim() || DEFAULT_API_BASE
  cachedApiBase = normalized
  if (useTauri) {
    const store = await getStore()
    await store.set(API_BASE_KEY, normalized)
    await store.save()
  }
}

export async function resetApiBase(): Promise<void> {
  cachedApiBase = DEFAULT_API_BASE
  if (useTauri) {
    const store = await getStore()
    await store.delete(API_BASE_KEY)
    await store.save()
  }
}

/** Full request URL — origin (if configured) + the fixed `/api` prefix + `path`. */
export function getApiUrl(path: string): string {
  return `${cachedApiBase}/api${path}`
}

/**
 * Request *pathname* only (`/api/...`), independent of the configured origin.
 * Use this — never `getApiUrl()` — for anything the server verifies against
 * `url.pathname` (Ed25519 auth token signing): the path is identical no
 * matter which host serves it, but `getApiUrl()` may return an absolute URL.
 */
export function getApiPath(path: string): string {
  return `/api${path}`
}

/**
 * True when the app needs to show the first-run "Server address" screen before
 * anything else — a packaged/dev Tauri runtime with no absolute backend address
 * configured yet. Deliberately gated on `isPackagedTauri()`, NOT the broader
 * `isTauriRuntime()`: the Playwright IPC mock also satisfies `isTauriRuntime()`
 * (that's what lets ~500 existing desktop scenarios exercise real Tauri IPC
 * code paths), and those scenarios rely on the relative `/api` dev-proxy
 * default with NO server-address step anywhere — gating on `isTauriRuntime()`
 * here would show this screen on every single one of them. Tests that
 * specifically exercise this flow opt in via `isPackagedTauri()`'s test hook
 * (see `tests/steps/config/`), everything else is unaffected.
 */
export function needsServerAddress(): boolean {
  return isPackagedTauri() && !isAbsoluteUrl(cachedApiBase)
}

/** Whether this build should ever route network traffic through the Rust-enforced proxy (#739). */
export function isTauriRuntime(): boolean {
  return useTauri
}

/**
 * Whether this is a genuine Tauri process (packaged app or `tauri:dev`) — as
 * opposed to the Playwright IPC mock, which satisfies `isTauriRuntime()` but
 * not this. Playwright tests that specifically need to exercise packaged-app
 * behavior (the first-run gate, the Settings "Server address" section) opt in
 * by setting `window.__TEST_SIMULATE_PACKAGED_TAURI__ = true` via
 * `page.addInitScript` before navigating — see `tests/steps/config/`. No
 * other test sets this, so this is false (and behavior unchanged) everywhere else.
 */
export function isPackagedTauri(): boolean {
  if (typeof window === 'undefined') return false
  if ('__TAURI_INTERNALS__' in window) return true
  if (import.meta.env.PLAYWRIGHT_TEST) {
    return !!(window as unknown as Record<string, unknown>).__TEST_SIMULATE_PACKAGED_TAURI__
  }
  return false
}

/**
 * Normalize a user-typed host into an absolute base URL, inferring the scheme
 * the way the iOS client's `APIService.configure(baseURL:)` does: explicit
 * schemes are respected, loopback/private hosts default to `http://` (local
 * dev/staging convenience), everything else defaults to `https://`.
 */
export function normalizeServerInput(raw: string): string {
  let input = raw.trim()
  if (!input) return input
  input = input.replace(/\/+$/, '')

  if (/^https?:\/\//i.test(input)) return input

  const hostPart = input.split(/[:/]/)[0].toLowerCase()
  const isLoopbackOrPrivate =
    hostPart === 'localhost' ||
    hostPart === '127.0.0.1' ||
    hostPart === '::1' ||
    /^10\.\d+\.\d+\.\d+$/.test(hostPart) ||
    /^192\.168\.\d+\.\d+$/.test(hostPart) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostPart)

  const scheme = isLoopbackOrPrivate ? 'http' : 'https'
  return `${scheme}://${input}`
}

/**
 * Derive the WebSocket origin (scheme-swapped) from an absolute API base.
 * Returns `undefined` for the relative dev/test default — callers should fall
 * back to the server-declared `wsRelayUrl` resolved against `window.location`
 * in that case, matching existing dev-proxy behavior.
 */
export function deriveWsBase(): string | undefined {
  if (!isAbsoluteUrl(cachedApiBase)) return undefined
  try {
    const url = new URL(cachedApiBase)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    // Strip the `/api` path suffix — relay paths are absolute (`/ws`, `wsRelayUrl` from /api/config).
    return `${url.protocol}//${url.host}`
  } catch {
    return undefined
  }
}
