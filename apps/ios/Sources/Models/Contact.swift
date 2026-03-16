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

// MARK: - Contact Detail

/// Full contact profile including linked cases and identifiers.
struct ContactDetail: Codable, Sendable {
    let contactHash: String
    let last4: String?
    let firstSeen: String
    let lastSeen: String
    let callCount: Int
    let conversationCount: Int
    let noteCount: Int
    let reportCount: Int
    let contactType: String?
    let linkedCases: [ContactLinkedCase]?
    let identifiers: [ContactIdentifier]?

    var displayIdentifier: String {
        if let last4 { return "***\(last4)" }
        return String(contactHash.prefix(8)) + "..."
    }
}

/// A case linked to a contact.
struct ContactLinkedCase: Codable, Identifiable, Sendable {
    let id: String
    let caseNumber: String?
    let entityTypeId: String
    let statusHash: String
    let role: String?
    let createdAt: String
}

/// An identifier associated with a contact (phone, email, etc).
struct ContactIdentifier: Codable, Identifiable, Sendable {
    var id: String { type + ":" + (value ?? hash) }
    let type: String
    let hash: String
    let value: String?
    let addedAt: String?
}

struct ContactDetailResponse: Codable, Sendable {
    let contact: ContactDetail
}

// MARK: - Contact Relationship

/// A relationship between two contacts.
struct AppContactRelationship: Codable, Identifiable, Sendable {
    var id: String { relatedContactHash + ":" + relationshipType }
    let relatedContactHash: String
    let relatedLast4: String?
    let relationshipType: String
    let createdAt: String?

    var relatedDisplayIdentifier: String {
        if let relatedLast4 { return "***\(relatedLast4)" }
        return String(relatedContactHash.prefix(8)) + "..."
    }
}

struct AppContactRelationshipsResponse: Codable, Sendable {
    let relationships: [AppContactRelationship]
}

// MARK: - Contact Search Response

struct ContactSearchResponse: Codable, Sendable {
    let contacts: [ContactSummary]
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
        case .call: return .brandPrimary
        case .conversation: return .statusActive
        case .note: return .brandDarkTeal
        case .report: return .brandAccent
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
