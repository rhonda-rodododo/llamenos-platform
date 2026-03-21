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

    let hubContext: HubContext
    let cryptoService: CryptoService
    let keychainService: KeychainService
    let apiService: APIService
    let authService: AuthService
    let webSocketService: WebSocketService
    let wakeKeyService: WakeKeyService
    let transcriptionService: TranscriptionService
    let crashReportingService: CrashReportingService
    let offlineQueue: OfflineQueue
    let hubActivityService: HubActivityService

    // MARK: - Auth State

    /// Current authentication status, drives top-level navigation.
    var authStatus: AuthStatus = .unauthenticated

    /// Whether the app is currently locked (background timeout or manual lock).
    /// Distinct from authStatus == .locked because it tracks the explicit "needs re-auth" state.
    var isLocked: Bool = false

    /// Admin decryption pubkey from the server — used for E2EE envelope encryption
    /// so admins can decrypt notes, reports, and messages created by this client.
    var adminDecryptionPubkey: String?

    /// The current user's role. Determines whether admin features are visible.
    /// Loaded from the server after authentication.
    var userRole: UserRole = .volunteer

    /// Whether the current user has admin privileges.
    var isAdmin: Bool { userRole == .admin }

    /// Total unread conversation count for the tab badge.
    var unreadConversationCount: Int = 0

    /// Result of the on-launch version compatibility check against the server.
    var versionStatus: VersionStatus = .unknown

    /// Whether to show the force-update blocking screen.
    var showForceUpdate: Bool = false

    /// Whether to show the soft-update banner (dismissible).
    var showUpdateBanner: Bool = false

    // MARK: - WebSocket Event Listener

    /// Background task that listens for WebSocket events.
    private var eventListenerTask: Task<Void, Never>?

    // MARK: - Initialization

    init(hubContext: HubContext) {
        self.hubContext = hubContext
        let crypto = CryptoService()
        let keychain = KeychainService()
        let api = APIService(cryptoService: crypto, hubContext: hubContext)
        let auth = AuthService(cryptoService: crypto, keychainService: keychain)
        let ws = WebSocketService(cryptoService: crypto)
        let wake = WakeKeyService(keychainService: keychain, cryptoService: crypto, apiService: api)
        let transcription = TranscriptionService()
        let crashReporting = CrashReportingService()
        let offline = OfflineQueue(apiService: api)
        let hubActivity = HubActivityService()

        self.cryptoService = crypto
        self.keychainService = keychain
        self.apiService = api
        self.authService = auth
        self.webSocketService = ws
        self.wakeKeyService = wake
        self.transcriptionService = transcription
        self.crashReportingService = crashReporting
        self.offlineQueue = offline
        self.hubActivityService = hubActivity

        // Wire offline queue into API service for automatic enqueue on network errors
        api.offlineQueue = offline

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
            if args.contains("--test-volunteer-identity") {
                // Use a separate volunteer keypair (NOT the admin key)
                cryptoService.setMockVolunteerIdentity()
            } else {
                // Default: admin mock identity matching ADMIN_PUBKEY in Docker .env
                cryptoService.setMockIdentity()
            }
            isLocked = false
        }

        if args.contains("--test-admin") {
            userRole = .admin
        }

        // Register identity with server (must come after keypair + hub URL)
        if args.contains("--test-register") && cryptoService.isUnlocked {
            if args.contains("--test-volunteer-identity") {
                // Volunteer identity — register via admin API, not bootstrap
                registerUserIdentity()
            } else {
                // Admin identity — use the bootstrap endpoint
                bootstrapTestIdentity()
            }
            // After successful registration, connect WebSocket and fetch role
            // so the dashboard shows "Connected" and the correct user role.
            connectWebSocketIfConfigured()
            fetchUserRole()
        }
    }

    /// Register the test identity as admin on the server via POST /api/auth/bootstrap.
    /// Blocks the main thread briefly (max 5s) — acceptable for test setup only.
    /// The bootstrap endpoint creates the admin user with role-super-admin.
    /// If admin already exists (403), this is a no-op.
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
        request.timeoutInterval = 5

        let body: [String: Any] = [
            "pubkey": token.pubkey,
            "timestamp": Int(token.timestamp),
            "token": token.token,
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        let sem = DispatchSemaphore(value: 0)
        URLSession.shared.dataTask(with: request) { _, _, _ in
            sem.signal()
        }.resume()
        _ = sem.wait(timeout: .now() + 5)
    }

    /// Register the test user (volunteer) identity on the server.
    /// First ensures admin is bootstrapped (using the admin key), then creates a user
    /// using the admin's auth via POST /api/users.
    private func registerUserIdentity() {
        guard let hubURL = authService.hubURL,
              let baseURL = URL(string: hubURL) else { return }
        guard let userPubkey = cryptoService.pubkey else { return }

        // Step 1: Bootstrap admin (admin key is hardcoded — same as setMockIdentity)
        let adminSecretHex = "f5450e96b38e7cb7f109fb6e55a2d616fa6bf7e3f1f86594379023bdcf4dd1bb"
        bootstrapAdmin(baseURL: baseURL, adminSecretHex: adminSecretHex)

        // Step 2: Create user using admin auth
        createUser(baseURL: baseURL, adminSecretHex: adminSecretHex, userPubkey: userPubkey)
    }

    private func bootstrapAdmin(baseURL: URL, adminSecretHex: String) {
        guard let adminToken = try? CryptoService.createAuthTokenStatic(
            secretHex: adminSecretHex, method: "POST", path: "/api/auth/bootstrap"
        ) else { return }

        let url = baseURL.appendingPathComponent("api/auth/bootstrap")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 5

        let body: [String: Any] = [
            "pubkey": adminToken.pubkey,
            "timestamp": Int(adminToken.timestamp),
            "token": adminToken.token,
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        let sem = DispatchSemaphore(value: 0)
        URLSession.shared.dataTask(with: request) { _, _, _ in sem.signal() }.resume()
        _ = sem.wait(timeout: .now() + 5)
    }

    private func createUser(baseURL: URL, adminSecretHex: String, userPubkey: String) {
        guard let adminToken = try? CryptoService.createAuthTokenStatic(
            secretHex: adminSecretHex, method: "POST", path: "/api/users"
        ) else { return }

        let url = baseURL.appendingPathComponent("api/users")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // Server expects: Bearer {"pubkey":"...","timestamp":...,"token":"..."}
        let authJSON = """
        {"pubkey":"\(adminToken.pubkey)","timestamp":\(adminToken.timestamp),"token":"\(adminToken.token)"}
        """
        request.setValue("Bearer \(authJSON)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 5

        let body: [String: Any] = [
            "pubkey": userPubkey,
            "name": "Test Volunteer",
            "roles": ["role-volunteer"],
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        let sem = DispatchSemaphore(value: 0)
        URLSession.shared.dataTask(with: request) { _, _, _ in sem.signal() }.resume()
        _ = sem.wait(timeout: .now() + 5)
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
        offlineQueue.startMonitoring()
        // Replay any queued operations now that we're authenticated
        Task { await offlineQueue.replay() }
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
        offlineQueue.startMonitoring()
    }

    /// Called when the user logs out / resets identity.
    func didLogout() {
        webSocketService.disconnect()
        cryptoService.clearHubKeys()
        eventListenerTask?.cancel()
        eventListenerTask = nil
        wakeKeyService.cleanup()
        offlineQueue.stopMonitoring()
        offlineQueue.clear()
        authService.logout()
        isLocked = false
        authStatus = .unauthenticated
        userRole = .volunteer
        unreadConversationCount = 0
    }

    // MARK: - Hub Key Management

    /// Load hub keys for all hubs in parallel. Called after login.
    /// Full implementation added in Task 13 (requires APIService.getHubKey from Task 4
    /// and CryptoService.loadHubKey from Task 7).
    func loadAllHubKeys(hubs: [Hub]) async {
        // Implemented in Task 13
    }

    /// Clear hub key cache on lock / logout.
    /// Full implementation added in Task 13 (requires CryptoService.clearHubKeys from Task 7).
    func clearHubKeys() {
        hubContext.clearActiveHub()
    }

    // MARK: - WebSocket Connection

    /// Check API version compatibility with the server on app launch.
    /// Fetches `/api/config` and compares `minApiVersion` / `apiVersion` against the client.
    func checkVersionCompatibility() {
        Task {
            let status = await apiService.checkVersionCompatibility()
            await MainActor.run {
                self.versionStatus = status
                switch status {
                case .forceUpdate:
                    self.showForceUpdate = true
                    self.showUpdateBanner = false
                case .updateAvailable:
                    self.showForceUpdate = false
                    self.showUpdateBanner = true
                case .upToDate, .unknown:
                    self.showForceUpdate = false
                    self.showUpdateBanner = false
                }
            }
        }
    }

    /// Fetch the current user's role from the API after authentication.
    func fetchUserRole() {
        Task {
            do {
                let response: AuthMeResponse = try await apiService.request(
                    method: "GET",
                    path: "/api/auth/me"
                )
                await MainActor.run {
                    // Check if any role contains "admin" (e.g. "role-super-admin", "role-admin")
                    let isAdmin = response.roles.contains { $0.contains("admin") }
                    self.userRole = isAdmin ? .admin : .volunteer

                    // Store admin decryption pubkey for E2EE envelope encryption
                    self.adminDecryptionPubkey = response.adminDecryptionPubkey

                    // Store the server event key in CryptoService keyed by the active hub ID
                    // so multi-hub key-trial attribution can identify this hub's events.
                    if let hubId = self.hubContext.activeHubId,
                       let keyHex = response.serverEventKeyHex {
                        self.cryptoService.storeServerEventKey(hubId: hubId, keyHex: keyHex)
                    }
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

        // Start (or restart) the attributed-event consumer that drives per-hub activity state.
        eventListenerTask?.cancel()
        eventListenerTask = Task { [weak self] in
            guard let self else { return }
            for await attributed in webSocketService.attributedEvents {
                hubActivityService.handle(attributed)
            }
        }
    }
}

// MARK: - API Response Types

/// Response from `GET /api/auth/me`.
struct AuthMeResponse: Decodable {
    let pubkey: String
    let roles: [String]
    let name: String?
    let profileCompleted: Bool?
    let onBreak: Bool?
    let adminDecryptionPubkey: String?
    let serverEventKeyHex: String?
}
