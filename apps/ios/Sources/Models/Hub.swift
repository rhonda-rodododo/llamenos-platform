import Foundation

// MARK: - Hub

/// A hub (organization/hotline) that the user belongs to.
struct Hub: Codable, Identifiable, Sendable, Equatable {
    let id: String
    let name: String
    let slug: String
    let description: String?
    let status: HubStatus
    let phoneNumber: String?
    let createdBy: String
    let createdAt: String
    let updatedAt: String
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