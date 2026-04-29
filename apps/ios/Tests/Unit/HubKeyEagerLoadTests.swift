import Foundation
import Testing
@testable import Llamenos

// MARK: - Mocks with call counting

/// API service mock that records which hub IDs had getHubKey called.
/// Uses NSLock for thread safety: getHubKey is called from concurrent child tasks
/// inside withTaskGroup, so actor isolation alone is not sufficient.
final class TrackingHubAPIService: HubAPIServiceProtocol {
    private let lock = NSLock()
    private var _fetchedHubIds: [String] = []
    var fetchedHubIds: [String] {
        lock.lock(); defer { lock.unlock() }
        return _fetchedHubIds
    }
    var hubKeyError: Error?

    func getHubKey(_ hubId: String) async throws -> HubKeyEnvelopeResponse {
        lock.lock()
        _fetchedHubIds.append(hubId)
        lock.unlock()
        if let error = hubKeyError { throw error }
        return HubKeyEnvelopeResponse(
            envelope: HubKeyEnvelopeResponseEnvelope(
                ephemeralPubkey: "aabbcc",
                pubkey: "ddeeff",
                wrappedKey: "112233"
            )
        )
    }

    func hp(_ path: String) -> String { path }

    func request<T: Decodable>(method: String, path: String, body: (any Encodable)?) async throws -> T {
        // Stub HubsListResponse for loadHubs() calls
        if let response = HubsListResponse(hubs: []) as? T {
            return response
        }
        throw URLError(.unsupportedURL)
    }
}

/// Crypto service mock that records which hub IDs had loadHubKey called.
/// Uses NSLock for thread safety: loadHubKey may be called concurrently when
/// protocol witness dispatch bypasses @MainActor isolation through an existential.
final class TrackingHubCryptoService: HubCryptoServiceProtocol {
    /// Hub IDs pre-populated as "already cached".
    var cachedHubIds: Set<String> = []
    private let lock = NSLock()
    private var _loadedHubIds: [String] = []
    var loadedHubIds: [String] {
        lock.lock(); defer { lock.unlock() }
        return _loadedHubIds
    }
    var loadHubKeyError: Error?

    func hasHubKey(hubId: String) -> Bool {
        cachedHubIds.contains(hubId)
    }

    func loadHubKey(hubId: String, envelope: HubKeyEnvelopeResponse) throws {
        if let error = loadHubKeyError { throw error }
        lock.lock()
        _loadedHubIds.append(hubId)
        lock.unlock()
        // Do NOT insert into cachedHubIds here — the eager load guard check
        // happens before tasks run, so this won't affect the test outcome.
        // Only update cachedHubIds when explicitly testing cache-hit behavior.
    }
}

// MARK: - Helpers

private func makeHub(id: String, slug: String = "hub") -> Hub {
    Hub(
        id: id,
        name: "Hub \(id)",
        slug: slug,
        description: nil,
        status: .active,
        phoneNumber: nil,
        createdBy: "pub001",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z"
    )
}

// MARK: - Tests

@MainActor
struct HubKeyEagerLoadTests {

    // MARK: - Eager Loading

    @Test func testEagerLoadFetchesKeysForAllHubs() async {
        UserDefaults.standard.removeObject(forKey: "activeHubId")
        defer { UserDefaults.standard.removeObject(forKey: "activeHubId") }

        let apiService = TrackingHubAPIService()
        let cryptoService = TrackingHubCryptoService()
        let ctx = HubContext()

        let vm = HubManagementViewModel(
            apiService: apiService,
            cryptoService: cryptoService,
            hubContext: ctx
        )

        let hubs = [makeHub(id: "hub-001"), makeHub(id: "hub-002"), makeHub(id: "hub-003")]
        await vm.eagerLoadHubKeys(for: hubs)

        // All three hub IDs must have been fetched from the API
        #expect(Set(apiService.fetchedHubIds) == ["hub-001", "hub-002", "hub-003"])
        // loadHubKey must have been called for all three hubs
        #expect(Set(cryptoService.loadedHubIds) == ["hub-001", "hub-002", "hub-003"])
    }

