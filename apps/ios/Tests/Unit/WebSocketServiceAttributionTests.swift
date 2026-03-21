import Foundation
import Testing
@testable import Llamenos

// MARK: - WebSocketService Multi-Hub Attribution Tests

/// Tests for `WebSocketService.decryptEvent(_:)` multi-hub key-trial attribution.
///
/// The core invariant: when multiple hub keys are loaded, `decryptEvent` tries each
/// one and attributes the resulting `AttributedHubEvent.hubId` to whichever hub's
/// key successfully decrypts the event content.
///
/// Real XChaCha20-Poly1305 decryption cannot be mocked without an FFI encrypt
/// counterpart, so these tests use `WebSocketService.decryptionHandler` — a
/// `#if DEBUG` closure that replaces the CryptoService call. This is the same
/// bypass pattern used by `CryptoServiceHubKeyTests.storeHubKeyForTesting`.
@MainActor
struct WebSocketServiceAttributionTests {

    // MARK: - Helpers

    /// Create a `WebSocketService` with a fresh `CryptoService` and a mock decryption
    /// closure that succeeds only when `keyHex` matches `successKeyHex`.
    ///
    /// The mock returns a minimal JSON payload recognized by `parseHubEvent` so the
    /// full attribution pipeline (decrypt → parse → AttributedHubEvent) fires.
    private func makeService(successKeyHex: String) -> WebSocketService {
        let crypto = CryptoService()
        let ws = WebSocketService(cryptoService: crypto)
        ws.decryptionHandler = { _, keyHex in
            guard keyHex == successKeyHex else { return nil }
            return #"{"type":"call:ring","callSid":"CA123"}"#
        }
        return ws
    }

    // MARK: - Attribution Tests

    /// `decryptEvent` attributes the event to hub-2 when hub-2's key is the matching one.
    @Test func testDecryptEventAttributesToCorrectHub() {
        let hub1KeyHex = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        let hub2KeyHex = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

        let crypto = CryptoService()
        crypto.storeHubKeyForTesting(hubId: "hub-1", keyHex: hub1KeyHex)
        crypto.storeHubKeyForTesting(hubId: "hub-2", keyHex: hub2KeyHex)

        let ws = WebSocketService(cryptoService: crypto)
        // Mock: only hub-2's key produces valid plaintext.
        ws.decryptionHandler = { _, keyHex in
            guard keyHex == hub2KeyHex else { return nil }
            return #"{"type":"shift:update"}"#
        }

        let result = ws.decryptEvent("opaque-ciphertext")
        #expect(result != nil)
        #expect(result?.hubId == "hub-2")
        #expect(result?.event == .shiftUpdate)
    }

    /// `decryptEvent` returns `nil` when no loaded hub key successfully decrypts the content.
    @Test func testDecryptEventReturnsNilWhenNoKeyMatches() {
        let crypto = CryptoService()
        crypto.storeHubKeyForTesting(hubId: "hub-1", keyHex: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc")

        let ws = WebSocketService(cryptoService: crypto)
        // Mock: all keys fail — simulates wrong key or tampered ciphertext.
        ws.decryptionHandler = { _, _ in nil }

        let result = ws.decryptEvent("opaque-ciphertext")
        #expect(result == nil)
    }

    /// `decryptEvent` returns `nil` when no hub keys are loaded at all.
    @Test func testDecryptEventReturnsNilWithNoHubKeys() {
        let crypto = CryptoService()
        // No keys stored — allHubKeys() returns empty dict.
        let ws = WebSocketService(cryptoService: crypto)

        let result = ws.decryptEvent("opaque-ciphertext")
        #expect(result == nil)
    }

    /// When multiple hub keys are loaded, `decryptEvent` tries them all and returns
    /// the first successful attribution. Only one hub's key should match.
    @Test func testDecryptEventIgnoresNonMatchingHubKeys() {
        let winnerKeyHex = "1111111111111111111111111111111111111111111111111111111111111111"
        let loserKeyHex  = "2222222222222222222222222222222222222222222222222222222222222222"

        let crypto = CryptoService()
        // Both keys loaded, but only "winner-hub" decrypts successfully.
        crypto.storeHubKeyForTesting(hubId: "loser-hub", keyHex: loserKeyHex)
        crypto.storeHubKeyForTesting(hubId: "winner-hub", keyHex: winnerKeyHex)

        let ws = WebSocketService(cryptoService: crypto)
        ws.decryptionHandler = { _, keyHex in
            guard keyHex == winnerKeyHex else { return nil }
            return #"{"type":"voicemail:new"}"#
        }

        let result = ws.decryptEvent("opaque-ciphertext")
        #expect(result != nil)
        #expect(result?.hubId == "winner-hub")
        #expect(result?.event == .voicemailNew)
    }
}
