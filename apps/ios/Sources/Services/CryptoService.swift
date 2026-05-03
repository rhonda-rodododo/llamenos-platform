import Foundation

// MARK: - File-level references to UniFFI global functions
// Needed because CryptoService method names shadow some global function names.
// At file scope there is no `self`, so these unambiguously refer to the UniFFI functions.

// V3 device key management (stateful — secrets held in Rust memory)
private func ffiMobileGenerateAndLoad(deviceId: String, pin: String) throws -> EncryptedDeviceKeys {
    try mobileGenerateAndLoad(deviceId: deviceId, pin: pin)
}

private func ffiMobileUnlock(data: EncryptedDeviceKeys, pin: String) throws -> DeviceKeyState {
    try mobileUnlock(data: data, pin: pin)
}

private func ffiMobileLock() {
    mobileLock()
}

private func ffiMobileIsUnlocked() -> Bool {
    mobileIsUnlocked()
}

private func ffiMobileGetDeviceState() throws -> DeviceKeyState {
    try mobileGetDeviceState()
}

private func ffiMobileIsValidPin(_ pin: String) -> Bool {
    mobileIsValidPin(pin: pin)
}

// V3 auth (Ed25519, stateful)
private func ffiMobileCreateAuthToken(timestamp: UInt64, method: String, path: String) throws -> AuthToken {
    try mobileCreateAuthToken(timestamp: timestamp, method: method, path: path)
}

// V3 HPKE (stateless seal, stateful open)
private func ffiMobileHpkeSeal(plaintextHex: String, recipientPubkeyHex: String, label: String, aadHex: String) throws -> HpkeEnvelope {
    try mobileHpkeSeal(plaintextHex: plaintextHex, recipientPubkeyHex: recipientPubkeyHex, label: label, aadHex: aadHex)
}

private func ffiMobileHpkeOpen(envelope: HpkeEnvelope, expectedLabel: String, aadHex: String) throws -> String {
    try mobileHpkeOpen(envelope: envelope, expectedLabel: expectedLabel, aadHex: aadHex)
}

private func ffiMobileHpkeSealKey(keyHex: String, recipientPubkeyHex: String, label: String, aadHex: String) throws -> HpkeEnvelope {
    try mobileHpkeSealKey(keyHex: keyHex, recipientPubkeyHex: recipientPubkeyHex, label: label, aadHex: aadHex)
}

private func ffiMobileHpkeOpenKey(envelope: HpkeEnvelope, expectedLabel: String, aadHex: String) throws -> String {
    try mobileHpkeOpenKey(envelope: envelope, expectedLabel: expectedLabel, aadHex: aadHex)
}

// V3 symmetric encryption (AES-256-GCM)
private func ffiMobileSymmetricEncrypt(plaintextHex: String) throws -> [String] {
    try mobileSymmetricEncrypt(plaintextHex: plaintextHex)
}

private func ffiMobileSymmetricDecrypt(ciphertextHex: String, keyHex: String) throws -> String {
    try mobileSymmetricDecrypt(ciphertextHex: ciphertextHex, keyHex: keyHex)
}

// V3 PUK
private func ffiMobilePukCreate() throws -> String {
    try mobilePukCreate()
}

// V3 Sigchain (stateful)
private func ffiMobileSigchainCreateLink(id: String, seq: UInt64, prevHash: String?, timestamp: String, payloadJson: String) throws -> SigchainLink {
    try mobileSigchainCreateLink(id: id, seq: seq, prevHash: prevHash, timestamp: timestamp, payloadJson: payloadJson)
}

// Legacy functions still needed for device linking and server events
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

private func ffiMobileRandomBytesHex() -> String {
    mobileRandomBytesHex()
}

// Mobile FFI for device-linking ephemeral ECDH (returns secret + public).
private func ffiGenerateEphemeralKeypair() -> EphemeralKeyPair {
    generateEphemeralKeypairMobile()
}

