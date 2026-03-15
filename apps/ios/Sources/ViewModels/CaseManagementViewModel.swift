import Foundation
import UIKit

// MARK: - CaseManagementViewModel

/// View model for CMS case management. Fetches entity types, records, interactions,
/// contacts, and evidence from the API. Handles status changes, comments, and assignment.
@Observable
final class CaseManagementViewModel {
    private let apiService: APIService
    private let cryptoService: CryptoService

    // MARK: - Public State

    /// Whether CMS is enabled for this hub.
    var cmsEnabled: Bool?

    /// Entity type definitions from the template.
    var entityTypes: [CaseEntityTypeDefinition] = []

    /// Case records from the current query.
    var records: [CaseRecord] = []

    /// Total record count for pagination.
    var totalRecords: Int = 0

    /// Currently selected record for the detail panel.
    var selectedRecord: CaseRecord?

    /// Currently selected entity type for the detail panel.
    var selectedEntityType: CaseEntityTypeDefinition?

    /// Active detail tab.
    var activeTab: DetailTab = .details

    /// Interactions (timeline) for the selected record.
    /// Uses the generated `Interaction` type from protocol codegen (list endpoint response).
    var interactions: [Interaction] = []

    /// Contacts linked to the selected record.
    var contacts: [RecordContact] = []

    /// Evidence items for the selected record.
    /// Uses the generated `Evidence` type from protocol codegen.
    var evidence: [Evidence] = []

    // Filters
    var entityTypeFilter: String? = nil
    var statusFilter: String? = nil
    var currentPage: Int = 1
    let pageSize: Int = 50

    // Loading states
    var isLoading: Bool = false
    var isLoadingDetail: Bool = false
    var isLoadingInteractions: Bool = false
    var isLoadingContacts: Bool = false
    var isLoadingEvidence: Bool = false
    var isActionInProgress: Bool = false

    /// Error message from last failed operation.
    var errorMessage: String?

    /// Whether the status sheet is shown.
    var showStatusSheet: Bool = false

    /// Whether the comment sheet is shown.
    var showCommentSheet: Bool = false

    // MARK: - Computed

    /// All unique statuses across entity types (for filter dropdown).
    var allStatuses: [CaseEnumOption] {
        var seen = Set<String>()
        var result: [CaseEnumOption] = []
        for et in entityTypes {
            for s in et.statuses where !seen.contains(s.value) {
                seen.insert(s.value)
                result.append(s)
            }
        }
        return result
    }

    /// Whether more pages exist.
    var hasMorePages: Bool {
        totalRecords > currentPage * pageSize
    }

    /// Total pages for pagination display.
    var totalPages: Int {
        max(1, Int(ceil(Double(totalRecords) / Double(pageSize))))
    }

    /// Entity type for a given ID.
    func entityType(for id: String) -> CaseEntityTypeDefinition? {
        entityTypes.first { $0.id == id }
    }

    /// Status definition for a record.
    func statusDef(for record: CaseRecord) -> CaseEnumOption? {
        entityType(for: record.entityTypeId)?.statuses.first { $0.value == record.statusHash }
    }

    // MARK: - Init

    init(apiService: APIService, cryptoService: CryptoService) {
        self.apiService = apiService
        self.cryptoService = cryptoService
    }

    // MARK: - Data Loading

    /// Load CMS enabled status + entity types on initial mount.
    func loadInitial() async {
        do {
            let enabled: CaseManagementEnabledResponse = try await apiService.request(
                method: "GET", path: "/api/settings/cms/case-management"
            )
            cmsEnabled = enabled.enabled
        } catch {
            cmsEnabled = false
        }

        guard cmsEnabled == true else { return }

        do {
            let response: EntityTypesResponse = try await apiService.request(
                method: "GET", path: "/api/settings/cms/entity-types"
            )
            entityTypes = response.entityTypes.filter { $0.isArchived != true }
        } catch {
            errorMessage = error.localizedDescription
        }

        await loadRecords()
    }

