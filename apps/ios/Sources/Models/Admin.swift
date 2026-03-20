import Foundation

// MARK: - UserRole

/// Roles in the system, matching the protocol spec.
enum UserRole: String, Codable, Sendable, CaseIterable {
    case volunteer
    case admin

    var displayName: String {
        switch self {
        case .volunteer: return NSLocalizedString("role_volunteer", comment: "Volunteer")
        case .admin: return NSLocalizedString("role_admin", comment: "Admin")
        }
    }

    var badgeColor: String {
        switch self {
        case .volunteer: return "blue"
        case .admin: return "purple"
        }
    }
}

// MARK: - ClientUserStatus

/// User account status (client-side enum with UI properties).
/// Named `ClientUserStatus` to avoid conflict with generated `UserStatus`.
enum ClientUserStatus: String, Codable, Sendable, CaseIterable {
    case active
    case inactive
    case suspended

    var displayName: String {
        switch self {
        case .active: return NSLocalizedString("status_active", comment: "Active")
        case .inactive: return NSLocalizedString("status_inactive", comment: "Inactive")
        case .suspended: return NSLocalizedString("status_suspended", comment: "Suspended")
        }
    }
}

// MARK: - ClientUser

/// A user/admin member from the API (client-side model with UI properties).
/// Named `ClientUser` to avoid conflict with generated `User`.
struct ClientUser: Codable, Identifiable, Sendable {
    let id: String
    let pubkey: String
    let displayName: String?
    let role: String
    let status: String
    let createdAt: String

    /// Parsed role enum.
    var userRole: UserRole {
        UserRole(rawValue: role) ?? .volunteer
    }

    /// Parsed status enum.
    var userStatus: ClientUserStatus {
        ClientUserStatus(rawValue: status) ?? .active
    }

    /// Display name or truncated pubkey.
    var displayLabel: String {
        if let name = displayName, !name.isEmpty {
            return name
        }
        return truncatedPubkey
    }

    /// Truncated pubkey for display.
    var truncatedPubkey: String {
        guard pubkey.count > 16 else { return pubkey }
        return "\(pubkey.prefix(8))...\(pubkey.suffix(6))"
    }

    /// Parsed creation date.
    var createdDate: Date? {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoFormatter.date(from: createdAt) { return date }
        isoFormatter.formatOptions = [.withInternetDateTime]
        return isoFormatter.date(from: createdAt)
    }
}

// MARK: - AppBanEntry

/// A ban list entry from the API (client-side model with UI properties).
/// Named `AppBanEntry` to avoid conflict with generated `Ban`/`BanResponse`.
struct AppBanEntry: Codable, Identifiable, Sendable {
    let id: String
    let identifierHash: String
    let reason: String?
    let createdBy: String
    let createdAt: String

    /// Truncated identifier hash for display.
    var truncatedHash: String {
        guard identifierHash.count > 16 else { return identifierHash }
        return "\(identifierHash.prefix(8))...\(identifierHash.suffix(6))"
    }

    /// Truncated creator pubkey for display.
    var creatorDisplay: String {
        guard createdBy.count > 16 else { return createdBy }
        return "\(createdBy.prefix(8))...\(createdBy.suffix(6))"
    }

    /// Parsed creation date.
    var createdDate: Date? {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoFormatter.date(from: createdAt) { return date }
        isoFormatter.formatOptions = [.withInternetDateTime]
        return isoFormatter.date(from: createdAt)
    }
}

// MARK: - AppAuditEntry

/// A hash-chained audit log entry from the API (client-side model with UI properties).
/// Named `AppAuditEntry` to avoid conflict with generated `AuditEntryResponse`/`Entry`.
struct AppAuditEntry: Codable, Identifiable, Sendable {
    let id: String
    let action: String
    let actorPubkey: String
    let details: String?
    let entryHash: String
    let previousEntryHash: String?
    let timestamp: String

    /// Truncated actor pubkey for display.
    var actorDisplay: String {
        guard actorPubkey.count > 16 else { return actorPubkey }
        return "\(actorPubkey.prefix(8))...\(actorPubkey.suffix(6))"
    }

    /// Truncated entry hash for display.
    var truncatedEntryHash: String {
        guard entryHash.count > 16 else { return entryHash }
        return "\(entryHash.prefix(8))...\(entryHash.suffix(6))"
    }

    /// Parsed timestamp.
    var timestampDate: Date? {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoFormatter.date(from: timestamp) { return date }
        isoFormatter.formatOptions = [.withInternetDateTime]
        return isoFormatter.date(from: timestamp)
    }

