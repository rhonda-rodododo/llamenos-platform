import Foundation
import Testing
@testable import Llamenos

// MARK: - LinphoneServiceTests
//
// These tests exercise the `pendingCallHubIds` map in LinphoneService, which is the
// only logic path that runs without the Linphone XCFramework present. All SIP Core
// operations are guarded by `#if canImport(linphonesw)` and are tested separately
// via integration tests once the SDK is linked.

struct LinphoneServiceTests {

    @Test func handleVoipPushStoresCallIdToHubIdMapping() {
        let svc = LinphoneService()
        svc.handleVoipPush(callId: "call-abc-001", hubId: "hub-uuid-001")
        #expect(svc.pendingCallHubIdForTesting("call-abc-001") == "hub-uuid-001")
    }

    @Test func pendingCallHubIdRemovedAfterConsumption() {
        let svc = LinphoneService()
        svc.handleVoipPush(callId: "call-abc-001", hubId: "hub-uuid-001")
        svc.consumePendingCallHubForTesting("call-abc-001")
        #expect(svc.pendingCallHubIdForTesting("call-abc-001") == nil)
    }

    @Test func separateCallIdsAreTrackedIndependently() {
        let svc = LinphoneService()
        svc.handleVoipPush(callId: "call-aaa", hubId: "hub-001")
        svc.handleVoipPush(callId: "call-bbb", hubId: "hub-002")
        #expect(svc.pendingCallHubIdForTesting("call-aaa") == "hub-001")
        #expect(svc.pendingCallHubIdForTesting("call-bbb") == "hub-002")
    }

    @Test func unknownCallIdReturnsNil() {
        let svc = LinphoneService()
        #expect(svc.pendingCallHubIdForTesting("call-unknown") == nil)
    }

    @Test func overwritingCallIdUpdatesHubId() {
        let svc = LinphoneService()
        svc.handleVoipPush(callId: "call-abc-001", hubId: "hub-uuid-001")
        svc.handleVoipPush(callId: "call-abc-001", hubId: "hub-uuid-002")
        #expect(svc.pendingCallHubIdForTesting("call-abc-001") == "hub-uuid-002")
    }
}
