package org.llamenos.hotline.crypto

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import org.llamenos.hotline.model.NotePayload
import org.llamenos.protocol.CryptoLabels
import org.llamenos.protocol.HubKeyEnvelopeResponse
import org.llamenos.protocol.RecipientEnvelope
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * V3 device key model data classes.
 *
 * Device keys (Ed25519 signing + X25519 encryption) are generated once per device.
 * The PIN encrypts the device key blob. Secrets are held exclusively in Rust memory.
 */
data class DeviceKeyState(
    val deviceId: String,
    val signingPubkeyHex: String,
    val encryptionPubkeyHex: String,
)

data class EncryptedDeviceKeys(
    val salt: String,
    val iterations: UInt,
    val nonce: String,
    val ciphertext: String,
    val state: DeviceKeyState,
)

data class AuthToken(
    val pubkey: String,
    val timestamp: Long,
    val token: String,
)

data class HpkeEnvelope(
    val v: Int,
    val labelId: Int,
    val enc: String,
    val ct: String,
)

/**
 * Result of encrypting a note/message.
 * [ciphertextHex] is AES-256-GCM encrypted content.
 * [envelopes] contain per-recipient HPKE-wrapped symmetric keys.
 */
data class EncryptedNote(
    val ciphertextHex: String,
    val envelopes: List<NoteEnvelope>,
)

data class NoteEnvelope(
    val recipientPubkey: String,
    val hpkeEnvelope: HpkeEnvelope,
)

data class EncryptedMessage(
    val ciphertextHex: String,
    val envelopes: List<RecipientEnvelope>,
)

