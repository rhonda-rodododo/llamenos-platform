package org.llamenos.hotline.crypto

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Placeholder data classes for UniFFI-generated types.
 * These will be replaced by the actual generated bindings from llamenos-core
 * once the native .so libraries are linked (Epic 201).
 */
data class Keypair(
    val secretKeyHex: String,
    val publicKey: String,
    val nsec: String,
    val npub: String,
)

data class EncryptedKeyData(
    val ciphertext: String,
    val salt: String,
    val nonce: String,
    val pubkeyHex: String,
)

data class AuthToken(
    val pubkey: String,
    val timestamp: Long,
    val token: String,
)

data class EncryptedNote(
    val ciphertext: String,
    val envelopes: List<NoteEnvelope>,
)

data class NoteEnvelope(
    val recipientPubkey: String,
    val wrappedKey: String,
)

class CryptoException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * CryptoService wraps the llamenos-core native library via JNI/UniFFI.
 *
 * CRITICAL SECURITY INVARIANT: The nsec (private key) NEVER leaves this class.
 * All cryptographic operations that require the private key are performed internally.
 * External code only ever receives the pubkey, npub, and operation results.
 *
 * All CPU-intensive crypto operations run on [Dispatchers.Default] to avoid
 * blocking the main thread (Android ANR after 5s on main thread).
 */
@Singleton
class CryptoService @Inject constructor() {

    private var nsecHex: String? = null

    var pubkey: String? = null
        private set

    var npub: String? = null
        private set

    val isUnlocked: Boolean
        get() = nsecHex != null

    private var nativeLibLoaded = false

    init {
        try {
            System.loadLibrary("llamenos_core")
            nativeLibLoaded = true
        } catch (_: UnsatisfiedLinkError) {
            // Native library not yet available (pre-Epic 201).
            // CryptoService will operate with placeholder implementations
            // until the .so files are built and placed in jniLibs/.
            nativeLibLoaded = false
        }
    }

    /**
     * Generate a new Nostr keypair.
     * Returns the (nsec, npub) pair. The nsec is shown to the user exactly once
     * during onboarding for backup, then never exposed again.
     */
    fun generateKeypair(): Pair<String, String> {
        if (nativeLibLoaded) {
            // When native lib is linked, this calls:
            // val kp = LlamenosCore.generateKeypair()
            // nsecHex = kp.secretKeyHex
            // pubkey = kp.publicKey
            // npub = kp.npub
            // return Pair(kp.nsec, kp.npub)
            throw CryptoException("Native library integration pending (Epic 201)")
        }

        // Placeholder: generate deterministic test values using platform SecureRandom
        val random = java.security.SecureRandom()
        val secretBytes = ByteArray(32)
        random.nextBytes(secretBytes)
        val secretHex = secretBytes.joinToString("") { "%02x".format(it) }

        // Derive a mock pubkey (in production this comes from secp256k1 scalar multiplication)
        val pubBytes = ByteArray(32)
        random.nextBytes(pubBytes)
        val pubHex = pubBytes.joinToString("") { "%02x".format(it) }

        nsecHex = secretHex
        pubkey = pubHex
        npub = "npub1${pubHex.take(58)}"

        val nsecBech32 = "nsec1${secretHex.take(58)}"
        return Pair(nsecBech32, npub!!)
    }

    /**
     * Import an existing Nostr private key (nsec/bech32 format).
     */
    fun importNsec(nsec: String) {
        if (!nsec.startsWith("nsec1")) {
            throw CryptoException("Invalid nsec format: must start with 'nsec1'")
        }

        if (nativeLibLoaded) {
            throw CryptoException("Native library integration pending (Epic 201)")
        }

        // Placeholder: extract hex from the nsec bech32 encoding
        val hexPart = nsec.removePrefix("nsec1")
        if (hexPart.length < 58) {
            throw CryptoException("Invalid nsec: too short")
        }

        nsecHex = hexPart.padEnd(64, '0')

        val random = java.security.SecureRandom()
        val pubBytes = ByteArray(32)
        random.nextBytes(pubBytes)
        val pubHex = pubBytes.joinToString("") { "%02x".format(it) }

        pubkey = pubHex
        npub = "npub1${pubHex.take(58)}"
    }

    /**
     * Encrypt the current private key for persistent storage using a PIN.
     * Uses PBKDF2 key derivation + XChaCha20-Poly1305 encryption via llamenos-core.
     */
    suspend fun encryptForStorage(pin: String): EncryptedKeyData = withContext(Dispatchers.Default) {
        val secret = nsecHex ?: throw CryptoException("No key loaded")
        val pub = pubkey ?: throw CryptoException("No pubkey available")

        if (pin.length < 4 || pin.length > 6) {
            throw CryptoException("PIN must be 4-6 digits")
        }

        if (nativeLibLoaded) {
            // When native lib is linked:
            // return@withContext LlamenosCore.encryptWithPin(nsec = secret, pin = pin, pubkeyHex = pub)
            throw CryptoException("Native library integration pending (Epic 201)")
        }

        // Placeholder: simulate PIN encryption with basic encoding
        // In production, llamenos-core performs PBKDF2 + XChaCha20-Poly1305
        val saltBytes = ByteArray(16)
        java.security.SecureRandom().nextBytes(saltBytes)
        val nonceBytes = ByteArray(24)
        java.security.SecureRandom().nextBytes(nonceBytes)

        EncryptedKeyData(
            ciphertext = java.util.Base64.getEncoder().encodeToString(
                secret.toByteArray(Charsets.UTF_8)
            ),
            salt = saltBytes.joinToString("") { "%02x".format(it) },
            nonce = nonceBytes.joinToString("") { "%02x".format(it) },
            pubkeyHex = pub,
        )
    }

