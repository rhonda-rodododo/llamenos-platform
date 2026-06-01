import Foundation

/// Centralized data wipe service — single source of truth for all destructive cleanup.
/// Used by panic wipe, remote device wipe, and logout flows.
///
/// Three wipe levels:
/// - `wipeAll()`: Full destructive wipe (panic wipe, remote device wipe). Clears everything.
/// - `logout()`: Session cleanup only. Preserves device keys, crash logs, and caches for re-login.
final class WipeService {
    private let keychainService: KeychainService
    private let cryptoService: CryptoService
    private let wakeKeyService: WakeKeyService
    private let offlineQueue: OfflineQueue
    private let crashReportingService: CrashReportingService
    private let webSocketService: WebSocketService

    init(
        keychainService: KeychainService,
        cryptoService: CryptoService,
        wakeKeyService: WakeKeyService,
        offlineQueue: OfflineQueue,
        crashReportingService: CrashReportingService,
        webSocketService: WebSocketService
    ) {
        self.keychainService = keychainService
        self.cryptoService = cryptoService
        self.wakeKeyService = wakeKeyService
        self.offlineQueue = offlineQueue
        self.crashReportingService = crashReportingService
        self.webSocketService = webSocketService
    }

    /// Full destructive wipe — used by panic wipe and remote device wipe.
    /// Clears ALL sensitive data from all storage locations.
    func wipeAll() {
        // 1. Keychain — delete ALL items (device keys, PIN data, biometric, wake keys)
        keychainService.deleteAll()

        // 2. Rust crypto state — zeroize hub keys then lock (zeroize device secrets)
        cryptoService.clearHubKeys()
        cryptoService.lock()

        // 3. Wake key service — remove registered wake keypair
        wakeKeyService.cleanup()

        // 4. Offline queue — stop monitoring and delete queued operations
        offlineQueue.stopMonitoring()
        offlineQueue.clear()

        // 5. Crash logs — delete all crash report files
        crashReportingService.clearCrashLogs()

        // 6. URL cache — replace with a fresh empty cache.
        // removeAllCachedResponses() is asynchronous under the hood and may not
        // clear the in-memory cache immediately, causing race conditions in tests.
        // Replacing the singleton guarantees instant, deterministic clearing.
        let old = URLCache.shared
        URLCache.shared = URLCache(
            memoryCapacity: old.memoryCapacity,
            diskCapacity: old.diskCapacity,
            diskPath: nil
        )

        // 7. HTTP cookies — remove all cookies
        if let cookies = HTTPCookieStorage.shared.cookies {
            cookies.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
        }

        // 8. Temp directory — remove all temporary files
        clearDirectory(FileManager.default.temporaryDirectory)

        // 9. Caches directory — remove all cached data
        if let cachesDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
            clearDirectory(cachesDir)
        }

        // 10. Application Support (offline queue file, crash logs already cleared above, other app data)
        if let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            clearDirectory(appSupport)
        }

        // 11. WebSocket — disconnect from relay
        webSocketService.disconnect()

        // 12. UserDefaults — remove all app preferences
        if let bundleId = Bundle.main.bundleIdentifier {
            UserDefaults.standard.removePersistentDomain(forName: bundleId)
        }
    }

    /// Logout cleanup — less aggressive, preserves device keys for re-login.
    /// Does NOT clear: keychain (device keys), crash logs, URL cache, cookies, temp/caches dirs.
    func logout() {
        // Clear hub-scoped crypto state (hub keys, server event keys)
        cryptoService.clearHubKeys()
        cryptoService.lock()

        // Clean up wake key registration
        wakeKeyService.cleanup()

        // Stop and clear offline queue
        offlineQueue.stopMonitoring()
        offlineQueue.clear()

        // Disconnect WebSocket
        webSocketService.disconnect()
    }

    // MARK: - Private

    private func clearDirectory(_ url: URL) {
        let fm = FileManager.default
        guard let contents = try? fm.contentsOfDirectory(at: url, includingPropertiesForKeys: nil) else { return }
        for item in contents {
            try? fm.removeItem(at: item)
        }
    }
}
