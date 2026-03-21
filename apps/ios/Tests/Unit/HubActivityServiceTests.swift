import Foundation
import Testing
@testable import Llamenos

// MARK: - HubActivityService Unit Tests

/// Tests for `HubActivityService` state machine behavior.
///
/// Each test constructs a fresh `HubActivityService`, drives it with synthetic
/// `AttributedHubEvent` values, and asserts the resulting `HubActivityState`.
/// No real WebSocket connection or crypto is required — events are injected directly.
@MainActor
struct HubActivityServiceTests {

    // MARK: - Helpers

    private func event(hubId: String, type: HubEventType) -> AttributedHubEvent {
        AttributedHubEvent(hubId: hubId, event: type)
    }

    // MARK: - Call Count Tests

    @Test func callRingIncrementsActiveCallCount() {
        let svc = HubActivityService()
        svc.handle(event(hubId: "hub-001", type: .callRing))
        #expect(svc.state(for: "hub-001").activeCallCount == 1)
    }

    @Test func callAnsweredDecrementsActiveCallCount() {
        let svc = HubActivityService()
        svc.handle(event(hubId: "hub-001", type: .callRing))
        svc.handle(event(hubId: "hub-001", type: .callAnswered))
        #expect(svc.state(for: "hub-001").activeCallCount == 0)
    }

    @Test func activeCallCountNeverGoesNegative() {
        let svc = HubActivityService()
        // Answered without a prior ring (e.g. reconnect, missed ring event)
        svc.handle(event(hubId: "hub-001", type: .callAnswered))
        #expect(svc.state(for: "hub-001").activeCallCount == 0)
    }

    @Test func callEndedDecrementsActiveCallCount() {
        let svc = HubActivityService()
        svc.handle(event(hubId: "hub-001", type: .callRing))
        svc.handle(event(hubId: "hub-001", type: .callEnded))
        #expect(svc.state(for: "hub-001").activeCallCount == 0)
    }

    @Test func multipleRingsAccumulate() {
        let svc = HubActivityService()
        svc.handle(event(hubId: "hub-001", type: .callRing))
        svc.handle(event(hubId: "hub-001", type: .callRing))
        svc.handle(event(hubId: "hub-001", type: .callRing))
        #expect(svc.state(for: "hub-001").activeCallCount == 3)
    }

    // MARK: - Shift State Tests

    @Test func shiftStartedSetsIsOnShift() {
        let svc = HubActivityService()
        svc.handle(event(hubId: "hub-001", type: .shiftStarted))
        #expect(svc.state(for: "hub-001").isOnShift == true)
    }

    @Test func shiftEndedClearsIsOnShift() {
        let svc = HubActivityService()
        svc.handle(event(hubId: "hub-001", type: .shiftStarted))
        svc.handle(event(hubId: "hub-001", type: .shiftEnded))
        #expect(svc.state(for: "hub-001").isOnShift == false)
    }

    @Test func shiftEndedWithoutStartDoesNotGoBelowFalse() {
        let svc = HubActivityService()
        svc.handle(event(hubId: "hub-001", type: .shiftEnded))
        #expect(svc.state(for: "hub-001").isOnShift == false)
    }

    // MARK: - Unread Count Tests

    @Test func messageNewIncrementsUnreadCount() {
        let svc = HubActivityService()
        svc.handle(event(hubId: "hub-001", type: .messageNew))
        svc.handle(event(hubId: "hub-001", type: .messageNew))
        #expect(svc.state(for: "hub-001").unreadMessageCount == 2)
    }

    @Test func conversationAssignedIncrementsUnreadConversationCount() {
        let svc = HubActivityService()
        svc.handle(event(hubId: "hub-001", type: .conversationAssigned))
        #expect(svc.state(for: "hub-001").unreadConversationCount == 1)
    }

    @Test func openHubClearsUnreadCounts() {
        let svc = HubActivityService()
        svc.handle(event(hubId: "hub-001", type: .messageNew))
        svc.handle(event(hubId: "hub-001", type: .conversationAssigned))
        svc.markHubOpened("hub-001")
        let state = svc.state(for: "hub-001")
        #expect(state.unreadMessageCount == 0)
        #expect(state.unreadConversationCount == 0)
    }

    @Test func openHubDoesNotAffectCallCountOrShiftState() {
        let svc = HubActivityService()
        svc.handle(event(hubId: "hub-001", type: .callRing))
        svc.handle(event(hubId: "hub-001", type: .shiftStarted))
        svc.handle(event(hubId: "hub-001", type: .messageNew))
        svc.markHubOpened("hub-001")
        let state = svc.state(for: "hub-001")
        #expect(state.activeCallCount == 1)
        #expect(state.isOnShift == true)
        #expect(state.unreadMessageCount == 0)
    }

    // MARK: - Hub Isolation Tests

    @Test func statesForDifferentHubsAreIsolated() {
        let svc = HubActivityService()
        svc.handle(event(hubId: "hub-001", type: .callRing))
        #expect(svc.state(for: "hub-001").activeCallCount == 1)
        #expect(svc.state(for: "hub-002").activeCallCount == 0)
    }

    @Test func unreadCountsAreIsolatedPerHub() {
        let svc = HubActivityService()
        svc.handle(event(hubId: "hub-001", type: .messageNew))
        svc.handle(event(hubId: "hub-001", type: .messageNew))
        svc.handle(event(hubId: "hub-002", type: .messageNew))
        #expect(svc.state(for: "hub-001").unreadMessageCount == 2)
        #expect(svc.state(for: "hub-002").unreadMessageCount == 1)
    }

    @Test func openingOneHubDoesNotAffectOtherHubs() {
        let svc = HubActivityService()
        svc.handle(event(hubId: "hub-001", type: .messageNew))
        svc.handle(event(hubId: "hub-002", type: .messageNew))
        svc.markHubOpened("hub-001")
        #expect(svc.state(for: "hub-001").unreadMessageCount == 0)
        #expect(svc.state(for: "hub-002").unreadMessageCount == 1)
    }

    @Test func shiftStateIsIsolatedPerHub() {
        let svc = HubActivityService()
        svc.handle(event(hubId: "hub-001", type: .shiftStarted))
        #expect(svc.state(for: "hub-001").isOnShift == true)
        #expect(svc.state(for: "hub-002").isOnShift == false)
    }

    // MARK: - Default State Tests

    @Test func unknownHubReturnsDefaultZeroState() {
        let svc = HubActivityService()
        let state = svc.state(for: "hub-never-seen")
        #expect(state.activeCallCount == 0)
        #expect(state.unreadMessageCount == 0)
        #expect(state.unreadConversationCount == 0)
        #expect(state.isOnShift == false)
    }
}
