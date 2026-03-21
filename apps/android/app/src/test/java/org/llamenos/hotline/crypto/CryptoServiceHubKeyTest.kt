package org.llamenos.hotline.crypto

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.llamenos.protocol.HubKeyEnvelopeResponse
import org.llamenos.protocol.HubKeyEnvelopeResponseEnvelope

/**
 * Unit tests for CryptoService hub key management methods:
 * [CryptoService.hasHubKey], [CryptoService.loadHubKey],
 * [CryptoService.allHubKeys], [CryptoService.clearHubKeys].
 *
 * These tests run on JVM where the native llamenos_core library is NOT available
 * (nativeLibLoaded=false). Methods that delegate to the native library will throw
 * [IllegalStateException] — this is the correct C6 hard-fail behaviour.
 *
 * For [hasHubKey], [allHubKeys], and [clearHubKeys] — which do NOT require native
 * crypto — we inject test state directly via [CryptoService.injectHubKeyForTest]
 * to simulate a loaded key and verify pure cache semantics.
 *
 * [loadHubKey] is verified to throw [IllegalStateException] when the native lib is
 * absent, ensuring the hard-fail invariant holds.
 */
class CryptoServiceHubKeyTest {

    private lateinit var cryptoService: CryptoService

    @Before
    fun setup() {
        cryptoService = CryptoService()
        // Confirm: JVM test environment has no native lib
        assertFalse(
            "Native library must not be available in JVM tests",
            cryptoService.nativeLibLoaded,
        )
    }

    // ---- hasHubKey ----

    @Test
    fun `hasHubKey returns false for unknown hub`() {
        assertFalse(cryptoService.hasHubKey("hub-unknown"))
    }

    @Test
    fun `hasHubKey returns true after key is injected`() {
        cryptoService.injectHubKeyForTest("hub-abc", ByteArray(32) { it.toByte() })
        assertTrue(cryptoService.hasHubKey("hub-abc"))
    }

    @Test
    fun `hasHubKey is hub-specific — other hubs return false`() {
        cryptoService.injectHubKeyForTest("hub-1", ByteArray(32))
        assertFalse(cryptoService.hasHubKey("hub-2"))
    }

    // ---- clearHubKeys ----

    @Test
    fun `clearHubKeys removes all cached keys`() {
        cryptoService.injectHubKeyForTest("hub-1", ByteArray(32))
        cryptoService.injectHubKeyForTest("hub-2", ByteArray(32))
        cryptoService.clearHubKeys()
        assertFalse(cryptoService.hasHubKey("hub-1"))
        assertFalse(cryptoService.hasHubKey("hub-2"))
    }

    @Test
    fun `clearHubKeys is safe when cache is already empty`() {
        cryptoService.clearHubKeys()
        assertFalse(cryptoService.hasHubKey("hub-1"))
    }

    @Test
    fun `clearHubKeys is idempotent`() {
        cryptoService.injectHubKeyForTest("hub-x", ByteArray(32))
        cryptoService.clearHubKeys()
        cryptoService.clearHubKeys()
        assertFalse(cryptoService.hasHubKey("hub-x"))
    }

    // ---- lock clears hub keys ----

    @Test
    fun `lock evicts hub keys`() {
        cryptoService.injectHubKeyForTest("hub-1", ByteArray(32))
        cryptoService.lock()
        assertFalse(cryptoService.hasHubKey("hub-1"))
    }

    // ---- allHubKeys ----

    @Test
    fun `allHubKeys returns empty map when cache is empty`() {
        assertTrue(cryptoService.allHubKeys().isEmpty())
    }

    @Test
    fun `allHubKeys returns all cached hubs`() {
        val key1 = ByteArray(32) { 0x01 }
        val key2 = ByteArray(32) { 0x02 }
        cryptoService.injectHubKeyForTest("hub-a", key1)
        cryptoService.injectHubKeyForTest("hub-b", key2)

        val all = cryptoService.allHubKeys()
        assertEquals(2, all.size)
        assertArrayEquals(key1, all["hub-a"])
        assertArrayEquals(key2, all["hub-b"])
    }

    @Test
    fun `allHubKeys returns a snapshot copy not the internal map`() {
        cryptoService.injectHubKeyForTest("hub-snap", ByteArray(32))

        val snapshot = cryptoService.allHubKeys()
        // Mutate the snapshot — should not affect the service's internal cache
        (snapshot as? MutableMap)?.put("hub-injected", ByteArray(32))

        // Internal cache is unchanged
        assertFalse(cryptoService.hasHubKey("hub-injected"))
    }

    @Test
    fun `allHubKeys snapshot is not the same object as internal map`() {
        val snapshot1 = cryptoService.allHubKeys()
        val snapshot2 = cryptoService.allHubKeys()
        // Each call returns a new copy
        assertNotSame(snapshot1, snapshot2)
    }

    // ---- loadHubKey: C6 hard-fail without native lib ----

    @Test(expected = IllegalStateException::class)
    fun `loadHubKey throws without native lib`(): Unit = runBlocking {
        val envelope = HubKeyEnvelopeResponse(
            envelope = HubKeyEnvelopeResponseEnvelope(
                ephemeralPubkey = "02" + "ab".repeat(32),
                pubkey = "cd".repeat(32),
                wrappedKey = "AAEC".repeat(16), // base64 placeholder
            )
        )
        cryptoService.loadHubKey("hub-test", envelope)
    }
}
