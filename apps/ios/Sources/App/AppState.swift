import Foundation

// MARK: - AuthStatus

/// Top-level authentication state for the app.
enum AuthStatus: Equatable {
    /// No identity exists — show login/onboarding.
    case unauthenticated
    /// Identity exists but is locked — show PIN unlock.
    case locked
    /// Identity is loaded and nsec is in memory — show dashboard.
    case unlocked
}

// MARK: - AppState

/// Root observable state container for the entire app. Holds all service instances
/// and the current auth status. Injected into the SwiftUI environment at the app root.
@Observable
final class AppState {
    // MARK: - Services

    let cryptoService: CryptoService
    let keychainService: KeychainService
    let apiService: APIService
    let authService: AuthService
    let webSocketService: WebSocketService
    let wakeKeyService: WakeKeyService

    // MARK: - Auth State

    /// Current authentication status, drives top-level navigation.
    var authStatus: AuthStatus = .unauthenticated

    /// Whether the app is currently locked (background timeout or manual lock).
    /// Distinct from authStatus == .locked because it tracks the explicit "needs re-auth" state.
    var isLocked: Bool = false

    /// The current user's role. Determines whether admin features are visible.
    /// Loaded from the server after authentication.
    var userRole: UserRole = .volunteer

    /// Whether the current user has admin privileges.
    var isAdmin: Bool { userRole == .admin }

    /// Total unread conversation count for the tab badge.
    var unreadConversationCount: Int = 0

    // MARK: - WebSocket Event Listener

    /// Background task that listens for WebSocket events.
    private var eventListenerTask: Task<Void, Never>?

    // MARK: - Initialization

    init() {
        let crypto = CryptoService()
        let keychain = KeychainService()
        let api = APIService(cryptoService: crypto)
        let auth = AuthService(cryptoService: crypto, keychainService: keychain)
        let ws = WebSocketService()
        let wake = WakeKeyService(keychainService: keychain, cryptoService: crypto, apiService: api)

        self.cryptoService = crypto
        self.keychainService = keychain
        self.apiService = api
        self.authService = auth
        self.webSocketService = ws
        self.wakeKeyService = wake

        #if DEBUG
        // Handle launch arguments BEFORE reading persisted state
        // so --reset-keychain clears everything before we configure services
        handleLaunchArguments()
        #endif

        // Configure API base URL if stored
        if let hubURL = auth.hubURL {
            try? api.configure(hubURLString: hubURL)
        }

        // Generate wake keypair on first launch (non-blocking)
        try? wake.ensureKeypairExists()

        // Determine initial auth state
        resolveAuthStatus()
    }

    // MARK: - Launch Arguments (Test Support)

    #if DEBUG
    /// Handle launch arguments for XCUITest automation.
    /// These flags let UI tests set up specific states without going through full flows.
    private func handleLaunchArguments() {
        let args = ProcessInfo.processInfo.arguments

        if args.contains("--reset-keychain") {
            keychainService.deleteAll()
            // AuthService cached hasStoredKeys/hubURL from init — reset stale values
            authService.logout()
        }

        // Configure hub URL for API access (must come before --test-register)
        if let hubIndex = args.firstIndex(of: "--test-hub-url"),
           hubIndex + 1 < args.count {
            let hubURL = args[hubIndex + 1]
            try? apiService.configure(hubURLString: hubURL)
            try? authService.setHubURL(hubURL)
        }

        if args.contains("--test-authenticated") {
            // Set deterministic mock identity for UI test automation.
            cryptoService.setMockIdentity()
            isLocked = false
        }

        if args.contains("--test-admin") {
            userRole = .admin
        }

        // Register identity with server (must come after keypair + hub URL)
        if args.contains("--test-register") && cryptoService.isUnlocked {
            bootstrapTestIdentity()
        }
    }

    /// Synchronously register the test identity as admin via POST /api/auth/bootstrap.
    /// Blocks the main thread briefly — acceptable for test setup only.
    private func bootstrapTestIdentity() {
        guard let hubURL = authService.hubURL,
              let baseURL = URL(string: hubURL) else { return }

        guard let token = try? cryptoService.createAuthToken(
            method: "POST", path: "/api/auth/bootstrap"
        ) else { return }

        let url = baseURL.appendingPathComponent("api/auth/bootstrap")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 10

        let body: [String: Any] = [
            "pubkey": token.pubkey,
            "timestamp": token.timestamp,
            "token": token.token,
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        let semaphore = DispatchSemaphore(value: 0)
        URLSession.shared.dataTask(with: request) { _, _, _ in
            semaphore.signal()
        }.resume()
        _ = semaphore.wait(timeout: .now() + 10)
    }
    #endif

    // MARK: - Auth Status Resolution

    /// Determine auth status from service state. Called on init and after state transitions.
    func resolveAuthStatus() {
        if cryptoService.isUnlocked && !isLocked {
            authStatus = .unlocked
        } else if authService.hasStoredKeys {
            authStatus = .locked
        } else {
            authStatus = .unauthenticated
        }
    }

    // MARK: - Lock / Unlock

    /// Lock the app: clear nsec from memory, set locked state.
    func lockApp() {
        authService.lock()
        isLocked = true
        authStatus = .locked
    }

    /// Called after successful PIN/biometric unlock.
    func didUnlock() {
        isLocked = false
        authStatus = .unlocked
        connectWebSocketIfConfigured()
        fetchUserRole()
    }

    /// Called after successful onboarding (new identity or import + PIN set).
    func didCompleteOnboarding() {
        isLocked = false
        authStatus = .unlocked

        // Configure API with the stored hub URL
        if let hubURL = authService.hubURL {
            try? apiService.configure(hubURLString: hubURL)
        }

        connectWebSocketIfConfigured()
        fetchUserRole()
    }

    /// Called when the user logs out / resets identity.
    func didLogout() {
        webSocketService.disconnect()
        eventListenerTask?.cancel()
        eventListenerTask = nil
        wakeKeyService.cleanup()
        authService.logout()
        isLocked = false
        authStatus = .unauthenticated
        userRole = .volunteer
        unreadConversationCount = 0
    }

    // MARK: - WebSocket Connection

    /// Fetch the current user's role from the API after authentication.
    func fetchUserRole() {
        Task {
            do {
                let response: IdentityMeResponse = try await apiService.request(
                    method: "GET",
                    path: "/api/identity/me"
                )
                await MainActor.run {
                    self.userRole = UserRole(rawValue: response.role) ?? .volunteer
                }
            } catch {
                // Default to volunteer if role fetch fails
                await MainActor.run {
                    self.userRole = .volunteer
                }
            }
        }
    }

    /// Connect WebSocket to the relay if a hub URL is configured.
    private func connectWebSocketIfConfigured() {
        guard let hubURL = authService.hubURL else { return }

        // Derive relay URL from hub URL
        var relayURL = hubURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if !relayURL.hasPrefix("wss://") && !relayURL.hasPrefix("ws://") {
            if relayURL.hasPrefix("https://") {
                relayURL = relayURL.replacingOccurrences(of: "https://", with: "wss://")
            } else if relayURL.hasPrefix("http://") {
                relayURL = relayURL.replacingOccurrences(of: "http://", with: "ws://")
            } else {
                relayURL = "wss://\(relayURL)"
            }
        }
        if !relayURL.hasSuffix("/relay") {
            relayURL += "/relay"
        }

        Task {
            await webSocketService.connect(to: relayURL)
        }
    }
}

// MARK: - API Response Types

/// Response from `GET /api/identity/me`.
struct IdentityMeResponse: Decodable {
    let pubkey: String
    let role: String
    let displayName: String?
}
