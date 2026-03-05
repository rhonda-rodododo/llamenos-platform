import Foundation
import UIKit

// MARK: - AdminTab

/// Sub-tabs within the admin section.
enum AdminTab: String, CaseIterable, Sendable {
    case volunteers
    case bans
    case auditLog
    case invites
    case customFields

    var title: String {
        switch self {
        case .volunteers: return NSLocalizedString("admin_tab_volunteers", comment: "Volunteers")
        case .bans: return NSLocalizedString("admin_tab_bans", comment: "Ban List")
        case .auditLog: return NSLocalizedString("admin_tab_audit", comment: "Audit Log")
        case .invites: return NSLocalizedString("admin_tab_invites", comment: "Invites")
        case .customFields: return NSLocalizedString("admin_tab_fields", comment: "Fields")
        }
    }

    var icon: String {
        switch self {
        case .volunteers: return "person.3.fill"
        case .bans: return "hand.raised.fill"
        case .auditLog: return "list.clipboard.fill"
        case .invites: return "envelope.open.fill"
        case .customFields: return "list.bullet.rectangle.fill"
        }
    }
}

// MARK: - AdminViewModel

/// View model for admin management screens. Handles CRUD operations for
/// volunteers, bans, audit log, and invite codes.
@Observable
final class AdminViewModel {
    private let apiService: APIService
    private let cryptoService: CryptoService

    // MARK: - Volunteers State

    /// All volunteers/members from the server.
    var volunteers: [Volunteer] = []

    /// Filtered volunteers based on search text.
    var filteredVolunteers: [Volunteer] {
        if volunteerSearchText.isEmpty {
            return volunteers
        }
        let query = volunteerSearchText.lowercased()
        return volunteers.filter { vol in
            (vol.displayName?.lowercased().contains(query) ?? false)
                || vol.pubkey.lowercased().contains(query)
                || vol.role.lowercased().contains(query)
        }
    }

    /// Search text for volunteer filtering.
    var volunteerSearchText: String = ""

    /// Whether volunteers are loading.
    var isLoadingVolunteers: Bool = false

    // MARK: - Ban List State

    /// All ban entries from the server.
    var bans: [BanEntry] = []

    /// Whether bans are loading.
    var isLoadingBans: Bool = false

    /// Whether the add ban sheet is showing.
    var showAddBanSheet: Bool = false

    /// Input for new ban identifier hash.
    var newBanIdentifierHash: String = ""

    /// Input for new ban reason.
    var newBanReason: String = ""

    // MARK: - Audit Log State

    /// Audit log entries from the server.
    var auditEntries: [AuditEntry] = []

    /// Total count of audit entries for pagination.
    var auditTotal: Int = 0

    /// Whether audit entries are loading.
    var isLoadingAudit: Bool = false

    /// Whether more audit entries are loading (pagination).
    var isLoadingMoreAudit: Bool = false

    /// Whether there are more audit entries to load.
    var hasMoreAudit: Bool = true

    /// Current audit log page.
    private var auditPage: Int = 1
    private let auditPageSize: Int = 50

    // MARK: - Invites State

    /// All invite codes from the server.
    var invites: [Invite] = []

    /// Whether invites are loading.
    var isLoadingInvites: Bool = false

    /// Whether the create invite sheet is showing.
    var showCreateInviteSheet: Bool = false

    /// Selected role for new invite.
    var newInviteRole: UserRole = .volunteer

    // MARK: - Custom Fields State

    /// All custom field definitions.
    var customFields: [CustomFieldDefinition] = []

    /// Whether custom fields are loading.
    var isLoadingFields: Bool = false

    /// Whether the field editor sheet is showing.
    var showFieldEditor: Bool = false

    /// The field being edited (nil for create).
    var editingField: CustomFieldDefinition?

    // MARK: - Shared State

    /// Error message from the last failed operation.
    var errorMessage: String?

    /// Success message for completed actions.
    var successMessage: String?

    /// Whether a destructive action confirmation is showing.
    var showDeleteConfirmation: Bool = false

    /// The ID of the item pending deletion.
    var pendingDeleteId: String?

    /// Type of pending deletion.
    var pendingDeleteType: DeleteType?

    // MARK: - Initialization

    init(apiService: APIService, cryptoService: CryptoService) {
        self.apiService = apiService
        self.cryptoService = cryptoService
    }

    // MARK: - Volunteers

