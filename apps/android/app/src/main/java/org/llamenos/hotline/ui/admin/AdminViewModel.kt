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
import org.llamenos.hotline.model.CallSettingsRequest
import org.llamenos.hotline.model.CallSettingsResponse
import org.llamenos.hotline.model.CreateInviteRequest
import org.llamenos.hotline.model.CreateReportCategoryRequest
import org.llamenos.hotline.model.CreateShiftRequest
import org.llamenos.hotline.model.CreateUserRequest
import org.llamenos.hotline.model.CreateUserResponse
import org.llamenos.hotline.model.CustomFieldDefinition
import org.llamenos.hotline.model.CustomFieldsResponse
import org.llamenos.hotline.model.FallbackGroupRequest
import org.llamenos.hotline.model.Invite
import org.llamenos.hotline.model.InvitesListResponse
import org.llamenos.hotline.model.IvrLanguagesRequest
import org.llamenos.hotline.model.IvrLanguagesResponse
import org.llamenos.hotline.model.AdminShiftDetail
import org.llamenos.hotline.model.AdminShiftsListResponse
import org.llamenos.hotline.model.ReportCategory
import org.llamenos.hotline.model.ReportTypesResponse
import org.llamenos.hotline.model.SpamSettingsRequest
import org.llamenos.hotline.model.SpamSettingsResponse
import org.llamenos.hotline.model.SystemHealth
import org.llamenos.hotline.model.TelephonySettingsRequest
import org.llamenos.hotline.model.TelephonySettingsResponse
import org.llamenos.hotline.model.UpdateCustomFieldsRequest
import org.llamenos.hotline.model.User
import org.llamenos.hotline.model.UsersListResponse
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
    SCHEMA,
    SHIFTS,
    SETTINGS,
    SYSTEM_HEALTH,
}

data class AdminUiState(
    val selectedTab: AdminTab = AdminTab.VOLUNTEERS,

    // Users
    val volunteers: List<User> = emptyList(),
    val isLoadingVolunteers: Boolean = false,
    val volunteersError: String? = null,
    val volunteerSearchQuery: String = "",
    val showAddVolunteerDialog: Boolean = false,
    val createdVolunteerNsec: String? = null,
    val showDeleteVolunteerDialog: String? = null, // user ID to delete

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

    // Admin settings (transcription)
    val transcriptionEnabled: Boolean = false,
    val transcriptionOptOut: Boolean = false,
    val isLoadingSettings: Boolean = false,
    val settingsError: String? = null,

    // Report categories
    val reportCategories: List<ReportCategory> = emptyList(),
    val isLoadingCategories: Boolean = false,
    val categoriesError: String? = null,
    val showAddCategoryDialog: Boolean = false,

    // Telephony settings
    val telephonyProvider: String = "twilio",
    val telephonyAccountSid: String = "",
    val telephonyAuthToken: String = "",
    val telephonyPhoneNumber: String = "",
    val isLoadingTelephony: Boolean = false,
    val telephonyError: String? = null,

    // Call settings
    val ringTimeout: Int = 30,
    val maxCallDuration: Int = 60,
    val parallelRingCount: Int = 3,
    val isLoadingCallSettings: Boolean = false,
    val callSettingsError: String? = null,

    // IVR languages
    val ivrLanguages: Map<String, Boolean> = emptyMap(),
    val isLoadingIvrLanguages: Boolean = false,
    val ivrLanguagesError: String? = null,

    // Spam settings
    val maxCallsPerHour: Int = 10,
    val voiceCaptchaEnabled: Boolean = false,
    val knownNumberBypass: Boolean = true,
    val isLoadingSpamSettings: Boolean = false,
    val spamSettingsError: String? = null,

    // System health
    val systemHealth: SystemHealth? = null,
    val isLoadingHealth: Boolean = false,
    val healthError: String? = null,
)

