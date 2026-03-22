import Foundation

#if canImport(linphonesw)
import linphonesw
#endif

// MARK: - LinphoneServiceProtocol

/// Protocol for SIP account lifecycle operations. Implemented by `LinphoneService` for
/// production and by test doubles in unit tests.
protocol LinphoneServiceProtocol: AnyObject {
    func registerHubAccount(hubId: String, sipParams: SipTokenResponse) throws
    func unregisterHubAccount(hubId: String)
    func handleVoipPush(callId: String, hubId: String)
}

// MARK: - LinphoneError

enum LinphoneError: LocalizedError {
    case notInitialized
    case accountRegistrationFailed(String)
    case coreStartFailed(String)

    var errorDescription: String? {
        switch self {
        case .notInitialized:
            return "Linphone Core not initialized"
        case .accountRegistrationFailed(let msg):
            return "SIP account registration failed: \(msg)"
        case .coreStartFailed(let msg):
            return "Linphone Core failed to start: \(msg)"
        }
    }
}

// MARK: - SipTokenResponse

/// SIP credentials returned by `GET /api/hubs/{hubId}/telephony/sip-token`.
/// Used to register the volunteer's SIP account for the active shift.
struct SipTokenResponse: Decodable {
    let username: String
    let domain: String
    let password: String
    let transport: String
    let expiry: Int
}

// MARK: - LinphoneService

/// Manages a Linphone SIP core instance for real-time VoIP call handling.
///
/// One SIP account is registered per hub the volunteer is on-shift for.
/// The `pendingCallHubIds` map correlates incoming VoIP push payloads
/// (which carry a `callId` and `hubId`) with the Linphone `Call` object
/// that subsequently arrives in `onCallStateChanged`, so the hub context
/// can be switched before the call is presented to the volunteer.
///
/// Conditional compilation (`#if canImport(linphonesw)`) ensures the file
/// compiles without the Linphone XCFramework. Run `scripts/download-linphone-ios.sh`
/// and re-run `xcodegen generate` to link the real SDK.
@Observable
final class LinphoneService: LinphoneServiceProtocol {
    // MARK: - Private State

    /// callId → hubId map set by VoIP push before Linphone fires onCallStateChanged.
    private var pendingCallHubIds: [String: String] = [:]
    private let pendingCallLock = NSLock()
    private weak var hubContext: HubContext?

    #if canImport(linphonesw)
    private var core: Core?
    private var hubAccounts: [String: Account] = [:]
    #endif

    // MARK: - Initialization

    init() {}

    /// Configure the service with an app-wide HubContext and start the Linphone Core.
    /// Call this once from AppState or LlamenosApp after the hub context is ready.
    func initialize(hubContext: HubContext) throws {
        self.hubContext = hubContext
        #if canImport(linphonesw)
        let factory = Factory.Instance
        let core = try factory.createCore(
            configFilename: "linphone",
            factoryConfigFilename: nil,
            systemContext: nil
        )
        core.callKitEnabled = true
        core.mediaEncryption = .SRTP
        core.mediaEncryptionMandatory = true

        // Allow only Opus and G.711 µ-law; disable all others.
        for pt in core.audioPayloadTypes {
            pt.enable(pt.mimeType == "opus" || pt.mimeType == "PCMU")
        }

        setupCoreDelegate(core: core)
        try core.start()
        self.core = core
        #endif
    }

    // MARK: - SIP Account Management

    /// Register a SIP account for the given hub. Called when the volunteer clocks in.
    func registerHubAccount(hubId: String, sipParams: SipTokenResponse) throws {
        #if canImport(linphonesw)
        guard let core else { throw LinphoneError.notInitialized }
        let params = try core.createAccountParams()
        let identity = try Factory.Instance.createAddress(
            addr: "sip:\(sipParams.username)@\(sipParams.domain)"
        )
        try params.setIdentityaddress(newValue: identity)
        let server = try Factory.Instance.createAddress(
            addr: "sip:\(sipParams.domain);transport=\(sipParams.transport)"
        )
        try params.setServeraddress(newValue: server)
        params.registerEnabled = true
        let account = try core.createAccount(params: params)
        try core.addAccount(account: account)
        hubAccounts[hubId] = account
        #endif
    }

    /// Unregister the SIP account for the given hub. Called when the volunteer clocks out.
    func unregisterHubAccount(hubId: String) {
        #if canImport(linphonesw)
        guard let account = hubAccounts.removeValue(forKey: hubId) else { return }
        core?.removeAccount(account: account)
        #endif
    }

    // MARK: - VoIP Push Handling

    /// Record the hub ID that triggered a VoIP push for a given call ID.
    /// Called by PushKit before Linphone fires `onCallStateChanged(.IncomingReceived)`.
    func handleVoipPush(callId: String, hubId: String) {
        pendingCallLock.lock()
        defer { pendingCallLock.unlock() }
        pendingCallHubIds[callId] = hubId
    }

    // MARK: - Core Delegate (Linphone)

    #if canImport(linphonesw)
    private func setupCoreDelegate(core: Core) {
        let delegate = CoreDelegateStub(
            onCallStateChanged: { [weak self] _, call, state, _ in
                guard let self else { return }
                let callId = call.callLog?.callId ?? ""
                switch state {
                case .IncomingReceived:
                    self.pendingCallLock.lock()
                    let hubId = self.pendingCallHubIds.removeValue(forKey: callId)
                    self.pendingCallLock.unlock()
                    if let hubId {
                        Task { @MainActor in
                            self.hubContext?.setActiveHub(hubId)
                        }
                    }
                case .Released, .End:
                    self.pendingCallLock.lock()
                    self.pendingCallHubIds.removeValue(forKey: callId)
                    self.pendingCallLock.unlock()
                default:
                    break
                }
            }
        )
        core.addDelegate(delegate: delegate)
    }
    #endif

    // MARK: - Test-only Accessors

    #if DEBUG
    /// Returns the pending hub ID for a call ID without consuming it. For unit tests only.
    func pendingCallHubIdForTesting(_ callId: String) -> String? {
        pendingCallLock.lock()
        defer { pendingCallLock.unlock() }
        return pendingCallHubIds[callId]
    }

    /// Remove the pending hub ID for a call ID, simulating post-consumption. For unit tests only.
    func consumePendingCallHubForTesting(_ callId: String) {
        pendingCallLock.lock()
        pendingCallHubIds.removeValue(forKey: callId)
        pendingCallLock.unlock()
    }
    #endif
}
