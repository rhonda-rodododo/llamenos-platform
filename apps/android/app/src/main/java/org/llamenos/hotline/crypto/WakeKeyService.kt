package org.llamenos.hotline.crypto

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.security.SecureRandom
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Serialized wake payload delivered inside an ECIES-encrypted push envelope.
 *
 * Wake-tier payloads are decryptable without user PIN unlock because the
 * wake key is stored without user authentication requirements. They carry
 * only minimal metadata — enough to display "New call available" on the
 * lock screen without revealing caller identity.
 */
@Serializable
data class WakePayload(
    val type: String,
    val callId: String? = null,
    val shiftId: String? = null,
    val timestamp: Long = 0,
    val message: String? = null,
    val hubId: String? = null,
)

/**
 * Device-level wake key service for decrypting lock-screen push notifications.
 *
 * The wake keypair is generated once and stored in [KeystoreService] (backed by
 * Android Keystore / EncryptedSharedPreferences). Unlike the user's Nostr nsec,
 * the wake key does NOT require PIN/biometric to access — it must be available
 * when [PushService] receives a message while the device is locked.
 *
 * Flow:
 * 1. On first use, [getOrCreateWakePublicKey] generates a secp256k1 keypair and stores it
 * 2. The wake public key is registered with the server (POST /api/v1/identity/device)
 * 3. Server encrypts push payloads with the device's wake public key via ECIES
 * 4. [PushService] calls [decryptWakePayload] to decrypt with llamenos-core
 */
@Singleton
class WakeKeyService @Inject constructor(
    private val keystoreService: KeystoreService,
) {

    private val json = Json { ignoreUnknownKeys = true }

    private var nativeLibLoaded = false

    init {
        try {
            System.loadLibrary("llamenos_core")
            nativeLibLoaded = true
        } catch (_: UnsatisfiedLinkError) {
            nativeLibLoaded = false
        }
    }

    /**
     * Get the wake public key, generating a new keypair if none exists.
     * This key is registered with the server for push notification encryption.
     */
    fun getOrCreateWakePublicKey(): String {
        val existing = keystoreService.retrieve(KEY_WAKE_PUBKEY)
        if (existing != null) return existing

        if (nativeLibLoaded) {
            val kp = org.llamenos.core.generateKeypair()
            keystoreService.store(KEY_WAKE_SECRET, kp.secretKeyHex)
            keystoreService.store(KEY_WAKE_PUBKEY, kp.publicKey)
            return kp.publicKey
        }

        // Placeholder: generate random keypair bytes
        val random = SecureRandom()
        val secretBytes = ByteArray(32)
        random.nextBytes(secretBytes)
        val secretHex = secretBytes.joinToString("") { "%02x".format(it) }

        val pubBytes = ByteArray(32)
        random.nextBytes(pubBytes)
        val pubHex = pubBytes.joinToString("") { "%02x".format(it) }

        keystoreService.store(KEY_WAKE_SECRET, secretHex)
        keystoreService.store(KEY_WAKE_PUBKEY, pubHex)

        return pubHex
    }

    /**
     * Check whether a wake keypair has been generated.
     */
    fun hasWakeKey(): Boolean {
        return keystoreService.contains(KEY_WAKE_PUBKEY)
    }

    /**
     * Decrypt a wake-tier push notification payload.
     *
     * The push data contains [packedHex] (nonce + ciphertext, hex) and
     * [ephemeralPubkeyHex] (the server's ephemeral ECIES public key, hex).
     * Returns the decoded [WakePayload] or null if decryption fails.
     */
    suspend fun decryptWakePayload(
        packedHex: String,
        ephemeralPubkeyHex: String,
    ): WakePayload? =
        withContext(Dispatchers.Default) {
            val secretHex = keystoreService.retrieve(KEY_WAKE_SECRET)
                ?: return@withContext null

            if (nativeLibLoaded) {
                return@withContext try {
                    val plaintext = org.llamenos.core.eciesDecryptContentHex(
                        packedHex = packedHex,
                        ephemeralPubkeyHex = ephemeralPubkeyHex,
                        secretKeyHex = secretHex,
                        label = LABEL_PUSH_WAKE,
                    )
                    json.decodeFromString<WakePayload>(plaintext)
                } catch (_: Exception) {
                    null
                }
            }

            // Placeholder: try to decode the hex as UTF-8 JSON
            try {
                val bytes = packedHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
                val plaintext = String(bytes, Charsets.UTF_8)
                json.decodeFromString<WakePayload>(plaintext)
            } catch (_: Exception) {
                null
            }
        }

    companion object {
        private const val KEY_WAKE_SECRET = "wake-secret"
        private const val KEY_WAKE_PUBKEY = "wake-pubkey"
        private const val LABEL_PUSH_WAKE = "llamenos:push-wake"
    }
}
