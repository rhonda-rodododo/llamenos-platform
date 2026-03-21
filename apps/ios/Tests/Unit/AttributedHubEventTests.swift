import Foundation
import Testing
@testable import Llamenos

// MARK: - AttributedHubEvent Unit Tests

/// Tests for `AttributedHubEvent` struct construction and `WebSocketService` hub-tagging behavior.
///
/// Strategy: `WebSocketService.emitEvent(_:)` is `internal`, so `@testable import` lets us
/// inject synthetic `NostrEvent` values directly and observe the typed-event stream without
/// requiring a real WebSocket connection.
@MainActor
struct AttributedHubEventTests {

    // MARK: - Helpers

    /// Build a minimal `NostrEvent` with empty content (no decryption key set, so typed
    /// emission is skipped) for testing raw stream delivery.
    private func makeRawEvent(id: String = UUID().uuidString) -> NostrEvent {
        NostrEvent(
            id: id,
            pubkey: "deadbeef",
            createdAt: 1_700_000_000,
            kind: 20001,
            tags: [["t", "llamenos:event"]],
            content: "opaque-ciphertext",
            sig: "cafebabe"
        )
    }

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

    // MARK: - Raw event stream delivery

    @Test func rawEventsStreamDeliversEmittedEvents() async {
        let ws = WebSocketService(cryptoService: CryptoService())

        let collected: NostrEvent? = await withCheckedContinuation { continuation in
            var resumed = false
            Task {
                for await event in ws.events {
                    if !resumed {
                        resumed = true
                        continuation.resume(returning: event)
                    }
                    return
                }
            }
            Task {
                // Small yield to let the subscriber register before emitting.
                await Task.yield()
                ws.emitEvent(self.makeRawEvent(id: "evt-hub-1"))
            }
        }
        #expect(collected?.id == "evt-hub-1")
    }

    @Test func rawEventsStreamDeliversMultipleSequentialEvents() async {
        let ws = WebSocketService(cryptoService: CryptoService())

        let first: NostrEvent? = await withCheckedContinuation { continuation in
            var resumed = false
            Task {
                for await event in ws.events {
                    if !resumed {
                        resumed = true
                        continuation.resume(returning: event)
                    }
                    return
                }
            }
            Task {
                await Task.yield()
                ws.emitEvent(self.makeRawEvent(id: "evt-first"))
            }
        }
        #expect(first?.id == "evt-first")

        let second: NostrEvent? = await withCheckedContinuation { continuation in
            var resumed = false
            Task {
                for await event in ws.events {
                    if !resumed {
                        resumed = true
                        continuation.resume(returning: event)
                    }
                    return
                }
            }
            Task {
                await Task.yield()
                ws.emitEvent(self.makeRawEvent(id: "evt-second"))
            }
        }
        #expect(second?.id == "evt-second")
    }

    @Test func attributedEventsStreamHasCorrectElementType() {
        let ws = WebSocketService(cryptoService: CryptoService())
        // Type-level assertion: if this compiles, the stream element type is correct.
        // Actual emission requires decryption; that's covered in WebSocketServiceAttributionTests.
        let stream: AsyncStream<AttributedHubEvent> = ws.attributedEvents
        _ = stream
    }
}
