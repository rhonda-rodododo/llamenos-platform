package org.llamenos.hotline

import java.net.URI

/**
 * Validates relay WebSocket URLs before connection.
 *
 * Guards against relay URL injection attacks where a crafted deep link or QR code
 * points the app to a malicious relay server that can intercept communications (H33).
 *
 * Two validation levels:
 * - [isValidRelayUrl] — basic: requires encrypted scheme + non-private host
 * - [isValidRelayUrl] with [configuredHubUrl] — strict: also enforces domain match
 *
 * Usage:
 * - Deep-link relay params: use the two-argument overload so the relay must
 *   belong to the user's configured hub server.
 * - QR-code provisioning relay: use the single-argument overload (the provisioning
 *   relay may differ from the hub server if no hub is configured yet).
 */
object RelayUrlValidator {

    /**
     * Returns true if [relayUrl] is safe for relay connection:
     * - Scheme is `wss://` or `https://` — rejects plaintext `ws://`/`http://`
     * - Host is not loopback, RFC 1918 private, or link-local (SSRF prevention)
     * - URL parses as a valid URI
     */
    fun isValidRelayUrl(relayUrl: String): Boolean {
        val uri = parseUri(relayUrl) ?: return false
        if (!isSafeScheme(uri.scheme)) return false
        val host = uri.host ?: return false
        return isValidPublicHost(host)
    }

    /**
     * Returns true if [relayUrl] passes the basic check AND its host matches
     * (or is a subdomain of) the host in [configuredHubUrl].
     *
     * Used for deep-link relay parameters: the relay must belong to the user's
     * configured hub server, preventing MITM via foreign-domain relay injection.
     */
    fun isValidRelayUrl(relayUrl: String, configuredHubUrl: String): Boolean {
        if (!isValidRelayUrl(relayUrl)) return false
        val relayUri = parseUri(relayUrl) ?: return false
        val hubUri = parseUri(configuredHubUrl) ?: return false
        val relayHost = relayUri.host?.lowercase() ?: return false
        val hubHost = hubUri.host?.lowercase() ?: return false
        return relayHost == hubHost || relayHost.endsWith(".$hubHost")
    }

    /**
     * Returns true if [scheme] is an encrypted transport scheme.
     * Accepts `wss` (WebSocket Secure) and `https` only.
     */
    internal fun isSafeScheme(scheme: String?): Boolean =
        scheme == "wss" || scheme == "https"

    /**
     * Returns true if [host] is a publicly routable address.
     *
     * Rejects:
     * - localhost, 127.0.0.1, ::1, [::1] (loopback)
     * - 10.x.x.x (RFC 1918 Class A)
     * - 172.16–31.x.x (RFC 1918 Class B)
     * - 192.168.x.x (RFC 1918 Class C)
     * - 169.254.x.x (IPv4 link-local)
     * - fe80: (IPv6 link-local)
     */
    internal fun isValidPublicHost(host: String): Boolean {
        val lower = host.lowercase().trimStart('[').trimEnd(']')
        if (lower == "localhost" || lower == "127.0.0.1" || lower == "::1") return false

        val blockedPrefixes = listOf("10.", "192.168.", "169.254.", "fe80:") +
            (16..31).map { "172.$it." }
        return blockedPrefixes.none { lower.startsWith(it) }
    }

    private fun parseUri(url: String): URI? = try {
        URI(url)
    } catch (_: Exception) {
        null
    }
}
