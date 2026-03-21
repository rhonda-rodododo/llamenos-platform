import Foundation
import UIKit

// MARK: - HubManagementViewModel

/// View model for hub listing, creation, and switching.
@Observable
final class HubManagementViewModel {
    private let apiService: any HubAPIServiceProtocol
    private let cryptoService: any HubCryptoServiceProtocol
    private let hubContext: HubContext
    private let feedbackGenerator = UINotificationFeedbackGenerator()

    // MARK: - State

    var hubs: [Hub] = []
    var isLoading: Bool = false
    var isSaving: Bool = false
    var isSwitching: Bool = false
    var error: Error?
    var errorMessage: String? { error?.localizedDescription }
    var successMessage: String?

    // MARK: - Init

    /// Primary init — uses protocol types so tests can inject mocks.
    init(
        apiService: any HubAPIServiceProtocol,
        cryptoService: any HubCryptoServiceProtocol,
        hubContext: HubContext
    ) {
        self.apiService = apiService
        self.cryptoService = cryptoService
        self.hubContext = hubContext
        feedbackGenerator.prepare()
    }

    // MARK: - Data Loading

    /// Fetch all hubs the user belongs to.
    /// Uses the global /api/hubs path (not hub-prefixed — this is a cross-hub listing).
    func loadHubs() async {
        isLoading = true
        defer { isLoading = false }
        error = nil

        do {
            let response: HubsListResponse = try await apiService.request(
                method: "GET", path: "/api/hubs", body: nil
            )
            hubs = response.hubs

            // Eager-load hub keys for all hubs in parallel.
            // Errors from individual key fetches are logged but do not fail the overall load.
            await eagerLoadHubKeys(for: hubs)

            // If no active hub is set and there are hubs, select the first one
            if hubContext.activeHubId == nil, let first = hubs.first {
                await switchHub(to: first)
            }
        } catch {
            self.error = error
        }
    }

    // MARK: - Eager Hub Key Loading

    /// Pre-fetch and cache hub keys for all hubs in the background.
    /// Runs fetches in parallel; individual failures are logged and skipped.
    func eagerLoadHubKeys(for hubs: [Hub]) async {
        await withTaskGroup(of: Void.self) { group in
            for hub in hubs {
                guard !cryptoService.hasHubKey(hubId: hub.id) else { continue }
                group.addTask {
                    do {
                        let envelope = try await self.apiService.getHubKey(hub.id)
                        try self.cryptoService.loadHubKey(hubId: hub.id, envelope: envelope)
                    } catch {
                        // Individual key fetch errors do not propagate — log and continue
                        // so that the hub list remains usable even if some keys fail.
                        print("[HubManagementViewModel] Failed to eager-load key for hub \(hub.id): \(error)")
                    }
                }
            }
        }
    }

    // MARK: - Hub Switching

    /// Switch to a different hub.
    ///
    /// 1. Guard: already active → no-op.
    /// 2. Fetch hub key from API if not cached in CryptoService.
    /// 3. Load into CryptoService key cache.
    /// 4. Update HubContext (persists to UserDefaults).
    ///
    /// On any error, HubContext is NOT updated — the active hub remains unchanged.
    func switchHub(to hub: Hub) async {
        guard hubContext.activeHubId != hub.id else { return }
        isSwitching = true
        error = nil
        defer { isSwitching = false }

        do {
            if !cryptoService.hasHubKey(hubId: hub.id) {
                let envelope = try await apiService.getHubKey(hub.id)
                try cryptoService.loadHubKey(hubId: hub.id, envelope: envelope)
            }
            hubContext.setActiveHub(hub.id)
            feedbackGenerator.notificationOccurred(.success)
        } catch {
            self.error = error
        }
    }

    /// Check if a hub is the currently active one. Compares by UUID, not slug.
    func isActive(_ hub: Hub) -> Bool {
        hub.id == hubContext.activeHubId
    }

    // MARK: - Hub Creation

    /// Create a new hub.
    func createHub(name: String, slug: String?, description: String?, phoneNumber: String?) async -> Bool {
        isSaving = true
        defer { isSaving = false }
        error = nil

        let body = CreateHubRequest(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            slug: slug?.trimmingCharacters(in: .whitespacesAndNewlines),
            description: description?.trimmingCharacters(in: .whitespacesAndNewlines),
            phoneNumber: phoneNumber?.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        do {
            let response: AppHubResponse = try await apiService.request(
                method: "POST", path: "/api/hubs", body: body as (any Encodable)?
            )
            hubs.append(response.hub)
            successMessage = NSLocalizedString("hubs_created_success", comment: "Hub created successfully")
            feedbackGenerator.notificationOccurred(.success)
            return true
        } catch {
            self.error = error
            feedbackGenerator.notificationOccurred(.error)
            return false
        }
    }
}
