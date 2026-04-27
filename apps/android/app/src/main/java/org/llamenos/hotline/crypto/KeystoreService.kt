package org.llamenos.hotline.crypto

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * PIN lockout state for brute-force protection.
 *
 * Escalating lockout schedule:
 * - Attempts 1-4: No lockout
 * - Attempts 5-6: 30 seconds
 * - Attempts 7-8: 2 minutes
 * - Attempt 9: 10 minutes
 * - Attempt 10+: All keys wiped
 */
sealed class PinLockoutState {
    /** PIN entry is allowed. [attemptsRemaining] until wipe (max 10). */
    data class Unlocked(val attemptsRemaining: Int) : PinLockoutState()
    /** PIN entry is locked. [until] is the epoch millis when lockout expires. */
    data class LockedOut(val until: Long) : PinLockoutState()
    /** Too many failed attempts — all keys have been wiped. */
    data object Wiped : PinLockoutState()
}

/**
 * KeystoreService provides encrypted persistent storage backed by Android Keystore.
 *
 * Uses [EncryptedSharedPreferences] with a hardware-backed [MasterKey] (AES-256-GCM).
 * All values are encrypted at rest with key material that never leaves the Keystore.
 * Requests StrongBox hardware backing where available (graceful fallback on unsupported devices).
 *
 * Storage layout:
 * - "encrypted-keys"      — PIN-encrypted device keys JSON (EncryptedDeviceKeys serialized)
 * - "hub-url"             — Server endpoint URL
 * - "device-id"           — Unique device identifier
 * - "signing-pubkey"      — Ed25519 signing public key hex (for display when locked)
 * - "encryption-pubkey"   — X25519 encryption public key hex (for display when locked)
 * - "biometric-enabled"   — Whether biometric unlock is configured
 * - "failed_attempts"     — PIN brute-force attempt counter
 * - "lockout_until"       — Epoch millis when lockout expires
 */
@Singleton
class KeystoreService @Inject constructor(
    @ApplicationContext private val context: Context,
) : KeyValueStore {

    private val masterKey: MasterKey by lazy {
        try {
            MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .setRequestStrongBoxBacked(true)
                .build()
        } catch (_: Exception) {
            // StrongBox not available on this device — fall back to TEE-backed key
            MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
        }
    }

    private val prefs: SharedPreferences by lazy {
        EncryptedSharedPreferences.create(
            context,
            PREFS_FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    /**
     * Store a string value under the given key. The value is encrypted at rest.
     */
    override fun store(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    /**
     * Retrieve a previously stored value, or null if the key does not exist.
     */
    override fun retrieve(key: String): String? {
        return prefs.getString(key, null)
    }

    /**
     * Delete a single key-value pair.
     */
    override fun delete(key: String) {
        prefs.edit().remove(key).apply()
    }

    /**
     * Clear all stored values. Used during account reset / logout.
     */
    override fun clear() {
        prefs.edit().clear().apply()
    }

    /**
     * Check whether a key exists in the store.
     */
    override fun contains(key: String): Boolean {
        return prefs.contains(key)
    }

    /**
     * Clear non-essential cached data while preserving identity keys and core settings.
     * Removes preferences like notification toggles, theme, profile info, etc.
     * Does NOT remove encrypted keys, hub URL, device ID, pubkeys, or biometric config.
     */
    fun clearCache() {
        val protectedKeys = setOf(
            KEY_ENCRYPTED_KEYS, KEY_HUB_URL, KEY_DEVICE_ID,
            KEY_SIGNING_PUBKEY, KEY_ENCRYPTION_PUBKEY, KEY_BIOMETRIC_ENABLED,
        )
        val editor = prefs.edit()
        prefs.all.keys.filter { it !in protectedKeys }.forEach { key ->
            editor.remove(key)
        }
        editor.apply()
    }

    // ---- PIN Brute-Force Protection ----

    /**
     * Check the current lockout state before allowing a PIN attempt.
     *
     * @return Current [PinLockoutState]:
     *   - [PinLockoutState.Unlocked] if PIN entry is allowed
     *   - [PinLockoutState.LockedOut] if the user must wait
     *   - [PinLockoutState.Wiped] if keys were wiped due to too many attempts
     */
    fun checkLockoutState(): PinLockoutState {
        val attempts = prefs.getInt(KEY_FAILED_ATTEMPTS, 0)
        if (attempts >= MAX_ATTEMPTS) {
            return PinLockoutState.Wiped
        }

        val lockoutUntil = prefs.getLong(KEY_LOCKOUT_UNTIL, 0L)
        if (lockoutUntil > 0 && System.currentTimeMillis() < lockoutUntil) {
            return PinLockoutState.LockedOut(lockoutUntil)
        }

        return PinLockoutState.Unlocked(MAX_ATTEMPTS - attempts)
    }

    /**
     * Record a failed PIN attempt and return the resulting lockout state.
     *
     * Escalating lockout schedule:
     * - Attempts 1-4: no lockout
     * - Attempts 5-6: 30 second lockout
     * - Attempts 7-8: 2 minute lockout
     * - Attempt 9: 10 minute lockout
     * - Attempt 10+: wipe all keys
     */
    fun recordFailedAttempt(): PinLockoutState {
        val attempts = prefs.getInt(KEY_FAILED_ATTEMPTS, 0) + 1
        prefs.edit().putInt(KEY_FAILED_ATTEMPTS, attempts).apply()

        val lockoutMs = when (attempts) {
            in 1..4 -> 0L
            in 5..6 -> 30_000L
            in 7..8 -> 120_000L
            9 -> 600_000L
            else -> {
                wipeAllKeys()
                return PinLockoutState.Wiped
            }
        }

        if (lockoutMs > 0) {
            val lockoutUntil = System.currentTimeMillis() + lockoutMs
            prefs.edit().putLong(KEY_LOCKOUT_UNTIL, lockoutUntil).apply()
            return PinLockoutState.LockedOut(lockoutUntil)
        }

        return PinLockoutState.Unlocked(MAX_ATTEMPTS - attempts)
    }

    /**
     * Reset failed attempt counter after a successful PIN unlock.
     */
    fun resetFailedAttempts() {
        prefs.edit()
            .putInt(KEY_FAILED_ATTEMPTS, 0)
            .putLong(KEY_LOCKOUT_UNTIL, 0L)
            .apply()
    }

    /**
     * Get the current failed attempt count (for display purposes).
     */
    fun getFailedAttemptCount(): Int {
        return prefs.getInt(KEY_FAILED_ATTEMPTS, 0)
    }

    /**
     * Wipe all stored keys. Called when max PIN attempts are exceeded.
     * This is a destructive, irrecoverable operation.
     */
    private fun wipeAllKeys() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val PREFS_FILE_NAME = "llamenos_secure_prefs"

        /** Maximum PIN attempts before key wipe. */
        const val MAX_ATTEMPTS = 10

        // Well-known storage keys
        const val KEY_ENCRYPTED_KEYS = "encrypted-keys"
        const val KEY_HUB_URL = "hub-url"
        const val KEY_DEVICE_ID = "device-id"
        const val KEY_SIGNING_PUBKEY = "signing-pubkey"
        const val KEY_ENCRYPTION_PUBKEY = "encryption-pubkey"
        const val KEY_BIOMETRIC_ENABLED = "biometric-enabled"

        // PIN lockout keys
        const val KEY_FAILED_ATTEMPTS = "failed_attempts"
        const val KEY_LOCKOUT_UNTIL = "lockout_until"
    }
}