class CryptoException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * CryptoService wraps the llamenos-core native library via JNI/UniFFI.
 *
 * ## V3 Device Key Model
 * Device secrets (Ed25519 signing + X25519 encryption) are held exclusively in
 * Rust memory via the mobile FFI state. Kotlin only sees public keys and operation
 * results — secrets NEVER leave the Rust process.
 *
 * CRITICAL SECURITY INVARIANT: Device key material NEVER leaves this class or the
 * Rust FFI layer. All cryptographic operations that require private keys are performed
 * in Rust memory. External code only receives public keys and operation results.
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

    /** Ed25519 signing public key (hex). Used for identity. */
    var signingPubkeyHex: String? = null
        private set

    /** X25519 encryption public key (hex). Used for HPKE. */
    var encryptionPubkeyHex: String? = null
        private set

    /** Device identifier (UUID). */
    var deviceId: String? = null
        private set

    // Legacy alias for envelope matching — uses encryption pubkey for HPKE.
    val pubkey: String? get() = encryptionPubkeyHex

    val isUnlocked: Boolean
        get() = if (nativeLibLoaded) {
            try { org.llamenos.core.mobileIsUnlocked() } catch (_: Exception) { false }
        } else { false }

    /** Whether any device identity has been set (even if locked). */
    val hasIdentity: Boolean get() = signingPubkeyHex != null

    internal var nativeLibLoaded = false

    init {
        try {
            System.loadLibrary("llamenos_core")
            nativeLibLoaded = true
        } catch (_: UnsatisfiedLinkError) {
            nativeLibLoaded = false
        }
    }

    // ---- Device Key Generation ----

    /**
     * Generate new Ed25519 + X25519 device keys, encrypt with PIN, and load into Rust state.
     * Returns the encrypted key blob for persistent storage.
     * Device secrets stay in Rust memory — NEVER exposed to Kotlin.
     */
    suspend fun generateDeviceKeys(deviceId: String, pin: String): EncryptedDeviceKeys =
        withContext(computeDispatcher) {
            check(nativeLibLoaded) { "Native crypto library not loaded." }

            try {
                val ffiResult = org.llamenos.core.mobileGenerateAndLoad(
                    deviceId = deviceId,
                    pin = pin,
                )
                val state = DeviceKeyState(
                    deviceId = ffiResult.state.deviceId,
                    signingPubkeyHex = ffiResult.state.signingPubkeyHex,
                    encryptionPubkeyHex = ffiResult.state.encryptionPubkeyHex,
                )
                this@CryptoService.signingPubkeyHex = state.signingPubkeyHex
                this@CryptoService.encryptionPubkeyHex = state.encryptionPubkeyHex
                this@CryptoService.deviceId = state.deviceId
                EncryptedDeviceKeys(
                    salt = ffiResult.salt,
                    iterations = ffiResult.iterations,
                    nonce = ffiResult.nonce,
                    ciphertext = ffiResult.ciphertext,
                    state = state,
                )
            } catch (e: org.llamenos.core.CryptoException) {
                throw CryptoException("Device key generation failed: ${e.message}", e)
            }
        }

    // ---- Unlock / Lock ----

    /**
     * Decrypt device keys from PIN-encrypted storage and load into Rust state.
     */
    suspend fun unlockWithPin(data: EncryptedDeviceKeys, pin: String): DeviceKeyState =
        withContext(computeDispatcher) {
            check(nativeLibLoaded) { "Native crypto library not loaded." }

            try {
                val ffiData = org.llamenos.core.EncryptedDeviceKeys(
                    salt = data.salt,
                    iterations = data.iterations,
                    nonce = data.nonce,
                    ciphertext = data.ciphertext,
                    state = org.llamenos.core.DeviceKeyState(
                        deviceId = data.state.deviceId,
                        signingPubkeyHex = data.state.signingPubkeyHex,
                        encryptionPubkeyHex = data.state.encryptionPubkeyHex,
                    ),
                )
                val ffiState = org.llamenos.core.mobileUnlock(data = ffiData, pin = pin)
                val state = DeviceKeyState(
                    deviceId = ffiState.deviceId,
                    signingPubkeyHex = ffiState.signingPubkeyHex,
                    encryptionPubkeyHex = ffiState.encryptionPubkeyHex,
                )
                this@CryptoService.signingPubkeyHex = state.signingPubkeyHex
                this@CryptoService.encryptionPubkeyHex = state.encryptionPubkeyHex
                this@CryptoService.deviceId = state.deviceId
                state
            } catch (e: org.llamenos.core.CryptoException) {
                throw CryptoException("Decryption failed: incorrect PIN", e)
            }
        }

    /**
     * Lock by zeroizing device secrets in Rust memory.
     * Public keys are retained for locked-state display ("Locked as ...").
     */
    fun lock() {
        if (nativeLibLoaded) {
            try { org.llamenos.core.mobileLock() } catch (_: Exception) {}
        }
        hubKeys.clear()
    }

    // ---- Auth Token (Ed25519) ----

    /**
     * Create an Ed25519-signed auth token for API requests.
     */
    suspend fun createAuthToken(method: String, path: String): AuthToken =
        withContext(computeDispatcher) {
            createAuthTokenInternal(method, path)
        }

    /**
     * Create an Ed25519 auth token synchronously.
     * Used by AuthInterceptor since OkHttp interceptors cannot use coroutines.
     */
    fun createAuthTokenSync(method: String, path: String): AuthToken {
        return createAuthTokenInternal(method, path)
    }

    private fun createAuthTokenInternal(method: String, path: String): AuthToken {
        check(nativeLibLoaded) { "Native crypto library not loaded." }
        if (!isUnlocked) throw CryptoException("No key loaded")

        val timestamp = System.currentTimeMillis()
        return try {
            val ffiToken = org.llamenos.core.mobileCreateAuthToken(
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

    // ---- Note Encryption (HPKE) ----

    /**
     * Encrypt a note payload with per-note forward secrecy using HPKE key wrapping.
     *
     * 1. Generate random 32-byte symmetric key
     * 2. AES-256-GCM encrypt the payload with that key
     * 3. HPKE-seal the key to each recipient's X25519 pubkey
     */
    suspend fun encryptNote(
        payload: String,
        recipientPubkeys: List<String>,
    ): EncryptedNote = withContext(computeDispatcher) {
        check(nativeLibLoaded) { "Native crypto library not loaded." }
        if (!isUnlocked) throw CryptoException("No key loaded")

        try {
            val plaintextHex = payload.toByteArray(Charsets.UTF_8)
                .joinToString("") { "%02x".format(it) }
            val result = org.llamenos.core.mobileSymmetricEncrypt(plaintextHex = plaintextHex)
            val ciphertextHex = result[0]
            val keyHex = result[1]

            val envelopes = recipientPubkeys.map { pubkey ->
                val hpkeEnv = org.llamenos.core.mobileHpkeSealKey(
                    keyHex = keyHex,
                    recipientPubkeyHex = pubkey,
                    label = CryptoLabels.LABEL_NOTE_KEY,
                    aadHex = "",
                )
                NoteEnvelope(
                    recipientPubkey = pubkey,
                    hpkeEnvelope = HpkeEnvelope(
                        v = hpkeEnv.v.toInt(),
                        labelId = hpkeEnv.labelId.toInt(),
                        enc = hpkeEnv.enc,
                        ct = hpkeEnv.ct,
                    ),
                )
            }

            EncryptedNote(ciphertextHex = ciphertextHex, envelopes = envelopes)
        } catch (e: org.llamenos.core.CryptoException) {
            throw CryptoException("Note encryption failed: ${e.message}", e)
        }
    }

    // ---- Note Decryption (HPKE) ----

    /**
     * Decrypt a note using an HPKE envelope addressed to this device.
     */
    suspend fun decryptNote(
        ciphertextHex: String,
        envelope: HpkeEnvelope,
    ): NotePayload? = withContext(computeDispatcher) {
        check(nativeLibLoaded) { "Native crypto library not loaded." }
        if (!isUnlocked) return@withContext null

        try {
            val ffiEnvelope = org.llamenos.core.HpkeEnvelope(
                v = envelope.v.toUByte(),
                labelId = envelope.labelId.toUByte(),
                enc = envelope.enc,
                ct = envelope.ct,
            )
            val keyHex = org.llamenos.core.mobileHpkeOpenKey(
                envelope = ffiEnvelope,
                expectedLabel = CryptoLabels.LABEL_NOTE_KEY,
                aadHex = "",
            )
            val plaintextHex = org.llamenos.core.mobileSymmetricDecrypt(
                ciphertextHex = ciphertextHex,
                keyHex = keyHex,
            )
            val bytes = hexToBytes(plaintextHex)
            val plaintext = String(bytes, Charsets.UTF_8)
            json.decodeFromString<NotePayload>(plaintext)
        } catch (_: Exception) {
            null
        }
    }

    // ---- Message Encryption (HPKE) ----

    /**
     * Encrypt a message for multiple readers with per-message forward secrecy using HPKE.
     */
    suspend fun encryptMessage(
        plaintext: String,
        readerPubkeys: List<String>,
    ): EncryptedMessage = withContext(computeDispatcher) {
        check(nativeLibLoaded) { "Native crypto library not loaded." }
        val encPubkey = encryptionPubkeyHex ?: throw CryptoException("No key loaded")

        try {
            val allReaders = (listOf(encPubkey) + readerPubkeys).distinct()
            val plaintextHex = plaintext.toByteArray(Charsets.UTF_8)
                .joinToString("") { "%02x".format(it) }
            val result = org.llamenos.core.mobileSymmetricEncrypt(plaintextHex = plaintextHex)
            val ciphertextHex = result[0]
            val keyHex = result[1]

            val envelopes = allReaders.map { pubkey ->
                val hpkeEnv = org.llamenos.core.mobileHpkeSealKey(
                    keyHex = keyHex,
                    recipientPubkeyHex = pubkey,
                    label = CryptoLabels.LABEL_MESSAGE,
                    aadHex = "",
                )
                RecipientEnvelope(
                    pubkey = pubkey,
                    wrappedKey = hpkeEnv.ct,
                    ephemeralPubkey = hpkeEnv.enc,
                )
            }

            EncryptedMessage(ciphertextHex = ciphertextHex, envelopes = envelopes)
        } catch (e: org.llamenos.core.CryptoException) {
            throw CryptoException("Message encryption failed: ${e.message}", e)
        }
    }

    // ---- Message Decryption (HPKE) ----

    /**
     * Decrypt a message using an HPKE envelope addressed to this device.
     */
    suspend fun decryptMessage(
        encryptedContent: String,
        envelope: HpkeEnvelope,
    ): String? = withContext(computeDispatcher) {
        check(nativeLibLoaded) { "Native crypto library not loaded." }
        if (!isUnlocked) return@withContext null

        try {
            val ffiEnvelope = org.llamenos.core.HpkeEnvelope(
                v = envelope.v.toUByte(),
                labelId = envelope.labelId.toUByte(),
                enc = envelope.enc,
                ct = envelope.ct,
            )
            val keyHex = org.llamenos.core.mobileHpkeOpenKey(
                envelope = ffiEnvelope,
                expectedLabel = CryptoLabels.LABEL_MESSAGE,
                aadHex = "",
            )
            val plaintextHex = org.llamenos.core.mobileSymmetricDecrypt(
                ciphertextHex = encryptedContent,
                keyHex = keyHex,
            )
            val bytes = hexToBytes(plaintextHex)
            String(bytes, Charsets.UTF_8)
        } catch (_: Exception) {
            null
        }
    }

    // ---- PUK Operations ----

    /** Create the initial Per-User Key (generation 1). */
    suspend fun createInitialPuk(): String = withContext(computeDispatcher) {
        check(nativeLibLoaded) { "Native crypto library not loaded." }
        if (!isUnlocked) throw CryptoException("No key loaded")
        try {
            org.llamenos.core.mobilePukCreate()
        } catch (e: org.llamenos.core.CryptoException) {
            throw CryptoException("PUK creation failed: ${e.message}", e)
        }
    }

    // ---- Sigchain Operations ----

    /** Create a new sigchain link signed by this device. */
    suspend fun createSigchainLink(
        id: String,
        seq: Long,
        prevHash: String?,
        timestamp: String,
        payloadJson: String,
    ): org.llamenos.core.SigchainLink = withContext(computeDispatcher) {
        check(nativeLibLoaded) { "Native crypto library not loaded." }
        if (!isUnlocked) throw CryptoException("No key loaded")
        try {
            org.llamenos.core.mobileSigchainCreateLink(
                id = id,
                seq = seq.toULong(),
                prevHash = prevHash,
                timestamp = timestamp,
                payloadJson = payloadJson,
            )
        } catch (e: org.llamenos.core.CryptoException) {
            throw CryptoException("Sigchain link creation failed: ${e.message}", e)
        }
    }

    // ---- Server Event Decryption ----

    /**
     * Decrypt a server-encrypted event payload (XChaCha20-Poly1305).
     */
    fun decryptServerEvent(encryptedHex: String, keyHex: String): String? {
        if (!nativeLibLoaded) return null
        return try {
            org.llamenos.core.decryptServerEventHex(encryptedHex, keyHex)
        } catch (_: Exception) {
            null
        }
    }

    // ---- Device Linking (legacy ECDH provisioning) ----

    /**
     * Generate an ephemeral secp256k1 keypair for device linking ECDH.
     * @return Pair of (secretKeyHex, publicKeyHex)
     */
    fun generateEphemeralKeypair(): Pair<String, String> {
        check(nativeLibLoaded) { "Native crypto library not loaded." }
        return try {
            val kp = org.llamenos.core.generateKeypair()
            Pair(kp.secretKeyHex, kp.publicKey)
        } catch (e: org.llamenos.core.CryptoException) {
            throw CryptoException("Ephemeral keypair generation failed: ${e.message}", e)
        }
    }

    /**
     * Derive ECDH shared secret from our ephemeral secret and their ephemeral public key.
     */
    fun deriveSharedSecret(ourSecret: String, theirPublic: String): String {
        check(nativeLibLoaded) { "Native crypto library not loaded." }
        return try {
            org.llamenos.core.computeSharedXHex(ourSecret, theirPublic)
        } catch (e: org.llamenos.core.CryptoException) {
            throw CryptoException("ECDH derivation failed: ${e.message}", e)
        }
    }

    /**
     * Decrypt data encrypted with a shared secret (XChaCha20-Poly1305).
     * Used during device linking.
     */
    suspend fun decryptWithSharedSecret(
        ciphertextHex: String,
        sharedSecretHex: String,
    ): String = withContext(computeDispatcher) {
        check(nativeLibLoaded) { "Native crypto library not loaded." }
        try {
            org.llamenos.core.decryptWithSharedKeyHex(ciphertextHex, sharedSecretHex)
        } catch (e: org.llamenos.core.CryptoException) {
            throw CryptoException("Shared secret decryption failed: ${e.message}", e)
        }
    }

    /**
     * Derive a 6-digit SAS verification code from a shared secret.
     */
    fun deriveSASCode(sharedSecret: String): String {
        check(nativeLibLoaded) { "Native crypto library not loaded." }
        return try {
            org.llamenos.core.computeSasCode(sharedSecret)
        } catch (e: org.llamenos.core.CryptoException) {
            throw CryptoException("SAS code derivation failed: ${e.message}", e)
        }
    }

    // ---- Hub Key Management ----

    private val hubKeys: MutableMap<String, String> = ConcurrentHashMap() // hubId → keyHex

    fun hasHubKey(hubId: String): Boolean = hubKeys.containsKey(hubId)

    fun allHubKeys(): Map<String, String> = HashMap(hubKeys)

    fun clearHubKeys() { hubKeys.clear() }

    /**
     * Unwrap and cache the hub key using HPKE from a server-provided envelope.
     */
    suspend fun loadHubKey(hubId: String, envelope: HubKeyEnvelopeResponse): Unit =
        withContext(computeDispatcher) {
            check(nativeLibLoaded) { "Native crypto library not loaded." }
            if (!isUnlocked) throw CryptoException("No key loaded")

            val ffiEnvelope = org.llamenos.core.HpkeEnvelope(
                v = 3.toUByte(),
                labelId = 0.toUByte(),
                enc = envelope.envelope.wrappedKey,
                ct = envelope.envelope.ephemeralPubkey,
            )

            val keyHex = try {
                org.llamenos.core.mobileHpkeOpenKey(
                    envelope = ffiEnvelope,
                    expectedLabel = CryptoLabels.LABEL_HUB_KEY_WRAP,
                    aadHex = "",
                )
            } catch (e: org.llamenos.core.CryptoException) {
                throw CryptoException("Hub key decryption failed for hub $hubId: ${e.message}", e)
            }

            hubKeys[hubId] = keyHex
        }

    // ---- Hex Utility ----

    private fun hexToBytes(hex: String): ByteArray {
        require(hex.length % 2 == 0) { "Hex string has odd length" }
        return ByteArray(hex.length / 2) { i ->
            hex.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
    }

    // ---- Test Support ----

    internal fun injectHubKeyForTest(hubId: String, keyHex: String) {
        hubKeys[hubId] = keyHex
    }

    /**
     * Set up test key state without native library calls.
     */
    internal fun setTestKeyState(
        signing: String,
        encryption: String,
        device: String,
    ) {
        signingPubkeyHex = signing
        encryptionPubkeyHex = encryption
        deviceId = device
    }
}
