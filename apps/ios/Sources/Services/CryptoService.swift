import Foundation

// MARK: - File-level references to UniFFI global functions
// Needed because CryptoService method names shadow some global function names.
// At file scope there is no `self`, so these unambiguously refer to the UniFFI functions.

private func ffiGenerateKeypair() -> KeyPair {
    generateKeypair()
}

private func ffiKeypairFromNsec(_ nsec: String) throws -> KeyPair {
    try keypairFromNsec(nsec: nsec)
}

private func ffiKeypairFromSecretKeyHex(_ hex: String) throws -> KeyPair {
    try keypairFromSecretKeyHex(secretKeyHex: hex)
}

private func ffiIsValidPin(_ pin: String) -> Bool {
    isValidPin(pin: pin)
}

private func ffiEncryptWithPin(nsec: String, pin: String, pubkeyHex: String) throws -> EncryptedKeyData {
    try encryptWithPin(nsec: nsec, pin: pin, pubkeyHex: pubkeyHex)
}

private func ffiDecryptWithPin(data: EncryptedKeyData, pin: String) throws -> String {
    try decryptWithPin(data: data, pin: pin)
}

private func ffiCreateAuthToken(secretKeyHex: String, timestamp: UInt64, method: String, path: String) throws -> AuthToken {
    try createAuthToken(secretKeyHex: secretKeyHex, timestamp: timestamp, method: method, path: path)
}

private func ffiEncryptNoteForRecipients(payloadJson: String, authorPubkey: String, adminPubkeys: [String]) throws -> EncryptedNote {
    try encryptNoteForRecipients(payloadJson: payloadJson, authorPubkey: authorPubkey, adminPubkeys: adminPubkeys)
}

private func ffiDecryptNote(encryptedContent: String, envelope: KeyEnvelope, secretKeyHex: String) throws -> String {
    try decryptNote(encryptedContent: encryptedContent, envelope: envelope, secretKeyHex: secretKeyHex)
}

private func ffiEncryptMessageForReaders(plaintext: String, readerPubkeys: [String]) throws -> EncryptedMessage {
    try encryptMessageForReaders(plaintext: plaintext, readerPubkeys: readerPubkeys)
}

private func ffiDecryptMessageForReader(encryptedContent: String, readerEnvelopes: [RecipientKeyEnvelope], secretKeyHex: String, readerPubkey: String) throws -> String {
    try decryptMessageForReader(encryptedContent: encryptedContent, readerEnvelopes: readerEnvelopes, secretKeyHex: secretKeyHex, readerPubkey: readerPubkey)
}

private func ffiComputeSharedXHex(ourSecretHex: String, theirPubkeyHex: String) throws -> String {
    try computeSharedXHex(ourSecretHex: ourSecretHex, theirPubkeyHex: theirPubkeyHex)
}

private func ffiDecryptWithSharedKeyHex(ciphertextHex: String, sharedXHex: String) throws -> String {
    try decryptWithSharedKeyHex(ciphertextHex: ciphertextHex, sharedXHex: sharedXHex)
}

private func ffiComputeSasCode(sharedXHex: String) throws -> String {
    try computeSasCode(sharedXHex: sharedXHex)
}

private func ffiDecryptServerEventHex(encryptedHex: String, keyHex: String) throws -> String {
    try decryptServerEventHex(encryptedHex: encryptedHex, keyHex: keyHex)
}

// MARK: - CryptoService

enum CryptoServiceError: LocalizedError {
    case noKeyLoaded
    case invalidNsec
    case invalidPin
    case encryptionFailed(String)
    case decryptionFailed(String)

    var errorDescription: String? {
        switch self {
        case .noKeyLoaded:
            return NSLocalizedString("error_no_key_loaded", comment: "No cryptographic key is loaded")
        case .invalidNsec:
            return NSLocalizedString("error_invalid_nsec", comment: "The provided nsec key is invalid")
        case .invalidPin:
            return NSLocalizedString("error_invalid_pin", comment: "PIN must be 6-8 digits")
        case .encryptionFailed(let detail):
            return String(format: NSLocalizedString("error_encryption_failed", comment: "Encryption failed: %@"), detail)
        case .decryptionFailed(let detail):
            return String(format: NSLocalizedString("error_decryption_failed", comment: "Decryption failed: %@"), detail)
        }
    }
}

