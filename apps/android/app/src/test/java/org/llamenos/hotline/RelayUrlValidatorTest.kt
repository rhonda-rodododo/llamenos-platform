package org.llamenos.hotline

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for [RelayUrlValidator] relay URL injection defence (H33).
 *
 * Covers:
 * - Scheme enforcement (wss/https accepted, ws/http rejected)
 * - Private/loopback host rejection (SSRF prevention)
 * - Domain-match enforcement for deep-link relay parameters
 */
class RelayUrlValidatorTest {

    // ── Scheme enforcement ────────────────────────────────────────────────────

    @Test
    fun `accepts wss scheme`() {
        assertTrue(RelayUrlValidator.isValidRelayUrl("wss://relay.llamenos.org/relay"))
    }

    @Test
    fun `accepts https scheme`() {
        assertTrue(RelayUrlValidator.isValidRelayUrl("https://relay.llamenos.org/relay"))
    }

    @Test
    fun `rejects ws scheme`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("ws://relay.llamenos.org/relay"))
    }

    @Test
    fun `rejects http scheme`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("http://relay.llamenos.org/relay"))
    }

    @Test
    fun `rejects scheme-relative url`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("//relay.llamenos.org/relay"))
    }

    @Test
    fun `rejects bare hostname without scheme`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("relay.llamenos.org"))
    }

    @Test
    fun `rejects empty string`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl(""))
    }

    @Test
    fun `rejects malformed url`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("not-a-url"))
    }

    // ── Loopback address rejection ────────────────────────────────────────────

    @Test
    fun `rejects localhost`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://localhost/relay"))
    }

    @Test
    fun `rejects 127_0_0_1`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://127.0.0.1/relay"))
    }

    @Test
    fun `rejects IPv6 loopback`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://[::1]/relay"))
    }

    // ── RFC 1918 private range rejection ─────────────────────────────────────

    @Test
    fun `rejects 10_x private range`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://10.0.0.1/relay"))
    }

    @Test
    fun `rejects 10_255_255_255`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://10.255.255.255/relay"))
    }

    @Test
    fun `rejects 192_168 private range`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://192.168.1.1/relay"))
    }

    @Test
    fun `rejects 172_16 private range`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://172.16.0.1/relay"))
    }

    @Test
    fun `rejects 172_31 private range`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://172.31.255.255/relay"))
    }

    @Test
    fun `allows 172_15 (not private)`() {
        assertTrue(RelayUrlValidator.isValidRelayUrl("wss://172.15.0.1/relay"))
    }

    @Test
    fun `allows 172_32 (not private)`() {
        assertTrue(RelayUrlValidator.isValidRelayUrl("wss://172.32.0.1/relay"))
    }

    // ── Link-local rejection ──────────────────────────────────────────────────

    @Test
    fun `rejects 169_254 link-local`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://169.254.1.1/relay"))
    }

    @Test
    fun `rejects fe80 IPv6 link-local`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://fe80::1/relay"))
    }

    // ── Valid public relay URLs ───────────────────────────────────────────────

    @Test
    fun `accepts public relay domain`() {
        assertTrue(RelayUrlValidator.isValidRelayUrl("wss://relay.llamenos.org/relay"))
    }

    @Test
    fun `accepts public IP`() {
        assertTrue(RelayUrlValidator.isValidRelayUrl("wss://1.2.3.4/relay"))
    }

    @Test
    fun `accepts relay with port`() {
        assertTrue(RelayUrlValidator.isValidRelayUrl("wss://relay.llamenos.org:4443/relay"))
    }

    // ── Domain-match enforcement (deep-link relay params) ─────────────────────

    @Test
    fun `accepts relay matching configured hub domain`() {
        assertTrue(
            RelayUrlValidator.isValidRelayUrl(
                "wss://relay.llamenos.org/relay",
                "https://relay.llamenos.org",
            )
        )
    }

    @Test
    fun `accepts relay as subdomain of configured hub domain`() {
        assertTrue(
            RelayUrlValidator.isValidRelayUrl(
                "wss://ws.hub.llamenos.org/relay",
                "https://hub.llamenos.org",
            )
        )
    }

    @Test
    fun `rejects relay on foreign domain`() {
        assertFalse(
            RelayUrlValidator.isValidRelayUrl(
                "wss://evil.com/relay",
                "https://relay.llamenos.org",
            )
        )
    }

    @Test
    fun `rejects relay that looks like subdomain but is different domain`() {
        // "relay.llamenos.org.evil.com" should NOT be accepted for hub "relay.llamenos.org"
        assertFalse(
            RelayUrlValidator.isValidRelayUrl(
                "wss://relay.llamenos.org.evil.com/relay",
                "https://relay.llamenos.org",
            )
        )
    }

    @Test
    fun `rejects ws scheme even when domain matches`() {
        assertFalse(
            RelayUrlValidator.isValidRelayUrl(
                "ws://relay.llamenos.org/relay",
                "https://relay.llamenos.org",
            )
        )
    }

    @Test
    fun `rejects http scheme even when domain matches`() {
        assertFalse(
            RelayUrlValidator.isValidRelayUrl(
                "http://relay.llamenos.org/relay",
                "https://relay.llamenos.org",
            )
        )
    }

    @Test
    fun `rejects private host even with matching domain`() {
        // Hub URL itself should never be private, but defensive check
        assertFalse(
            RelayUrlValidator.isValidRelayUrl(
                "wss://192.168.1.1/relay",
                "https://192.168.1.1",
            )
        )
    }

    @Test
    fun `rejects relay when hub url is malformed`() {
        assertFalse(
            RelayUrlValidator.isValidRelayUrl(
                "wss://relay.llamenos.org/relay",
                "not-a-url",
            )
        )
    }
}
