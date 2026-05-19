package org.llamenos.hotline.crypto

import org.junit.Test
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class KeystoreServiceBiometricTest {

    @Test
    fun `biometric key alias constant is defined`() {
        assertNotNull(KeystoreService.BIOMETRIC_KEY_ALIAS)
        assertTrue(KeystoreService.BIOMETRIC_KEY_ALIAS.isNotEmpty())
    }

    @Test
    fun `biometric encrypted PIN storage key constant is defined`() {
        assertNotNull(KeystoreService.KEY_BIOMETRIC_ENCRYPTED_PIN)
        assertTrue(KeystoreService.KEY_BIOMETRIC_ENCRYPTED_PIN.isNotEmpty())
    }

    @Test
    fun `biometric PIN IV storage key constant is defined`() {
        assertNotNull(KeystoreService.KEY_BIOMETRIC_PIN_IV)
        assertTrue(KeystoreService.KEY_BIOMETRIC_PIN_IV.isNotEmpty())
    }

    @Test
    fun `storePINForBiometric method exists on KeystoreService`() {
        val hasMethod = KeystoreService::class.java.methods.any { it.name == "storePINForBiometric" }
        assertTrue(hasMethod, "KeystoreService.storePINForBiometric method must exist")
    }

    @Test
    fun `decryptPINWithBiometric method exists on KeystoreService`() {
        val hasMethod = KeystoreService::class.java.methods.any { it.name == "decryptPINWithBiometric" }
        assertTrue(hasMethod, "KeystoreService.decryptPINWithBiometric method must exist")
    }

    @Test
    fun `hasBiometricPIN method exists on KeystoreService`() {
        val hasMethod = KeystoreService::class.java.methods.any { it.name == "hasBiometricPIN" }
        assertTrue(hasMethod, "KeystoreService.hasBiometricPIN method must exist")
    }

    @Test
    fun `getBiometricDecryptCipher method exists on KeystoreService`() {
        val hasMethod = KeystoreService::class.java.methods.any { it.name == "getBiometricDecryptCipher" }
        assertTrue(hasMethod, "KeystoreService.getBiometricDecryptCipher method must exist")
    }
}