/// Central cryptographic service. The nsec (private key) is held privately and NEVER
/// exposed outside this class. Views and view models interact only with the pubkey/npub
/// and high-level encrypt/decrypt/sign methods.
///
/// All crypto operations delegate to LlamenosCore (UniFFI FFI via the compiled
/// LlamenosCoreFFI.xcframework). The generated Swift bindings in Sources/Generated/
/// provide type-safe wrappers around the Rust crypto implementation.
@Observable
final class CryptoService: @unchecked Sendable {
    private(set) var pubkey: String?
    private(set) var npub: String?

    /// The secret key in hex. NEVER exposed outside this class.
    private var nsecHex: String?

    /// The nsec bech32 string, stored for PIN encryption which needs it.
    private var nsecBech32: String?

    /// Whether a key is loaded and available for signing/decryption.
    var isUnlocked: Bool { nsecHex != nil }

    /// Whether any identity has been loaded (even if locked).
    var hasIdentity: Bool { pubkey != nil }

    // MARK: - Key Generation

    /// Generate a new secp256k1 keypair. Returns the nsec (for one-time backup display)
    /// and npub. The nsec is stored internally; callers must NOT persist the returned nsec.
    @discardableResult
    func generateKeypair() -> (nsec: String, npub: String) {
        let kp = ffiGenerateKeypair()
        self.nsecHex = kp.secretKeyHex
        self.nsecBech32 = kp.nsec
        self.pubkey = kp.publicKey
        self.npub = kp.npub
        return (kp.nsec, kp.npub)
    }

    // MARK: - Key Import

    /// Import an existing nsec (bech32 `nsec1...` or 64-char hex).
    func importNsec(_ input: String) throws {
        let kp: KeyPair
        if input.hasPrefix("nsec1") {
            kp = try ffiKeypairFromNsec(input)
        } else if input.count == 64, input.allSatisfy(\.isHexDigit) {
            kp = try ffiKeypairFromSecretKeyHex(input)
        } else {
            throw CryptoError.InvalidNsec(message: "Enter a bech32 key (nsec1...) or 64-character hex key")
        }
        self.nsecHex = kp.secretKeyHex
        self.nsecBech32 = kp.nsec
        self.pubkey = kp.publicKey
        self.npub = kp.npub
    }

    // MARK: - PIN Encryption

    /// Encrypt the nsec for persistent storage, protected by the user's PIN.
    /// Returns opaque encrypted data suitable for Keychain storage.
    func encryptForStorage(pin: String) throws -> EncryptedKeyData {
        guard let pubkey else { throw CryptoServiceError.noKeyLoaded }
        guard let nsecBech32 else { throw CryptoServiceError.noKeyLoaded }
        guard ffiIsValidPin(pin) else { throw CryptoServiceError.invalidPin }
        return try ffiEncryptWithPin(nsec: nsecBech32, pin: pin, pubkeyHex: pubkey)
    }

    /// Decrypt nsec from storage using the user's PIN and load it into memory.
    func decryptFromStorage(_ data: EncryptedKeyData, pin: String) throws {
        let nsec = try ffiDecryptWithPin(data: data, pin: pin)
        try importNsec(nsec)
    }

    // MARK: - Auth Token

    /// Create a Schnorr-signed auth token for API requests.
    /// The nsec is used for signing but never leaves this service.
    func createAuthToken(method: String, path: String) throws -> AuthToken {
        guard let nsecHex else { throw CryptoServiceError.noKeyLoaded }
        return try Self.createAuthTokenStatic(secretHex: nsecHex, method: method, path: path)
    }

    /// Create an auth token from a known secret key (no instance state needed).
    /// Used by test infrastructure to create tokens for admin bootstrapping.
    static func createAuthTokenStatic(secretHex: String, method: String, path: String) throws -> AuthToken {
        let timestamp = UInt64(Date().timeIntervalSince1970 * 1000)
        return try ffiCreateAuthToken(
            secretKeyHex: secretHex,
            timestamp: timestamp,
            method: method,
            path: path
        )
    }

