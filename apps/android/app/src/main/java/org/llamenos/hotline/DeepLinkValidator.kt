package org.llamenos.hotline

import android.net.Uri

/**
 * Validates deep link URIs against an explicit allowlist.
 *
 * The app registers as a handler for `llamenos://` URIs. Without an allowlist,
 * a malicious app could craft `llamenos://admin/dangerous-action` URIs and trick
 * users into triggering them via NFC, QR codes, or share targets.
 *
 * Only URIs in [ALLOWED_HOSTS] are accepted. All others are silently dropped.
 *
 * Relay URL parameters in deep links are separately validated via [isValidRelayParam]
 * to prevent relay URL injection attacks (H33).
 */
object DeepLinkValidator {

    /** Allowed hosts within the `llamenos://` scheme. */
    private val ALLOWED_HOSTS = setOf(
        "oauth",  // OAuth provider callbacks: llamenos://oauth/callback
        "call",   // Call handling: llamenos://call/answer
        "hub",    // Hub switching (user-initiated only): llamenos://hub/switch
    )

    /** Sensitive hosts that require user confirmation before acting. */
    private val CONFIRMATION_REQUIRED_HOSTS = setOf(
        "hub",  // Hub switches require explicit user intent confirmation
    )

    /**
     * Returns true if [uri] is a valid, allowed deep link.
     * Validates scheme and host against the allowlist.
     */
    fun isAllowed(uri: Uri?): Boolean {
        if (uri == null) return false
        if (uri.scheme != "llamenos") return false
        return uri.host in ALLOWED_HOSTS
    }

    /**
     * Returns true if [uri] requires user confirmation before processing.
     * Used for actions that could change app state in ways the user may not expect
     * when triggered via external deep links.
     */
    fun requiresConfirmation(uri: Uri): Boolean {
        return uri.host in CONFIRMATION_REQUIRED_HOSTS
    }

    /**
     * Returns true if a `relayUrl` query parameter extracted from a deep link is safe.
     *
     * Always prefer the two-argument overload in production code — pairing the relay
     * URL with the configured hub URL ensures the relay belongs to the user's own server
     * and prevents MITM via foreign-domain relay injection.
     *
     * @param relayUrl The relay URL extracted from the deep link parameter.
     * @param configuredHubUrl The hub URL stored in the keystore. When provided, the relay
     *   host must match (or be a subdomain of) the hub host.
     */
    fun isValidRelayParam(relayUrl: String, configuredHubUrl: String? = null): Boolean =
        if (configuredHubUrl != null) {
            RelayUrlValidator.isValidRelayUrl(relayUrl, configuredHubUrl)
        } else {
            RelayUrlValidator.isValidRelayUrl(relayUrl)
        }
}