    @Test func testEagerLoadSkipsAlreadyCachedHubs() async {
        UserDefaults.standard.removeObject(forKey: "activeHubId")
        defer { UserDefaults.standard.removeObject(forKey: "activeHubId") }

        let apiService = TrackingHubAPIService()
        let cryptoService = TrackingHubCryptoService()
        // Pre-seed hub-001 as already cached
        cryptoService.cachedHubIds = ["hub-001"]
        let ctx = HubContext()

        let vm = HubManagementViewModel(
            apiService: apiService,
            cryptoService: cryptoService,
            hubContext: ctx
        )

        let hubs = [makeHub(id: "hub-001"), makeHub(id: "hub-002")]
        await vm.eagerLoadHubKeys(for: hubs)

        // Only hub-002 should have been fetched — hub-001 was already cached
        #expect(apiService.fetchedHubIds == ["hub-002"])
        #expect(cryptoService.loadedHubIds == ["hub-002"])
    }

    @Test func testEagerLoadIndividualFailuresDoNotPropagateOrFailOthers() async {
        UserDefaults.standard.removeObject(forKey: "activeHubId")
        defer { UserDefaults.standard.removeObject(forKey: "activeHubId") }

        let apiService = TrackingHubAPIService()
        // Inject a fetch error — ALL fetches will fail
        apiService.hubKeyError = URLError(.badServerResponse)
        let cryptoService = TrackingHubCryptoService()
        let ctx = HubContext()

        let vm = HubManagementViewModel(
            apiService: apiService,
            cryptoService: cryptoService,
            hubContext: ctx
        )

        let hubs = [makeHub(id: "hub-001"), makeHub(id: "hub-002")]

        // Must complete without throwing — errors are swallowed internally
        await vm.eagerLoadHubKeys(for: hubs)

        // Fetches were attempted but nothing was loaded into cache
        #expect(apiService.fetchedHubIds.count == 2)
        #expect(cryptoService.loadedHubIds.isEmpty)
        // The vm-level error must NOT be set — failures are per-key, not global
        #expect(vm.error == nil)
    }

    // MARK: - Cache-miss fallback in switchHub

    @Test func testSwitchHubFetchesMissingKeyOnDemand() async {
        UserDefaults.standard.removeObject(forKey: "activeHubId")
        defer { UserDefaults.standard.removeObject(forKey: "activeHubId") }

        let apiService = TrackingHubAPIService()
        let cryptoService = TrackingHubCryptoService()
        // No keys pre-cached — cache miss guaranteed
        let ctx = HubContext()

        let vm = HubManagementViewModel(
            apiService: apiService,
            cryptoService: cryptoService,
            hubContext: ctx
        )

        let hub = makeHub(id: "hub-on-demand")
        await vm.switchHub(to: hub)

        // Key must have been fetched on demand
        #expect(apiService.fetchedHubIds == ["hub-on-demand"])
        #expect(cryptoService.loadedHubIds == ["hub-on-demand"])
        // Hub context must have been updated
        #expect(ctx.activeHubId == "hub-on-demand")
        #expect(vm.error == nil)
    }

    @Test func testSwitchHubSkipsFetchIfKeyCached() async {
        UserDefaults.standard.removeObject(forKey: "activeHubId")
        defer { UserDefaults.standard.removeObject(forKey: "activeHubId") }

        let apiService = TrackingHubAPIService()
        let cryptoService = TrackingHubCryptoService()
        // Pre-cache the hub key
        cryptoService.cachedHubIds = ["hub-cached"]
        let ctx = HubContext()

        let vm = HubManagementViewModel(
            apiService: apiService,
            cryptoService: cryptoService,
            hubContext: ctx
        )

        let hub = makeHub(id: "hub-cached")
        await vm.switchHub(to: hub)

        // No fetch should have occurred — key was already cached
        #expect(apiService.fetchedHubIds.isEmpty)
        #expect(cryptoService.loadedHubIds.isEmpty)
        // Hub context must still be updated
        #expect(ctx.activeHubId == "hub-cached")
        #expect(vm.error == nil)
    }
}
