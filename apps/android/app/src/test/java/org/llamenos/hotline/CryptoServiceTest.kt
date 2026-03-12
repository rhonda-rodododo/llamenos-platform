package org.llamenos.hotline

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.llamenos.hotline.crypto.CryptoService

/**
 * Unit tests for [CryptoService].
 *
 * These tests run on JVM where the native lib cannot be loaded.
 * Since Epic 261 (C6), CryptoService hard-fails without the native library —
 * all crypto operations throw [IllegalStateException].
 *
 * Tests verify:
 * 1. Every crypto method throws when nativeLibLoaded=false (security invariant)
 * 2. State management (lock/unlock) works independently of crypto
 * 3. The nativeLibLoaded flag is correctly false in JVM tests
 */
class CryptoServiceTest {

    private lateinit var cryptoService: CryptoService

    @Before
    fun setup() {
        cryptoService = CryptoService()
    }

    @Test
    fun `native lib not loaded in JVM tests`() {
        assertFalse("nativeLibLoaded should be false in JVM tests", cryptoService.nativeLibLoaded)
    }

    @Test
    fun `initially not unlocked`() {
        assertFalse(cryptoService.isUnlocked)
        assertNull(cryptoService.pubkey)
        assertNull(cryptoService.npub)
    }

    // ---- C6: Hard-fail without native library ----

    @Test(expected = IllegalStateException::class)
    fun `generateKeypair throws without native lib`() {
        cryptoService.generateKeypair()
    }

    @Test(expected = IllegalStateException::class)
    fun `importNsec throws without native lib`() {
        cryptoService.importNsec("nsec1" + "a".repeat(58))
    }

    @Test(expected = IllegalStateException::class)
    fun `encryptForStorage throws without native lib`(): Unit = runBlocking {
        cryptoService.encryptForStorage("1234")
    }

    @Test(expected = IllegalStateException::class)
    fun `decryptFromStorage throws without native lib`(): Unit = runBlocking {
        val data = org.llamenos.hotline.crypto.EncryptedKeyData(
            ciphertext = "test",
            salt = "test",
            nonce = "test",
            pubkeyHex = "test",
        )
        cryptoService.decryptFromStorage(data, "1234")
    }

    @Test(expected = IllegalStateException::class)
    fun `createAuthTokenSync throws without native lib`() {
        cryptoService.createAuthTokenSync("GET", "/api/v1/identity")
    }

    @Test(expected = IllegalStateException::class)
    fun `createAuthToken throws without native lib`(): Unit = runBlocking {
        cryptoService.createAuthToken("GET", "/api/v1/identity")
    }

    @Test(expected = IllegalStateException::class)
    fun `encryptNote throws without native lib`(): Unit = runBlocking {
        cryptoService.encryptNote("""{"text":"test"}""", emptyList())
    }

    @Test(expected = IllegalStateException::class)
    fun `decryptNote throws without native lib`(): Unit = runBlocking {
        val envelope = org.llamenos.protocol.RecipientEnvelope(
            pubkey = "test",
            wrappedKey = "test",
            ephemeralPubkey = "test",
        )
        cryptoService.decryptNote("test", envelope)
    }

    @Test(expected = IllegalStateException::class)
    fun `encryptMessage throws without native lib`(): Unit = runBlocking {
        cryptoService.encryptMessage("test", listOf("pubkey1"))
    }

    @Test(expected = IllegalStateException::class)
    fun `decryptMessage throws without native lib`(): Unit = runBlocking {
        cryptoService.decryptMessage("test", "wrappedKey", "ephemeralPubkey")
    }

    @Test(expected = IllegalStateException::class)
    fun `generateEphemeralKeypair throws without native lib`() {
        cryptoService.generateEphemeralKeypair()
    }

    @Test(expected = IllegalStateException::class)
    fun `deriveSharedSecret throws without native lib`() {
        cryptoService.deriveSharedSecret("a".repeat(64), "b".repeat(64))
    }

    @Test(expected = IllegalStateException::class)
    fun `decryptWithSharedSecret throws without native lib`(): Unit = runBlocking {
        cryptoService.decryptWithSharedSecret("test", "test")
    }

    @Test(expected = IllegalStateException::class)
    fun `deriveSASCode throws without native lib`() {
        cryptoService.deriveSASCode("a".repeat(64))
    }

    // ---- State management (no native lib needed) ----

    @Test
    fun `lock is safe when not unlocked`() {
        cryptoService.lock()
        assertFalse(cryptoService.isUnlocked)
    }

    @Test
    fun `lock is idempotent`() {
        cryptoService.lock()
        cryptoService.lock()
        assertFalse(cryptoService.isUnlocked)
    }

    @Test
    fun `importNsec rejects invalid prefix before native check`() {
        try {
            cryptoService.importNsec("invalid_key_format")
            assertTrue("Should have thrown", false)
        } catch (e: org.llamenos.hotline.crypto.CryptoException) {
            assertTrue(e.message!!.contains("nsec1"))
        }
    }
}
