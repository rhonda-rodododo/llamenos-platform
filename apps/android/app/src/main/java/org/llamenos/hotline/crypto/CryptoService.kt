package org.llamenos.hotline.crypto

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import org.llamenos.hotline.model.NotePayload
import org.llamenos.protocol.RecipientEnvelope
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Data classes for CryptoService public API.
 *
 * These are populated from UniFFI-generated types in [org.llamenos.core].
 * The native crypto library MUST be loaded — all operations hard-fail without it (C6).
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
            // Native library not available — all crypto operations will throw
            // IllegalStateException until the .so files are built and placed in jniLibs/.
            nativeLibLoaded = false
        }
    }

    /**
     * Generate a new Nostr keypair.
     * Returns the (nsec, npub) pair. The nsec is shown to the user exactly once
     * during onboarding for backup, then never exposed again.
     */
    fun generateKeypair(): Pair<String, String> {
        check(nativeLibLoaded) {
            "Cannot generate keypair: native crypto library not loaded."
        }
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

    /**
     * Import an existing Nostr private key (nsec/bech32 format).
     */
    fun importNsec(nsec: String) {
        if (!nsec.startsWith("nsec1")) {
            throw CryptoException("Invalid nsec format: must start with 'nsec1'")
        }

        check(nativeLibLoaded) {
            "Cannot import key: native crypto library not loaded."
        }
        try {
            val kp = org.llamenos.core.keypairFromNsec(nsec)
            nsecHex = kp.secretKeyHex
            nsecBech32 = kp.nsec
            pubkey = kp.publicKey
            npub = kp.npub
        } catch (e: org.llamenos.core.CryptoException) {
            throw CryptoException("Invalid nsec: ${e.message}", e)
        }
    }

    /**
     * Encrypt the current private key for persistent storage using a PIN.
     * Uses PBKDF2 key derivation + XChaCha20-Poly1305 encryption via llamenos-core.
     */
    suspend fun encryptForStorage(pin: String): EncryptedKeyData = withContext(computeDispatcher) {
        check(nativeLibLoaded) {
            "Cannot store keys: native crypto library not loaded."
        }

        val pub = pubkey ?: throw CryptoException("No pubkey available")

        if (pin.length < 6 || pin.length > 8) {
            throw CryptoException("PIN must be 6-8 digits")
        }

        val nsec = nsecBech32 ?: throw CryptoException("No key loaded")
        try {
            val ffiResult = org.llamenos.core.encryptWithPin(
                nsec = nsec,
                pin = pin,
                pubkeyHex = pub,
            )
            EncryptedKeyData(
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

    /**
     * Decrypt stored key data with the user's PIN and restore the keypair.
     */
    suspend fun decryptFromStorage(data: EncryptedKeyData, pin: String): Unit =
        withContext(computeDispatcher) {
            check(nativeLibLoaded) {
                "Cannot decrypt keys: native crypto library not loaded."
            }

            if (pin.length < 6 || pin.length > 8) {
                throw CryptoException("PIN must be 6-8 digits")
            }

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
            } catch (e: org.llamenos.core.CryptoException) {
                throw CryptoException("Decryption failed: incorrect PIN", e)
            }
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
        check(nativeLibLoaded) {
            "Cannot create auth token: native crypto library not loaded."
        }

        val secret = nsecHex ?: throw CryptoException("No key loaded")
        val timestamp = System.currentTimeMillis()

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

    /**
     * Encrypt a note payload with per-note forward secrecy.
     * Each note gets a unique random key, ECIES-wrapped for each recipient.
     */
    suspend fun encryptNote(payload: String, adminPubkeys: List<String>): EncryptedNote =
        withContext(computeDispatcher) {
            check(nativeLibLoaded) {
                "Cannot encrypt note: native crypto library not loaded."
            }

            val pub = pubkey ?: throw CryptoException("No key loaded")

            try {
                val ffiNote = org.llamenos.core.encryptNoteForRecipients(
                    payloadJson = payload,
                    authorPubkey = pub,
                    adminPubkeys = adminPubkeys,
                )
                // Map FFI EncryptedNote -> app EncryptedNote
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
        check(nativeLibLoaded) {
            "Cannot decrypt note: native crypto library not loaded."
        }

        val secret = nsecHex ?: throw CryptoException("No key loaded")

        try {
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
        check(nativeLibLoaded) {
            "Cannot encrypt message: native crypto library not loaded."
        }

        val pub = pubkey ?: throw CryptoException("No key loaded")

        try {
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
        check(nativeLibLoaded) {
            "Cannot decrypt message: native crypto library not loaded."
        }

        val secret = nsecHex ?: throw CryptoException("No key loaded")
        val pub = pubkey ?: throw CryptoException("No pubkey available")

        try {
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

    /**
     * Decrypt a server-encrypted event payload (XChaCha20-Poly1305).
     *
     * The server encrypts all Nostr relay event content with a derived key.
     * Clients receive this key as `serverEventKeyHex` from GET /api/auth/me.
     *
     * @param encryptedHex Hex-encoded ciphertext (24-byte nonce || ciphertext || 16-byte tag)
     * @param keyHex The 32-byte server event key (hex)
     * @return Decrypted plaintext JSON, or null on decryption failure
     */
    fun decryptServerEvent(encryptedHex: String, keyHex: String): String? {
        if (!nativeLibLoaded) return null
        return try {
            org.llamenos.core.decryptServerEventHex(encryptedHex, keyHex)
        } catch (_: Exception) {
            null
        }
    }

    // ---- Device Linking (ECDH provisioning) ----

    /**
     * Generate an ephemeral secp256k1 keypair for device linking ECDH.
     *
     * @return Pair of (secretKeyHex, publicKeyHex)
     */
    fun generateEphemeralKeypair(): Pair<String, String> {
        check(nativeLibLoaded) {
            "Cannot generate ephemeral keypair: native crypto library not loaded."
        }
        // Use generateKeypair from FFI -- ephemeral keys are the same secp256k1 type
        return try {
            val kp = org.llamenos.core.generateKeypair()
            Pair(kp.secretKeyHex, kp.publicKey)
        } catch (e: org.llamenos.core.CryptoException) {
            throw CryptoException("Ephemeral keypair generation failed: ${e.message}", e)
        }
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
        check(nativeLibLoaded) {
            "Cannot derive shared secret: native crypto library not loaded."
        }
        return try {
            org.llamenos.core.computeSharedXHex(ourSecret, theirPublic)
        } catch (e: org.llamenos.core.CryptoException) {
            throw CryptoException("ECDH shared secret derivation failed: ${e.message}", e)
        }
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
        check(nativeLibLoaded) {
            "Cannot decrypt with shared secret: native crypto library not loaded."
        }
        try {
            org.llamenos.core.decryptWithSharedKeyHex(ciphertextHex, sharedSecretHex)
        } catch (e: org.llamenos.core.CryptoException) {
            throw CryptoException("Shared secret decryption failed: ${e.message}", e)
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
        check(nativeLibLoaded) {
            "Cannot derive SAS code: native crypto library not loaded."
        }
        return try {
            org.llamenos.core.computeSasCode(sharedSecret)
        } catch (e: org.llamenos.core.CryptoException) {
            throw CryptoException("SAS code derivation failed: ${e.message}", e)
        }
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

    /**
     * Set up test key state without native library calls.
     * Only available in the same module (internal) for unit testing.
     *
     * This allows AuthViewModel tests to simulate crypto state transitions
     * without requiring the native library, which is not available in JVM tests.
     */
    internal fun setTestKeyState(
        secretHex: String,
        secretBech32: String,
        publicKey: String,
        nostrPub: String,
    ) {
        nsecHex = secretHex
        nsecBech32 = secretBech32
        pubkey = publicKey
        npub = nostrPub
    }
}
