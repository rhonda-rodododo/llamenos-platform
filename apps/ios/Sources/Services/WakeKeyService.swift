import Foundation
import Security

// MARK: - WakeKeyError

enum WakeKeyError: LocalizedError {
    case keyGenerationFailed
    case keyStorageFailed(OSStatus)
    case keyRetrievalFailed(OSStatus)
    case noPrivateKey
    case decryptionFailed(String)
    case registrationFailed(String)

    var errorDescription: String? {
        switch self {
        case .keyGenerationFailed:
            return NSLocalizedString("error_wake_key_generation", comment: "Failed to generate wake key")
        case .keyStorageFailed(let status):
            return "Wake key storage failed: \(status)"
        case .keyRetrievalFailed(let status):
            return "Wake key retrieval failed: \(status)"
        case .noPrivateKey:
            return NSLocalizedString("error_no_wake_key", comment: "No wake key found")
        case .decryptionFailed(let detail):
            return String(format: NSLocalizedString("error_wake_decrypt_failed", comment: "Wake decrypt failed: %@"), detail)
        case .registrationFailed(let detail):
            return String(format: NSLocalizedString("error_wake_register_failed", comment: "Device registration failed: %@"), detail)
        }
    }
}

// MARK: - DeviceRegistrationRequest

/// Request body for `POST /api/devices/register`.
struct DeviceRegistrationRequest: Encodable, Sendable {
    let pushToken: String
    let wakePublicKey: String
    let platform: String
    let deviceId: String
}

// MARK: - WakeKeyService

/// Manages device-specific wake keypair for push notification encryption.
/// The wake key enables the notification service extension to decrypt push payloads
/// without requiring PIN unlock — critical for lock-screen call notifications.
///
/// The private key is stored in the Keychain with `kSecAttrAccessibleAfterFirstUnlock`
/// so it remains accessible even when the device is locked (needed for push decryption).
///
/// Flow:
/// 1. On first launch: `ensureKeypairExists()` generates and stores the wake key
/// 2. On push token receipt: `registerDevice(pushToken:)` sends wake pubkey + token to server
/// 3. On push receipt: notification service extension calls `decryptWakePayload()` to
///    decrypt the ECIES-encrypted notification content
@Observable
final class WakeKeyService: @unchecked Sendable {

    // MARK: - Public State

    /// The wake public key in hex, available after `ensureKeypairExists()`.
    private(set) var publicKeyHex: String?

    /// Whether the wake keypair has been generated.
    var hasKeypair: Bool { publicKeyHex != nil }

    /// Whether the device is registered with the server.
    private(set) var isRegistered: Bool = false

    // MARK: - Private Properties

    private let keychainService: KeychainService
    private let cryptoService: CryptoService
    private let apiService: APIService

    private static let wakePrivateKeyAccount = "wake-private-key"
    private static let wakePublicKeyAccount = "wake-public-key"
    private static let deviceRegisteredAccount = "device-registered"

    // MARK: - Initialization

    init(keychainService: KeychainService, cryptoService: CryptoService, apiService: APIService) {
        self.keychainService = keychainService
        self.cryptoService = cryptoService
        self.apiService = apiService
        loadExistingKeys()
    }

    // MARK: - Key Management

    /// Load existing wake keys from Keychain if they exist.
    private func loadExistingKeys() {
        do {
            if let pubKeyData = try keychainService.retrieve(key: Self.wakePublicKeyAccount) {
                publicKeyHex = String(data: pubKeyData, encoding: .utf8)
            }
            if let regData = try keychainService.retrieve(key: Self.deviceRegisteredAccount) {
                isRegistered = regData.first == 1
            }
        } catch {
            publicKeyHex = nil
            isRegistered = false
        }
    }

    /// Generate and store the wake keypair if it doesn't already exist.
    /// This must be called early in the app lifecycle, before push token registration.
    func ensureKeypairExists() throws {
        if publicKeyHex != nil { return }

        // Generate 32 random bytes for the wake private key
        var privateKeyBytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, 32, &privateKeyBytes)
        guard status == errSecSuccess else {
            throw WakeKeyError.keyGenerationFailed
        }

        let privateKeyHex = privateKeyBytes.map { String(format: "%02x", $0) }.joined()

        let publicKey = try derivePublicKey(from: privateKeyHex)