/**
 * ViewModel for the Admin panel.
 *
 * Provides CRUD operations for users, ban lists, audit logs, and invites.
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
            AdminTab.SCHEMA -> { /* Schema browser handled inline via SchemaBrowserViewModel */ }
            AdminTab.SHIFTS -> loadAdminShifts()
            AdminTab.SETTINGS -> loadAdminSettings()
            AdminTab.SYSTEM_HEALTH -> loadSystemHealth()
        }
    }

    // ---- Users ----

    fun loadVolunteers() {
        viewModelScope.launch {
            _uiState.update {
                it.copy(isLoadingVolunteers = true, volunteersError = null)
            }

            try {
                val response = apiService.request<UsersListResponse>(
                    "GET",
                    "/api/users",
                )
                _uiState.update {
                    it.copy(
                        volunteers = response.users,
                        isLoadingVolunteers = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingVolunteers = false,
                        volunteersError = e.message ?: "Failed to load users",
                    )
                }
            }
        }
    }

    fun setVolunteerSearchQuery(query: String) {
        _uiState.update { it.copy(volunteerSearchQuery = query) }
    }

    /**
     * Filter users by search query (matches display name or pubkey prefix).
     */
    fun filteredVolunteers(): List<User> {
        val query = _uiState.value.volunteerSearchQuery.lowercase()
        if (query.isBlank()) return _uiState.value.volunteers

        return _uiState.value.volunteers.filter { user ->
            (user.displayName?.lowercase()?.contains(query) == true) ||
                    user.pubkey.lowercase().contains(query)
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

    // ---- User CRUD ----

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
                val request = CreateUserRequest(name = name, phone = phone, role = role)
                val response = apiService.request<CreateUserResponse>(
                    "POST", "/api/users", request,
                )
                _uiState.update { it.copy(createdVolunteerNsec = response.nsec) }
                loadVolunteers()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(volunteersError = e.message ?: "Failed to create user")
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
                apiService.requestNoContent("DELETE", "/api/users/$volunteerId")
                loadVolunteers()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(volunteersError = e.message ?: "Failed to delete user")
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

    // ---- Admin Settings ----

    private fun loadAdminSettings() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingSettings = true, settingsError = null) }
            try {
                val response = apiService.request<Map<String, Any>>(
                    "GET",
                    "/api/admin/settings",
                )
                _uiState.update {
                    it.copy(
                        transcriptionEnabled = response["transcriptionEnabled"] as? Boolean ?: false,
                        transcriptionOptOut = response["allowVolunteerOptOut"] as? Boolean ?: false,
                        isLoadingSettings = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoadingSettings = false, settingsError = e.message)
                }
            }
        }
        // Load all settings sub-sections in parallel
        loadReportCategories()
        loadTelephonySettings()
        loadCallSettings()
        loadIvrLanguages()
        loadSpamSettings()
    }

    fun toggleTranscription(enabled: Boolean) {
        viewModelScope.launch {
            _uiState.update { it.copy(settingsError = null) }
            try {
                apiService.requestNoContent(
                    "PUT",
                    "/api/admin/settings/transcription",
                    mapOf("enabled" to enabled),
                )
                _uiState.update { it.copy(transcriptionEnabled = enabled) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(settingsError = e.message ?: "Failed to update transcription")
                }
            }
        }
    }

    fun toggleTranscriptionOptOut(allowed: Boolean) {
        viewModelScope.launch {
            _uiState.update { it.copy(settingsError = null) }
            try {
                apiService.requestNoContent(
                    "PUT",
                    "/api/admin/settings/transcription",
                    mapOf("allowVolunteerOptOut" to allowed),
                )
                _uiState.update { it.copy(transcriptionOptOut = allowed) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(settingsError = e.message ?: "Failed to update opt-out setting")
                }
            }
        }
    }

    // ---- Report Categories ----

    fun loadReportCategories() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingCategories = true, categoriesError = null) }
            try {
                val response = apiService.request<ReportTypesResponse>(
                    "GET", "/api/settings/report-types",
                )
                _uiState.update {
                    it.copy(reportCategories = response.categories, isLoadingCategories = false)
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingCategories = false,
                        categoriesError = e.message ?: "Failed to load report categories",
                    )
                }
            }
        }
    }

    fun showAddCategoryDialog() {
        _uiState.update { it.copy(showAddCategoryDialog = true) }
    }

    fun dismissAddCategoryDialog() {
        _uiState.update { it.copy(showAddCategoryDialog = false) }
    }

    fun addReportCategory(name: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(showAddCategoryDialog = false, categoriesError = null) }
            try {
                val request = CreateReportCategoryRequest(name = name)
                apiService.requestNoContent("POST", "/api/settings/report-types", request)
                loadReportCategories()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(categoriesError = e.message ?: "Failed to add category")
                }
            }
        }
    }

    fun deleteReportCategory(categoryId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(categoriesError = null) }
            try {
                apiService.requestNoContent("DELETE", "/api/settings/report-types/$categoryId")
                loadReportCategories()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(categoriesError = e.message ?: "Failed to delete category")
                }
            }
        }
    }

    // ---- Telephony Settings ----

    fun loadTelephonySettings() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingTelephony = true, telephonyError = null) }
            try {
                val response = apiService.request<TelephonySettingsResponse>(
                    "GET", "/api/settings/telephony",
                )
                _uiState.update {
                    it.copy(
                        telephonyProvider = response.provider,
                        telephonyAccountSid = response.accountSid,
                        telephonyAuthToken = response.authToken,
                        telephonyPhoneNumber = response.phoneNumber,
                        isLoadingTelephony = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingTelephony = false,
                        telephonyError = e.message ?: "Failed to load telephony settings",
                    )
                }
            }
        }
    }

    fun updateTelephonyProvider(provider: String) {
        _uiState.update { it.copy(telephonyProvider = provider) }
    }

    fun updateTelephonyAccountSid(value: String) {
        _uiState.update { it.copy(telephonyAccountSid = value) }
    }

    fun updateTelephonyAuthToken(value: String) {
        _uiState.update { it.copy(telephonyAuthToken = value) }
    }

    fun updateTelephonyPhoneNumber(value: String) {
        _uiState.update { it.copy(telephonyPhoneNumber = value) }
    }

    fun saveTelephonySettings() {
        viewModelScope.launch {
            _uiState.update { it.copy(telephonyError = null) }
            try {
                val state = _uiState.value
                val request = TelephonySettingsRequest(
                    provider = state.telephonyProvider,
                    accountSid = state.telephonyAccountSid,
                    authToken = state.telephonyAuthToken,
                    phoneNumber = state.telephonyPhoneNumber,
                )
                apiService.requestNoContent("PUT", "/api/settings/telephony", request)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(telephonyError = e.message ?: "Failed to save telephony settings")
                }
            }
        }
    }

    // ---- Call Settings ----

    fun loadCallSettings() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingCallSettings = true, callSettingsError = null) }
            try {
                val response = apiService.request<CallSettingsResponse>(
                    "GET", "/api/settings/call",
                )
                _uiState.update {
                    it.copy(
                        ringTimeout = response.ringTimeout,
                        maxCallDuration = response.maxCallDuration,
                        parallelRingCount = response.parallelRingCount,
                        isLoadingCallSettings = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingCallSettings = false,
                        callSettingsError = e.message ?: "Failed to load call settings",
                    )
                }
            }
        }
    }

    fun updateRingTimeout(value: Int) {
        _uiState.update { it.copy(ringTimeout = value) }
    }

    fun updateMaxCallDuration(value: Int) {
        _uiState.update { it.copy(maxCallDuration = value) }
    }

    fun updateParallelRingCount(value: Int) {
        _uiState.update { it.copy(parallelRingCount = value) }
    }

    fun saveCallSettings() {
        viewModelScope.launch {
            _uiState.update { it.copy(callSettingsError = null) }
            try {
                val state = _uiState.value
                val request = CallSettingsRequest(
                    ringTimeout = state.ringTimeout,
                    maxCallDuration = state.maxCallDuration,
                    parallelRingCount = state.parallelRingCount,
                )
                apiService.requestNoContent("PUT", "/api/settings/call", request)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(callSettingsError = e.message ?: "Failed to save call settings")
                }
            }
        }
    }

    // ---- IVR Languages ----

    fun loadIvrLanguages() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingIvrLanguages = true, ivrLanguagesError = null) }
            try {
                val response = apiService.request<IvrLanguagesResponse>(
                    "GET", "/api/settings/ivr-languages",
                )
                _uiState.update {
                    it.copy(ivrLanguages = response.languages, isLoadingIvrLanguages = false)
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingIvrLanguages = false,
                        ivrLanguagesError = e.message ?: "Failed to load IVR languages",
                    )
                }
            }
        }
    }

    fun toggleIvrLanguage(code: String, enabled: Boolean) {
        _uiState.update {
            it.copy(ivrLanguages = it.ivrLanguages + (code to enabled))
        }
    }

    fun saveIvrLanguages() {
        viewModelScope.launch {
            _uiState.update { it.copy(ivrLanguagesError = null) }
            try {
                val request = IvrLanguagesRequest(languages = _uiState.value.ivrLanguages)
                apiService.requestNoContent("PUT", "/api/settings/ivr-languages", request)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(ivrLanguagesError = e.message ?: "Failed to save IVR languages")
                }
            }
        }
    }

    // ---- Spam Settings ----

    fun loadSpamSettings() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingSpamSettings = true, spamSettingsError = null) }
            try {
                val response = apiService.request<SpamSettingsResponse>(
                    "GET", "/api/settings/spam",
                )
                _uiState.update {
                    it.copy(
                        maxCallsPerHour = response.maxCallsPerHour,
                        voiceCaptchaEnabled = response.voiceCaptchaEnabled,
                        knownNumberBypass = response.knownNumberBypass,
                        isLoadingSpamSettings = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingSpamSettings = false,
                        spamSettingsError = e.message ?: "Failed to load spam settings",
                    )
                }
            }
        }
    }

    fun updateMaxCallsPerHour(value: Int) {
        _uiState.update { it.copy(maxCallsPerHour = value) }
    }

    fun toggleVoiceCaptcha(enabled: Boolean) {
        _uiState.update { it.copy(voiceCaptchaEnabled = enabled) }
    }

    fun toggleKnownNumberBypass(enabled: Boolean) {
        _uiState.update { it.copy(knownNumberBypass = enabled) }
    }

    fun saveSpamSettings() {
        viewModelScope.launch {
            _uiState.update { it.copy(spamSettingsError = null) }
            try {
                val state = _uiState.value
                val request = SpamSettingsRequest(
                    maxCallsPerHour = state.maxCallsPerHour,
                    voiceCaptchaEnabled = state.voiceCaptchaEnabled,
                    knownNumberBypass = state.knownNumberBypass,
                )
                apiService.requestNoContent("PUT", "/api/settings/spam", request)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(spamSettingsError = e.message ?: "Failed to save spam settings")
                }
            }
        }
    }

    // ---- System Health ----

    fun loadSystemHealth() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingHealth = true, healthError = null) }
            try {
                val response = apiService.request<SystemHealth>(
                    "GET", "/api/system/health",
                )
                _uiState.update {
                    it.copy(systemHealth = response, isLoadingHealth = false)
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingHealth = false,
                        healthError = e.message ?: "Failed to load system health",
                    )
                }
            }
        }
    }
}
