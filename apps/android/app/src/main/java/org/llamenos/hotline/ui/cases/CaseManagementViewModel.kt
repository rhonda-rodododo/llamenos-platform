package org.llamenos.hotline.ui.cases

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.api.SessionState
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.model.AssignRecordRequest
import org.llamenos.hotline.model.AssignResponse
import org.llamenos.hotline.model.CaseRecord
import org.llamenos.hotline.model.EntityTypesResponse
import org.llamenos.hotline.model.EvidenceItem
import org.llamenos.hotline.model.InteractionsResponse
import org.llamenos.hotline.model.RecordsListResponse
import org.llamenos.hotline.model.RecordContactsResponse
import org.llamenos.hotline.model.UpdateRecordRequest
import org.llamenos.protocol.CreateInteractionBody
import org.llamenos.protocol.CreateInteractionBodyContentEnvelope
import org.llamenos.hotline.model.EntityTypeDefinition
import org.llamenos.protocol.Evidence
import org.llamenos.protocol.Interaction
import org.llamenos.protocol.InteractionType
import org.llamenos.protocol.Record
import org.llamenos.protocol.RecordContact
import javax.inject.Inject

/**
 * Active detail tab on the case detail screen.
 */
enum class CaseDetailTab {
    DETAILS,
    TIMELINE,
    CONTACTS,
    EVIDENCE,
}

/**
 * UI state for the case management screens.
 */
data class CaseUiState(
    // Entity types
    val entityTypes: List<EntityTypeDefinition> = emptyList(),
    val isLoadingEntityTypes: Boolean = false,
    val entityTypesError: String? = null,

    // Records
    val records: List<Record> = emptyList(),
    val recordsTotal: Int = 0,
    val recordsPage: Int = 1,
    val hasMoreRecords: Boolean = false,
    val isLoadingRecords: Boolean = false,
    val isRefreshingRecords: Boolean = false,
    val recordsError: String? = null,

    // Filters
    val selectedEntityTypeId: String? = null,
    val selectedStatusHash: String? = null,

    // Selected record detail
    val selectedRecord: Record? = null,
    val isLoadingDetail: Boolean = false,
    val detailError: String? = null,
    val activeTab: CaseDetailTab = CaseDetailTab.DETAILS,

    // Interactions (timeline)
    val interactions: List<Interaction> = emptyList(),
    val interactionsTotal: Int = 0,
    val isLoadingInteractions: Boolean = false,
    val interactionsError: String? = null,

    // Contacts
    val contacts: List<RecordContact> = emptyList(),
    val isLoadingContacts: Boolean = false,
    val contactsError: String? = null,

    // Evidence
    val evidence: List<Evidence> = emptyList(),
    val evidenceTotal: Int = 0,
    val isLoadingEvidence: Boolean = false,
    val evidenceError: String? = null,

    // Action states
    val isUpdatingStatus: Boolean = false,
    val isAddingComment: Boolean = false,
    val isAssigning: Boolean = false,
    val actionError: String? = null,
    val actionSuccess: String? = null,
) {
    /**
     * Active entity types that should be shown in the tab bar.
     * Filters out archived types and types not shown in navigation.
     */
    val visibleEntityTypes: List<EntityTypeDefinition>
        get() = entityTypes.filter { !it.isArchived && it.showInNavigation }

    /**
     * The entity type definition for the currently selected record.
     */
    val selectedEntityType: EntityTypeDefinition?
        get() = selectedRecord?.let { record ->
            entityTypes.find { it.id == record.entityTypeID }
        }
}

/**
 * ViewModel for the case management screens (list and detail).
 *
 * Loads entity type definitions and case records from the CMS API.
 * Supports filtering by entity type and status, case detail with
 * timeline interactions, linked contacts, and evidence.
 *
 * All E2EE content is encrypted/decrypted via [CryptoService].
 */
