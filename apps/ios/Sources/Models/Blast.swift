import SwiftUI

// MARK: - AppBlast
// Client-only: generated `Blast` uses structured `BlastContent` and `BlastStats`
// nested types, while this client model uses inline `[String: [String: String]]`
// for content (matching the actual API response shape for multi-language/channel).

/// Client-side blast model with UI-specific fields and computed properties.
/// Named `AppBlast` to avoid conflict with generated `Blast` from protocol codegen.
struct AppBlast: Identifiable, Codable, Sendable {
    let id: String
    let name: String
    let content: [String: [String: String]]
    let targetChannels: [String]
    let targetTags: [String]
    let targetLanguages: [String]
    let status: String
    let createdAt: String
    let sentAt: String?
    let scheduledAt: String?

    var statusEnum: BlastStatus { BlastStatus(rawValue: status) ?? .draft }

    var messagePreview: String {
        // Extract first available message text
        for (_, channels) in content {
            for (_, text) in channels {
                if !text.isEmpty { return text }
            }
        }
        return NSLocalizedString("blast_no_content", comment: "No message content")
    }
}

/// Client-side API response for the blast list.
/// Named `AppBlastsListResponse` to avoid conflict with generated `BlastListResponse`.
struct AppBlastsListResponse: Codable, Sendable {
    let blasts: [AppBlast]
    let total: Int
}

// MARK: - Blast Status
// Client-only: UI display properties (icon, color, displayName).
// Generated `ProtocolBlastStatus` has the same cases plus `sending`.

enum BlastStatus: String, CaseIterable, Sendable {
    case draft
    case sent
    case scheduled
    case cancelled

    var icon: String {
        switch self {
        case .draft: return "pencil"
        case .sent: return "paperplane.fill"
        case .scheduled: return "clock.fill"
        case .cancelled: return "xmark.circle.fill"
        }
    }

    var color: Color {
        switch self {
        case .draft: return .statusWarning
        case .sent: return .statusActive
        case .scheduled: return .brandAccent
        case .cancelled: return .brandDestructive
        }
    }

    var displayName: String {
        switch self {
        case .draft: return NSLocalizedString("blast_status_draft", comment: "Draft")
        case .sent: return NSLocalizedString("blast_status_sent", comment: "Sent")
        case .scheduled: return NSLocalizedString("blast_status_scheduled", comment: "Scheduled")
        case .cancelled: return NSLocalizedString("blast_status_cancelled", comment: "Cancelled")
        }
    }
}

// MARK: - Create Blast Request

struct CreateBlastRequest: Codable, Sendable {
    let name: String
    let content: [String: [String: String]]
    let targetChannels: [String]
    let targetTags: [String]
    let targetLanguages: [String]
}

// MARK: - Schedule Blast Request

struct ScheduleBlastRequest: Codable, Sendable {
    let scheduledAt: String
}

// MARK: - Subscriber Stats
// Generated `SubscriberStatsResponse` available but has different field shapes.

struct BlastSubscriberStats: Codable, Sendable {
    let total: Int
    let active: Int
    let paused: Int
    let unsubscribed: Int
}
