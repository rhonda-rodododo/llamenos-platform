package org.llamenos.hotline.crypto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/**
 * Unit tests for [EphemeralKeypair] zeroization behavior.
 *
 * Verifies that secret key material is properly zeroized when [close] is called,
 * preventing key material from lingering in JVM memory after use.
 */
class EphemeralKeypairTest {

    @Test
    fun `secretHex returns correct hex encoding`() {
        val bytes = byteArrayOf(0x0a, 0x1b, 0x2c, 0xff.toByte())
        val keypair = EphemeralKeypair("pubkey", bytes)
        assertEquals("0a1b2cff", keypair.secretHex())
        keypair.close()
    }

    @Test
    fun `close zeroizes secret bytes`() {
        val keypair = EphemeralKeypair("pubkey", byteArrayOf(1, 2, 3, 4))
        // Before close, secretHex should have non-zero content
        assertNotEquals("00000000", keypair.secretHex())
        keypair.close()
        // After close, all bytes should be zero
        assertEquals("00000000", keypair.secretHex())
    }

    @Test
    fun `close is idempotent`() {
        val keypair = EphemeralKeypair("pubkey", byteArrayOf(0x41, 0x42))
        keypair.close()
        keypair.close()
        assertEquals("0000", keypair.secretHex())
    }

    @Test
    fun `publicKeyHex is preserved after close`() {
        val keypair = EphemeralKeypair("mypubkey", byteArrayOf(1, 2))
        keypair.close()
        assertEquals("mypubkey", keypair.publicKeyHex)
    }

    @Test
    fun `use block zeroizes automatically`() {
        var secretAfterUse: String? = null
        val keypair = EphemeralKeypair("pub", byteArrayOf(0xde.toByte(), 0xad.toByte()))
        keypair.use {
            assertNotEquals("0000", it.secretHex())
        }
        secretAfterUse = keypair.secretHex()
        assertEquals("0000", secretAfterUse)
    }

    @Test
    fun `32-byte key round-trips correctly before close`() {
        val bytes = ByteArray(32) { (it + 1).toByte() }
        val keypair = EphemeralKeypair("pub", bytes)
        val hex = keypair.secretHex()
        assertEquals(64, hex.length) // 32 bytes = 64 hex chars
        keypair.close()
        // After close, should be all zeros
        assertEquals("0".repeat(64), keypair.secretHex())
    }
}