// Hub key + server event key management (keys stored in Rust, never in Swift)
private func ffiMobileSetHubKey(hubId: String, keyHex: String) throws {
    try mobileSetHubKey(hubId: hubId, keyHex: keyHex)
}

private func ffiMobileHasHubKey(hubId: String) -> Bool {
    mobileHasHubKey(hubId: hubId)
}

private func ffiMobileClearHubKeys() {
    mobileClearHubKeys()
}

private func ffiMobileSetServerEventKeys(currentHex: String, previousHex: String?) throws {
    try mobileSetServerEventKeys(currentHex: currentHex, previousHex: previousHex)
}

private func ffiMobileDecryptHubEvent(ciphertextHex: String, hubId: String) throws -> String {
    try mobileDecryptHubEvent(ciphertextHex: ciphertextHex, hubId: hubId)
}

private func ffiMobileDecryptServerEvent(encryptedHex: String) throws -> String {
    try mobileDecryptServerEvent(encryptedHex: encryptedHex)
}

private func ffiMobileDecryptEventWithAttribution(ciphertextHex: String) throws -> [String] {
    try mobileDecryptEventWithAttribution(ciphertextHex: ciphertextHex)
}

// MARK: - CryptoService

enum CryptoServiceError: LocalizedError {
    case noKeyLoaded
    case invalidPin
    case encryptionFailed(String)
    case decryptionFailed(String)

    var errorDescription: String? {
        switch self {
        case .noKeyLoaded:
            return NSLocalizedString("error_no_key_loaded", comment: "No cryptographic key is loaded")
        case .invalidPin:
            return NSLocalizedString("error_invalid_pin", comment: "PIN must be 6-8 digits")
        case .encryptionFailed(let detail):
            return String(format: NSLocalizedString("error_encryption_failed", comment: "Encryption failed: %@"), detail)
        case .decryptionFailed(let detail):
            return String(format: NSLocalizedString("error_decryption_failed", comment: "Decryption failed: %@"), detail)
        }
    }
}

/// Central cryptographic service using the v3 device key model.
///
/// Device secrets (Ed25519 signing + X25519 encryption) are held exclusively in
/// Rust memory via the mobile FFI state. The Swift layer only sees public keys
/// and operation results — secrets NEVER leave the Rust process.
///
/// All crypto operations delegate to LlamenosCore (UniFFI FFI via the compiled
/// LlamenosCoreFFI.xcframework). The generated Swift bindings in Sources/Generated/
/// provide type-safe wrappers around the Rust crypto implementation.
@Observable
final class CryptoService: @unchecked Sendable {
    /// Ed25519 signing public key (hex, 64 chars). Used to identify this device.
    private(set) var signingPubkeyHex: String?

    /// X25519 encryption public key (hex, 64 chars). Used for HPKE decapsulation.
    private(set) var encryptionPubkeyHex: String?

    /// Unique device identifier (UUID).
    private(set) var deviceId: String?

    // Used by note/message envelope matching — must be encryption pubkey for HPKE.
    var pubkey: String? { encryptionPubkeyHex }

    /// Whether device keys are loaded and available for signing/decryption.
    var isUnlocked: Bool { ffiMobileIsUnlocked() }

    /// Whether any device identity has been set (even if locked).
    var hasIdentity: Bool { signingPubkeyHex != nil }

    // MARK: - Device Key Generation

    /// Generate new Ed25519 + X25519 device keys, encrypt with PIN, and load into state.
    /// Returns the encrypted key blob for persistent storage in Keychain.
    /// Device secrets stay in Rust memory — NEVER exposed to Swift.
    func generateDeviceKeys(deviceId: String, pin: String) throws -> EncryptedDeviceKeys {
        guard ffiMobileIsValidPin(pin) else { throw CryptoServiceError.invalidPin }
        let encrypted = try ffiMobileGenerateAndLoad(deviceId: deviceId, pin: pin)
        self.signingPubkeyHex = encrypted.state.signingPubkeyHex
        self.encryptionPubkeyHex = encrypted.state.encryptionPubkeyHex
        self.deviceId = encrypted.state.deviceId
        return encrypted
    }

