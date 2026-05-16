import Foundation
import Observation

@Observable
final class ContactFormViewModel {
    var displayName = ""
    var phone = ""
    var email = ""
    var tags: [String] = []
    var notes = ""
    var isSaving = false
    var error: String?

    private let apiService: ContactsAPIService

    init(apiService: ContactsAPIService = .shared) {
        self.apiService = apiService
    }

    func populate(from contact: DirectoryContact) {
        displayName = contact.displayName
        // Phone/email are in contact.identifiers, not top-level fields
        if let identifiers = contact.identifiers {
            phone = identifiers.first(where: { $0.type == .phone })?.value ?? ""
            email = identifiers.first(where: { $0.type == .email })?.value ?? ""
        }
    }

    func save(hubKey: Data) async throws -> DirectoryContact {
        isSaving = true
        defer { isSaving = false }

        // Stub: real implementation needs HPKE encryption + blind indexes
        let body = CreateContactBody(
            blindIndexes: nil,
            contactTypeHash: nil,
            encryptedPII: nil,
            encryptedSummary: "",
            hubID: "",
            identifierHashes: [],
            nameHash: nil,
            piiEnvelopes: nil,
            statusHash: nil,
            summaryEnvelopes: [],
            tagHashes: nil,
            trigramTokens: nil
        )
        return try await apiService.createContact(body)
    }

    func update(contactId: String, hubKey: Data) async throws -> DirectoryContact {
        isSaving = true
        defer { isSaving = false }

        // Stub: real implementation needs HPKE encryption + blind indexes
        let body = UpdateContactBody(
            blindIndexes: nil,
            contactTypeHash: nil,
            encryptedPII: nil,
            encryptedSummary: nil,
            hubID: nil,
            identifierHashes: nil,
            nameHash: nil,
            piiEnvelopes: nil,
            statusHash: nil,
            summaryEnvelopes: nil,
            tagHashes: nil,
            trigramTokens: nil
        )
        return try await apiService.updateContact(id: contactId, body: body)
    }
}