        // Store private key with kSecAttrAccessibleAfterFirstUnlock
        // This is a custom Keychain write because we need a different accessibility level
        // than the standard KeychainService provides
        try storeWakePrivateKey(privateKeyHex)

        // Store public key normally
        if let pubData = publicKey.data(using: .utf8) {
            try keychainService.store(key: Self.wakePublicKeyAccount, data: pubData)
        }

        publicKeyHex = publicKey
    }

    /// Store the wake private key with afterFirstUnlock accessibility.
    /// This is needed so the notification service extension can access it
    /// even when the device is locked.
    private func storeWakePrivateKey(_ privateKeyHex: String) throws {
        guard let data = privateKeyHex.data(using: .utf8) else {
            throw WakeKeyError.keyStorageFailed(errSecParam)
        }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "org.llamenos.hotline.wake",
            kSecAttrAccount as String: Self.wakePrivateKeyAccount,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]

        // Delete any existing key first
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "org.llamenos.hotline.wake",
            kSecAttrAccount as String: Self.wakePrivateKeyAccount,
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw WakeKeyError.keyStorageFailed(status)
        }
    }

    /// Retrieve the wake private key from Keychain.
    private func retrieveWakePrivateKey() throws -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "org.llamenos.hotline.wake",
            kSecAttrAccount as String: Self.wakePrivateKeyAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data,
              let hex = String(data: data, encoding: .utf8) else {
            throw WakeKeyError.keyRetrievalFailed(status)
        }
        return hex
    }

    // MARK: - Device Registration

    /// Register this device's push token and wake public key with the server.
    /// Called after receiving the push token from APNs.
    func registerDevice(pushToken: String) async throws {
        guard let wakePublicKey = publicKeyHex else {
            throw WakeKeyError.noPrivateKey
        }

        // Get or generate device ID
        let deviceId: String
        if let existingId = try keychainService.retrieveString(key: KeychainKey.deviceID) {
            deviceId = existingId
        } else {
            deviceId = UUID().uuidString
            try keychainService.storeString(deviceId, key: KeychainKey.deviceID)
        }

        let request = DeviceRegistrationRequest(
            pushToken: pushToken,
            wakePublicKey: wakePublicKey,
            platform: "ios",
            deviceId: deviceId
        )

        do {
            try await apiService.request(method: "POST", path: "/api/devices/register", body: request)
            let regData = Data([1])
            try keychainService.store(key: Self.deviceRegisteredAccount, data: regData)
            isRegistered = true
        } catch {
            throw WakeKeyError.registrationFailed(error.localizedDescription)
        }
    }

    // MARK: - Wake Payload Decryption

    /// Decrypt an ECIES-encrypted push notification payload using the wake private key.
    /// This is called by the notification service extension when a push arrives.
    ///
    /// - Parameter encryptedHex: The hex-encoded ECIES ciphertext from the push payload.
    /// - Returns: The decrypted plaintext string (typically JSON).
    func decryptWakePayload(encryptedHex: String) throws -> String {
        let privateKeyHex = try retrieveWakePrivateKey()

        guard encryptedHex.count >= 66 else {
            throw WakeKeyError.decryptionFailed("Payload too short")
        }

        // ECIES payload format: ephemeralPubkey (33 bytes = 66 hex) + packed(nonce + ciphertext)
        let ephemeralPubkeyHex = String(encryptedHex.prefix(66))
        let packedHex = String(encryptedHex.dropFirst(66))

        return try eciesDecryptContentHex(
            packedHex: packedHex,
            ephemeralPubkeyHex: ephemeralPubkeyHex,
            secretKeyHex: privateKeyHex,
            label: "llamenos:wake-key"
        )
    }

    // MARK: - Key Derivation

    /// Derive a public key from a private key hex string via secp256k1.
    private func derivePublicKey(from privateKeyHex: String) throws -> String {
        try getPublicKey(secretKeyHex: privateKeyHex)
    }

    // MARK: - Cleanup

    /// Remove wake keys and registration state. Called on logout.
    func cleanup() {
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "org.llamenos.hotline.wake",
        ]
        SecItemDelete(deleteQuery as CFDictionary)
        keychainService.delete(key: Self.wakePublicKeyAccount)
        keychainService.delete(key: Self.deviceRegisteredAccount)
        publicKeyHex = nil
        isRegistered = false
    }
}
