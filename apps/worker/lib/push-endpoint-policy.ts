/**
 * Trusted UnifiedPush endpoint policy (#960).
 *
 * The backend POSTs a wake signal to the endpoint URL a device registered. The
 * ntfy Android app defaults to the public https://ntfy.sh server, so without a
 * policy a tester who does not reconfigure it would route every wake signal —
 * and therefore the fact and timing of "this volunteer is being contacted" —
 * through a third party.
 *
 * Policy: an endpoint is trusted iff its ORIGIN (scheme + host + port), taken
 * from the parsed URL, exactly equals the origin of the operator's ntfy relay.
 * Never a string-prefix test: `https://ntfy.example.com.evil.tld/x` starts with
 * `https://ntfy.example.com`, and `https://ntfy.example.com@evil.tld/x` names
 * evil.tld as its host.
 *
 * Trusted origins come from:
 *   - NTFY_URL         the address the backend uses to reach the relay
 *                      (often an internal address such as http://ntfy:80)
 *   - NTFY_PUBLIC_URL  the address devices register (e.g. https://push.example.org),
 *                      needed when it differs from NTFY_URL
 *
 * Neither set => there is no trusted origin and every URL endpoint is refused
 * (fail closed). "No relay configured" must never mean "accept anything".
 */

export interface PushRelayEnv {
  NTFY_URL?: string
  NTFY_PUBLIC_URL?: string
}

/** Parse a URL, returning null (never throwing) when it is not a valid absolute URL. */
function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** Origin of a configured relay URL, or null if unset/unparseable/non-http(s). */
function relayOrigin(value: string | undefined): string | null {
  if (!value) return null
  const url = parseUrl(value)
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null
  return url.origin
}

/** Distinct, normalised origins of the operator's relay. Empty when none is configured. */
export function resolveTrustedPushOrigins(env: PushRelayEnv): string[] {
  const origins = [relayOrigin(env.NTFY_URL), relayOrigin(env.NTFY_PUBLIC_URL)]
  return [...new Set(origins.filter((o): o is string => o !== null))]
}

/**
 * The origin a device's distributor should be pointed at — what registration
 * rejections tell the client. Prefers the public origin over the (possibly
 * internal) backend-facing one.
 */
export function expectedPushOrigin(env: PushRelayEnv): string | null {
  return relayOrigin(env.NTFY_PUBLIC_URL) ?? relayOrigin(env.NTFY_URL)
}

/** True when the endpoint's parsed origin exactly matches one of `trustedOrigins`. */
export function isTrustedPushEndpoint(endpoint: string, trustedOrigins: readonly string[]): boolean {
  const url = parseUrl(endpoint)
  if (!url) return false
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  // Userinfo has no legitimate use in an endpoint and is the classic way to
  // make a hostile URL read as a trusted one.
  if (url.username !== '' || url.password !== '') return false
  return trustedOrigins.includes(url.origin)
}

/**
 * True when a registered push token is a URL (UnifiedPush endpoint) rather than
 * an opaque APNs/FCM token. Deliberately broader than `includes('://')`:
 * `https:evil.example` has no slashes yet the WHATWG parser resolves it to
 * https://evil.example/.
 */
export function isUrlPushToken(token: string): boolean {
  return token.includes('://') || parseUrl(token) !== null
}
