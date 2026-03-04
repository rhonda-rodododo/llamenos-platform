import Foundation
import SwiftUI

// MARK: - ReportStatus

/// Status of a report in its lifecycle.
enum ReportStatus: String, CaseIterable, Sendable {
    case waiting
    case active
    case closed

    var displayName: String {
        switch self {
        case .waiting: return NSLocalizedString("report_status_waiting", comment: "Waiting")
        case .active: return NSLocalizedString("report_status_active", comment: "Active")
        case .closed: return NSLocalizedString("report_status_closed", comment: "Closed")
        }
    }

    var color: Color {
        switch self {
        case .waiting: return .orange
        case .active: return .blue
        case .closed: return .secondary
        }
    }

    var icon: String {
        switch self {
        case .waiting: return "clock"
        case .active: return "person.fill"
        case .closed: return "checkmark.circle"
        }
    }
}

// MARK: - ReportStatusFilter

/// Filter options for the reports list.
enum ReportStatusFilter: String, CaseIterable, Sendable {
    case all
    case waiting
    case active
    case closed

    var displayName: String {
        switch self {
        case .all: return NSLocalizedString("report_filter_all", comment: "All")
        case .waiting: return NSLocalizedString("report_status_waiting", comment: "Waiting")
        case .active: return NSLocalizedString("report_status_active", comment: "Active")
        case .closed: return NSLocalizedString("report_status_closed", comment: "Closed")
        }
    }
}

// MARK: - ReportMetadata

/// Metadata embedded in a report's conversation record.
struct ReportMetadata: Codable, Sendable {
    let type: String?
    let reportTitle: String?
    let reportCategory: String?
    let linkedCallId: String?
    let reportId: String?
}

// MARK: - ReportResponse

/// Server response for a single report from `GET /api/reports`.
struct ReportResponse: Codable, Identifiable, Sendable {
    let id: String
    let channelType: String
    let contactIdentifierHash: String?
    let assignedTo: String?
    let status: String
    let createdAt: String
    let updatedAt: String?
    let lastMessageAt: String?
    let messageCount: Int
    let metadata: ReportMetadata?

    var reportTitle: String {
        metadata?.reportTitle ?? NSLocalizedString("report_untitled", comment: "Untitled Report")
    }

    var reportCategory: String? { metadata?.reportCategory }

    var statusEnum: ReportStatus { ReportStatus(rawValue: status) ?? .waiting }
}

// MARK: - ReportsListResponse

/// API response wrapper for the reports list.
struct ReportsListResponse: Codable, Sendable {
    let conversations: [ReportResponse]
    let total: Int
}

// MARK: - CreateReportRequest

/// Request body for `POST /api/reports`.
struct CreateReportRequest: Encodable, Sendable {
    let title: String
    let category: String?
    let encryptedContent: String
    let authorEnvelope: NoteKeyEnvelope
    let adminEnvelopes: [NoteRecipientEnvelope]
}

// MARK: - ReportCategoriesResponse

/// API response for `GET /api/reports/categories`.
struct ReportCategoriesResponse: Codable, Sendable {
    let categories: [String]
}

// MARK: - ReportAssignRequest

/// Request body for `POST /api/reports/:id/assign`.
struct ReportAssignRequest: Encodable, Sendable {
    let assignTo: String
}

// MARK: - ReportUpdateRequest

/// Request body for `PATCH /api/reports/:id`.
struct ReportUpdateRequest: Encodable, Sendable {
    let status: String
}