    // MARK: - Note Encryption

    /// Encrypt a note payload with per-note forward secrecy. The note key is ECIES-wrapped
    /// for the author and each admin pubkey.
    func encryptNote(payload: String, adminPubkeys: [String]) throws -> EncryptedNote {
        guard let pubkey else { throw CryptoServiceError.noKeyLoaded }
        return try ffiEncryptNoteForRecipients(
            payloadJson: payload,
            authorPubkey: pubkey,
            adminPubkeys: adminPubkeys
        )
    }

    // MARK: - Note Decryption

    /// Decrypt a note using the recipient envelope that matches our pubkey.
    /// Finds our envelope, unwraps the note key via ECIES, then decrypts the content
    /// with XChaCha20-Poly1305.
    ///
    /// - Parameters:
    ///   - encryptedContent: Hex-encoded encrypted note content.
    ///   - wrappedKey: Hex-encoded ECIES-wrapped note symmetric key.
    ///   - ephemeralPubkey: Hex-encoded ephemeral public key used in ECIES.
    /// - Returns: Decrypted JSON string containing the `NotePayload`.
    func decryptNoteContent(encryptedContent: String, wrappedKey: String, ephemeralPubkey: String) throws -> String {
        guard let nsecHex else { throw CryptoServiceError.noKeyLoaded }
        let envelope = KeyEnvelope(wrappedKey: wrappedKey, ephemeralPubkey: ephemeralPubkey)
        return try ffiDecryptNote(
            encryptedContent: encryptedContent,
            envelope: envelope,
            secretKeyHex: nsecHex
        )
    }

    // MARK: - Message Encryption

    /// Encrypt a message for multiple readers with per-message forward secrecy.
    /// A random symmetric key is generated, the plaintext is encrypted with XChaCha20-Poly1305,
    /// and the key is ECIES-wrapped for each reader pubkey.
    ///
    /// - Parameters:
    ///   - plaintext: The message text to encrypt.
    ///   - readerPubkeys: Public keys of all recipients (assigned volunteer + admins).
    /// - Returns: Encrypted content and recipient envelopes.
    func encryptMessage(plaintext: String, readerPubkeys: [String]) throws -> (encryptedContent: String, envelopes: [NoteRecipientEnvelope]) {
        guard let pubkey else { throw CryptoServiceError.noKeyLoaded }
        let allReaders = Array(Set([pubkey] + readerPubkeys))
        let result = try ffiEncryptMessageForReaders(
            plaintext: plaintext,
            readerPubkeys: allReaders
        )
        let envelopes = result.readerEnvelopes.map { env in
            NoteRecipientEnvelope(ephemeralPubkey: env.ephemeralPubkey, pubkey: env.pubkey, wrappedKey: env.wrappedKey)
        }
        return (result.encryptedContent, envelopes)
    }

    // MARK: - Message Decryption

    /// Decrypt a message using our private key and the ECIES envelope addressed to us.
    ///
    /// - Parameters:
    ///   - encryptedContent: Hex-encoded encrypted message content.
    ///   - wrappedKey: Hex-encoded ECIES-wrapped symmetric key.
    ///   - ephemeralPubkey: Hex-encoded ephemeral public key used in ECIES.
    /// - Returns: Decrypted plaintext string.
    func decryptMessage(encryptedContent: String, wrappedKey: String, ephemeralPubkey: String) throws -> String {
        guard let nsecHex else { throw CryptoServiceError.noKeyLoaded }
        guard let pubkey else { throw CryptoServiceError.noKeyLoaded }
        let envelope = RecipientKeyEnvelope(pubkey: pubkey, wrappedKey: wrappedKey, ephemeralPubkey: ephemeralPubkey)
        return try ffiDecryptMessageForReader(
            encryptedContent: encryptedContent,
            readerEnvelopes: [envelope],
            secretKeyHex: nsecHex,
            readerPubkey: pubkey
        )
    }

    // MARK: - Device Linking ECDH

