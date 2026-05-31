package org.llamenos.hotline

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for relay URL validation in the device-linking flow (H10/H33).
 *
 * Validation now lives in [RelayUrlValidator], which enforces both scheme
 * (wss:// required) and host (no private/reserved addresses) constraints.
 *
 * These tests exercise the full URL path — scheme + host — that [RelayUrlValidator]
 * validates during QR code provisioning.
 */
class DeviceLinkViewModelTest {

    // ---- Scheme enforcement (new in H33 fix) ----

    @Test
    fun `rejects ws scheme`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("ws://relay.llamenos.org/relay"))
    }

    @Test
    fun `rejects http scheme`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("http://relay.llamenos.org/relay"))
    }

    @Test
    fun `accepts wss scheme`() {
        assertTrue(RelayUrlValidator.isValidRelayUrl("wss://relay.llamenos.org/relay"))
    }

    // ---- Loopback addresses ----

    @Test
    fun `rejects localhost`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://localhost/relay"))
    }

    @Test
    fun `rejects localhost case insensitive`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://LOCALHOST/relay"))
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://Localhost/relay"))
    }

    @Test
    fun `rejects 127_0_0_1`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://127.0.0.1/relay"))
    }

    @Test
    fun `rejects IPv6 loopback`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://[::1]/relay"))
    }

    // ---- RFC 1918 Class A (10.x.x.x) ----

    @Test
    fun `rejects 10_0_0_1`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://10.0.0.1/relay"))
    }

    @Test
    fun `rejects 10_255_255_255`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://10.255.255.255/relay"))
    }

    @Test
    fun `rejects 10_0_2_2 emulator host`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://10.0.2.2/relay"))
    }

    // ---- RFC 1918 Class B (172.16-31.x.x) ----

    @Test
    fun `rejects 172_16_0_1`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://172.16.0.1/relay"))
    }

    @Test
    fun `rejects 172_31_255_255`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://172.31.255.255/relay"))
    }

    @Test
    fun `allows 172_15_0_1`() {
        assertTrue(RelayUrlValidator.isValidRelayUrl("wss://172.15.0.1/relay"))
    }

    @Test
    fun `allows 172_32_0_1`() {
        assertTrue(RelayUrlValidator.isValidRelayUrl("wss://172.32.0.1/relay"))
    }

    // ---- RFC 1918 Class C (192.168.x.x) ----

    @Test
    fun `rejects 192_168_0_1`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://192.168.0.1/relay"))
    }

    @Test
    fun `rejects 192_168_50_95`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://192.168.50.95/relay"))
    }

    // ---- Link-local ----

    @Test
    fun `rejects 169_254_x_x`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://169.254.1.1/relay"))
    }

    @Test
    fun `rejects fe80 IPv6 link-local`() {
        assertFalse(RelayUrlValidator.isValidRelayUrl("wss://fe80::1/relay"))
    }

    // ---- Valid public relay URLs ----

    @Test
    fun `allows public domain`() {
        assertTrue(RelayUrlValidator.isValidRelayUrl("wss://relay.llamenos.org/relay"))
    }

    @Test
    fun `allows public IP`() {
        assertTrue(RelayUrlValidator.isValidRelayUrl("wss://1.2.3.4/relay"))
    }

    @Test
    fun `allows cloudflare domain`() {
        assertTrue(RelayUrlValidator.isValidRelayUrl("wss://app.llamenos.org/relay"))
    }

    @Test
    fun `allows public relay`() {
        assertTrue(RelayUrlValidator.isValidRelayUrl("wss://relay.damus.io/relay"))
    }
}
