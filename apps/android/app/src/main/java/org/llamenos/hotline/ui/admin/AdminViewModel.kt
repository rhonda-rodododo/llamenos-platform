package org.llamenos.hotline.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.model.AddBanRequest
import org.llamenos.hotline.model.AuditEntry
import org.llamenos.hotline.model.AuditLogResponse
import org.llamenos.hotline.model.BanEntry
import org.llamenos.hotline.model.BanListResponse
import org.llamenos.hotline.model.BulkBanRequest
import org.llamenos.hotline.model.CreateInviteRequest
import org.llamenos.hotline.model.CreateShiftRequest
import org.llamenos.hotline.model.CreateVolunteerRequest
import org.llamenos.hotline.model.CreateVolunteerResponse
import org.llamenos.hotline.model.CustomFieldDefinition
import org.llamenos.hotline.model.CustomFieldsResponse
import org.llamenos.hotline.model.FallbackGroupRequest
import org.llamenos.hotline.model.Invite
import org.llamenos.hotline.model.InvitesListResponse
import org.llamenos.hotline.model.AdminShiftDetail
import org.llamenos.hotline.model.AdminShiftsListResponse
import org.llamenos.hotline.model.UpdateCustomFieldsRequest
import org.llamenos.hotline.model.Volunteer
import org.llamenos.hotline.model.VolunteersListResponse
import javax.inject.Inject

/**
 * Admin panel tab indices for the TabRow.
 */
enum class AdminTab {
    VOLUNTEERS,
    BANS,
    AUDIT,
    INVITES,
    FIELDS,
}

data class AdminUiState(
    val selectedTab: AdminTab = AdminTab.VOLUNTEERS,

    // Volunteers
    val volunteers: List<Volunteer> = emptyList(),
    val isLoadingVolunteers: Boolean = false,
    val volunteersError: String? = null,
    val volunteerSearchQuery: String = "",
    val showAddVolunteerDialog: Boolean = false,
    val createdVolunteerNsec: String? = null,
    val showDeleteVolunteerDialog: String? = null, // volunteer ID to delete

    // Ban list
    val bans: List<BanEntry> = emptyList(),
    val isLoadingBans: Boolean = false,
    val bansError: String? = null,
    val showAddBanDialog: Boolean = false,
    val showBulkImportDialog: Boolean = false,

    // Audit log
    val auditEntries: List<AuditEntry> = emptyList(),
    val isLoadingAudit: Boolean = false,
    val auditError: String? = null,
    val auditPage: Int = 1,
    val auditTotal: Int = 0,
    val hasMoreAuditPages: Boolean = false,
    val auditSearchQuery: String = "",
    val auditEventFilter: String = "all",

    // Invites
    val invites: List<Invite> = emptyList(),
    val isLoadingInvites: Boolean = false,
    val invitesError: String? = null,
    val showCreateInviteDialog: Boolean = false,
    val createdInviteCode: String? = null,

    // Custom fields
    val customFields: List<CustomFieldDefinition> = emptyList(),
    val isLoadingFields: Boolean = false,
    val fieldsError: String? = null,
    val showCreateFieldDialog: Boolean = false,
    val editingField: CustomFieldDefinition? = null,

    // Admin shifts
    val adminShifts: List<AdminShiftDetail> = emptyList(),
    val isLoadingAdminShifts: Boolean = false,
    val adminShiftsError: String? = null,
    val showCreateShiftDialog: Boolean = false,
    val editingShift: AdminShiftDetail? = null,
)

/**
 * ViewModel for the Admin panel.
 *
 * Provides CRUD operations for volunteers, ban lists, audit logs, and invites.
 * Only accessible to users with admin role. Data is fetched on tab selection
 * to avoid unnecessary API calls.
 */
