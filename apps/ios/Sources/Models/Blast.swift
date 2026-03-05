import SwiftUI

// MARK: - Blast

struct Blast: Identifiable, Codable, Sendable {
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

struct BlastsListResponse: Codable, Sendable {
    let blasts: [Blast]
    let total: Int
}

// MARK: - Blast Status

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
        case .draft: return .secondary
        case .sent: return .blue
        case .scheduled: return .orange
        case .cancelled: return .red
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

// MARK: - Subscriber Stats

struct BlastSubscriberStats: Codable, Sendable {
    let total: Int
    let active: Int
    let paused: Int
    let unsubscribed: Int
}
