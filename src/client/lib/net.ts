/**
 * Rust-enforced network egress for the desktop webview (Epic #739).
 *
 * A packaged Tauri build's CSP `connect-src` allows only `ipc: http://ipc.localhost`
 * (see apps/desktop/tauri.conf.json) — the webview cannot open a raw `fetch` or
 * `WebSocket` to any remote host, full stop. All HTTP and WebSocket traffic to the
 * configured backend is instead proxied through Tauri commands implemented in
 * `apps/desktop/src/net.rs` (`net_fetch`, `net_probe_health`, `net_ws_connect`,
 * `net_ws_send`, `net_ws_close`), which re-check the target origin against the SAME
 * persisted `apiBaseUrl` that `api-config.ts` reads/writes (via the Tauri Store),
 * so "which hosts can this app reach" is a runtime decision driven by user config —
 * not a build-time CSP allowlist. See #739 for the security rationale.
 *
 * In dev (`bun run tauri:dev`) and outside a real backend configuration (relative
 * `/api` default), this module falls straight through to the browser's native
 * `fetch`/`WebSocket` — dev already reaches the backend via Vite's proxy
 * (vite.config.ts), and Tauri does not enforce CSP against a `devUrl` page load.
 *
 * Playwright tests exercise the SAME code path as production: `tests/mocks/tauri-core.ts`
 * implements `net_fetch`/`net_probe_health`/`net_ws_*` by performing a real fetch/WebSocket
 * from the mock (mirroring the Rust allowlist check in JS), so a configured non-default
 * origin is genuinely reached end-to-end in tests, not just asserted against a string.
 */

import { getApiBase, isAbsoluteUrl, isTauriRuntime } from './api-config'

function shouldRouteThroughRust(): boolean {
  return isTauriRuntime() && isAbsoluteUrl(getApiBase())
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
  return tauriInvoke<T>(cmd, args)
}

// ── base64 <-> bytes helpers (no Node Buffer in the webview) ───────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function bodyToBase64(body: BodyInit | null | undefined): Promise<string | undefined> {
  if (body === null || body === undefined) return undefined
  if (typeof body === 'string') return bytesToBase64(new TextEncoder().encode(body))
  if (body instanceof ArrayBuffer) return bytesToBase64(new Uint8Array(body))
  if (ArrayBuffer.isView(body)) {
    return bytesToBase64(new Uint8Array(body.buffer, body.byteOffset, body.byteLength))
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return bytesToBase64(new Uint8Array(await body.arrayBuffer()))
  }
  throw new Error('netFetch: unsupported request body type')
}

interface NetResponse {
  status: number
  headers: Record<string, string>
  bodyBase64: string
}

/** Minimal `Response`-compatible wrapper around a Rust-proxied HTTP result. */
class ProxiedResponse {
  readonly status: number
  readonly ok: boolean
  readonly headers: { get(name: string): string | null }
  private readonly bytes: Uint8Array

  constructor(r: NetResponse) {
    this.status = r.status
    this.ok = r.status >= 200 && r.status < 300
    this.bytes = base64ToBytes(r.bodyBase64)
    const byLowerCase = new Map(Object.entries(r.headers).map(([k, v]) => [k.toLowerCase(), v]))
    this.headers = { get: (name: string) => byLowerCase.get(name.toLowerCase()) ?? null }
  }

  async text(): Promise<string> {
    return new TextDecoder().decode(this.bytes)
  }

  async json(): Promise<unknown> {
    return JSON.parse(await this.text())
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.bytes.buffer.slice(
      this.bytes.byteOffset,
      this.bytes.byteOffset + this.bytes.byteLength,
    ) as ArrayBuffer
  }
}

/**
 * `fetch`-compatible request helper. Routes through the Rust-enforced proxy
 * whenever a real backend address is configured under Tauri; otherwise behaves
 * exactly like the browser's native `fetch` (dev/test relative `/api`, or
 * outside Tauri entirely).
 */
