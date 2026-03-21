import Foundation

// MARK: - TriageStatus

/// Conversion status for triage reports.
enum TriageStatusFilter: String, CaseIterable, Sendable {
    case all
    case pending
    case inProgress = "in_progress"
    case completed

    var displayName: String {
        switch self {
        case .all: return NSLocalizedString("triage_filter_all", comment: "All")
        case .pending: return NSLocalizedString("triage_filter_pending", comment: "Pending")
        case .inProgress: return NSLocalizedString("triage_filter_in_progress", comment: "In Progress")
        case .completed: return NSLocalizedString("triage_filter_completed", comment: "Completed")
        }
    }
}

// MARK: - TriageViewModel

/// Manages the triage queue: reports with `allowCaseConversion: true` that can be
/// converted to case records. Fetches from `GET /api/reports?conversionEnabled=true`.
@Observable
final class TriageViewModel {
    private let apiService: APIService
    private let cryptoService: CryptoService

    var reports: [ClientReportResponse] = []
    var total: Int = 0
    var isLoading = false
    var isActionInProgress = false
    var errorMessage: String?

    /// Current conversion status filter.
    var selectedFilter: TriageStatusFilter = .pending

    /// Filtered reports based on selected conversion status.
    var filteredReports: [ClientReportResponse] {
        guard selectedFilter != .all else { return reports }
        // The conversionStatus filter is applied server-side, but for client-side
        // filtering of already-loaded data:
        return reports
    }

    /// Report type definitions for resolving labels.
    var reportTypes: [ClientReportTypeDefinition] = []

    init(apiService: APIService, cryptoService: CryptoService) {
        self.apiService = apiService
        self.cryptoService = cryptoService
    }

    // MARK: - Load Triage Reports

    func loadReports() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil

        async let reportsResult: Void = fetchReports()
        async let typesResult: Void = fetchReportTypes()

        await reportsResult
        await typesResult

        isLoading = false
    }

    private func fetchReports() async {
        do {
            var path = apiService.hp("/api/reports") + "?conversionEnabled=true&limit=50"
            if selectedFilter != .all {
                path += "&conversionStatus=\(selectedFilter.rawValue)"
            }
            let response: ReportsListResponse = try await apiService.request(
                method: "GET",
                path: path
            )
            reports = response.conversations
            total = response.total
        } catch {
            if reports.isEmpty {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func fetchReportTypes() async {
        do {
            let types = try await apiService.fetchCmsReportTypes()
            reportTypes = types
        } catch {
            // Report types are optional
        }
    }

    // MARK: - Filter

    func filterByStatus(_ status: TriageStatusFilter) async {
        selectedFilter = status
        reports = []
        total = 0
        await fetchReports()
    }

    // MARK: - Refresh

    func refresh() async {
        isLoading = false
        await loadReports()
    }

    // MARK: - Convert to Case

    /// Convert a triage report to a case record.
    ///
    /// - Creates a new record via `POST /api/records` with fields pre-filled from the report.
    /// - Links the report to the new record.
    /// - Updates the report's conversion status to `completed`.
    ///
    /// - Parameter report: The report to convert.
    /// - Returns: `true` if conversion succeeded.
    @discardableResult
    func convertToCase(report: ClientReportResponse) async -> Bool {
        isActionInProgress = true
        errorMessage = nil

        do {
            // Step 1: Create a new record from the report
            let createBody = ConvertReportToCaseRequest(
                reportId: report.id,
                title: report.reportTitle,
                reportTypeId: report.reportTypeId
            )

            let _: ConvertReportToCaseResponse = try await apiService.request(
                method: "POST",
                path: apiService.hp("/api/reports/\(report.id)/convert-to-case"),
                body: createBody
            )

            // Reload triage queue
            await refresh()
            isActionInProgress = false
            return true
        } catch {
            errorMessage = error.localizedDescription
            isActionInProgress = false
            return false
        }
    }

    // MARK: - Helpers

    func reportTypeLabel(for typeId: String?) -> String? {
        guard let typeId else { return nil }
        return reportTypes.first { $0.id == typeId }?.label
    }
}

// MARK: - Request/Response Types

struct ConvertReportToCaseRequest: Encodable, Sendable {
    let reportId: String
    let title: String
    let reportTypeId: String?
}

struct ConvertReportToCaseResponse: Codable, Sendable {
    let recordId: String
    let reportId: String
}
