import Foundation
import Observation

/// Observable hub key store injected via SwiftUI Environment.
/// Holds the decrypted hub symmetric key for the active hub.
/// Full implementation pending hub key distribution (EP05).
@Observable
final class HubKeyStore {
    var currentHubKey: Data?
}
