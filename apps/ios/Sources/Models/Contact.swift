import SwiftUI

// MARK: - Contact Summary

struct ContactSummary: Identifiable, Codable, Sendable {
    var id: String { contactHash }
    let contactHash: String
    let last4: String?
    let firstSeen: String
    let lastSeen: String
    let callCount: Int
    let conversationCount: Int
    let noteCount: Int
    let reportCount: Int

    var displayIdentifier: String {
        if let last4 { return "***\(last4)" }
        return String(contactHash.prefix(8)) + "..."
    }

    var totalInteractions: Int {
        callCount + conversationCount + noteCount + reportCount
    }
}

struct ContactsListResponse: Codable, Sendable {
    let contacts: [ContactSummary]
    let total: Int
}

// MARK: - Timeline Event

struct ContactTimelineEvent: Identifiable, Codable, Sendable {
    let id: String
    let type: String
    let timestamp: String
    let summary: String?
    let status: String?
    let duration: Int?

    var eventType: ContactEventType { ContactEventType(rawValue: type) ?? .call }
}

struct ContactTimelineResponse: Codable, Sendable {
    let events: [ContactTimelineEvent]
    let total: Int
}

// MARK: - Event Type

enum ContactEventType: String, CaseIterable, Sendable {
    case call
    case conversation
    case note
    case report

    var icon: String {
        switch self {
        case .call: return "phone.fill"
        case .conversation: return "message.fill"
        case .note: return "doc.text.fill"
        case .report: return "exclamationmark.triangle.fill"
        }
    }

    var color: Color {
        switch self {
        case .call: return .blue
        case .conversation: return .green
        case .note: return .purple
        case .report: return .orange
        }
    }

    var displayName: String {
        switch self {
        case .call: return NSLocalizedString("event_type_call", comment: "Call")
        case .conversation: return NSLocalizedString("event_type_conversation", comment: "Conversation")
        case .note: return NSLocalizedString("event_type_note", comment: "Note")
        case .report: return NSLocalizedString("event_type_report", comment: "Report")
        }
    }
}
