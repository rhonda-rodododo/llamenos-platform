import Foundation
import UIKit

// MARK: - HubManagementViewModel

/// View model for hub listing, creation, and switching.
@Observable
final class HubManagementViewModel {
    private let apiService: any HubAPIServiceProtocol
    private let cryptoService: any HubCryptoServiceProtocol
    private let hubContext: HubContext

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
    }

    // MARK: - Data Loading

    /// Fetch all hubs the user belongs to.
    /// Uses the global /api/hubs path (not hub-prefixed — this is a cross-hub listing).
    func loadHubs() async {
        isLoading = true
        defer { isLoading = false }
        error = nil

        // apiService is typed as HubAPIServiceProtocol which only exposes getHubKey;
        // for the generic request we need the concrete APIService. Cast gracefully.
        guard let concreteAPI = apiService as? APIService else { return }

        do {
            let response: HubsListResponse = try await concreteAPI.request(
                method: "GET", path: "/api/hubs"
            )
            hubs = response.hubs

            // If no active hub is set and there are hubs, select the first one
            if hubContext.activeHubId == nil, let first = hubs.first {
                await switchHub(to: first)
            }
        } catch {
            self.error = error
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
            UINotificationFeedbackGenerator().notificationOccurred(.success)
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
        guard let concreteAPI = apiService as? APIService else { return false }
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
            let response: AppHubResponse = try await concreteAPI.request(
                method: "POST", path: "/api/hubs", body: body
            )
            hubs.append(response.hub)
            successMessage = NSLocalizedString("hubs_created_success", comment: "Hub created successfully")
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            return true
        } catch {
            self.error = error
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return false
        }
    }
}