    /// Generate an ephemeral secp256k1 keypair for the ECDH key exchange
    /// during device linking. Uses the main keypair generator since ephemeral
    /// keys are the same secp256k1 type.
    ///
    /// - Returns: Tuple of (secretKeyHex, publicKeyHex).
    func generateEphemeralKeypair() -> (secretHex: String, publicHex: String) {
        let kp = ffiGenerateKeypair()
        return (kp.secretKeyHex, kp.publicKey)
    }

    /// Compute an ECDH shared secret from our ephemeral secret and their ephemeral public key.
    /// Used in the device linking protocol to establish a shared encryption key.
    ///
    /// - Parameters:
    ///   - ourSecret: Our ephemeral private key in hex.
    ///   - theirPublic: Their ephemeral public key in hex (x-only or compressed).
    /// - Returns: The shared x-coordinate in hex (32 bytes).
    func deriveSharedSecret(ourSecret: String, theirPublic: String) throws -> String {
        try ffiComputeSharedXHex(ourSecretHex: ourSecret, theirPubkeyHex: theirPublic)
    }

    /// Decrypt data encrypted with a shared secret (XChaCha20-Poly1305 with HKDF-derived key).
    /// Used during device linking to decrypt the nsec sent from the desktop.
    func decryptWithSharedSecret(encrypted: String, sharedSecret: String) throws -> String {
        guard !encrypted.isEmpty else {
            throw CryptoServiceError.decryptionFailed("Empty ciphertext")
        }
        return try ffiDecryptWithSharedKeyHex(ciphertextHex: encrypted, sharedXHex: sharedSecret)
    }

    // MARK: - SAS Code

    /// Derive a 6-digit Short Authentication String from the ECDH shared secret.
    /// Both devices derive the same SAS code independently; the user visually confirms
    /// the codes match to prevent MITM attacks during device linking.
    func deriveSASCode(sharedSecret: String) throws -> String {
        try ffiComputeSasCode(sharedXHex: sharedSecret)
    }

    // MARK: - Server Event Decryption

    /// Decrypt a server-encrypted event payload (XChaCha20-Poly1305).
    /// The server encrypts all Nostr relay event content with a symmetric key
    /// returned as `serverEventKeyHex` in `GET /api/auth/me`.
    ///
    /// - Parameters:
    ///   - encryptedHex: Hex-encoded ciphertext (nonce || ciphertext || tag).
    ///   - keyHex: 64-char hex server event encryption key.
    /// - Returns: Decrypted plaintext JSON string, or nil on failure.
    static func decryptServerEvent(encryptedHex: String, keyHex: String) -> String? {
        return try? ffiDecryptServerEventHex(encryptedHex: encryptedHex, keyHex: keyHex)
    }

    // MARK: - Hub Key Cache

    /// In-memory hub key cache. Keys are hex strings of 32-byte symmetric keys. Never written to disk.
    private var hubKeyCache: [String: String] = [:]  // hubId → keyHex
    private let hubKeyCacheLock = NSLock()

    /// Total number of hub keys currently cached.
    var hubKeyCount: Int {
        hubKeyCacheLock.lock()
        defer { hubKeyCacheLock.unlock() }
        return hubKeyCache.count
    }

    /// Returns true if a key for the given hub is cached.
    func hasHubKey(hubId: String) -> Bool {
        hubKeyCacheLock.lock()
        defer { hubKeyCacheLock.unlock() }
        return hubKeyCache[hubId] != nil
    }

    /// Returns a copy of the hub key cache (for relay event decryption).
    func allHubKeys() -> [String: String] {
        hubKeyCacheLock.lock()
        defer { hubKeyCacheLock.unlock() }
        return hubKeyCache
    }

