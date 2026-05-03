import Foundation
import Testing
@testable import Llamenos

struct CryptoServiceHubKeyTests {

    @Test func storeHubKeyMakesItAvailable() throws {
        let crypto = CryptoService()
        crypto.storeHubKeyForTesting(hubId: "hub-001", keyHex: String(repeating: "ab", count: 32))
        #expect(crypto.hasHubKey(hubId: "hub-001") == true)
        #expect(crypto.hasHubKey(hubId: "hub-002") == false)
        crypto.clearHubKeys()
    }

    @Test func clearHubKeysEvictsAllKeys() throws {
        let crypto = CryptoService()
        crypto.storeHubKeyForTesting(hubId: "hub-001", keyHex: String(repeating: "ab", count: 32))
        crypto.storeHubKeyForTesting(hubId: "hub-002", keyHex: String(repeating: "cd", count: 32))
        #expect(crypto.hasHubKey(hubId: "hub-001") == true)
        #expect(crypto.hasHubKey(hubId: "hub-002") == true)
        crypto.clearHubKeys()
        #expect(crypto.hasHubKey(hubId: "hub-001") == false)
        #expect(crypto.hasHubKey(hubId: "hub-002") == false)
    }

    @Test func lockClearsHubKeys() {
        let crypto = CryptoService()
        crypto.storeHubKeyForTesting(hubId: "hub-001", keyHex: String(repeating: "ab", count: 32))
        crypto.lock()
        #expect(crypto.hasHubKey(hubId: "hub-001") == false)
    }

    @Test func storeServerEventKeyStoresAsHubKey() {
        let crypto = CryptoService()
        let keyHex = String(repeating: "ef", count: 32)
        crypto.storeServerEventKey(hubId: "hub-svr", keyHex: keyHex)
        #expect(crypto.hasHubKey(hubId: "hub-svr") == true)
        crypto.clearHubKeys()
    }

    @Test func setServerEventKeysStoresInRust() throws {
        let crypto = CryptoService()
        let currentKey = String(repeating: "11", count: 32)
        try crypto.setServerEventKeys(currentHex: currentKey)
        // Server event keys are separate from hub keys — no hub key assertion
        // The key is stored in Rust for mobile_decrypt_server_event
        crypto.lock()
    }

    @Test func decryptHubEventReturnsNilForUnknownHub() {
        let crypto = CryptoService()
        let result = crypto.decryptHubEvent(ciphertextHex: String(repeating: "00", count: 40), hubId: "no-such-hub")
        #expect(result == nil)
    }

    @Test func decryptEventWithAttributionReturnsNilWhenEmpty() {
        let crypto = CryptoService()
        let result = crypto.decryptEventWithAttribution(ciphertextHex: String(repeating: "00", count: 40))
        #expect(result == nil)
    }
}
