import Foundation

// MARK: - ChannelType

/// Messaging channel types supported by the platform.
enum ChannelType: String, Codable, Sendable, CaseIterable {
    case sms
    case whatsapp
    case signal

    /// SF Symbol icon name for this channel.
    var iconName: String {
        switch self {
        case .sms: return "message.fill"
        case .whatsapp: return "bubble.left.and.text.bubble.right.fill"
        case .signal: return "lock.shield.fill"
        }
    }

    /// Human-readable display name.
    var displayName: String {
        switch self {
        case .sms: return "SMS"
        case .whatsapp: return "WhatsApp"
        case .signal: return "Signal"
        }
    }

    /// Tint color for the channel badge.
    var badgeColorName: String {
        switch self {
        case .sms: return "blue"
        case .whatsapp: return "green"
        case .signal: return "indigo"
        }
    }
}

// MARK: - ConversationStatus

/// Conversation lifecycle states.
enum ConversationStatus: String, Codable, Sendable, CaseIterable {
    case active
    case closed
    case waiting

    var displayName: String {
        switch self {
        case .active: return NSLocalizedString("conversation_status_active", comment: "Active")
        case .closed: return NSLocalizedString("conversation_status_closed", comment: "Closed")
        case .waiting: return NSLocalizedString("conversation_status_waiting", comment: "Waiting")
        }
    }
}

// MARK: - Conversation

/// A messaging conversation (SMS/WhatsApp/Signal) from the API.
/// Matches the protocol spec wire format for conversations.
struct Conversation: Codable, Identifiable, Sendable {
    let id: String
    let channelType: String
    let contactHash: String
    let assignedVolunteerPubkey: String?
    let status: String
    let lastMessageAt: String?
    let unreadCount: Int
    let createdAt: String

    /// Parsed channel type enum.
    var channel: ChannelType {
        ChannelType(rawValue: channelType) ?? .sms
    }

    /// Parsed conversation status enum.
    var conversationStatus: ConversationStatus {
        ConversationStatus(rawValue: status) ?? .active
    }

    /// Truncated contact hash for display.
    var contactDisplayHash: String {
        guard contactHash.count > 12 else { return contactHash }
        return "\(contactHash.prefix(6))...\(contactHash.suffix(4))"
    }

    /// Parsed last message date.
    var lastMessageDate: Date? {
        guard let str = lastMessageAt else { return nil }
        return DateFormatting.parseISO(str)
    }

    /// Parsed creation date.
    var createdDate: Date? {
        DateFormatting.parseISO(createdAt)
    }

    /// Relative time string for the last message.
    var lastMessageRelativeTime: String {
        guard let date = lastMessageDate else { return "" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }

}

// MARK: - ConversationMessage

/// An encrypted message within a conversation, matching the wire format.
struct ConversationMessage: Codable, Identifiable, Sendable {
    let id: String
    let conversationId: String
    let direction: String
    let encryptedContent: String
    let recipientEnvelopes: [NoteRecipientEnvelope]
    let channelType: String
    let createdAt: String
    let readAt: String?

    /// Whether the message has been read.
    var isRead: Bool { readAt != nil }

    /// Whether this is an inbound message.
    var isInbound: Bool { direction == "inbound" }

    /// Parsed channel type.
    var channel: ChannelType {
        ChannelType(rawValue: channelType) ?? .sms
    }
}

// MARK: - DecryptedMessage

/// A fully decrypted message ready for display in the conversation detail view.
struct DecryptedMessage: Identifiable, Sendable {
    let id: String
    let text: String
    let direction: String
    let channelType: String
    let createdAt: Date
    let isRead: Bool

    /// Whether this is an inbound message (from the contact).
    var isInbound: Bool { direction == "inbound" }

    /// Whether this is an outbound message (from the volunteer).
    var isOutbound: Bool { direction == "outbound" }

    /// Parsed channel type.
    var channel: ChannelType {
        ChannelType(rawValue: channelType) ?? .sms
    }

    /// Formatted time string for display alongside the message bubble.
    var timeDisplay: String {
        createdAt.formatted(date: .omitted, time: .shortened)
    }

    /// Full date+time for accessibility and long-press display.
    var fullDateDisplay: String {
        createdAt.formatted(date: .abbreviated, time: .shortened)
    }
}

// MARK: - ConversationsListResponse

/// API response wrapper for the conversations list.
struct ConversationsListResponse: Codable, Sendable {
    let conversations: [Conversation]
}

// MARK: - ConversationMessagesResponse

/// API response wrapper for a conversation's messages.
struct ConversationMessagesResponse: Codable, Sendable {
    let messages: [ConversationMessage]
}

// MARK: - SendMessageRequest

/// Request body for `POST /api/conversations/:id/messages`.
struct SendMessageRequest: Encodable, Sendable {
    let encryptedContent: String
    let recipientEnvelopes: [NoteRecipientEnvelope]
}

// MARK: - MarkReadResponse

/// Response from `POST /api/conversations/:id/read`.
struct MarkReadResponse: Codable, Sendable {
    let ok: Bool
}
