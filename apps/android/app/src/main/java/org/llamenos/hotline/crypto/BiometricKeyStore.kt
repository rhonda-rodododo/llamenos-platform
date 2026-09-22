package org.llamenos.hotline.crypto

import javax.crypto.Cipher

/**
 * Thrown when the AndroidKeystore biometric key was invalidated because the
 * device's enrolled biometrics changed (a new fingerprint/face was added, or
 * all biometrics were removed) since the key was created.
 *
 * This is the standard Android key-invalidation behaviour for a key created
 * with `setInvalidatedByBiometricEnrollment(true)` (see
 * [KeystoreService.getOrCreateBiometricKey]). Callers MUST treat this as
 * "biometric unlock is no longer available" and fall back to PIN entry — the
 * PIN itself is never affected.
 */
class BiometricKeyInvalidatedException(cause: Throwable? = null) : Exception(cause)

/**
 * Abstraction over the Android Keystore-backed biometric PIN storage
 * implemented by [KeystoreService].
 *
 * Exists so view models (auth unlock, settings enrollment) can be unit
 * tested against a fake implementation — the real AndroidKeyStore provider
 * and `EncryptedSharedPreferences`/Tink storage are not available outside a
 * real device/emulator, even under Robolectric.
 */
interface BiometricKeyStore {
    /** Whether a biometric-protected PIN is currently stored. */
    fun hasBiometricPIN(): Boolean

    /**
     * A [Cipher] initialized for a fresh enrollment encryption.
     *
     * If a previous key was invalidated by a biometric change, this
     * transparently wipes it and mints a fresh one valid for the device's
     * current biometrics — a new enrollment shouldn't be blocked by stale
     * material from an old one.
     */
    fun getBiometricEncryptCipher(): Cipher

    /**
     * A [Cipher] initialized for decrypting the stored PIN, or null if
     * nothing is enrolled.
     *
     * @throws BiometricKeyInvalidatedException if something is enrolled but
     *   the underlying key was invalidated by a biometric change. The stored
     *   PIN material is wiped as part of throwing, so [hasBiometricPIN]
     *   returns false immediately afterward.
     */
    fun getBiometricDecryptCipher(): Cipher?

    /** Persist [pin], encrypted with the CryptoObject cipher from a successful enrollment auth. */
    fun storePINForBiometric(cipher: Cipher, pin: String)

    /** Decrypt the stored PIN using the CryptoObject cipher from a successful unlock auth. */
    fun decryptPINWithBiometric(cipher: Cipher): String?

    /**
     * Wipe all biometric-enrolled PIN material — the AndroidKeystore key and
     * the encrypted PIN blob. Used for explicit un-enrollment and for
     * cleaning up after a detected key invalidation. Never touches the PIN
     * itself; PIN unlock is unaffected.
     */
    fun removeBiometricPIN()
}
