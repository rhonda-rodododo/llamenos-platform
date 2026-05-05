import Foundation

// MARK: - Hub (from protocol codegen)
// `HubResponse` is generated from packages/protocol/generated/swift/Types.swift.
// We typealias it as `Hub` for convenience throughout the iOS app.

typealias Hub = HubResponse

extension HubResponse: Identifiable {}
extension HubResponse: Equatable {
    public static func == (lhs: HubResponse, rhs: HubResponse) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - HubStatus display extensions

extension HubStatus {
    var displayName: String {
        switch self {
        case .active:
            return NSLocalizedString("hubs_status_active", comment: "Active")
        case .suspended:
            return NSLocalizedString("hubs_status_suspended", comment: "Suspended")
        case .archived:
            return NSLocalizedString("hubs_status_archived", comment: "Archived")
        }
    }

    var color: String {
        switch self {
        case .active: return "green"
        case .suspended: return "yellow"
        case .archived: return "red"
        }
    }
}

// MARK: - API Responses

/// API response wrapper for the hubs list.
/// Uses `Hub` (= `HubResponse`) for each hub entry.
struct HubsListResponse: Codable, Sendable {
    let hubs: [Hub]
}

struct AppHubResponse: Codable, Sendable {
    let hub: Hub
}

// MARK: - Request Bodies

struct CreateHubRequest: Codable, Sendable {
    let name: String
    let slug: String?
    let description: String?
    let phoneNumber: String?
}

struct UpdateHubRequest: Codable, Sendable {
    let name: String?
    let description: String?
    let phoneNumber: String?
}

// HubKeyEnvelopeResponse and HubKeyEnvelopeResponseEnvelope are generated from
// packages/protocol/generated/swift/Types.swift — do not redefine here.