    /// Load all volunteers from the API.
    func loadVolunteers() async {
        guard !isLoadingVolunteers else { return }
        isLoadingVolunteers = true
        errorMessage = nil

        do {
            let response: VolunteersListResponse = try await apiService.request(
                method: "GET",
                path: "/api/identity/members"
            )
            volunteers = response.members.sorted { lhs, rhs in
                // Admins first, then by display name
                if lhs.role != rhs.role {
                    return lhs.userRole == .admin
                }
                return (lhs.displayName ?? lhs.pubkey) < (rhs.displayName ?? rhs.pubkey)
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoadingVolunteers = false
    }

    /// Update a volunteer's role.
    func updateVolunteerRole(pubkey: String, newRole: UserRole) async {
        errorMessage = nil
        successMessage = nil

        do {
            let request = UpdateRoleRequest(role: newRole.rawValue)
            try await apiService.request(
                method: "PATCH",
                path: "/api/identity/\(pubkey)/role",
                body: request
            )

            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)

            successMessage = NSLocalizedString("admin_role_updated", comment: "Role updated successfully")
            await loadVolunteers()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Bans

    /// Load the ban list from the API.
    func loadBans() async {
        guard !isLoadingBans else { return }
        isLoadingBans = true
        errorMessage = nil

        do {
            let response: BanListResponse = try await apiService.request(
                method: "GET",
                path: "/api/bans"
            )
            bans = response.bans.sorted { lhs, rhs in
                (lhs.createdDate ?? Date.distantPast) > (rhs.createdDate ?? Date.distantPast)
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoadingBans = false
    }

    /// Add a new ban entry.
    func addBan() async {
        let hash = newBanIdentifierHash.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !hash.isEmpty else {
            errorMessage = NSLocalizedString("admin_ban_hash_required", comment: "Identifier hash is required")
            return
        }

        errorMessage = nil
        successMessage = nil

        do {
            let reason = newBanReason.trimmingCharacters(in: .whitespacesAndNewlines)
            let request = CreateBanRequest(
                identifierHash: hash,
                reason: reason.isEmpty ? nil : reason
            )
            try await apiService.request(
                method: "POST",
                path: "/api/bans",
                body: request
            )

            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)

            newBanIdentifierHash = ""
            newBanReason = ""
            showAddBanSheet = false
            successMessage = NSLocalizedString("admin_ban_added", comment: "Ban entry added")
            await loadBans()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Remove a ban entry.
    func removeBan(id: String) async {
        errorMessage = nil
        successMessage = nil

        do {
            try await apiService.request(
                method: "DELETE",
                path: "/api/bans/\(id)"
            )

            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)

            successMessage = NSLocalizedString("admin_ban_removed", comment: "Ban entry removed")
            await loadBans()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Audit Log

    /// Load the first page of audit log entries.
    func loadAuditLog() async {
        guard !isLoadingAudit else { return }
        isLoadingAudit = true
        errorMessage = nil
        auditPage = 1

        do {
            let response: AuditLogResponse = try await apiService.request(
                method: "GET",
                path: "/api/audit?page=1&limit=\(auditPageSize)"
            )
            auditEntries = response.entries
            auditTotal = response.total
            hasMoreAudit = auditEntries.count < response.total
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoadingAudit = false
    }

    /// Load the next page of audit log entries.
    func loadMoreAuditEntries() async {
        guard !isLoadingMoreAudit, hasMoreAudit else { return }
        isLoadingMoreAudit = true

        let nextPage = auditPage + 1

        do {
            let response: AuditLogResponse = try await apiService.request(
                method: "GET",
                path: "/api/audit?page=\(nextPage)&limit=\(auditPageSize)"
            )
            auditEntries.append(contentsOf: response.entries)
            auditPage = nextPage
            auditTotal = response.total
            hasMoreAudit = auditEntries.count < response.total
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoadingMoreAudit = false
    }

    // MARK: - Invites

    /// Load all invite codes from the API.
    func loadInvites() async {
        guard !isLoadingInvites else { return }
        isLoadingInvites = true
        errorMessage = nil

        do {
            let response: InvitesListResponse = try await apiService.request(
                method: "GET",
                path: "/api/identity/invites"
            )
            invites = response.invites.sorted { lhs, rhs in
                (lhs.createdDate ?? Date.distantPast) > (rhs.createdDate ?? Date.distantPast)
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoadingInvites = false
    }

    /// Generate a new invite code.
    func createInvite() async {
        errorMessage = nil
        successMessage = nil

        do {
            let request = CreateInviteRequest(role: newInviteRole.rawValue)
            let _: Invite = try await apiService.request(
                method: "POST",
                path: "/api/identity/invite",
                body: request
            )

            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)

            showCreateInviteSheet = false
            successMessage = NSLocalizedString("admin_invite_created", comment: "Invite code created")
            await loadInvites()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Custom Fields

    /// Load custom field definitions from the API.
    func loadCustomFields() async {
        guard !isLoadingFields else { return }
        isLoadingFields = true
        errorMessage = nil

        do {
            let response: CustomFieldsResponse = try await apiService.request(
                method: "GET",
                path: "/api/settings/custom-fields?role=admin"
            )
            customFields = response.fields.sorted { $0.order < $1.order }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoadingFields = false
    }

    /// Save the entire custom fields list (PUT replaces all).
    func saveCustomFields() async {
        errorMessage = nil
        successMessage = nil

        do {
            let body = ["fields": customFields]
            try await apiService.request(
                method: "PUT",
                path: "/api/settings/custom-fields",
                body: body
            )

            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)

            successMessage = NSLocalizedString("admin_fields_saved", comment: "Custom fields saved")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Add or update a field in the local list, then save to server.
    func saveField(_ field: CustomFieldDefinition) async {
        if let index = customFields.firstIndex(where: { $0.id == field.id }) {
            customFields[index] = field
        } else {
            customFields.append(field)
        }
        await saveCustomFields()
        showFieldEditor = false
        editingField = nil
    }

    /// Delete a field by ID, then save to server.
    func deleteField(id: String) async {
        customFields.removeAll { $0.id == id }
        await saveCustomFields()
    }

    // MARK: - Deletion Confirmation

    /// Request confirmation for a destructive action.
    func confirmDelete(id: String, type: DeleteType) {
        pendingDeleteId = id
        pendingDeleteType = type
        showDeleteConfirmation = true
    }

    /// Execute the confirmed deletion.
    func executeDelete() async {
        guard let id = pendingDeleteId, let type = pendingDeleteType else { return }

        switch type {
        case .ban:
            await removeBan(id: id)
        }

        pendingDeleteId = nil
        pendingDeleteType = nil
        showDeleteConfirmation = false
    }

    /// Cancel the pending deletion.
    func cancelDelete() {
        pendingDeleteId = nil
        pendingDeleteType = nil
        showDeleteConfirmation = false
    }
}

// MARK: - DeleteType

/// Types of items that can be deleted in the admin section.
enum DeleteType: Sendable {
    case ban
}