@HiltViewModel
class AdminViewModel @Inject constructor(
    private val apiService: ApiService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AdminUiState())
    val uiState: StateFlow<AdminUiState> = _uiState.asStateFlow()

    init {
        loadVolunteers()
    }

    /**
     * Switch to a different admin tab and load its data.
     */
    fun selectTab(tab: AdminTab) {
        _uiState.update { it.copy(selectedTab = tab) }
        when (tab) {
            AdminTab.VOLUNTEERS -> loadVolunteers()
            AdminTab.BANS -> loadBans()
            AdminTab.AUDIT -> loadAuditLog(page = 1)
            AdminTab.INVITES -> loadInvites()
            AdminTab.FIELDS -> loadCustomFields()
        }
    }

    // ---- Volunteers ----

    fun loadVolunteers() {
        viewModelScope.launch {
            _uiState.update {
                it.copy(isLoadingVolunteers = true, volunteersError = null)
            }

            try {
                val response = apiService.request<VolunteersListResponse>(
                    "GET",
                    "/api/admin/volunteers",
                )
                _uiState.update {
                    it.copy(
                        volunteers = response.volunteers,
                        isLoadingVolunteers = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingVolunteers = false,
                        volunteersError = e.message ?: "Failed to load volunteers",
                    )
                }
            }
        }
    }

    fun setVolunteerSearchQuery(query: String) {
        _uiState.update { it.copy(volunteerSearchQuery = query) }
    }

    /**
     * Filter volunteers by search query (matches display name or pubkey prefix).
     */
    fun filteredVolunteers(): List<Volunteer> {
        val query = _uiState.value.volunteerSearchQuery.lowercase()
        if (query.isBlank()) return _uiState.value.volunteers

        return _uiState.value.volunteers.filter { volunteer ->
            (volunteer.displayName?.lowercase()?.contains(query) == true) ||
                    volunteer.pubkey.lowercase().contains(query)
        }
    }

    // ---- Ban List ----

    fun loadBans() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingBans = true, bansError = null) }

            try {
                val response = apiService.request<BanListResponse>(
                    "GET",
                    "/api/admin/bans",
                )
                _uiState.update {
                    it.copy(
                        bans = response.bans,
                        isLoadingBans = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingBans = false,
                        bansError = e.message ?: "Failed to load ban list",
                    )
                }
            }
        }
    }

    fun showAddBanDialog() {
        _uiState.update { it.copy(showAddBanDialog = true) }
    }

    fun dismissAddBanDialog() {
        _uiState.update { it.copy(showAddBanDialog = false) }
    }

    fun addBan(identifier: String, reason: String?) {
        viewModelScope.launch {
            _uiState.update { it.copy(showAddBanDialog = false, bansError = null) }

            try {
                val request = AddBanRequest(
                    identifier = identifier,
                    reason = reason?.takeIf { it.isNotBlank() },
                )
                apiService.requestNoContent("POST", "/api/admin/bans", request)
                loadBans()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(bansError = e.message ?: "Failed to add ban")
                }
            }
        }
    }

    fun removeBan(banId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(bansError = null) }

            try {
                apiService.requestNoContent("DELETE", "/api/admin/bans/$banId")
                loadBans()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(bansError = e.message ?: "Failed to remove ban")
                }
            }
        }
    }

    // ---- Audit Log ----

    fun loadAuditLog(page: Int = 1) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingAudit = true, auditError = null) }

            try {
                val response = apiService.request<AuditLogResponse>(
                    "GET",
                    "/api/admin/audit?page=$page&limit=50",
                )

                _uiState.update {
                    val allEntries = if (page == 1) {
                        response.entries
                    } else {
                        it.auditEntries + response.entries
                    }
                    it.copy(
                        auditEntries = allEntries,
                        isLoadingAudit = false,
                        auditPage = page,
                        auditTotal = response.total,
                        hasMoreAuditPages = allEntries.size < response.total,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingAudit = false,
                        auditError = e.message ?: "Failed to load audit log",
                    )
                }
            }
        }
    }

    fun loadNextAuditPage() {
        val state = _uiState.value
        if (!state.hasMoreAuditPages || state.isLoadingAudit) return
        loadAuditLog(page = state.auditPage + 1)
    }

    // ---- Invites ----

    fun loadInvites() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingInvites = true, invitesError = null) }

            try {
                val response = apiService.request<InvitesListResponse>(
                    "GET",
                    "/api/admin/invites",
                )
                _uiState.update {
                    it.copy(
                        invites = response.invites,
                        isLoadingInvites = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingInvites = false,
                        invitesError = e.message ?: "Failed to load invites",
                    )
                }
            }
        }
    }

    fun showCreateInviteDialog() {
        _uiState.update { it.copy(showCreateInviteDialog = true, createdInviteCode = null) }
    }

    fun dismissCreateInviteDialog() {
        _uiState.update { it.copy(showCreateInviteDialog = false, createdInviteCode = null) }
    }

    fun createInvite(role: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(invitesError = null) }

            try {
                val request = CreateInviteRequest(role = role)
                val invite = apiService.request<Invite>(
                    "POST",
                    "/api/admin/invites",
                    request,
                )
                _uiState.update {
                    it.copy(createdInviteCode = invite.code)
                }
                loadInvites()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        invitesError = e.message ?: "Failed to create invite",
                    )
                }
            }
        }
    }

    fun clearCreatedInviteCode() {
        _uiState.update { it.copy(createdInviteCode = null) }
    }

    // ---- Volunteer CRUD ----

    fun showAddVolunteerDialog() {
        _uiState.update { it.copy(showAddVolunteerDialog = true, createdVolunteerNsec = null) }
    }

    fun dismissAddVolunteerDialog() {
        _uiState.update { it.copy(showAddVolunteerDialog = false) }
    }

    fun clearCreatedVolunteerNsec() {
        _uiState.update { it.copy(createdVolunteerNsec = null) }
    }

    fun createVolunteer(name: String, phone: String, role: String = "role-volunteer") {
        viewModelScope.launch {
            _uiState.update { it.copy(showAddVolunteerDialog = false, volunteersError = null) }
            try {
                val request = CreateVolunteerRequest(name = name, phone = phone, role = role)
                val response = apiService.request<CreateVolunteerResponse>(
                    "POST", "/api/admin/volunteers", request,
                )
                _uiState.update { it.copy(createdVolunteerNsec = response.nsec) }
                loadVolunteers()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(volunteersError = e.message ?: "Failed to create volunteer")
                }
            }
        }
    }

    fun showDeleteVolunteerDialog(volunteerId: String) {
        _uiState.update { it.copy(showDeleteVolunteerDialog = volunteerId) }
    }

    fun dismissDeleteVolunteerDialog() {
        _uiState.update { it.copy(showDeleteVolunteerDialog = null) }
    }

    fun deleteVolunteer(volunteerId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(showDeleteVolunteerDialog = null, volunteersError = null) }
            try {
                apiService.requestNoContent("DELETE", "/api/admin/volunteers/$volunteerId")
                loadVolunteers()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(volunteersError = e.message ?: "Failed to delete volunteer")
                }
            }
        }
    }

    // ---- Bulk Ban Import ----

    fun showBulkImportDialog() {
        _uiState.update { it.copy(showBulkImportDialog = true) }
    }

    fun dismissBulkImportDialog() {
        _uiState.update { it.copy(showBulkImportDialog = false) }
    }

    fun bulkImportBans(phones: List<String>, reason: String?) {
        viewModelScope.launch {
            _uiState.update { it.copy(showBulkImportDialog = false, bansError = null) }
            try {
                val request = BulkBanRequest(
                    phones = phones,
                    reason = reason?.takeIf { it.isNotBlank() },
                )
                apiService.requestNoContent("POST", "/api/admin/bans/bulk", request)
                loadBans()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(bansError = e.message ?: "Failed to import bans")
                }
            }
        }
    }

    // ---- Audit Filters ----

    fun setAuditSearchQuery(query: String) {
        _uiState.update { it.copy(auditSearchQuery = query) }
        loadAuditLog(page = 1)
    }

    fun setAuditEventFilter(filter: String) {
        _uiState.update { it.copy(auditEventFilter = filter) }
        loadAuditLog(page = 1)
    }

    fun clearAuditFilters() {
        _uiState.update { it.copy(auditSearchQuery = "", auditEventFilter = "all") }
        loadAuditLog(page = 1)
    }

    // ---- Custom Fields ----

    fun loadCustomFields() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingFields = true, fieldsError = null) }
            try {
                val response = apiService.request<CustomFieldsResponse>(
                    "GET", "/api/admin/custom-fields",
                )
                _uiState.update {
                    it.copy(customFields = response.fields, isLoadingFields = false)
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoadingFields = false, fieldsError = e.message ?: "Failed to load fields")
                }
            }
        }
    }

    fun showCreateFieldDialog() {
        _uiState.update { it.copy(showCreateFieldDialog = true, editingField = null) }
    }

    fun showEditFieldDialog(field: CustomFieldDefinition) {
        _uiState.update { it.copy(showCreateFieldDialog = true, editingField = field) }
    }

    fun dismissFieldDialog() {
        _uiState.update { it.copy(showCreateFieldDialog = false, editingField = null) }
    }

    fun saveCustomField(field: CustomFieldDefinition) {
        viewModelScope.launch {
            _uiState.update { it.copy(showCreateFieldDialog = false, editingField = null, fieldsError = null) }
            try {
                val currentFields = _uiState.value.customFields.toMutableList()
                val existingIndex = currentFields.indexOfFirst { it.id == field.id }
                if (existingIndex >= 0) {
                    currentFields[existingIndex] = field
                } else {
                    currentFields.add(field)
                }
                val request = UpdateCustomFieldsRequest(fields = currentFields)
                apiService.requestNoContent("PUT", "/api/admin/custom-fields", request)
                loadCustomFields()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(fieldsError = e.message ?: "Failed to save field")
                }
            }
        }
    }

    fun deleteCustomField(fieldId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(fieldsError = null) }
            try {
                val updatedFields = _uiState.value.customFields.filter { it.id != fieldId }
                val request = UpdateCustomFieldsRequest(fields = updatedFields)
                apiService.requestNoContent("PUT", "/api/admin/custom-fields", request)
                loadCustomFields()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(fieldsError = e.message ?: "Failed to delete field")
                }
            }
        }
    }

    // ---- Admin Shift Management ----

    fun loadAdminShifts() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingAdminShifts = true, adminShiftsError = null) }
            try {
                val response = apiService.request<AdminShiftsListResponse>(
                    "GET", "/api/admin/shifts",
                )
                _uiState.update {
                    it.copy(adminShifts = response.shifts, isLoadingAdminShifts = false)
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingAdminShifts = false,
                        adminShiftsError = e.message ?: "Failed to load shifts",
                    )
                }
            }
        }
    }

    fun showCreateShiftDialog() {
        _uiState.update { it.copy(showCreateShiftDialog = true, editingShift = null) }
    }

    fun showEditShiftDialog(shift: AdminShiftDetail) {
        _uiState.update { it.copy(showCreateShiftDialog = true, editingShift = shift) }
    }

    fun dismissShiftDialog() {
        _uiState.update { it.copy(showCreateShiftDialog = false, editingShift = null) }
    }

    fun createShift(name: String, startTime: String, endTime: String, volunteerIds: List<String> = emptyList()) {
        viewModelScope.launch {
            _uiState.update { it.copy(showCreateShiftDialog = false, editingShift = null, adminShiftsError = null) }
            try {
                val request = CreateShiftRequest(
                    name = name, startTime = startTime, endTime = endTime, volunteerIds = volunteerIds,
                )
                apiService.requestNoContent("POST", "/api/admin/shifts", request)
                loadAdminShifts()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(adminShiftsError = e.message ?: "Failed to create shift")
                }
            }
        }
    }

    fun updateShift(shiftId: String, name: String, startTime: String, endTime: String, volunteerIds: List<String> = emptyList()) {
        viewModelScope.launch {
            _uiState.update { it.copy(showCreateShiftDialog = false, editingShift = null, adminShiftsError = null) }
            try {
                val request = CreateShiftRequest(
                    name = name, startTime = startTime, endTime = endTime, volunteerIds = volunteerIds,
                )
                apiService.requestNoContent("PUT", "/api/admin/shifts/$shiftId", request)
                loadAdminShifts()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(adminShiftsError = e.message ?: "Failed to update shift")
                }
            }
        }
    }

    fun deleteShift(shiftId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(adminShiftsError = null) }
            try {
                apiService.requestNoContent("DELETE", "/api/admin/shifts/$shiftId")
                loadAdminShifts()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(adminShiftsError = e.message ?: "Failed to delete shift")
                }
            }
        }
    }

    fun setFallbackGroup(volunteerIds: List<String>) {
        viewModelScope.launch {
            _uiState.update { it.copy(adminShiftsError = null) }
            try {
                val request = FallbackGroupRequest(volunteerIds = volunteerIds)
                apiService.requestNoContent("PUT", "/api/admin/shifts/fallback", request)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(adminShiftsError = e.message ?: "Failed to set fallback group")
                }
            }
        }
    }
}
