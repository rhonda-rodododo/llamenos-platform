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
/// Real XChaCha20-Poly1305 decryption happens in Rust. These tests use
/// `WebSocketService.decryptionHandler` — a `#if DEBUG` closure that replaces
/// the Rust CryptoService call, returning (hubId, json) directly.
@MainActor
struct WebSocketServiceAttributionTests {

    // MARK: - Attribution Tests

    /// `decryptEvent` attributes the event to hub-2 when the mock returns hub-2.
    @Test func testDecryptEventAttributesToCorrectHub() {
        let crypto = CryptoService()
        let ws = WebSocketService(cryptoService: crypto)
        ws.decryptionHandler = { _ in
            return (hubId: "hub-2", json: #"{"type":"shift:update"}"#)
        }

        let result = ws.decryptEvent("opaque-ciphertext")
        #expect(result != nil)
        #expect(result?.hubId == "hub-2")
        #expect(result?.event == .shiftUpdate)
    }

    /// `decryptEvent` returns `nil` when no loaded hub key successfully decrypts the content.
    @Test func testDecryptEventReturnsNilWhenNoKeyMatches() {
        let crypto = CryptoService()
        let ws = WebSocketService(cryptoService: crypto)
        ws.decryptionHandler = { _ in nil }

        let result = ws.decryptEvent("opaque-ciphertext")
        #expect(result == nil)
    }

    /// `decryptEvent` returns `nil` when no hub keys are loaded at all.
    @Test func testDecryptEventReturnsNilWithNoHubKeys() {
        let crypto = CryptoService()
        let ws = WebSocketService(cryptoService: crypto)
        // No mock set — default returns nil, Rust also has no keys

        let result = ws.decryptEvent("opaque-ciphertext")
        #expect(result == nil)
    }

    /// When the mock identifies a specific hub, that attribution is preserved
    /// through the full parse pipeline.
    @Test func testDecryptEventAttributionPreservedThroughPipeline() {
        let crypto = CryptoService()
        let ws = WebSocketService(cryptoService: crypto)
        ws.decryptionHandler = { _ in
            return (hubId: "winner-hub", json: #"{"type":"voicemail:new"}"#)
        }

        let result = ws.decryptEvent("opaque-ciphertext")
        #expect(result != nil)
        #expect(result?.hubId == "winner-hub")
        #expect(result?.event == .voicemailNew)
    }
}
