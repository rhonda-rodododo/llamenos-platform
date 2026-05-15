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
        // Phone and email are in encrypted identifiers — extract from decrypted identifiers if available
        if let identifiers = contact.identifiers {
            phone = identifiers.first(where: { $0.type == .phone })?.value ?? ""
            email = identifiers.first(where: { $0.type == .email })?.value ?? ""
        }
    }

    func save(hubKey: Data) async throws -> DirectoryContactSummary {
        isSaving = true
        defer { isSaving = false }

        let profile = ContactProfile(
            displayName: displayName.trimmingCharacters(in: .whitespaces),
            phone: phone.isEmpty ? nil : phone,
            email: email.isEmpty ? nil : email,
            tags: tags,
            notes: notes.isEmpty ? nil : notes
        )
        let plaintext = try JSONEncoder().encode(profile)
        let encryptedSummary = plaintext.base64EncodedString()

        let body = CreateContactRequest(
            encryptedSummary: encryptedSummary,
            summaryEnvelopes: [],
            nameHash: nil,
            identifierHashes: []
        )
        return try await apiService.createContact(body)
    }

    func update(contactId: String, hubKey: Data) async throws -> DirectoryContactSummary {
        isSaving = true
        defer { isSaving = false }

        let profile = ContactProfile(
            displayName: displayName.trimmingCharacters(in: .whitespaces),
            phone: phone.isEmpty ? nil : phone,
            email: email.isEmpty ? nil : email,
            tags: tags,
            notes: notes.isEmpty ? nil : notes
        )
        let plaintext = try JSONEncoder().encode(profile)
        let encryptedSummary = plaintext.base64EncodedString()

        let body = UpdateContactRequest(
            encryptedSummary: encryptedSummary,
            summaryEnvelopes: [],
            nameHash: nil,
            identifierHashes: []
        )
        return try await apiService.updateContact(id: contactId, body: body)
    }
}