    // MARK: - Unlock / Lock

    /// Decrypt device keys from PIN-encrypted storage and load into Rust state.
    /// Returns the DeviceKeyState (public keys only).
    func unlockWithPin(data: EncryptedDeviceKeys, pin: String) throws -> DeviceKeyState {
        let ds = try ffiMobileUnlock(data: data, pin: pin)
        self.signingPubkeyHex = ds.signingPubkeyHex
        self.encryptionPubkeyHex = ds.encryptionPubkeyHex
        self.deviceId = ds.deviceId
        return ds
    }

    /// Lock the crypto state — zeroize device secrets, hub keys, and server event keys in Rust.
    /// Public keys are retained for locked-state UI display ("Locked as ...").
    func lock() {
        ffiMobileLock()
        // mobile_lock() already clears hub keys and server event keys in Rust
    }

    // MARK: - Auth Token (Ed25519)

    /// Create an Ed25519-signed auth token for API requests.
    /// The device signing key is used; secrets never leave Rust.
    func createAuthToken(method: String, path: String) throws -> AuthToken {
        guard isUnlocked else { throw CryptoServiceError.noKeyLoaded }
        let timestamp = UInt64(Date().timeIntervalSince1970 * 1000)
        return try ffiMobileCreateAuthToken(timestamp: timestamp, method: method, path: path)
    }

    // MARK: - Note Encryption (HPKE)

    /// Encrypt a note payload with per-note forward secrecy using HPKE key wrapping.
    ///
    /// 1. Generate random 32-byte symmetric key
    /// 2. AES-256-GCM encrypt the payload with that key
    /// 3. HPKE-seal the key to each recipient's X25519 pubkey
    ///
    /// - Parameters:
    ///   - payload: JSON string of the note payload.
    ///   - recipientPubkeys: X25519 public keys of all recipients (author device + admins).
    /// - Returns: Ciphertext hex and per-recipient HPKE envelopes.
    func encryptNote(payload: String, recipientPubkeys: [String]) throws -> (ciphertextHex: String, envelopes: [(pubkey: String, envelope: HpkeEnvelope)]) {
        guard isUnlocked else { throw CryptoServiceError.noKeyLoaded }

        let plaintextHex = payload.data(using: .utf8)!.map { String(format: "%02x", $0) }.joined()
        let result = try ffiMobileSymmetricEncrypt(plaintextHex: plaintextHex)
        let ciphertextHex = result[0]
        let keyHex = result[1]

        var envelopes: [(pubkey: String, envelope: HpkeEnvelope)] = []
        for pubkey in recipientPubkeys {
            let envelope = try ffiMobileHpkeSealKey(
                keyHex: keyHex,
                recipientPubkeyHex: pubkey,
                label: CryptoLabels.LABEL_NOTE_KEY,
                aadHex: ""
            )
            envelopes.append((pubkey: pubkey, envelope: envelope))
        }

        return (ciphertextHex, envelopes)
    }

    // MARK: - Note Decryption (HPKE)

    /// Decrypt a note using an HPKE envelope addressed to this device.
    ///
    /// 1. HPKE-open the key envelope using device X25519 key
    /// 2. AES-256-GCM decrypt the content with the recovered key
    ///
    /// - Parameters:
    ///   - ciphertextHex: Hex-encoded AES-256-GCM ciphertext (nonce || ct || tag).
    ///   - envelope: The HPKE envelope containing the wrapped note key.
    /// - Returns: Decrypted JSON string containing the NotePayload.
    func decryptNote(ciphertextHex: String, envelope: HpkeEnvelope) throws -> String {
        guard isUnlocked else { throw CryptoServiceError.noKeyLoaded }
        let keyHex = try ffiMobileHpkeOpenKey(
            envelope: envelope,
            expectedLabel: CryptoLabels.LABEL_NOTE_KEY,
            aadHex: ""
        )
        let plaintextHex = try ffiMobileSymmetricDecrypt(ciphertextHex: ciphertextHex, keyHex: keyHex)
        guard let data = hexToData(plaintextHex), let result = String(data: data, encoding: .utf8) else {
            throw CryptoServiceError.decryptionFailed("Invalid UTF-8 in decrypted note")
        }
        return result
    }

