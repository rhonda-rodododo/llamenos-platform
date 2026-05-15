import Foundation
import Observation

/// Observable store that tracks the decrypted hub key for the currently active hub.
/// Injected into SwiftUI views via `@Environment(HubKeyStore.self)`.
@Observable
final class HubKeyStore {
    /// The decrypted hub key for the active hub, or nil if not yet loaded.
    var currentHubKey: Data?

    init(currentHubKey: Data? = nil) {
        self.currentHubKey = currentHubKey
    }
}
