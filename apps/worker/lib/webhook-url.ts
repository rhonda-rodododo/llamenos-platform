/**
 * Build the canonical webhook URL for HMAC signature verification.
 *
 * Telephony providers (Twilio, SignalWire, Plivo) compute their webhook HMAC
 * over the full request URL (scheme + host + path + query). If the server
 * trusts the Host header from the incoming request, an attacker can spoof it
 * to change the signed string and bypass signature validation.
 *
 * This helper replaces the origin with the operator-configured WEBHOOK_BASE_URL,
 * so the signed string always reflects the known public URL — not whatever host
 * the attacker supplied.
 *
 * @param request - Incoming webhook request
 * @param baseUrl - Configured public base URL (e.g. "https://api.llamenos.org")
 *                  When empty, falls back to request.url (unsafe — dev only).
 */
export function buildWebhookUrl(request: Request, baseUrl: string): URL {
  const reqUrl = new URL(request.url)
  if (!baseUrl) {
    // Fallback: use request URL as-is. Only acceptable in dev/test.
    return reqUrl
  }
  const base = new URL(baseUrl)
  return new URL(base.origin + reqUrl.pathname + reqUrl.search)
}
