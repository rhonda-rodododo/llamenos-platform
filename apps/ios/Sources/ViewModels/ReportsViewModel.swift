import Foundation
import UIKit

// MARK: - ReportsViewModel

/// View model for the Reports feature. Fetches reports from the API,
/// manages status filtering, and handles report creation with E2EE encryption.
@Observable
final class ReportsViewModel {
    private let apiService: APIService
    private let cryptoService: CryptoService

    // MARK: - Public State

    /// Reports from the server.
    var reports: [ReportResponse] = []

    /// Available report categories from the server.
    var categories: [String] = []

    /// Current status filter.
    var selectedFilter: ReportStatusFilter = .all

    /// Whether the initial load is in progress.
    var isLoading: Bool = false

    /// Whether a report action (create, claim, close) is in progress.
    var isActionInProgress: Bool = false

    /// Error message from the last failed operation.
    var errorMessage: String?

    /// Whether the report creation sheet is shown.
    var showCreateSheet: Bool = false

    /// Total report count from server.
    var totalCount: Int = 0

    /// Reports filtered by the selected status filter.
    var filteredReports: [ReportResponse] {
        guard selectedFilter != .all else { return reports }
        return reports.filter { $0.status == selectedFilter.rawValue }
    }

    // MARK: - Initialization

    init(apiService: APIService, cryptoService: CryptoService) {
        self.apiService = apiService
        self.cryptoService = cryptoService
    }

    // MARK: - Data Loading

    /// Load reports and categories from the API.
    func loadReports() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil

        async let reportsResult: Void = fetchReports()
        async let categoriesResult: Void = fetchCategories()

        await reportsResult
        await categoriesResult

        isLoading = false
    }

    /// Refresh reports (pull-to-refresh).
    func refresh() async {
        isLoading = false
        await loadReports()
    }

    // MARK: - Report Creation

    /// Encrypt and create a new report.
    ///
    /// - Parameters:
    ///   - title: The report title.
    ///   - category: Optional report category.
    ///   - body: The report body text.
    /// - Returns: `true` if creation succeeded.
    @discardableResult
    func createReport(title: String, category: String?, body: String) async -> Bool {
        isActionInProgress = true
        errorMessage = nil

        do {
            // Encrypt the body with E2EE envelope (same as notes)
            let encryptedNote = try cryptoService.encryptNote(payload: body, adminPubkeys: [])

            let request = CreateReportRequest(
                title: title,
                category: category,
                encryptedContent: encryptedNote.encryptedContent,
                authorEnvelope: NoteKeyEnvelope(
                    wrappedKey: encryptedNote.authorEnvelope.wrappedKey,
                    ephemeralPubkey: encryptedNote.authorEnvelope.ephemeralPubkey
                ),
                adminEnvelopes: encryptedNote.adminEnvelopes.map { env in
                    NoteRecipientEnvelope(
                        pubkey: env.pubkey,
                        wrappedKey: env.wrappedKey,
                        ephemeralPubkey: env.ephemeralPubkey
                    )
                }
            )

            let _: ReportResponse = try await apiService.request(
                method: "POST",
                path: "/api/reports",
                body: request
            )

            // Haptic feedback on success
            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.impactOccurred()

            // Reload reports to include the new one
            await refresh()
            isActionInProgress = false
            return true
        } catch {
            errorMessage = error.localizedDescription
            isActionInProgress = false
            return false
        }
    }

    // MARK: - Report Actions

    /// Claim a waiting report by assigning it to the current user.
    func claimReport(id: String) async {
        guard let pubkey = cryptoService.pubkey else { return }
        isActionInProgress = true
        errorMessage = nil

        do {
            let request = ReportAssignRequest(assignTo: pubkey)
            let _: ReportResponse = try await apiService.request(
                method: "POST",
                path: "/api/reports/\(id)/assign",
                body: request
            )

            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)

            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }

        isActionInProgress = false
    }

    /// Close an active report.
    func closeReport(id: String) async {
        isActionInProgress = true
        errorMessage = nil

        do {
            let request = ReportUpdateRequest(status: "closed")
            let _: ReportResponse = try await apiService.request(
                method: "PATCH",
                path: "/api/reports/\(id)",
                body: request
            )

            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)

            await refresh()
        } catch {
            errorMessage = error.localizedDescription
        }

        isActionInProgress = false
    }

    // MARK: - Private Helpers

    private func fetchReports() async {
        do {
            let response: ReportsListResponse = try await apiService.request(
                method: "GET",
                path: "/api/reports?limit=50"
            )
            reports = response.conversations
            totalCount = response.total
        } catch {
            if case APIError.noBaseURL = error {
                // Hub not configured — show empty state, no error
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func fetchCategories() async {
        do {
            let response: ReportCategoriesResponse = try await apiService.request(
                method: "GET",
                path: "/api/reports/categories"
            )
            categories = response.categories
        } catch {
            // Categories are optional — silently continue without them
            categories = []
        }
    }
}