    // MARK: - Message Encryption (HPKE)

    /// Encrypt a message for multiple readers with per-message forward secrecy using HPKE.
    func encryptMessage(plaintext: String, readerPubkeys: [String]) throws -> (encryptedContent: String, envelopes: [NoteRecipientEnvelope]) {
        guard let encPubkey = encryptionPubkeyHex else { throw CryptoServiceError.noKeyLoaded }
        let allReaders = Array(Set([encPubkey] + readerPubkeys))

        let plaintextHex = plaintext.data(using: .utf8)!.map { String(format: "%02x", $0) }.joined()
        let result = try ffiMobileSymmetricEncrypt(plaintextHex: plaintextHex)
        let ciphertextHex = result[0]
        let keyHex = result[1]

        var envelopes: [NoteRecipientEnvelope] = []
        for pubkey in allReaders {
            let hpkeEnv = try ffiMobileHpkeSealKey(
                keyHex: keyHex,
                recipientPubkeyHex: pubkey,
                label: CryptoLabels.LABEL_MESSAGE,
                aadHex: ""
            )
            // Map HPKE envelope to the protocol RecipientEnvelope format
            envelopes.append(NoteRecipientEnvelope(
                ephemeralPubkey: hpkeEnv.enc,
                pubkey: pubkey,
                wrappedKey: hpkeEnv.ct
            ))
        }

        return (ciphertextHex, envelopes)
    }

    // MARK: - Message Decryption (HPKE)

    /// Decrypt a message using an HPKE envelope addressed to this device.
    func decryptMessage(encryptedContent: String, envelope: HpkeEnvelope) throws -> String {
        guard isUnlocked else { throw CryptoServiceError.noKeyLoaded }
        let keyHex = try ffiMobileHpkeOpenKey(
            envelope: envelope,
            expectedLabel: CryptoLabels.LABEL_MESSAGE,
            aadHex: ""
        )
        let plaintextHex = try ffiMobileSymmetricDecrypt(ciphertextHex: encryptedContent, keyHex: keyHex)
        guard let data = hexToData(plaintextHex), let result = String(data: data, encoding: .utf8) else {
            throw CryptoServiceError.decryptionFailed("Invalid UTF-8 in decrypted message")
        }
        return result
    }

    // MARK: - PUK Operations

    /// Create the initial Per-User Key (generation 1).
    /// Returns JSON with pukState, seedHex, and device envelope.
    func createInitialPuk() throws -> String {
        guard isUnlocked else { throw CryptoServiceError.noKeyLoaded }
        return try ffiMobilePukCreate()
    }

    /// Unwrap a PUK seed from an HPKE envelope addressed to this device.
    func unwrapPukSeed(envelope: HpkeEnvelope, aad: String) throws -> String {
        guard isUnlocked else { throw CryptoServiceError.noKeyLoaded }
        let aadHex = aad.data(using: .utf8)!.map { String(format: "%02x", $0) }.joined()
        return try ffiMobileHpkeOpenKey(
            envelope: envelope,
            expectedLabel: CryptoLabels.LABEL_PUK_WRAP_TO_DEVICE,
            aadHex: aadHex
        )
    }

    // MARK: - Sigchain Operations

