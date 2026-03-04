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
            return NSLocalizedString("error_invalid_pin", comment: "PIN must be 4-6 digits")
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

    /// Import an existing nsec (bech32-encoded secret key).
    func importNsec(_ nsec: String) throws {
        let kp = try ffiKeypairFromNsec(nsec)
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
        let timestamp = UInt64(Date().timeIntervalSince1970 * 1000)
        return try ffiCreateAuthToken(
            secretKeyHex: nsecHex,
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
            NoteRecipientEnvelope(pubkey: env.pubkey, wrappedKey: env.wrappedKey, ephemeralPubkey: env.ephemeralPubkey)
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

    // MARK: - Lock

    /// Clear the nsec from memory. The pubkey and npub remain so the UI can show
    /// which identity is locked ("Locked as npub1...").
    func lock() {
        nsecHex = nil
        nsecBech32 = nil
    }

    // MARK: - Test Support

    #if DEBUG
    /// Set a deterministic mock identity for XCUITest automation.
    /// Avoids generating real keys during UI tests where crypto correctness isn't under test.
    func setMockIdentity() {
        self.nsecHex = String(repeating: "ab", count: 32)
        self.nsecBech32 = "nsec1mock"
        self.pubkey = String(repeating: "cd", count: 32)
        self.npub = "npub1mock"
    }
    #endif
}
