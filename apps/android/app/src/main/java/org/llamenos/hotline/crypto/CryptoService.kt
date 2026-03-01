package org.llamenos.hotline.crypto

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import org.llamenos.hotline.model.NotePayload
import org.llamenos.hotline.model.RecipientEnvelope
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

/**
 * Result of encrypting a message for multiple recipients.
 *
 * [ciphertext] is the XChaCha20-Poly1305 encrypted content (base64).
 * [envelopes] contain the per-recipient ECIES-wrapped symmetric keys.
 */
data class EncryptedMessage(
    val ciphertext: String,
    val envelopes: List<MessageEnvelope>,
)

data class MessageEnvelope(
    val recipientPubkey: String,
    val wrappedKey: String,
    val ephemeralPubkey: String,
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

    private val json = Json { ignoreUnknownKeys = true }

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
     * Decrypt a note using the recipient envelope matching our keypair.
     *
     * Finds the envelope addressed to our pubkey, unwraps the symmetric key
     * via ECIES using our nsec, then decrypts the note ciphertext with
     * XChaCha20-Poly1305.
     *
     * @param encryptedContent Base64-encoded ciphertext of the note
     * @param envelope The recipient envelope containing our wrapped key
     * @return The decrypted [NotePayload], or null if decryption fails
     */
    suspend fun decryptNote(
        encryptedContent: String,
        envelope: RecipientEnvelope,
    ): NotePayload? = withContext(Dispatchers.Default) {
        val secret = nsecHex ?: throw CryptoException("No key loaded")

        if (nativeLibLoaded) {
            // When native lib is linked:
            // val plaintext = LlamenosCore.decryptNote(
            //     encryptedContent = encryptedContent,
            //     wrappedKey = envelope.wrappedKey,
            //     ephemeralPubkey = envelope.ephemeralPubkey,
            //     secretKeyHex = secret
            // )
            // return@withContext json.decodeFromString<NotePayload>(plaintext)
            throw CryptoException("Native library integration pending (Epic 201)")
        }

        // Placeholder: decode base64 content as if it were plaintext JSON
        try {
            val decoded = java.util.Base64.getDecoder().decode(encryptedContent)
            val plaintext = String(decoded, Charsets.UTF_8)
            json.decodeFromString<NotePayload>(plaintext)
        } catch (_: Exception) {
            // If it's not valid base64 JSON, try direct parsing
            try {
                json.decodeFromString<NotePayload>(encryptedContent)
            } catch (_: Exception) {
                null
            }
        }
    }

    /**
     * Encrypt a message for multiple recipients.
     *
     * Uses per-message forward secrecy: a unique random symmetric key encrypts the
     * plaintext, then the key is ECIES-wrapped individually for each reader pubkey.
     *
     * @param plaintext The message text to encrypt
     * @param readerPubkeys Public keys of all authorized readers (volunteer + admins)
     * @return Encrypted message with per-recipient envelopes
     */
    suspend fun encryptMessage(
        plaintext: String,
        readerPubkeys: List<String>,
    ): EncryptedMessage = withContext(Dispatchers.Default) {
        val pub = pubkey ?: throw CryptoException("No key loaded")

        if (nativeLibLoaded) {
            // When native lib is linked:
            // return@withContext LlamenosCore.encryptMessageForRecipients(
            //     plaintext = plaintext,
            //     readerPubkeys = readerPubkeys
            // )
            throw CryptoException("Native library integration pending (Epic 201)")
        }

        // Placeholder: mock envelope encryption
        val random = java.security.SecureRandom()
        val ciphertextBytes = ByteArray(plaintext.length + 16)
        random.nextBytes(ciphertextBytes)

        val allReaders = (listOf(pub) + readerPubkeys).distinct()
        val envelopes = allReaders.map { recipientPub ->
            val wrappedKeyBytes = ByteArray(80)
            random.nextBytes(wrappedKeyBytes)
            val ephemeralBytes = ByteArray(32)
            random.nextBytes(ephemeralBytes)
            MessageEnvelope(
                recipientPubkey = recipientPub,
                wrappedKey = wrappedKeyBytes.joinToString("") { "%02x".format(it) },
                ephemeralPubkey = ephemeralBytes.joinToString("") { "%02x".format(it) },
            )
        }

        EncryptedMessage(
            ciphertext = java.util.Base64.getEncoder().encodeToString(ciphertextBytes),
            envelopes = envelopes,
        )
    }

    /**
     * Decrypt a message using the recipient envelope matching our keypair.
     *
     * @param encryptedContent Base64-encoded ciphertext of the message
     * @param wrappedKey The ECIES-wrapped symmetric key for our pubkey
     * @param ephemeralPubkey The ephemeral public key used for ECIES
     * @return The decrypted plaintext, or null if decryption fails
     */
    suspend fun decryptMessage(
        encryptedContent: String,
        wrappedKey: String,
        ephemeralPubkey: String,
    ): String? = withContext(Dispatchers.Default) {
        val secret = nsecHex ?: throw CryptoException("No key loaded")

        if (nativeLibLoaded) {
            // When native lib is linked:
            // return@withContext LlamenosCore.decryptMessage(
            //     encryptedContent = encryptedContent,
            //     wrappedKey = wrappedKey,
            //     ephemeralPubkey = ephemeralPubkey,
            //     secretKeyHex = secret
            // )
            throw CryptoException("Native library integration pending (Epic 201)")
        }

        // Placeholder: decode base64 content as if it were plaintext
        try {
            val decoded = java.util.Base64.getDecoder().decode(encryptedContent)
            String(decoded, Charsets.UTF_8)
        } catch (_: Exception) {
            try {
                encryptedContent
            } catch (_: Exception) {
                null
            }
        }
    }

    // ---- Device Linking (ECDH provisioning) ----

    /**
     * Generate an ephemeral secp256k1 keypair for device linking ECDH.
     *
     * @return Pair of (secretKeyHex, publicKeyHex)
     */
    fun generateEphemeralKeypair(): Pair<String, String> {
        if (nativeLibLoaded) {
            // When native lib is linked:
            // val kp = LlamenosCore.generateEphemeralKeypair()
            // return Pair(kp.secretKeyHex, kp.publicKeyHex)
            throw CryptoException("Native library integration pending (Epic 201)")
        }

        // Placeholder: generate random keypair bytes
        val random = java.security.SecureRandom()
        val secretBytes = ByteArray(32)
        random.nextBytes(secretBytes)
        val pubBytes = ByteArray(32)
        random.nextBytes(pubBytes)

        return Pair(
            secretBytes.joinToString("") { "%02x".format(it) },
            pubBytes.joinToString("") { "%02x".format(it) },
        )
    }

    /**
     * Derive a shared secret from our ephemeral secret and their ephemeral public key.
     * Uses ECDH on secp256k1 followed by HKDF-SHA256 for key derivation.
     *
     * @param ourSecret Our ephemeral secret key (hex)
     * @param theirPublic Their ephemeral public key (hex, x-only 32 bytes)
     * @return The derived shared secret (hex)
     */
    fun deriveSharedSecret(ourSecret: String, theirPublic: String): String {
        if (nativeLibLoaded) {
            // When native lib is linked:
            // return LlamenosCore.deriveSharedSecret(ourSecret, theirPublic)
            throw CryptoException("Native library integration pending (Epic 201)")
        }

        // Placeholder: XOR-based mock derivation (NOT secure, just for structure)
        val secretBytes = ourSecret.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val publicBytes = theirPublic.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val sharedBytes = ByteArray(32) { i ->
            (secretBytes.getOrElse(i) { 0.toByte() }.toInt() xor publicBytes.getOrElse(i) { 0.toByte() }.toInt()).toByte()
        }

        return sharedBytes.joinToString("") { "%02x".format(it) }
    }

    /**
     * Decrypt data that was encrypted with a shared secret (XChaCha20-Poly1305).
     * Used during device linking to decrypt the transferred nsec.
     *
     * @param encrypted Base64-encoded ciphertext (nonce prepended)
     * @param sharedSecret The ECDH-derived shared secret (hex)
     * @return Decrypted plaintext
     */
    suspend fun decryptWithSharedSecret(
        encrypted: String,
        sharedSecret: String,
    ): String = withContext(Dispatchers.Default) {
        if (nativeLibLoaded) {
            // When native lib is linked:
            // return@withContext LlamenosCore.decryptWithSharedSecret(encrypted, sharedSecret)
            throw CryptoException("Native library integration pending (Epic 201)")
        }

        // Placeholder: decode base64 as plaintext
        try {
            val decoded = java.util.Base64.getDecoder().decode(encrypted)
            String(decoded, Charsets.UTF_8)
        } catch (_: Exception) {
            encrypted
        }
    }

    /**
     * Derive a 6-digit SAS (Short Authentication String) verification code
     * from a shared secret. Both devices independently derive this code and
     * the user verifies they match to prevent MITM attacks.
     *
     * @param sharedSecret The ECDH-derived shared secret (hex)
     * @return 6-digit numeric SAS code
     */
    fun deriveSASCode(sharedSecret: String): String {
        if (nativeLibLoaded) {
            // When native lib is linked:
            // return LlamenosCore.deriveSASCode(sharedSecret)
            throw CryptoException("Native library integration pending (Epic 201)")
        }

        // Placeholder: derive 6 digits from the shared secret bytes
        val bytes = sharedSecret.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val numeric = ((bytes.getOrElse(0) { 0 }.toInt() and 0xFF) * 65536 +
                (bytes.getOrElse(1) { 0 }.toInt() and 0xFF) * 256 +
                (bytes.getOrElse(2) { 0 }.toInt() and 0xFF)) % 1_000_000

        return "%06d".format(numeric)
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
