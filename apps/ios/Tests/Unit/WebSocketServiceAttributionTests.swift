import Foundation
import Testing
@testable import Llamenos

// MARK: - WebSocketService Multi-Hub Attribution Tests

/// Tests for `WebSocketService.decryptEvent(_:)` multi-hub key-trial attribution.
///
/// The core invariant: when multiple hub keys are loaded, `decryptEvent` tries each
/// one in Rust and attributes the resulting `AttributedHubEvent.hubId` to whichever
/// hub's key successfully decrypts the event content.
///
/// Real XChaCha20-Poly1305 decryption happens in Rust via `decryptEventWithAttribution`.
/// These tests use `WebSocketService.decryptionHandler` — a `#if DEBUG` closure that
/// replaces the CryptoService call — to return predetermined (hubId, json) pairs
/// without requiring actual encrypted payloads.
@MainActor
struct WebSocketServiceAttributionTests {

    // MARK: - Helpers

    /// Create a `WebSocketService` with a fresh `CryptoService` and a mock decryption
    /// closure that returns a fixed (hubId, json) for any ciphertext.
    private func makeService(
        hubId: String,
        json: String = #"{"type":"call:ring","callSid":"CA123"}"#
    ) -> WebSocketService {
        let crypto = CryptoService()
        let ws = WebSocketService(cryptoService: crypto)
        ws.decryptionHandler = { _ in (hubId: hubId, json: json) }
        return ws
    }

    // MARK: - Attribution Tests

    /// `decryptEvent` attributes the event to the hub whose key decrypted it.
    @Test func testDecryptEventAttributesToCorrectHub() {
        let ws = makeService(hubId: "hub-2", json: #"{"type":"shift:update"}"#)

        let result = ws.decryptEvent("opaque-ciphertext")
        #expect(result != nil)
        #expect(result?.hubId == "hub-2")
        #expect(result?.event == .shiftUpdate)
    }

    /// `decryptEvent` returns `nil` when no loaded hub key successfully decrypts the content.
    @Test func testDecryptEventReturnsNilWhenNoKeyMatches() {
        let crypto = CryptoService()
        let ws = WebSocketService(cryptoService: crypto)
        // Mock: always fails — simulates wrong key or tampered ciphertext.
        ws.decryptionHandler = { _ in nil }

        let result = ws.decryptEvent("opaque-ciphertext")
        #expect(result == nil)
    }

    /// `decryptEvent` returns `nil` when no hub keys are loaded and no mock is set.
    @Test func testDecryptEventReturnsNilWithNoHubKeys() {
        let crypto = CryptoService()
        let ws = WebSocketService(cryptoService: crypto)
        // decryptionHandler defaults to { _ in nil }, and no Rust hub keys loaded.

        let result = ws.decryptEvent("opaque-ciphertext")
        #expect(result == nil)
    }

    /// `decryptEvent` parses a voicemail:new event type correctly via the attribution pipeline.
    @Test func testDecryptEventParsesVoicemailNewType() {
        let ws = makeService(hubId: "winner-hub", json: #"{"type":"voicemail:new"}"#)

        let result = ws.decryptEvent("opaque-ciphertext")
        #expect(result != nil)
        #expect(result?.hubId == "winner-hub")
        #expect(result?.event == .voicemailNew)
    }
}
