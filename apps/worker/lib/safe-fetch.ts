import { isInternalAddress } from './ssrf-guard'

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 120_000

export interface SafeFetchOptions extends RequestInit {
  /** Timeout in milliseconds (default: 30000, max: 120000) */
  timeoutMs?: number
  /** Whether to validate the URL against SSRF rules (default: false) */
  ssrfGuard?: boolean
}

export async function safeFetch(
  url: string | URL,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ssrfGuard = false, ...fetchOptions } = options

  const effectiveTimeout = Math.min(Math.max(timeoutMs, 1000), MAX_TIMEOUT_MS)

  const parsed = new URL(url)

  if (ssrfGuard) {
    if (isInternalAddress(parsed.hostname)) {
      throw new Error('SSRF: blocked request to private/reserved IP range')
    }
  }

  return fetch(url, {
    ...fetchOptions,
    signal: fetchOptions.signal ?? AbortSignal.timeout(effectiveTimeout),
  })
}
