/**
 * Shared utilities for provider setup service.
 */

/** Encode username:password as a Basic auth header value. */
export function basicAuth(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`
}

/** ISO timestamp for the current time. */
export function nowISO(): string {
  return new Date().toISOString()
}

/**
 * Fetch with simple retry on 429 and 5xx responses.
 * On 429, waits for Retry-After header (or 2s default).
 * On 5xx, retries once after 1s.
 */
export async function fetchWithRetry(
  url: string,
  opts?: RequestInit,
  maxRetries = 1,
): Promise<Response> {
  let lastResponse: Response | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, opts)

    if (res.status === 429 && attempt < maxRetries) {
      const retryAfter = res.headers.get('Retry-After')
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000
      await new Promise(resolve => setTimeout(resolve, Math.min(waitMs, 5000)))
      lastResponse = res
      continue
    }

    if (res.status >= 500 && attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      lastResponse = res
      continue
    }

    return res
  }

  return lastResponse!
}
