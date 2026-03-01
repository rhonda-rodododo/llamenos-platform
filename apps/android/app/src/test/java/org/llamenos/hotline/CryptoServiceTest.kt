package org.llamenos.hotline

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.llamenos.hotline.crypto.CryptoException
import org.llamenos.hotline.crypto.CryptoService

/**
 * Unit tests for [CryptoService].
 *
 * These tests run against the placeholder implementations (native lib not loaded).
 * When llamenos-core .so files are linked (Epic 201), these tests should be
 * converted to instrumented tests that run on a device/emulator with the JNI lib.
 */
class CryptoServiceTest {

    private lateinit var cryptoService: CryptoService

    @Before
    fun setup() {
        cryptoService = CryptoService()
    }

    @Test
    fun `initially not unlocked`() {
        assertFalse(cryptoService.isUnlocked)
        assertNull(cryptoService.pubkey)
        assertNull(cryptoService.npub)
    }

    @Test
    fun `generate keypair produces valid nsec and npub`() {
        val (nsec, npub) = cryptoService.generateKeypair()

        assertTrue("nsec should start with 'nsec1'", nsec.startsWith("nsec1"))
        assertTrue("npub should start with 'npub1'", npub.startsWith("npub1"))
        assertTrue("should be unlocked after generating", cryptoService.isUnlocked)
        assertNotNull("pubkey should be set", cryptoService.pubkey)
        assertNotNull("npub should be set", cryptoService.npub)
    }

    @Test
    fun `generate keypair produces unique keys`() {
        val (nsec1, npub1) = cryptoService.generateKeypair()
        val pubkey1 = cryptoService.pubkey

        // Create a second service to generate another keypair
        val secondService = CryptoService()
        val (nsec2, npub2) = secondService.generateKeypair()
        val pubkey2 = secondService.pubkey

        assertTrue("nsec values should be unique", nsec1 != nsec2)
        assertTrue("npub values should be unique", npub1 != npub2)
        assertTrue("pubkeys should be unique", pubkey1 != pubkey2)
    }

    @Test
    fun `import nsec sets unlocked state`() {
        val (nsec, _) = cryptoService.generateKeypair()
        val importService = CryptoService()

        importService.importNsec(nsec)

        assertTrue("should be unlocked after import", importService.isUnlocked)
        assertNotNull("pubkey should be set", importService.pubkey)
        assertNotNull("npub should be set", importService.npub)
    }

    @Test(expected = CryptoException::class)
    fun `import nsec rejects invalid prefix`() {
        cryptoService.importNsec("invalid_key_format")
    }

    @Test(expected = CryptoException::class)
    fun `import nsec rejects too short key`() {
        cryptoService.importNsec("nsec1abc")
    }

    @Test
    fun `lock clears private key but retains pubkey`() {
        cryptoService.generateKeypair()
        val pubkeyBefore = cryptoService.pubkey
        val npubBefore = cryptoService.npub

        cryptoService.lock()

        assertFalse("should not be unlocked after lock", cryptoService.isUnlocked)
        assertEquals("pubkey should be retained", pubkeyBefore, cryptoService.pubkey)
        assertEquals("npub should be retained", npubBefore, cryptoService.npub)
    }

    @Test
    fun `lock is idempotent`() {
        cryptoService.generateKeypair()
        cryptoService.lock()
        cryptoService.lock()

        assertFalse(cryptoService.isUnlocked)
    }

    @Test
    fun `create auth token sync returns valid token`() {
        cryptoService.generateKeypair()

        val token = cryptoService.createAuthTokenSync("GET", "/api/v1/identity")

        assertNotNull("pubkey should be set", token.pubkey)
        assertTrue("timestamp should be recent", token.timestamp > 0)
        assertTrue("token should not be empty", token.token.isNotEmpty())
        assertEquals("pubkey should match", cryptoService.pubkey, token.pubkey)
    }

    @Test(expected = CryptoException::class)
    fun `create auth token fails when locked`() {
        cryptoService.createAuthTokenSync("GET", "/api/v1/identity")
    }

    @Test
    fun `create auth token suspend version works`() = runBlocking {
        cryptoService.generateKeypair()

        val token = cryptoService.createAuthToken("POST", "/api/v1/notes")

        assertNotNull(token)
        assertEquals(cryptoService.pubkey, token.pubkey)
    }

    @Test
    fun `encrypt for storage requires valid PIN`() = runBlocking {
        cryptoService.generateKeypair()

        try {
            cryptoService.encryptForStorage("12") // Too short
            assertTrue("Should have thrown", false)
        } catch (e: CryptoException) {
            assertTrue(e.message!!.contains("4-6 digits"))
        }
    }

    @Test
    fun `encrypt for storage with valid PIN succeeds`() = runBlocking {
        cryptoService.generateKeypair()
        val pubkey = cryptoService.pubkey!!

        val encrypted = cryptoService.encryptForStorage("1234")

        assertNotNull("ciphertext should not be null", encrypted.ciphertext)
        assertNotNull("salt should not be null", encrypted.salt)
        assertNotNull("nonce should not be null", encrypted.nonce)
        assertEquals("pubkey should match", pubkey, encrypted.pubkeyHex)
    }

    @Test
    fun `decrypt from storage restores key`() = runBlocking {
        cryptoService.generateKeypair()
        val originalPubkey = cryptoService.pubkey!!

        val encrypted = cryptoService.encryptForStorage("5678")
        cryptoService.lock()
        assertFalse(cryptoService.isUnlocked)

        cryptoService.decryptFromStorage(encrypted, "5678")

        assertTrue("should be unlocked after decrypt", cryptoService.isUnlocked)
        assertEquals("pubkey should match original", originalPubkey, cryptoService.pubkey)
    }

    @Test
    fun `encrypt note produces valid output`() = runBlocking {
        cryptoService.generateKeypair()
        val adminPubkeys = listOf("admin1pubkey", "admin2pubkey")

        val encrypted = cryptoService.encryptNote(
            payload = """{"text":"Test note content"}""",
            adminPubkeys = adminPubkeys,
        )

        assertNotNull("ciphertext should not be null", encrypted.ciphertext)
        // Should have envelopes for: author + 2 admins = 3
        assertEquals("should have 3 envelopes", 3, encrypted.envelopes.size)
        assertEquals(
            "first envelope should be for author",
            cryptoService.pubkey,
            encrypted.envelopes[0].recipientPubkey,
        )
    }

    @Test(expected = CryptoException::class)
    fun `encrypt note fails when locked`(): Unit = runBlocking {
        cryptoService.encryptNote("""{"text":"test"}""", emptyList())
    }
}