    /// Create a new sigchain link signed by this device.
    func createSigchainLink(
        id: String,
        seq: UInt64,
        prevHash: String?,
        timestamp: String,
        payloadJson: String
    ) throws -> SigchainLink {
        guard isUnlocked else { throw CryptoServiceError.noKeyLoaded }
        return try ffiMobileSigchainCreateLink(
            id: id,
            seq: seq,
            prevHash: prevHash,
            timestamp: timestamp,
            payloadJson: payloadJson
        )
    }

    // MARK: - Device Linking ECDH (legacy secp256k1 — for provisioning protocol)

    /// Generate an ephemeral secp256k1 keypair for the ECDH key exchange
    /// during device linking.
    func generateEphemeralKeypair() -> (secretHex: String, publicHex: String) {
        let kp = ffiGenerateEphemeralKeypair()
        return (kp.secretKeyHex, kp.publicKey)
    }

    /// Compute an ECDH shared secret for device linking.
    func deriveSharedSecret(ourSecret: String, theirPublic: String) throws -> String {
        try ffiComputeSharedXHex(ourSecretHex: ourSecret, theirPubkeyHex: theirPublic)
    }

    /// Decrypt data encrypted with a provisioning shared secret.
    func decryptWithSharedSecret(encrypted: String, sharedSecret: String) throws -> String {
        guard !encrypted.isEmpty else {
            throw CryptoServiceError.decryptionFailed("Empty ciphertext")
        }
        return try ffiDecryptWithSharedKeyHex(ciphertextHex: encrypted, sharedXHex: sharedSecret)
    }

    // MARK: - SAS Code

    /// Derive a 6-digit Short Authentication String for device linking verification.
    func deriveSASCode(sharedSecret: String) throws -> String {
        try ffiComputeSasCode(sharedXHex: sharedSecret)
    }

    // MARK: - Server Event Decryption

    /// Decrypt a server-encrypted event payload (XChaCha20-Poly1305).
    static func decryptServerEvent(encryptedHex: String, keyHex: String) -> String? {
        return try? ffiDecryptServerEventHex(encryptedHex: encryptedHex, keyHex: keyHex)
    }

    // MARK: - Stateless Auth Token (test bootstrap)

    /// Create an Ed25519 auth token from a raw signing-key secret hex.
    /// Stateless — does NOT use any loaded device state. Used by integration
    /// tests that need to sign requests on behalf of an out-of-band identity
    /// (e.g. XCTEST_ADMIN_SECRET-driven admin bootstrap).
    static func createAuthTokenStatic(secretHex: String, method: String, path: String) throws -> AuthToken {
        let timestamp = UInt64(Date().timeIntervalSince1970 * 1000)
        return try mobileCreateAuthTokenFromSigningKey(
            signingKeyHex: secretHex,
            timestamp: timestamp,
            method: method,
            path: path
        )
    }

    // MARK: - Hub Key Management (keys stored in Rust, never in Swift)

    /// Returns true if a key for the given hub is stored in Rust.
    func hasHubKey(hubId: String) -> Bool {
        ffiMobileHasHubKey(hubId: hubId)
    }

    /// Unwrap a hub key envelope using HPKE and store in Rust CryptoState.
    /// Hub key never enters Swift memory — goes directly from HPKE open to Rust storage.
    func loadHubKey(hubId: String, envelope: HubKeyEnvelopeResponse) throws {
        guard !hasHubKey(hubId: hubId) else { return }
        guard isUnlocked else { throw CryptoServiceError.noKeyLoaded }

        // Build HPKE envelope from the hub key response
        let hpkeEnvelope = HpkeEnvelope(
            v: 3,
            labelId: 0,  // Will be validated by the Rust HPKE open
            enc: envelope.envelope.wrappedKey,
            ct: envelope.envelope.ephemeralPubkey
        )

        // Use HPKE to unwrap the hub key, then store directly in Rust
        let keyHex = try ffiMobileHpkeOpenKey(
            envelope: hpkeEnvelope,
            expectedLabel: CryptoLabels.LABEL_HUB_KEY_WRAP,
            aadHex: ""
        )
        try ffiMobileSetHubKey(hubId: hubId, keyHex: keyHex)
    }

