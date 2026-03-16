import Foundation
import UIKit

// MARK: - HubManagementViewModel

/// View model for hub listing, creation, and switching.
@Observable
final class HubManagementViewModel {
    private let apiService: APIService

    // MARK: - State

    var hubs: [Hub] = []
    var isLoading: Bool = false
    var isSaving: Bool = false
    var errorMessage: String?
    var successMessage: String?

    /// The currently active hub slug (stored in UserDefaults for persistence).
    var activeHubSlug: String? {
        didSet {
            if let slug = activeHubSlug {
                UserDefaults.standard.set(slug, forKey: "activeHubSlug")
            } else {
                UserDefaults.standard.removeObject(forKey: "activeHubSlug")
            }
        }
    }

    // MARK: - Init

    init(apiService: APIService) {
        self.apiService = apiService
        self.activeHubSlug = UserDefaults.standard.string(forKey: "activeHubSlug")
    }

    // MARK: - Data Loading

    /// Fetch all hubs the user belongs to.
    func loadHubs() async {
        isLoading = true
        defer { isLoading = false }
        errorMessage = nil

        do {
            let response: HubsListResponse = try await apiService.request(
                method: "GET", path: "/api/hubs"
            )
            hubs = response.hubs

            // If no active hub is set and there are hubs, select the first one
            if activeHubSlug == nil, let first = hubs.first {
                activeHubSlug = first.slug
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Switch to a different hub.
    func switchHub(to hub: Hub) {
        activeHubSlug = hub.slug
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    /// Check if a hub is the currently active one.
    func isActive(_ hub: Hub) -> Bool {
        hub.slug == activeHubSlug
    }

    // MARK: - Hub Creation

    /// Create a new hub.
    func createHub(name: String, slug: String?, description: String?, phoneNumber: String?) async -> Bool {
        isSaving = true
        defer { isSaving = false }
        errorMessage = nil

        let body = CreateHubRequest(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            slug: slug?.trimmingCharacters(in: .whitespacesAndNewlines),
            description: description?.trimmingCharacters(in: .whitespacesAndNewlines),
            phoneNumber: phoneNumber?.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        do {
            let response: AppHubResponse = try await apiService.request(
                method: "POST", path: "/api/hubs", body: body
            )
            hubs.append(response.hub)
            successMessage = NSLocalizedString("hubs_created_success", comment: "Hub created successfully")
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            return true
        } catch {
            errorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return false
        }
    }
}
