import Foundation
import UIKit

// MARK: - NotesViewModel

/// View model for the Notes tab. Fetches encrypted notes from the API, decrypts them
/// using CryptoService, and manages pagination and custom field definitions.
@Observable
final class NotesViewModel {
    private let apiService: HubAPIServiceProtocol
    private let cryptoService: CryptoService

    // MARK: - Public State

    /// Decrypted notes, sorted by creation date (newest first).
    var notes: [DecryptedNote] = []

    /// Custom field definitions fetched from the server.
    var customFields: [CustomFieldDefinition] = []

    /// Whether the initial load is in progress.
    var isLoading: Bool = false

    /// Whether a page load is in progress (for pagination).
    var isLoadingMore: Bool = false

    /// Error message from the last failed operation.
    var errorMessage: String?

    /// Whether there are more notes to load.
    var hasMore: Bool = true

    /// Total number of notes on the server.
    var totalCount: Int = 0

    /// Whether the note creation sheet is shown.
    var showCreateSheet: Bool = false

    // MARK: - Private State

    private var currentPage: Int = 1
    private let pageSize: Int = 50
    private var encryptedNotes: [EncryptedNoteResponse] = []

    // MARK: - Initialization

    init(apiService: HubAPIServiceProtocol, cryptoService: CryptoService) {
        self.apiService = apiService
        self.cryptoService = cryptoService
    }

    // MARK: - Data Loading

    /// Load the first page of notes and custom field definitions.
    func loadNotes() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        currentPage = 1

        async let notesResult: Void = fetchNotesPage(page: 1, replacing: true)
        async let fieldsResult: Void = fetchCustomFields()

        await notesResult
        await fieldsResult

        isLoading = false
    }

    /// Load the next page of notes (pagination).
    func loadMoreNotes() async {
        guard !isLoadingMore, hasMore else { return }
        isLoadingMore = true

        let nextPage = currentPage + 1
        await fetchNotesPage(page: nextPage, replacing: false)

        isLoadingMore = false
    }

    /// Refresh notes (pull-to-refresh).
    func refresh() async {
        isLoading = false
        await loadNotes()
    }

    // MARK: - Note Creation

    /// Encrypt and create a new note.
    ///
    /// - Parameters:
    ///   - text: The note body text.
    ///   - fields: Custom field values keyed by field name.
    ///   - callId: Optional associated call ID.
    ///   - conversationId: Optional associated conversation ID.
    ///   - adminPubkeys: Admin public keys for envelope encryption.
    func createNote(
        text: String,
        fields: [String: AnyCodableValue]?,
        callId: String?,
        conversationId: String?,
        adminPubkeys: [String]
    ) async throws {
        let payload = NotePayload(text: text, fields: fields)
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let payloadJSON = String(data: try encoder.encode(payload), encoding: .utf8) ?? "{}"

        let encryptedNote = try cryptoService.encryptNote(payload: payloadJSON, adminPubkeys: adminPubkeys)

        let request = CreateNoteRequest(
            callId: callId,
            conversationId: conversationId,
            encryptedContent: encryptedNote.encryptedContent,
            authorEnvelope: NoteKeyEnvelope(
                ephemeralPubkey: encryptedNote.authorEnvelope.ephemeralPubkey,
                wrappedKey: encryptedNote.authorEnvelope.wrappedKey
            ),
            adminEnvelopes: encryptedNote.adminEnvelopes.map { env in
                NoteRecipientEnvelope(
                    ephemeralPubkey: env.ephemeralPubkey,
                    pubkey: env.pubkey,
                    wrappedKey: env.wrappedKey
                )
            }
        )

        let _: EncryptedNoteResponse = try await apiService.request(
            method: "POST",
            path: apiService.hp("/api/notes"),
            body: request
        )

        // Haptic feedback on success
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()

        // Reload notes to include the new one
        await refresh()
    }

    // MARK: - Note Decryption

    /// Find the matching envelope for our pubkey and decrypt the note.
    func decryptNote(_ encrypted: EncryptedNoteResponse) -> DecryptedNote? {
        guard let ourPubkey = cryptoService.pubkey else { return nil }

        // Find our envelope — check author envelope first (volunteer's own note)
        var wrappedKey: String?
        var ephemeralPubkey: String?

        if encrypted.authorPubkey == ourPubkey, let authorEnv = encrypted.authorEnvelope {
            wrappedKey = authorEnv.wrappedKey
            ephemeralPubkey = authorEnv.ephemeralPubkey
        }

        // Then check admin envelopes
        if wrappedKey == nil, let adminEnvs = encrypted.adminEnvelopes {
            if let ourEnvelope = adminEnvs.first(where: { $0.pubkey == ourPubkey }) {
                wrappedKey = ourEnvelope.wrappedKey
                ephemeralPubkey = ourEnvelope.ephemeralPubkey
            }
        }

        guard let wk = wrappedKey, let epk = ephemeralPubkey else {
            // No envelope for us — we can't decrypt this note
            return nil
        }

        do {
            let decryptedJSON = try cryptoService.decryptNoteContent(
                encryptedContent: encrypted.encryptedContent,
                wrappedKey: wk,
                ephemeralPubkey: epk
            )

            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            let payload = try decoder.decode(NotePayload.self, from: Data(decryptedJSON.utf8))

            return DecryptedNote(
                id: encrypted.id,
                payload: payload,
                authorPubkey: encrypted.authorPubkey,
                callId: encrypted.callID,
                conversationId: encrypted.conversationID,
                createdAt: DateFormatting.parseISO(encrypted.createdAt) ?? Date(),
                updatedAt: DateFormatting.parseISO(encrypted.updatedAt)
            )
        } catch {
            // Decryption failed — return nil (note won't appear in list)
            return nil
        }
    }

    // MARK: - Private Helpers

    private func fetchNotesPage(page: Int, replacing: Bool) async {
        do {
            let response: NotesListResponse = try await apiService.request(
                method: "GET",
                path: apiService.hp("/api/notes?page=\(page)&limit=\(pageSize)")
            )

            if replacing {
                encryptedNotes = response.notes
            } else {
                encryptedNotes.append(contentsOf: response.notes)
            }

            totalCount = response.total
            currentPage = page
            hasMore = encryptedNotes.count < response.total

            // Decrypt all notes
            notes = encryptedNotes.compactMap(decryptNote)
        } catch {
            if case APIError.noBaseURL = error {
                // Hub not configured — show empty state, no error
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func fetchCustomFields() async {
        do {
            let response: CustomFieldsResponse = try await apiService.request(
                method: "GET",
                path: apiService.hp("/api/settings/custom-fields")
            )
            customFields = response.fields
                .filter { $0.visibleToVolunteers }
                .sorted { $0.order < $1.order }
        } catch {
            // Custom fields are optional — silently continue without them
            customFields = []
        }
    }

}
