import Foundation

/// API service for directory contact CRUD operations.
/// Wraps APIService endpoints for encrypted contact management.
final class ContactsAPIService: @unchecked Sendable {
    static let shared = ContactsAPIService()

    private init() {}

    func createContact(_ body: CreateContactRequest) async throws -> DirectoryContactSummary {
        // TODO: Wire to APIService hub contact endpoints once backend routes are finalized
        throw ContactsAPIError.notImplemented
    }

    func updateContact(id: String, body: UpdateContactRequest) async throws -> DirectoryContactSummary {
        throw ContactsAPIError.notImplemented
    }
}

/// Client-side request body for creating a contact (simplified from codegen CreateContactBody).
struct CreateContactRequest: Codable, Sendable {
    let encryptedSummary: String
    let summaryEnvelopes: [ContactEnvelope]
    let nameHash: String?
    let identifierHashes: [String]
}

/// Client-side request body for updating a contact.
struct UpdateContactRequest: Codable, Sendable {
    let encryptedSummary: String?
    let summaryEnvelopes: [ContactEnvelope]?
    let nameHash: String?
    let identifierHashes: [String]?
}

/// Envelope for an encrypted contact field.
struct ContactEnvelope: Codable, Sendable {
    let ct: String
    let enc: String
    let pubkey: String
}

enum ContactsAPIError: LocalizedError {
    case notImplemented

    var errorDescription: String? {
        switch self {
        case .notImplemented:
            return "Contact directory API is not yet available"
        }
    }
}