    /// Evict all hub keys from Rust memory. Called on lock and logout.
    func clearHubKeys() {
        ffiMobileClearHubKeys()
    }

    // MARK: - Hub Event Decryption

    /// Decrypt a hub-encrypted relay event payload in Rust (XChaCha20-Poly1305).
    /// Hub key is looked up by hub ID in Rust CryptoState — never touches Swift.
    func decryptHubEvent(ciphertextHex: String, hubId: String) -> String? {
        return try? ffiMobileDecryptHubEvent(ciphertextHex: ciphertextHex, hubId: hubId)
    }

    // MARK: - Server Event Keys

    /// Store server event encryption keys in Rust (current + optional previous for epoch rotation).
    func setServerEventKeys(currentHex: String, previousHex: String? = nil) throws {
        try ffiMobileSetServerEventKeys(currentHex: currentHex, previousHex: previousHex)
    }

    /// Decrypt a server-published event using stored server event keys in Rust.
    /// Tries current key first, falls back to previous key during epoch rotation.
    func decryptServerEventWithStoredKeys(encryptedHex: String) -> String? {
        return try? ffiMobileDecryptServerEvent(encryptedHex: encryptedHex)
    }

    /// Try to decrypt a relay event against all stored hub keys in Rust.
    /// Returns (hubId, decryptedJson) for the first key that succeeds, or nil.
    /// Keys never leave Rust memory during this operation.
    func decryptEventWithAttribution(ciphertextHex: String) -> (hubId: String, json: String)? {
        guard let result = try? ffiMobileDecryptEventWithAttribution(ciphertextHex: ciphertextHex),
              result.count == 2 else { return nil }
        return (hubId: result[0], json: result[1])
    }

    /// Store a server event key as a hub key for multi-hub key-trial attribution.
    /// The key goes directly to Rust CryptoState — never stored in Swift memory.
    func storeServerEventKey(hubId: String, keyHex: String) {
        try? ffiMobileSetHubKey(hubId: hubId, keyHex: keyHex)
    }

    // MARK: - Hex Utility

    private func hexToData(_ hex: String) -> Data? {
        var data = Data(capacity: hex.count / 2)
        var index = hex.startIndex
        while index < hex.endIndex {
            let nextIndex = hex.index(index, offsetBy: 2)
            guard nextIndex <= hex.endIndex,
                  let byte = UInt8(hex[index..<nextIndex], radix: 16) else {
                return nil
            }
            data.append(byte)
            index = nextIndex
        }
        return data
    }

    // MARK: - Test Support

    #if DEBUG
    /// Store a hub key directly in Rust for testing (bypasses FFI envelope decryption).
    func storeHubKeyForTesting(hubId: String, keyHex: String) {
        try? ffiMobileSetHubKey(hubId: hubId, keyHex: keyHex)
    }

    /// Set up a test identity by generating device keys with a known PIN.
    /// Used by XCUITest automation.
    func setMockIdentity() {
        let pin = ProcessInfo.processInfo.environment["XCTEST_MOCK_PIN"] ?? "123456"
        let deviceId = "xctest-device-\(UUID().uuidString)"
        do {
            _ = try generateDeviceKeys(deviceId: deviceId, pin: pin)
        } catch {
            print("[DEBUG] Mock identity generation failed: \(error)")
        }
    }

    /// Set a mock volunteer identity (generates a separate device keypair).
    func setMockVolunteerIdentity() {
        let deviceId = "xctest-volunteer-\(UUID().uuidString)"
        do {
            _ = try generateDeviceKeys(deviceId: deviceId, pin: "654321")
        } catch {
            print("[DEBUG] Mock volunteer identity generation failed: \(error)")
        }
    }
    #endif
}