    /**
     * Decrypt stored key data with the user's PIN and restore the keypair.
     */
    suspend fun decryptFromStorage(data: EncryptedKeyData, pin: String): Unit =
        withContext(Dispatchers.Default) {
            if (pin.length < 4 || pin.length > 6) {
                throw CryptoException("PIN must be 4-6 digits")
            }

            if (nativeLibLoaded) {
                // When native lib is linked:
                // val nsec = LlamenosCore.decryptWithPin(data = data, pin = pin)
                // importNsec(nsec)
                // return@withContext
                throw CryptoException("Native library integration pending (Epic 201)")
            }

            // Placeholder: decode the Base64 ciphertext
            val decoded = java.util.Base64.getDecoder().decode(data.ciphertext)
            val secretHex = String(decoded, Charsets.UTF_8)

            nsecHex = secretHex
            pubkey = data.pubkeyHex
            npub = "npub1${data.pubkeyHex.take(58)}"
        }

    /**
     * Create a Schnorr authentication token for API requests.
     * This is the suspend version for use in coroutine contexts.
     */
    suspend fun createAuthToken(method: String, path: String): AuthToken =
        withContext(Dispatchers.Default) {
            createAuthTokenInternal(method, path)
        }

    /**
     * Create a Schnorr authentication token synchronously.
     * Used by [AuthInterceptor] since OkHttp interceptors run on OkHttp's thread pool
     * and cannot use coroutines. Schnorr signing is ~1ms so blocking is acceptable.
     */
    fun createAuthTokenSync(method: String, path: String): AuthToken {
        return createAuthTokenInternal(method, path)
    }

    private fun createAuthTokenInternal(method: String, path: String): AuthToken {
        val secret = nsecHex ?: throw CryptoException("No key loaded")
        val pub = pubkey ?: throw CryptoException("No pubkey available")
        val timestamp = System.currentTimeMillis()

        if (nativeLibLoaded) {
            // When native lib is linked:
            // return LlamenosCore.createAuthToken(
            //     secretKeyHex = secret,
            //     timestamp = timestamp,
            //     method = method,
            //     path = path
            // )
            throw CryptoException("Native library integration pending (Epic 201)")
        }

        // Placeholder: create a mock token structure
        // In production, llamenos-core performs Schnorr signing over the challenge
        val challenge = "$method:$path:$timestamp"
        val mockSignature = challenge.toByteArray(Charsets.UTF_8)
            .joinToString("") { "%02x".format(it) }
            .take(128)
            .padEnd(128, '0')

        return AuthToken(
            pubkey = pub,
            timestamp = timestamp,
            token = mockSignature,
        )
    }

    /**
     * Encrypt a note payload with per-note forward secrecy.
     * Each note gets a unique random key, ECIES-wrapped for each recipient.
     */
    suspend fun encryptNote(payload: String, adminPubkeys: List<String>): EncryptedNote =
        withContext(Dispatchers.Default) {
            val pub = pubkey ?: throw CryptoException("No key loaded")

            if (nativeLibLoaded) {
                // When native lib is linked:
                // return@withContext LlamenosCore.encryptNoteForRecipients(
                //     payloadJson = payload,
                //     authorPubkey = pub,
                //     adminPubkeys = adminPubkeys
                // )
                throw CryptoException("Native library integration pending (Epic 201)")
            }

            // Placeholder: create mock encrypted note structure
            val ciphertextBytes = ByteArray(payload.length + 16)
            java.security.SecureRandom().nextBytes(ciphertextBytes)

            val envelopes = (listOf(pub) + adminPubkeys).map { recipientPub ->
                val wrappedKeyBytes = ByteArray(80)
                java.security.SecureRandom().nextBytes(wrappedKeyBytes)
                NoteEnvelope(
                    recipientPubkey = recipientPub,
                    wrappedKey = wrappedKeyBytes.joinToString("") { "%02x".format(it) },
                )
            }

            EncryptedNote(
                ciphertext = java.util.Base64.getEncoder().encodeToString(
                    ciphertextBytes
                ),
                envelopes = envelopes,
            )
        }

    /**
     * Lock the CryptoService by clearing the private key from memory.
     * The pubkey and npub are retained for display purposes.
     * Called on background timeout (5 min) or explicit user lock.
     */
    fun lock() {
        nsecHex = null
    }
}
