import Foundation

/// Stub API service for directory contacts (EP06).
/// Full implementation pending backend integration.
@Observable
final class ContactsAPIService: Sendable {
    static let shared = ContactsAPIService()

    func createContact(_ body: CreateContactBody) async throws -> DirectoryContact {
        throw ContactsAPIError.notImplemented
    }

    func updateContact(id: String, body: UpdateContactBody) async throws -> DirectoryContact {
        throw ContactsAPIError.notImplemented
    }
}

enum ContactsAPIError: Error, LocalizedError {
    case notImplemented

    var errorDescription: String? {
        switch self {
        case .notImplemented:
            return "Contact API not yet available"
        }
    }
}