    /// Human-readable action description.
    var actionDisplay: String {
        action.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

// MARK: - AppInvite

/// An invite code from the API (client-side model with UI properties).
/// Named `AppInvite` to avoid conflict with generated `Invite` from protocol codegen.
struct AppInvite: Codable, Identifiable, Sendable {
    let id: String
    let code: String
    let role: String
    let createdBy: String
    let claimedBy: String?
    let expiresAt: String
    let createdAt: String

    /// Whether this invite has been claimed.
    var isClaimed: Bool { claimedBy != nil }

    /// Whether this invite has expired.
    var isExpired: Bool {
        guard let date = expiresDate else { return false }
        return date < Date()
    }

    /// Whether this invite is currently usable (not claimed and not expired).
    var isActive: Bool { !isClaimed && !isExpired }

    /// Parsed role enum.
    var inviteRole: UserRole {
        UserRole(rawValue: role) ?? .volunteer
    }

    /// Parsed expiry date.
    var expiresDate: Date? {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoFormatter.date(from: expiresAt) { return date }
        isoFormatter.formatOptions = [.withInternetDateTime]
        return isoFormatter.date(from: expiresAt)
    }

    /// Parsed creation date.
    var createdDate: Date? {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoFormatter.date(from: createdAt) { return date }
        isoFormatter.formatOptions = [.withInternetDateTime]
        return isoFormatter.date(from: createdAt)
    }

    /// Truncated creator pubkey.
    var creatorDisplay: String {
        guard createdBy.count > 16 else { return createdBy }
        return "\(createdBy.prefix(8))...\(createdBy.suffix(6))"
    }
}

// MARK: - API Response Types

/// API response for the users list.
struct UsersListResponse: Codable, Sendable {
    let members: [ClientUser]
}

/// API response for the ban list (client-side).
/// Named `AppBanListResponse` to avoid conflict with generated `BanListResponse`.
struct AppBanListResponse: Codable, Sendable {
    let bans: [AppBanEntry]
}

/// API response for the audit log.
struct AuditLogResponse: Codable, Sendable {
    let entries: [AppAuditEntry]
    let total: Int
}

/// API response for the invites list.
struct InvitesListResponse: Codable, Sendable {
    let invites: [AppInvite]
}

// MARK: - Request Types

/// Request body for `POST /api/identity/invite`.
struct CreateInviteRequest: Encodable, Sendable {
    let role: String
}

/// Request body for `POST /api/bans`.
struct CreateBanRequest: Encodable, Sendable {
    let identifierHash: String
    let reason: String?
}

/// Request body for `PATCH /api/identity/:pubkey/role`.
struct UpdateRoleRequest: Encodable, Sendable {
    let role: String
}

// MARK: - Report Category

/// A report category from the API.
struct ReportCategory: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let createdAt: String?

    /// Parsed creation date.
    var createdDate: Date? {
        guard let createdAt else { return nil }
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = isoFormatter.date(from: createdAt) { return date }
        isoFormatter.formatOptions = [.withInternetDateTime]
        return isoFormatter.date(from: createdAt)
    }
}

/// API response from `GET /api/settings/report-types`.
struct ReportTypesResponse: Codable, Sendable {
    let reportTypes: [ReportCategory]
}

/// Request body for `POST /api/settings/report-types`.
struct CreateReportCategoryRequest: Encodable, Sendable {
    let name: String
}

// MARK: - Client Telephony Provider

/// Supported telephony providers (client-side enum with UI properties).
/// Named `ClientTelephonyProvider` to avoid conflict with generated `TelephonyProvider`.
enum ClientTelephonyProvider: String, Codable, Sendable, CaseIterable {
    case twilio
    case signalwire
    case vonage
    case plivo
    case asterisk

    var displayName: String {
        switch self {
        case .twilio: return "Twilio"
        case .signalwire: return "SignalWire"
        case .vonage: return "Vonage"
        case .plivo: return "Plivo"
        case .asterisk: return "Asterisk"
        }
    }
}

/// Telephony provider configuration from the API.
struct TelephonySettings: Codable, Sendable {
    var provider: String
    var accountSid: String
    var authToken: String
    var phoneNumber: String

    /// Parsed provider enum.
    var telephonyProvider: ClientTelephonyProvider {
        get { ClientTelephonyProvider(rawValue: provider) ?? .twilio }
        set { provider = newValue.rawValue }
    }
}

// MARK: - Client Call Settings

/// Call routing configuration from the API (client-side model).
/// Named `ClientCallSettings` to avoid conflict with generated `CallSettings`.
struct ClientCallSettings: Codable, Sendable {
    var ringTimeout: Int
    var maxDuration: Int
    var parallelRingCount: Int
}

// MARK: - Client IVR Languages

/// IVR language configuration from the API (client-side model).
/// Named `ClientIvrLanguages` to avoid conflict with generated `IvrLanguages`.
struct ClientIvrLanguages: Codable, Sendable {
    var languages: [String: Bool]
}

// MARK: - Client Transcription Settings

/// Transcription configuration from the API (client-side model).
/// Named `ClientTranscriptionSettings` to avoid conflict with generated `TranscriptionSettings`.
struct ClientTranscriptionSettings: Codable, Sendable {
    var enabled: Bool
    var allowVolunteerOptOut: Bool
}

// MARK: - Client Spam Settings

/// Spam mitigation configuration from the API (client-side model).
/// Named `ClientSpamSettings` to avoid conflict with generated `SpamSettings`.
struct ClientSpamSettings: Codable, Sendable {
    var maxCallsPerHour: Int
    var voiceCaptchaEnabled: Bool
    var knownNumberBypass: Bool
}

// MARK: - System Health

/// System health dashboard data from the API.
struct SystemHealth: Codable, Sendable {
    let server: ServiceStatus
    let services: ServiceStatus
    let calls: ServiceStatus
    let storage: ServiceStatus
    let backup: ServiceStatus
    let volunteers: ServiceStatus
}

/// Status of an individual service or subsystem.
struct ServiceStatus: Codable, Sendable {
    let name: String
    let status: String
    let details: String?

    /// Parsed status for display.
    var healthLevel: HealthLevel {
        switch status.lowercased() {
        case "healthy", "ok", "up": return .healthy
        case "degraded", "warning", "slow": return .degraded
        default: return .critical
        }
    }
}

/// Health level for status indicators.
enum HealthLevel: Sendable {
    case healthy
    case degraded
    case critical

    var color: String {
        switch self {
        case .healthy: return "green"
        case .degraded: return "yellow"
        case .critical: return "red"
        }
    }

    var icon: String {
        switch self {
        case .healthy: return "checkmark.circle.fill"
        case .degraded: return "exclamationmark.triangle.fill"
        case .critical: return "xmark.circle.fill"
        }
    }
}
