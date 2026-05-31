import Foundation
import Testing
@testable import Llamenos

// MARK: - AttributedHubEvent Unit Tests

/// Tests for `AttributedHubEvent` struct construction and `WebSocketService` attributed-event
/// stream delivery.
///
/// Strategy: `WebSocketService.emitAttributedEvent(hubId:eventType:)` is `internal`, so
/// `@testable import` lets us inject synthetic typed events directly and observe the
/// attributed-event stream without requiring a real WebSocket connection.
@MainActor
struct AttributedHubEventTests {

    // MARK: - Struct tests

    @Test func attributedHubEventStoresHubIdAndEventType() {
        let attributed = AttributedHubEvent(hubId: "hub-alpha", event: .callRing)
        #expect(attributed.hubId == "hub-alpha")
        #expect(attributed.event == .callRing)
    }

    @Test func attributedHubEventIsDistinctPerHubId() {
        let a = AttributedHubEvent(hubId: "hub-1", event: .shiftUpdate)
        let b = AttributedHubEvent(hubId: "hub-2", event: .shiftUpdate)
        #expect(a.hubId != b.hubId)
        #expect(a.event == b.event)
    }

    // MARK: - Attributed event stream delivery

    @Test func attributedEventsStreamDeliversEmittedEvents() async {
        let ws = WebSocketService(cryptoService: CryptoService())

        let collected: AttributedHubEvent? = await withCheckedContinuation { continuation in
            var resumed = false
            Task {
                for await event in ws.attributedEvents {
                    if !resumed {
                        resumed = true
                        continuation.resume(returning: event)
                    }
                    return
                }
            }
            Task {
                await Task.yield()
                ws.emitAttributedEvent(hubId: "hub-1", eventType: .callRing)
            }
        }
        #expect(collected?.hubId == "hub-1")
        #expect(collected?.event == .callRing)
    }

    @Test func attributedEventsStreamDeliversMultipleSequentialEvents() async {
        let ws = WebSocketService(cryptoService: CryptoService())

        let first: AttributedHubEvent? = await withCheckedContinuation { continuation in
            var resumed = false
            Task {
                for await event in ws.attributedEvents {
                    if !resumed {
                        resumed = true
                        continuation.resume(returning: event)
                    }
                    return
                }
            }
            Task {
                await Task.yield()
                ws.emitAttributedEvent(hubId: "hub-first", eventType: .presenceSummary)
            }
        }
        #expect(first?.hubId == "hub-first")
        #expect(first?.event == .presenceSummary)

        let second: AttributedHubEvent? = await withCheckedContinuation { continuation in
            var resumed = false
            Task {
                for await event in ws.attributedEvents {
                    if !resumed {
                        resumed = true
                        continuation.resume(returning: event)
                    }
                    return
                }
            }
            Task {
                await Task.yield()
                ws.emitAttributedEvent(hubId: "hub-second", eventType: .messageNew)
            }
        }
        #expect(second?.hubId == "hub-second")
        #expect(second?.event == .messageNew)
    }

    @Test func attributedEventsStreamHasCorrectElementType() {
        let ws = WebSocketService(cryptoService: CryptoService())
        // Type-level assertion: if this compiles, the stream element type is correct.
        let stream: AsyncStream<AttributedHubEvent> = ws.attributedEvents
        _ = stream
    }

    // MARK: - All 4 previously-missing event types

    @Test func attributedEventsStreamDeliversCallAnswered() async {
        let ws = WebSocketService(cryptoService: CryptoService())
        let result: AttributedHubEvent? = await withCheckedContinuation { continuation in
            var resumed = false
            Task {
                for await event in ws.attributedEvents {
                    if !resumed { resumed = true; continuation.resume(returning: event) }
                    return
                }
            }
            Task {
                await Task.yield()
                ws.emitAttributedEvent(hubId: "h", eventType: .callAnswered)
            }
        }
        #expect(result?.event == .callAnswered)
    }

    @Test func attributedEventsStreamDeliversPresenceDetail() async {
        let ws = WebSocketService(cryptoService: CryptoService())
        let result: AttributedHubEvent? = await withCheckedContinuation { continuation in
            var resumed = false
            Task {
                for await event in ws.attributedEvents {
                    if !resumed { resumed = true; continuation.resume(returning: event) }
                    return
                }
            }
            Task {
                await Task.yield()
                ws.emitAttributedEvent(hubId: "h", eventType: .presenceDetail)
            }
        }
        #expect(result?.event == .presenceDetail)
    }

    @Test func attributedEventsStreamDeliversConversationNew() async {
        let ws = WebSocketService(cryptoService: CryptoService())
        let result: AttributedHubEvent? = await withCheckedContinuation { continuation in
            var resumed = false
            Task {
                for await event in ws.attributedEvents {
                    if !resumed { resumed = true; continuation.resume(returning: event) }
                    return
                }
            }
            Task {
                await Task.yield()
                ws.emitAttributedEvent(hubId: "h", eventType: .conversationNew)
            }
        }
        #expect(result?.event == .conversationNew)
    }

    @Test func attributedEventsStreamDeliversMessageStatus() async {
        let ws = WebSocketService(cryptoService: CryptoService())
        let result: AttributedHubEvent? = await withCheckedContinuation { continuation in
            var resumed = false
            Task {
                for await event in ws.attributedEvents {
                    if !resumed { resumed = true; continuation.resume(returning: event) }
                    return
                }
            }
            Task {
                await Task.yield()
                ws.emitAttributedEvent(hubId: "h", eventType: .messageStatus)
            }
        }
        #expect(result?.event == .messageStatus)
    }
}
