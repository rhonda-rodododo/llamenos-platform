package org.llamenos.hotline.crypto

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import org.llamenos.hotline.model.NotePayload
import org.llamenos.hotline.model.RecipientEnvelope
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Data classes for CryptoService public API.
 *
 * When native lib is loaded, these are populated from UniFFI-generated types
 * in [org.llamenos.core]. When native lib is absent, placeholder implementations
 * produce mock data with the same structure.
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
    val iterations: UInt = 600_000u,
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
    val ephemeralPubkey: String = "",
)

/**
 * Result of encrypting a message for multiple recipients.
 *
 * [ciphertext] is the XChaCha20-Poly1305 encrypted content (hex).
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

    /**
     * Dispatcher for CPU-intensive crypto operations.
     * Defaults to [Dispatchers.Default]; overridden in tests to use a test dispatcher.
     */
    internal var computeDispatcher: CoroutineDispatcher = Dispatchers.Default

    private var nsecHex: String? = null

    /** The nsec bech32 string, stored for PIN encryption which needs it. */
    private var nsecBech32: String? = null

    var pubkey: String? = null
        private set

    var npub: String? = null
        private set

    val isUnlocked: Boolean
        get() = nsecHex != null

    internal var nativeLibLoaded = false

    init {
        try {
            // UniFFI uses JNA to load the library, but we also try System.loadLibrary
            // as a compatibility check. The actual FFI calls go through JNA.
            System.loadLibrary("llamenos_core")
            nativeLibLoaded = true
        } catch (_: UnsatisfiedLinkError) {
            // Native library not available.
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
            return try {
                val kp = org.llamenos.core.generateKeypair()
                nsecHex = kp.secretKeyHex
                nsecBech32 = kp.nsec
                pubkey = kp.publicKey
                npub = kp.npub
                Pair(kp.nsec, kp.npub)
            } catch (e: org.llamenos.core.CryptoException) {
                throw CryptoException("Keypair generation failed: ${e.message}", e)
            }
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

        val nsecBech32Mock = "nsec1${secretHex.take(58)}"
        nsecBech32 = nsecBech32Mock
        return Pair(nsecBech32Mock, npub!!)
    }

    /**
     * Import an existing Nostr private key (nsec/bech32 format).
     */
    fun importNsec(nsec: String) {
        if (!nsec.startsWith("nsec1")) {
            throw CryptoException("Invalid nsec format: must start with 'nsec1'")
        }

        if (nativeLibLoaded) {
            try {
                val kp = org.llamenos.core.keypairFromNsec(nsec)
                nsecHex = kp.secretKeyHex
                nsecBech32 = kp.nsec
                pubkey = kp.publicKey
                npub = kp.npub
                return
            } catch (e: org.llamenos.core.CryptoException) {
                throw CryptoException("Invalid nsec: ${e.message}", e)
            }
        }

        // Placeholder: extract hex from the nsec bech32 encoding
        val hexPart = nsec.removePrefix("nsec1")
        if (hexPart.length < 58) {
            throw CryptoException("Invalid nsec: too short")
        }

        nsecHex = hexPart.padEnd(64, '0')
        nsecBech32 = nsec

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
    suspend fun encryptForStorage(pin: String): EncryptedKeyData = withContext(computeDispatcher) {
        val pub = pubkey ?: throw CryptoException("No pubkey available")

        if (pin.length < 4 || pin.length > 6) {
            throw CryptoException("PIN must be 4-6 digits")
        }

        if (nativeLibLoaded) {
            val nsec = nsecBech32 ?: throw CryptoException("No key loaded")
            try {
                val ffiResult = org.llamenos.core.encryptWithPin(
                    nsec = nsec,
                    pin = pin,
                    pubkeyHex = pub,
                )
                return@withContext EncryptedKeyData(
                    ciphertext = ffiResult.ciphertext,
                    salt = ffiResult.salt,
                    nonce = ffiResult.nonce,
                    pubkeyHex = ffiResult.pubkey,
                    iterations = ffiResult.iterations,
                )
            } catch (e: org.llamenos.core.CryptoException) {
                throw CryptoException("PIN encryption failed: ${e.message}", e)
            }
        }

        val secret = nsecHex ?: throw CryptoException("No key loaded")

        // Placeholder: simulate PIN encryption with basic encoding
        // In production, llamenos-core performs PBKDF2 + XChaCha20-Poly1305
        val saltBytes = ByteArray(16)
        java.security.SecureRandom().nextBytes(saltBytes)
        val nonceBytes = ByteArray(24)
        java.security.SecureRandom().nextBytes(nonceBytes)

        // Embed PIN hash in salt so placeholder decryption can verify it
        val pinHash = pin.hashCode().toString()

        EncryptedKeyData(
            ciphertext = java.util.Base64.getEncoder().encodeToString(
                secret.toByteArray(Charsets.UTF_8)
            ),
            salt = pinHash + ":" + saltBytes.joinToString("") { "%02x".format(it) },
            nonce = nonceBytes.joinToString("") { "%02x".format(it) },
            pubkeyHex = pub,
        )
    }

    /**
     * Decrypt stored key data with the user's PIN and restore the keypair.
     */
    suspend fun decryptFromStorage(data: EncryptedKeyData, pin: String): Unit =
        withContext(computeDispatcher) {
            if (pin.length < 4 || pin.length > 6) {
                throw CryptoException("PIN must be 4-6 digits")
            }

            if (nativeLibLoaded) {
                try {
                    val ffiData = org.llamenos.core.EncryptedKeyData(
                        salt = data.salt,
                        iterations = data.iterations,
                        nonce = data.nonce,
                        ciphertext = data.ciphertext,
                        pubkey = data.pubkeyHex,
                    )
                    val nsec = org.llamenos.core.decryptWithPin(ffiData, pin)
                    // Restore the full keypair from the decrypted nsec
                    val kp = org.llamenos.core.keypairFromNsec(nsec)
                    nsecHex = kp.secretKeyHex
                    nsecBech32 = kp.nsec
                    pubkey = kp.publicKey
                    npub = kp.npub
                    return@withContext
                } catch (e: org.llamenos.core.CryptoException) {
                    throw CryptoException("Decryption failed: incorrect PIN", e)
                }
            }

            // Placeholder: verify PIN hash embedded in salt, then decode Base64 ciphertext
            val storedPinHash = data.salt.substringBefore(":")
            if (storedPinHash != pin.hashCode().toString()) {
                throw CryptoException("Decryption failed: incorrect PIN")
            }

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
        withContext(computeDispatcher) {
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
            return try {
                val ffiToken = org.llamenos.core.createAuthToken(
                    secretKeyHex = secret,
                    timestamp = timestamp.toULong(),
                    method = method,
                    path = path,
                )
                AuthToken(
                    pubkey = ffiToken.pubkey,
                    timestamp = ffiToken.timestamp.toLong(),
                    token = ffiToken.token,
                )
            } catch (e: org.llamenos.core.CryptoException) {
                throw CryptoException("Auth token creation failed: ${e.message}", e)
            }
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
        withContext(computeDispatcher) {
            val pub = pubkey ?: throw CryptoException("No key loaded")

            if (nativeLibLoaded) {
                return@withContext try {
                    val ffiNote = org.llamenos.core.encryptNoteForRecipients(
                        payloadJson = payload,
                        authorPubkey = pub,
                        adminPubkeys = adminPubkeys,
                    )
                    // Map FFI EncryptedNote → app EncryptedNote
                    // FFI has: authorEnvelope (KeyEnvelope) + adminEnvelopes (List<RecipientKeyEnvelope>)
                    // App has: flat list of NoteEnvelopes
                    val envelopes = mutableListOf<NoteEnvelope>()
                    // Author envelope
                    envelopes.add(
                        NoteEnvelope(
                            recipientPubkey = pub,
                            wrappedKey = ffiNote.authorEnvelope.wrappedKey,
                            ephemeralPubkey = ffiNote.authorEnvelope.ephemeralPubkey,
                        )
                    )
                    // Admin envelopes
                    for (env in ffiNote.adminEnvelopes) {
                        envelopes.add(
                            NoteEnvelope(
                                recipientPubkey = env.pubkey,
                                wrappedKey = env.wrappedKey,
                                ephemeralPubkey = env.ephemeralPubkey,
                            )
                        )
                    }
                    EncryptedNote(
                        ciphertext = ffiNote.encryptedContent,
                        envelopes = envelopes,
                    )
                } catch (e: org.llamenos.core.CryptoException) {
                    throw CryptoException("Note encryption failed: ${e.message}", e)
                }
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
    ): NotePayload? = withContext(computeDispatcher) {
        val secret = nsecHex ?: throw CryptoException("No key loaded")

        if (nativeLibLoaded) {
            return@withContext try {
                val ffiEnvelope = org.llamenos.core.KeyEnvelope(
                    wrappedKey = envelope.wrappedKey,
                    ephemeralPubkey = envelope.ephemeralPubkey,
                )
                val plaintext = org.llamenos.core.decryptNote(
                    encryptedContent = encryptedContent,
                    envelope = ffiEnvelope,
                    secretKeyHex = secret,
                )
                json.decodeFromString<NotePayload>(plaintext)
            } catch (e: org.llamenos.core.CryptoException) {
                null
            } catch (_: Exception) {
                null
            }
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
    ): EncryptedMessage = withContext(computeDispatcher) {
        val pub = pubkey ?: throw CryptoException("No key loaded")

        if (nativeLibLoaded) {
            return@withContext try {
                val allReaders = (listOf(pub) + readerPubkeys).distinct()
                val ffiMsg = org.llamenos.core.encryptMessageForReaders(
                    plaintext = plaintext,
                    readerPubkeys = allReaders,
                )
                EncryptedMessage(
                    ciphertext = ffiMsg.encryptedContent,
                    envelopes = ffiMsg.readerEnvelopes.map { env ->
                        MessageEnvelope(
                            recipientPubkey = env.pubkey,
                            wrappedKey = env.wrappedKey,
                            ephemeralPubkey = env.ephemeralPubkey,
                        )
                    },
                )
            } catch (e: org.llamenos.core.CryptoException) {
                throw CryptoException("Message encryption failed: ${e.message}", e)
            }
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
    ): String? = withContext(computeDispatcher) {
        val secret = nsecHex ?: throw CryptoException("No key loaded")
        val pub = pubkey ?: throw CryptoException("No pubkey available")

        if (nativeLibLoaded) {
            return@withContext try {
                // Build a single-element envelope list for the FFI call
                val envelope = org.llamenos.core.RecipientKeyEnvelope(
                    pubkey = pub,
                    wrappedKey = wrappedKey,
                    ephemeralPubkey = ephemeralPubkey,
                )
                org.llamenos.core.decryptMessageForReader(
                    encryptedContent = encryptedContent,
                    readerEnvelopes = listOf(envelope),
                    secretKeyHex = secret,
                    readerPubkey = pub,
                )
            } catch (e: org.llamenos.core.CryptoException) {
                null
            } catch (_: Exception) {
                null
            }
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
            // Use generateKeypair from FFI — ephemeral keys are the same secp256k1 type
            return try {
                val kp = org.llamenos.core.generateKeypair()
                Pair(kp.secretKeyHex, kp.publicKey)
            } catch (e: org.llamenos.core.CryptoException) {
                throw CryptoException("Ephemeral keypair generation failed: ${e.message}", e)
            }
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
     * Uses ECDH on secp256k1 to compute the shared x-coordinate.
     *
     * @param ourSecret Our ephemeral secret key (hex)
     * @param theirPublic Their ephemeral public key (hex, x-only 32 bytes or compressed 33 bytes)
     * @return The shared x-coordinate (hex)
     */
    fun deriveSharedSecret(ourSecret: String, theirPublic: String): String {
        if (nativeLibLoaded) {
            return try {
                org.llamenos.core.computeSharedXHex(ourSecret, theirPublic)
            } catch (e: org.llamenos.core.CryptoException) {
                throw CryptoException("ECDH shared secret derivation failed: ${e.message}", e)
            }
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
     * The shared secret (x-coordinate from ECDH) is hashed with SHA-256
     * using the device provisioning domain separation label to derive the
     * symmetric key. The ciphertext must be hex-encoded (nonce prepended).
     *
     * @param ciphertextHex Hex-encoded ciphertext (24-byte nonce + encrypted data + 16-byte tag)
     * @param sharedSecretHex The ECDH-derived shared x-coordinate (hex)
     * @return Decrypted plaintext
     */
    suspend fun decryptWithSharedSecret(
        ciphertextHex: String,
        sharedSecretHex: String,
    ): String = withContext(computeDispatcher) {
        if (nativeLibLoaded) {
            return@withContext try {
                org.llamenos.core.decryptWithSharedKeyHex(ciphertextHex, sharedSecretHex)
            } catch (e: org.llamenos.core.CryptoException) {
                throw CryptoException("Shared secret decryption failed: ${e.message}", e)
            }
        }

        // Placeholder: decode hex as plaintext
        try {
            val bytes = ciphertextHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
            String(bytes, Charsets.UTF_8)
        } catch (_: Exception) {
            ciphertextHex
        }
    }

    /**
     * Derive a 6-digit SAS (Short Authentication String) verification code
     * from a shared secret. Both devices independently derive this code and
     * the user verifies they match to prevent MITM attacks.
     *
     * Uses HKDF-SHA256 with protocol-defined salt and info to derive 4 bytes,
     * then formats as "XXX XXX" (6 digits with space separator).
     *
     * @param sharedSecret The ECDH-derived shared x-coordinate (hex)
     * @return Formatted SAS code ("XXX XXX")
     */
    fun deriveSASCode(sharedSecret: String): String {
        if (nativeLibLoaded) {
            return try {
                org.llamenos.core.computeSasCode(sharedSecret)
            } catch (e: org.llamenos.core.CryptoException) {
                throw CryptoException("SAS code derivation failed: ${e.message}", e)
            }
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
        nsecBech32 = null
    }
}