    /// Fetch records with current filters.
    func loadRecords() async {
        isLoading = true
        defer { isLoading = false }

        var path = "/api/records?page=\(currentPage)&limit=\(pageSize)"
        if let etFilter = entityTypeFilter {
            path += "&entityTypeId=\(etFilter)"
        }
        if let sFilter = statusFilter {
            path += "&statusHash=\(sFilter)"
        }

        do {
            let response: RecordsListResponse = try await apiService.request(
                method: "GET", path: path
            )
            records = response.records
            totalRecords = response.total
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Select a record and load its detail data.
    func selectRecord(_ record: CaseRecord) async {
        selectedRecord = record
        selectedEntityType = entityType(for: record.entityTypeId)
        activeTab = .details

        // Preload timeline
        await loadInteractions(for: record.id)
    }

    /// Refresh all data.
    func refresh() async {
        await loadRecords()
        if let selected = selectedRecord {
            await selectRecord(selected)
        }
    }

    // MARK: - Detail Tab Data

    /// Load interactions (timeline) for a record.
    func loadInteractions(for recordId: String) async {
        isLoadingInteractions = true
        defer { isLoadingInteractions = false }

        do {
            let response: InteractionListResponse = try await apiService.request(
                method: "GET", path: "/api/records/\(recordId)/interactions?limit=100"
            )
            interactions = response.interactions
        } catch {
            interactions = []
        }
    }

    /// Load contacts linked to a record.
    func loadContacts(for recordId: String) async {
        isLoadingContacts = true
        defer { isLoadingContacts = false }

        do {
            let response: RecordContactsResponse = try await apiService.request(
                method: "GET", path: "/api/records/\(recordId)/contacts"
            )
            contacts = response.contacts
        } catch {
            contacts = []
        }
    }

    /// Load evidence for a record.
    func loadEvidence(for recordId: String) async {
        isLoadingEvidence = true
        defer { isLoadingEvidence = false }

        do {
            let response: EvidenceListResponse = try await apiService.request(
                method: "GET", path: "/api/records/\(recordId)/evidence?limit=100"
            )
            evidence = response.evidence
        } catch {
            evidence = []
        }
    }

    // MARK: - Actions

    /// Update record status.
    func updateStatus(recordId: String, newStatus: String) async {
        isActionInProgress = true
        defer { isActionInProgress = false }

        do {
            let _: CaseRecord = try await apiService.request(
                method: "PATCH", path: "/api/records/\(recordId)",
                body: UpdateRecordRequest(statusHash: newStatus, severityHash: nil)
            )
            // Update local state
            if let idx = records.firstIndex(where: { $0.id == recordId }) {
                var updated = records[idx]
                // CaseRecord is a struct — recreate with new status
                let mirror = Mirror(reflecting: updated)
                _ = mirror // Can't mutate directly, reload instead
            }
            await loadRecords()
            if selectedRecord?.id == recordId {
                // Refresh selected record
                do {
                    let fresh: CaseRecord = try await apiService.request(
                        method: "GET", path: "/api/records/\(recordId)"
                    )
                    selectedRecord = fresh
                } catch { /* keep stale */ }
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch {
            errorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }

    /// Add a comment interaction to a record.
    func addComment(recordId: String, text: String) async {
        isActionInProgress = true
        defer { isActionInProgress = false }

        do {
            // Encrypt the comment content
            let encrypted = try cryptoService.encryptMessage(
                plaintext: text,
                readerPubkeys: [] // Server adds admin pubkeys
            )

            let envelopes = encrypted.envelopes.map { env in
                CaseEnvelope(
                    pubkey: env.recipientPubkey,
                    wrappedKey: env.wrappedKey,
                    ephemeralPubkey: env.ephemeralPubkey
                )
            }

            let body = CreateInteractionRequest(
                interactionType: "comment",
                encryptedContent: encrypted.ciphertext,
                contentEnvelopes: envelopes,
                interactionTypeHash: "comment_hash"
            )

            let _: CaseInteraction = try await apiService.request( // Returns full CaseInteraction on create
                method: "POST", path: "/api/records/\(recordId)/interactions",
                body: body
            )

            // Reload timeline
            await loadInteractions(for: recordId)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        } catch {
            errorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }

    /// Assign the current user to a record.
    func assignToMe(recordId: String) async {
        guard let pubkey = cryptoService.pubkey else { return }
        isActionInProgress = true
        defer { isActionInProgress = false }

        do {
            try await apiService.request(
                method: "POST", path: "/api/records/\(recordId)/assign",
                body: AssignRecordRequest(pubkeys: [pubkey])
            )
            await loadRecords()
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Pagination

    func nextPage() async {
        guard hasMorePages else { return }
        currentPage += 1
        await loadRecords()
    }

    func previousPage() async {
        guard currentPage > 1 else { return }
        currentPage -= 1
        await loadRecords()
    }

    func setEntityTypeFilter(_ id: String?) async {
        entityTypeFilter = id
        currentPage = 1
        await loadRecords()
    }

    func setStatusFilter(_ hash: String?) async {
        statusFilter = hash
        currentPage = 1
        await loadRecords()
    }
}

// MARK: - DetailTab

enum DetailTab: String, CaseIterable, Sendable {
    case details = "Details"
    case timeline = "Timeline"
    case contacts = "Contacts"
    case evidence = "Evidence"
}