export async function netFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (!shouldRouteThroughRust()) {
    return fetch(input, init)
  }

  const headers: Record<string, string> = {}
  if (init.headers) {
    new Headers(init.headers).forEach((value, key) => { headers[key] = value })
  }
  const bodyBase64 = await bodyToBase64(init.body as BodyInit | null | undefined)

  const invocation = invoke<NetResponse>('net_fetch', {
    method: (init.method || 'GET').toUpperCase(),
    url: input,
    headers,
    bodyBase64: bodyBase64 ?? null,
  })

  // Respect the caller's AbortSignal (callers like api.ts's request() rely on
  // this to turn their own timeout into a NetworkError). The underlying Rust
  // request may keep running in the background until it naturally resolves —
  // there is no cancellation channel into `net_fetch` — but the caller is
  // unblocked immediately either way.
  const signal = init.signal
  if (!signal) {
    const result = await invocation
    return new ProxiedResponse(result) as unknown as Response
  }
  const result = await new Promise<NetResponse>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('The operation was aborted', 'AbortError')); return }
    const onAbort = () => reject(new DOMException('The operation was aborted', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    invocation.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
  return new ProxiedResponse(result) as unknown as Response
}

/**
 * Test a CANDIDATE server address before it is confirmed/persisted — used by the
 * first-run and settings "Server address" screens. Always requests a fixed
 * `/api/health` path with no credentials and no caller-supplied headers, so
 * probing an unconfigured/untrusted host can never leak anything sensitive —
 * see `net_probe_health` in apps/desktop/src/net.rs, which intentionally skips
 * the backend allowlist check for exactly this reason (there is nothing
 * confirmed yet to check against).
 */
export async function probeServerHealth(baseUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (isTauriRuntime() && isAbsoluteUrl(baseUrl)) {
      const result = await invoke<NetResponse>('net_probe_health', { url: baseUrl })
      if (result.status >= 200 && result.status < 300) return { ok: true }
      return { ok: false, error: `server responded with status ${result.status}` }
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8_000)
    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/health`, { signal: controller.signal })
      if (res.ok) return { ok: true }
      return { ok: false, error: `server responded with status ${res.status}` }
    } finally {
      clearTimeout(timeout)
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unreachable' }
  }
}

// ── WebSocket shim (Rust-proxied) ───────────────────────────────────────

type NetWsPayload =
  | { type: 'open' }
  | { type: 'message'; data: string }
  | { type: 'close'; code: number; reason: string }
  | { type: 'error'; message: string }

/**
 * Registers a handler for Rust-emitted `net-ws:<id>` events. Mirrors
 * `platformListen` in `platform.ts`: Playwright test builds use an in-page
 * listener registry (populated directly by the mock's `net_ws_connect`/`send`
 * handlers in tests/mocks/tauri-core.ts) instead of the real Tauri event API.
 */
async function listenNetWs(id: string, handler: (payload: NetWsPayload) => void): Promise<() => void> {
  const channel = `net-ws:${id}`
  if (import.meta.env.PLAYWRIGHT_TEST) {
    const win = window as unknown as Record<string, unknown>
    if (!win.__NET_WS_LISTENERS__) win.__NET_WS_LISTENERS__ = {}
    const map = win.__NET_WS_LISTENERS__ as Record<string, Array<(p: NetWsPayload) => void>>
    ;(map[channel] ??= []).push(handler)
    return () => { map[channel] = (map[channel] ?? []).filter(h => h !== handler) }
  }
  const { listen } = await import('@tauri-apps/api/event')
  const unlisten = await listen<NetWsPayload>(channel, (event) => handler(event.payload))
  return unlisten
}

/**
 * Minimal `WebSocket`-compatible shim backed by the Rust WS proxy. Implements
 * just the surface `RelayConnection` (src/client/lib/relay/connection.ts) uses:
 * `readyState`, `send`, `close`, and `addEventListener('open'|'message'|'close'|'error')`.
 */
class TauriRelaySocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState: number = TauriRelaySocket.CONNECTING
  private readonly id: string
  private readonly listeners: Record<string, Array<(ev: unknown) => void>> = {
    open: [], message: [], close: [], error: [],
  }
  private unlisten: (() => void) | null = null

  constructor(url: string) {
    this.id = crypto.randomUUID()
    void this.connect(url)
  }

  private async connect(url: string): Promise<void> {
    try {
      this.unlisten = await listenNetWs(this.id, (payload) => {
        if (payload.type === 'open') {
          this.readyState = TauriRelaySocket.OPEN
          this.emit('open', {})
        } else if (payload.type === 'message') {
          this.emit('message', { data: payload.data })
        } else if (payload.type === 'close') {
          this.readyState = TauriRelaySocket.CLOSED
          this.emit('close', { code: payload.code, reason: payload.reason })
        } else if (payload.type === 'error') {
          this.emit('error', { message: payload.message })
        }
      })
      await invoke('net_ws_connect', { id: this.id, url })
    } catch (err) {
      this.readyState = TauriRelaySocket.CLOSED
      this.emit('error', { message: err instanceof Error ? err.message : String(err) })
      this.emit('close', { code: 1006, reason: 'connect failed' })
    }
  }

  addEventListener(type: string, cb: (ev: unknown) => void): void {
    (this.listeners[type] ??= []).push(cb)
  }

  removeEventListener(type: string, cb: (ev: unknown) => void): void {
    const arr = this.listeners[type]
    if (arr) this.listeners[type] = arr.filter(l => l !== cb)
  }

  private emit(type: string, detail: unknown): void {
    for (const cb of this.listeners[type] || []) {
      try { cb(detail) } catch { /* listener error — ignore, mirrors DOM EventTarget */ }
    }
  }

  send(data: string): void {
    invoke('net_ws_send', { id: this.id, data }).catch(() => { /* connection likely closed */ })
  }

  close(): void {
    this.readyState = TauriRelaySocket.CLOSING
    invoke('net_ws_close', { id: this.id }).catch(() => { /* already closed */ })
    this.unlisten?.()
  }
}

/**
 * Creates the transport `RelayConnection` should use for a given relay URL.
 * Routes through the Rust WS proxy whenever a real backend is configured under
 * Tauri; otherwise a plain `WebSocket` (dev/test, or outside Tauri).
 */
export function createRelaySocket(url: string): WebSocket {
  if (shouldRouteThroughRust()) {
    return new TauriRelaySocket(url) as unknown as WebSocket
  }
  return new WebSocket(url)
}