@HiltViewModel
class CaseManagementViewModel @Inject constructor(
    private val apiService: ApiService,
    private val cryptoService: CryptoService,
    private val sessionState: SessionState,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CaseUiState())
    val uiState: StateFlow<CaseUiState> = _uiState.asStateFlow()

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    init {
        loadEntityTypes()
        loadRecords()
    }

    // ---- Entity Types ----

    /**
     * Fetch entity type definitions from GET /api/settings/cms/entity-types.
     *
     * Entity types define the schema for case records: fields, statuses,
     * severities, numbering, and access control. They drive the entire
     * case management UI.
     */
    fun loadEntityTypes() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingEntityTypes = true, entityTypesError = null) }
            try {
                val response = apiService.request<EntityTypesResponse>(
                    "GET",
                    "/api/settings/cms/entity-types",
                )
                _uiState.update {
                    it.copy(
                        entityTypes = response.entityTypes,
                        isLoadingEntityTypes = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingEntityTypes = false,
                        entityTypesError = e.message ?: "Failed to load entity types",
                    )
                }
            }
        }
    }

    // ---- Records ----

    /**
     * Load case records from GET /api/records with optional filters.
     *
     * @param entityTypeId Filter by entity type (null for all types)
     * @param statusHash Filter by status blind index (null for all statuses)
     * @param page Page number for pagination
     */
    fun loadRecords(
        entityTypeId: String? = _uiState.value.selectedEntityTypeId,
        statusHash: String? = _uiState.value.selectedStatusHash,
        page: Int = 1,
    ) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoadingRecords = it.records.isEmpty(),
                    isRefreshingRecords = it.records.isNotEmpty(),
                    recordsError = null,
                )
            }
            try {
                val query = buildString {
                    append("/api/records?limit=20&page=$page")
                    if (entityTypeId != null) {
                        append("&entityTypeId=$entityTypeId")
                    }
                    if (statusHash != null) {
                        append("&statusHash=$statusHash")
                    }
                }
                val response = apiService.request<RecordsListResponse>("GET", query)
                _uiState.update {
                    it.copy(
                        records = response.records,
                        recordsTotal = response.total,
                        recordsPage = response.page,
                        hasMoreRecords = response.hasMore,
                        isLoadingRecords = false,
                        isRefreshingRecords = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingRecords = false,
                        isRefreshingRecords = false,
                        recordsError = e.message ?: "Failed to load records",
                    )
                }
            }
        }
    }

    /**
     * Select an entity type tab to filter records.
     *
     * @param entityTypeId The entity type ID, or null for "All"
     */
    fun setEntityTypeFilter(entityTypeId: String?) {
        _uiState.update { it.copy(selectedEntityTypeId = entityTypeId, selectedStatusHash = null) }
        loadRecords(entityTypeId = entityTypeId, statusHash = null)
    }

    /**
     * Set the status filter for record listing.
     */
    fun setStatusFilter(statusHash: String?) {
        _uiState.update { it.copy(selectedStatusHash = statusHash) }
        loadRecords(statusHash = statusHash)
    }

    // ---- Record Detail ----

    /**
     * Load a single record by ID and set it as selected.
     * Also loads related data (interactions, contacts, evidence).
     */
    fun selectRecord(recordId: String) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoadingDetail = true,
                    detailError = null,
                    selectedRecord = null,
                    interactions = emptyList(),
                    contacts = emptyList(),
                    evidence = emptyList(),
                    activeTab = CaseDetailTab.DETAILS,
                )
            }
            try {
                val record = apiService.request<CaseRecord>("GET", "/api/records/$recordId")
                _uiState.update {
                    it.copy(
                        selectedRecord = record,
                        isLoadingDetail = false,
                    )
                }
                // Load related data in parallel
                loadInteractions(recordId)
                loadContacts(recordId)
                loadEvidence(recordId)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingDetail = false,
                        detailError = e.message ?: "Failed to load record",
                    )
                }
            }
        }
    }

    /**
     * Set the active detail tab.
     */
    fun setActiveTab(tab: CaseDetailTab) {
        _uiState.update { it.copy(activeTab = tab) }
    }

    /**
     * Update the status of a record via PATCH /api/records/:id.
     *
     * @param recordId The record ID
     * @param statusHash The new status blind index
     */
    fun updateStatus(recordId: String, statusHash: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isUpdatingStatus = true, actionError = null) }
            try {
                val request = UpdateRecordRequest(statusHash = statusHash)
                val updated = apiService.request<CaseRecord>("PATCH", "/api/records/$recordId", request)
                _uiState.update {
                    it.copy(
                        selectedRecord = updated,
                        isUpdatingStatus = false,
                        actionSuccess = "Status updated",
                    )
                }
                // Reload the interactions to show the status change entry
                loadInteractions(recordId)
                // Refresh the list to reflect the new status
                loadRecords()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isUpdatingStatus = false,
                        actionError = e.message ?: "Failed to update status",
                    )
                }
            }
        }
    }

    // ---- Interactions (Timeline) ----

    /**
     * Load interactions for a case from GET /api/records/:id/interactions.
     */
    fun loadInteractions(recordId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingInteractions = true, interactionsError = null) }
            try {
                val response = apiService.request<InteractionsResponse>(
                    "GET",
                    "/api/records/$recordId/interactions?limit=50",
                )
                _uiState.update {
                    it.copy(
                        interactions = response.interactions,
                        interactionsTotal = response.total,
                        isLoadingInteractions = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingInteractions = false,
                        interactionsError = e.message ?: "Failed to load interactions",
                    )
                }
            }
        }
    }

    /**
     * Add a comment interaction to a case.
     *
     * The comment text is E2EE-encrypted for the author and all admin
     * pubkeys before being sent to the API.
     *
     * @param recordId The case record ID
     * @param comment The plaintext comment to encrypt and post
     */
    fun addComment(recordId: String, comment: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isAddingComment = true, actionError = null) }
            try {
                val encrypted = cryptoService.encryptNote(comment, sessionState.adminPubkeys)
                val envelopes = encrypted.envelopes.map { env ->
                    CreateInteractionBodyContentEnvelope(
                        pubkey = env.recipientPubkey,
                        wrappedKey = env.wrappedKey,
                        ephemeralPubkey = env.ephemeralPubkey,
                    )
                }
                val request = CreateInteractionBody(
                    interactionType = InteractionType.Comment,
                    encryptedContent = encrypted.ciphertext,
                    contentEnvelopes = envelopes,
                    interactionTypeHash = "comment",
                )
                apiService.request<Interaction>(
                    "POST",
                    "/api/records/$recordId/interactions",
                    request,
                )
                _uiState.update {
                    it.copy(
                        isAddingComment = false,
                        actionSuccess = "Comment added",
                    )
                }
                loadInteractions(recordId)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isAddingComment = false,
                        actionError = e.message ?: "Failed to add comment",
                    )
                }
            }
        }
    }

    // ---- Contacts ----

    /**
     * Load contacts linked to a record from GET /api/records/:id/contacts.
     */
    fun loadContacts(recordId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingContacts = true, contactsError = null) }
            try {
                val response = apiService.request<RecordContactsResponse>(
                    "GET",
                    "/api/records/$recordId/contacts",
                )
                _uiState.update {
                    it.copy(
                        contacts = response.contacts,
                        isLoadingContacts = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingContacts = false,
                        contactsError = e.message ?: "Failed to load contacts",
                    )
                }
            }
        }
    }

    // ---- Evidence ----

    /**
     * Load evidence for a case from GET /api/records/:id/evidence.
     */
    fun loadEvidence(recordId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingEvidence = true, evidenceError = null) }
            try {
                val response = apiService.request<org.llamenos.protocol.EvidenceListResponse>(
                    "GET",
                    "/api/records/$recordId/evidence?limit=50",
                )
                _uiState.update {
                    it.copy(
                        evidence = response.evidence,
                        evidenceTotal = response.total.toInt(),
                        isLoadingEvidence = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoadingEvidence = false,
                        evidenceError = e.message ?: "Failed to load evidence",
                    )
                }
            }
        }
    }

    // ---- Assignment ----

    /**
     * Assign the current user to a record via POST /api/records/:id/assign.
     */
    fun assignToMe(recordId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isAssigning = true, actionError = null) }
            val pubkey = cryptoService.pubkey
            if (pubkey == null) {
                _uiState.update {
                    it.copy(isAssigning = false, actionError = "No identity available")
                }
                return@launch
            }
            try {
                val request = AssignRecordRequest(pubkeys = listOf(pubkey))
                val response = apiService.request<AssignResponse>(
                    "POST",
                    "/api/records/$recordId/assign",
                    request,
                )
                // Update the selected record's assignedTo list from the response
                _uiState.update {
                    it.copy(
                        selectedRecord = it.selectedRecord?.copy(
                            assignedTo = response.assignedTo,
                        ),
                        isAssigning = false,
                        actionSuccess = "Assigned to you",
                    )
                }
                loadRecords()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isAssigning = false,
                        actionError = e.message ?: "Failed to assign record",
                    )
                }
            }
        }
    }

    // ---- Refresh ----

    /**
     * Refresh all loaded data.
     */
    fun refresh() {
        loadEntityTypes()
        loadRecords()
        val selectedId = _uiState.value.selectedRecord?.id
        if (selectedId != null) {
            selectRecord(selectedId)
        }
    }

    /**
     * Dismiss the action error message.
     */
    fun dismissActionError() {
        _uiState.update { it.copy(actionError = null) }
    }

    /**
     * Dismiss the action success message.
     */
    fun dismissActionSuccess() {
        _uiState.update { it.copy(actionSuccess = null) }
    }

    /**
     * Dismiss the records error message.
     */
    fun dismissError() {
        _uiState.update { it.copy(recordsError = null) }
    }

    /**
     * Clear the selected record and reset detail state.
     */
    fun clearSelection() {
        _uiState.update {
            it.copy(
                selectedRecord = null,
                interactions = emptyList(),
                contacts = emptyList(),
                evidence = emptyList(),
                activeTab = CaseDetailTab.DETAILS,
                detailError = null,
            )
        }
    }
}
