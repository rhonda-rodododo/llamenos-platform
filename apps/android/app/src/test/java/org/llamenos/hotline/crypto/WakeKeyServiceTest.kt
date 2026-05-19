package org.llamenos.hotline.crypto

import io.mockk.every
import io.mockk.mockk
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class WakeKeyServiceTest {

    @Test
    fun `getOrCreateWakePublicKey returns stored key if available`() {
        val keystoreService = mockk<KeystoreService>(relaxed = true)
        every { keystoreService.retrieve(WakeKeyService.KEY_WAKE_PUBKEY) } returns "deadbeef".repeat(8)
        val service = WakeKeyService(keystoreService)
        val result = service.getOrCreateWakePublicKey()
        assertEquals("deadbeef".repeat(8), result)
    }

    @Test
    fun `getOrCreateWakePublicKey throws when native FFI unavailable and no stored key`() {
        // Without native libs, generating a new keypair must throw rather than
        // silently returning a random public key that the server cannot use.
        val keystoreService = mockk<KeystoreService>(relaxed = true)
        every { keystoreService.retrieve(WakeKeyService.KEY_WAKE_PUBKEY) } returns null
        val service = WakeKeyService(keystoreService)
        if (service.isNativeLoaded()) {
            // Native available — test the happy path length instead.
            val pubKey = service.getOrCreateWakePublicKey()
            assertEquals(64, pubKey.length,
                "Wake public key must be 64 hex chars (32 bytes X25519)"
            )
        } else {
            // Native unavailable — must throw, not return random bytes.
            assertFailsWith<IllegalStateException> {
                service.getOrCreateWakePublicKey()
            }
        }
    }

    @Test
    fun `isNativeLoaded method exists`() {
        val keystoreService = mockk<KeystoreService>(relaxed = true)
        val service = WakeKeyService(keystoreService)
        // Just verify the method is callable — result depends on test environment.
        val _ = service.isNativeLoaded()
    }
}
