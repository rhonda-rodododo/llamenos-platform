import Foundation
import Testing
@testable import Llamenos

// MARK: - MockLinphoneService

/// Test double for LinphoneServiceProtocol that records registration calls without
/// touching any real SIP or Linphone state.
final class MockLinphoneService: LinphoneServiceProtocol {
    private(set) var registeredHubIds: [String] = []
    private(set) var unregisteredHubIds: [String] = []
    var shouldThrowOnRegister: Bool = false

    func registerHubAccount(hubId: String, sipParams: SipTokenResponse) throws {
        if shouldThrowOnRegister {
            throw LinphoneError.accountRegistrationFailed("mock error")
        }
        registeredHubIds.append(hubId)
    }

    func unregisterHubAccount(hubId: String) {
        unregisteredHubIds.append(hubId)
    }

    func handleVoipPush(callId: String, hubId: String) {
        // Not exercised in ShiftClockService tests
    }
}

// MARK: - ShiftClockServiceLinphoneTests

/// Tests that ShiftClockService correctly integrates with LinphoneService for the SIP
/// account lifecycle on clock in/out. Uses MockLinphoneService to verify registration
/// calls without network or Linphone Core.
@MainActor
struct ShiftClockServiceLinphoneTests {

    private func makeService(
        mock: MockLinphoneService,
        hubId: String? = "hub-uuid-001"
    ) -> (ShiftClockService, HubContext) {
        let hubContext = HubContext()
        if let hubId {
            hubContext.setActiveHub(hubId)
        }
        let crypto = CryptoService()
        let api = APIService(cryptoService: crypto, hubContext: hubContext)
        let service = ShiftClockService(
            apiService: api,
            cryptoService: crypto,
            hubContext: hubContext,
            linphoneService: mock
        )
        return (service, hubContext)
    }

    @Test func shiftStartRegistersLinphoneAccountForHub() async throws {
        let mock = MockLinphoneService()
        let (service, _) = makeService(mock: mock)
        await service.onShiftStarted(
            hubId: "hub-uuid-001",
            sipParams: SipTokenResponse(
                username: "testuser", domain: "sip.example.org",
                password: "secret", transport: "tls", expiry: 3600
            )
        )
        #expect(mock.registeredHubIds == ["hub-uuid-001"])
    }

    @Test func shiftEndUnregistersLinphoneAccountForHub() {
        let mock = MockLinphoneService()
        let (service, _) = makeService(mock: mock)
        service.onShiftEnded(hubId: "hub-uuid-001")
        #expect(mock.unregisteredHubIds == ["hub-uuid-001"])
    }

    @Test func multipleHubsRegisteredAndUnregisteredIndependently() async throws {
        let mock = MockLinphoneService()
        let (service, _) = makeService(mock: mock)
        let params = SipTokenResponse(
            username: "user", domain: "sip.example.org",
            password: "pass", transport: "tls", expiry: 3600
        )
        await service.onShiftStarted(hubId: "hub-aaa", sipParams: params)
        await service.onShiftStarted(hubId: "hub-bbb", sipParams: params)
        service.onShiftEnded(hubId: "hub-aaa")
        #expect(mock.registeredHubIds == ["hub-aaa", "hub-bbb"])
        #expect(mock.unregisteredHubIds == ["hub-aaa"])
    }

    @Test func shiftStartSilentlyHandlesLinphoneRegistrationError() async {
        let mock = MockLinphoneService()
        mock.shouldThrowOnRegister = true
        let (service, _) = makeService(mock: mock)
        // Should not throw — errors are logged, not surfaced to the caller
        await service.onShiftStarted(
            hubId: "hub-uuid-001",
            sipParams: SipTokenResponse(
                username: "user", domain: "sip.example.org",
                password: "pass", transport: "tls", expiry: 3600
            )
        )
        #expect(mock.registeredHubIds.isEmpty)
    }
}
