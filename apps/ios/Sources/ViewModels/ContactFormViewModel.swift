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
        phone = contact.phone ?? ""
        email = contact.email ?? ""
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
        let encryptedProfile = try cryptoService.encryptHpke(plaintext: plaintext, hubKey: hubKey)

        // Blind indexes
        let nameIndex = try cryptoService.hmacContactName(displayName, hubKey: hubKey)
        let phoneIndex = phone.isEmpty ? nil : (try cryptoService.hmacContactPhone(phone, hubKey: hubKey))

        let body = CreateContactBody(
            encryptedProfile: encryptedProfile.base64EncodedString(),
            profileEnvelopes: [],
            blindIndexes: ContactBlindIndexes(nameTokens: [nameIndex], phoneToken: phoneIndex)
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
        let encryptedProfile = try cryptoService.encryptHpke(plaintext: plaintext, hubKey: hubKey)
        let nameIndex = try cryptoService.hmacContactName(displayName, hubKey: hubKey)
        let phoneIndex = phone.isEmpty ? nil : (try cryptoService.hmacContactPhone(phone, hubKey: hubKey))

        let body = UpdateContactBody(
            encryptedProfile: encryptedProfile.base64EncodedString(),
            profileEnvelopes: [],
            blindIndexes: ContactBlindIndexes(nameTokens: [nameIndex], phoneToken: phoneIndex)
        )
        return try await apiService.updateContact(id: contactId, body: body)
    }
}