    /// Unwrap a hub key envelope using the user's nsec and store in the in-memory cache.
    /// Uses eciesUnwrapKeyHex with the CryptoLabels.LABEL_HUB_KEY_WRAP domain separation label.
    /// Requires the user's nsec to be loaded (app unlocked).
    func loadHubKey(hubId: String, envelope: HubKeyEnvelopeResponse) throws {
        hubKeyCacheLock.lock()
        let alreadyCached = hubKeyCache[hubId] != nil
        hubKeyCacheLock.unlock()
        guard !alreadyCached else { return }

        guard let nsecHex else { throw CryptoServiceError.noKeyLoaded }
        let ffiEnvelope = KeyEnvelope(
            wrappedKey: envelope.envelope.wrappedKey,
            ephemeralPubkey: envelope.envelope.ephemeralPubkey
        )
        // FFI call happens before acquiring the lock — no point holding the lock
        // during decryption, which may be slow and does not access hubKeyCache.
        let keyHex = try eciesUnwrapKeyHex(
            envelope: ffiEnvelope,
            secretKeyHex: nsecHex,
            label: CryptoLabels.LABEL_HUB_KEY_WRAP
        )
        hubKeyCacheLock.lock()
        defer { hubKeyCacheLock.unlock() }
        hubKeyCache[hubId] = keyHex
    }

    /// Evict all hub keys. Must be called on lock and logout.
    func clearHubKeys() {
        hubKeyCacheLock.lock()
        defer { hubKeyCacheLock.unlock() }
        hubKeyCache.removeAll()
    }

    // MARK: - Lock

    /// Clear the nsec from memory. The pubkey and npub remain so the UI can show
    /// which identity is locked ("Locked as npub1...").
    func lock() {
        nsecHex = nil
        nsecBech32 = nil
        clearHubKeys()
    }

    /// Store a server event encryption key directly for a hub (no ECIES unwrapping needed —
    /// the key is provided in plaintext by `GET /api/auth/me` as `serverEventKeyHex`).
    /// This is distinct from `loadHubKey(hubId:envelope:)` which unwraps hub membership keys.
    func storeServerEventKey(hubId: String, keyHex: String) {
        hubKeyCacheLock.lock()
        defer { hubKeyCacheLock.unlock() }
        hubKeyCache[hubId] = keyHex
    }

    // MARK: - Test Support

    #if DEBUG
    /// Store a hub key directly for testing (bypasses FFI envelope decryption).
    func storeHubKeyForTesting(hubId: String, keyHex: String) {
        hubKeyCacheLock.lock()
        defer { hubKeyCacheLock.unlock() }
        hubKeyCache[hubId] = keyHex
    }

    /// Set a deterministic test identity for XCUITest automation.
    /// Uses the same admin secret key as the desktop Playwright tests,
    /// matching the ADMIN_PUBKEY configured in Docker Compose. The real
    /// pubkey/npub are derived via the Rust FFI so auth tokens, note
    /// envelope matching, and API requests all use consistent keys.
    ///
    /// Admin nsec (desktop tests/helpers.ts): nsec174zsa94n3e7t0ugfldh9tgkkzmaxhalr78uxt9phjq3mmn6d6xas5jdffh
    /// Secret hex: f5450e96b38e7cb7f109fb6e55a2d616fa6bf7e3f1f86594379023bdcf4dd1bb
    /// Pubkey:     ac4718373d30301e5c7cf55e9e6f2568efb94f3278fb88f37f4981e880505228
    func setMockIdentity() {
        // Same admin key used in desktop tests — matches ADMIN_PUBKEY in Docker .env
        let secretHex = "f5450e96b38e7cb7f109fb6e55a2d616fa6bf7e3f1f86594379023bdcf4dd1bb"
        setIdentity(secretHex: secretHex)
    }

    /// Set a mock volunteer identity (different keypair from admin).
    /// Used by API-connected tests that need to test volunteer-specific behavior.
    ///
    /// Volunteer nsec hex: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
    /// Pubkey:             5877220aaae6e54a6f974602d5995c0fe24a3ea7ddabd8644bec795b9da00743
    func setMockVolunteerIdentity() {
        let secretHex = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
        setIdentity(secretHex: secretHex)
    }

    private func setIdentity(secretHex: String) {
        do {
            let kp = try ffiKeypairFromSecretKeyHex(secretHex)
            self.nsecHex = kp.secretKeyHex
            self.nsecBech32 = kp.nsec
            self.pubkey = kp.publicKey
            self.npub = kp.npub
        } catch {
            // Should never fail — this is a known-valid secp256k1 scalar
            self.nsecHex = secretHex
            self.nsecBech32 = nil
            self.pubkey = nil
            self.npub = nil
        }
    }
    #endif
}
