package org.llamenos.hotline

import org.llamenos.hotline.crypto.BiometricKeyInvalidatedException
import org.llamenos.hotline.crypto.BiometricKeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * In-memory [BiometricKeyStore] for unit tests.
 *
 * Uses a real AES-GCM key from the default JCE provider (not AndroidKeyStore,
 * which isn't available in JVM unit tests — not even under Robolectric) so
 * callers exercise real [Cipher] encrypt/decrypt round-trips end to end.
 *
 * Call [simulateBiometricChange] to simulate the device's enrolled
 * biometrics changing (new fingerprint/face added, or all biometrics
 * removed) — exactly what `setInvalidatedByBiometricEnrollment(true)` does
 * to a real AndroidKeystore key on a device.
 */
class FakeBiometricKeyStore : BiometricKeyStore {
    private var key: SecretKey? = null
    private var invalidated = false
    private var encryptedPin: ByteArray? = null
    private var iv: ByteArray? = null

    private fun currentKey(): SecretKey {
        if (invalidated) throw BiometricKeyInvalidatedException()
        return key ?: KeyGenerator.getInstance("AES").apply { init(256) }.generateKey().also { key = it }
    }

    override fun hasBiometricPIN(): Boolean = encryptedPin != null

    override fun getBiometricEncryptCipher(): Cipher {
        if (invalidated) {
            // Mirrors the real KeystoreService: a fresh enrollment isn't
            // blocked by a key invalidated by a *previous* enrollment —
            // wipe it and mint a new one valid for the current biometrics.
            invalidated = false
            key = null
        }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, currentKey())
        return cipher
    }

    override fun getBiometricDecryptCipher(): Cipher? {
        val storedIv = iv ?: return null
        if (invalidated) {
            // Mirrors the real KeystoreService: an unlock attempt against an
            // invalidated key wipes the stale enrollment before throwing, so
            // the caller can fall back to PIN entry immediately.
            removeBiometricPIN()
            throw BiometricKeyInvalidatedException()
        }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, currentKey(), GCMParameterSpec(GCM_TAG_LENGTH, storedIv))
        return cipher
    }

    override fun storePINForBiometric(cipher: Cipher, pin: String) {
        encryptedPin = cipher.doFinal(pin.toByteArray(Charsets.UTF_8))
        iv = cipher.iv
    }

    override fun decryptPINWithBiometric(cipher: Cipher): String? {
        val data = encryptedPin ?: return null
        return String(cipher.doFinal(data), Charsets.UTF_8)
    }

    override fun removeBiometricPIN() {
        encryptedPin = null
        iv = null
        key = null
        invalidated = false
    }

    /** Simulate the OS invalidating the key (new biometric enrolled, or all removed). */
    fun simulateBiometricChange() {
        invalidated = true
    }

    companion object {
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH = 128
    }
}
