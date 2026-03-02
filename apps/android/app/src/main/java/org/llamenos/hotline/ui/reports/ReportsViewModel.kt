package org.llamenos.hotline.ui.reports

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.model.AssignReportRequest
import org.llamenos.hotline.model.CreateReportRequest
import org.llamenos.hotline.model.Report
import org.llamenos.hotline.model.ReportCategoriesResponse
import org.llamenos.hotline.model.ReportEnvelope
import org.llamenos.hotline.model.ReportsListResponse
import org.llamenos.hotline.model.UpdateReportRequest
import javax.inject.Inject

data class ReportsUiState(
    val reports: List<Report> = emptyList(),
    val total: Int = 0,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val selectedStatus: ReportStatusFilter = ReportStatusFilter.ALL,
    val selectedCategory: String? = null,
    val categories: List<String> = emptyList(),
    val selectedReport: Report? = null,

    // Action states
    val isCreating: Boolean = false,
    val isClaiming: Boolean = false,
    val isClosing: Boolean = false,
    val createSuccess: Boolean = false,
    val actionError: String? = null,
)

enum class ReportStatusFilter(val queryParam: String?) {
    ALL(null),
    ACTIVE("active"),
    WAITING("waiting"),
    CLOSED("closed"),
}

/**
 * ViewModel for the reports screen.
 *
 * Loads reports from GET /reports with status and category filtering.
 * Supports creating, claiming, and closing reports.
 */
@HiltViewModel
class ReportsViewModel @Inject constructor(
    private val apiService: ApiService,
    private val cryptoService: CryptoService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReportsUiState())
    val uiState: StateFlow<ReportsUiState> = _uiState.asStateFlow()

    init {
        loadCategories()
        loadReports()
    }

    fun loadReports() {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = it.reports.isEmpty(),
                    isRefreshing = it.reports.isNotEmpty(),
                    error = null,
                )
            }
            try {
                val query = buildString {
                    append("/api/reports?limit=50")
                    val status = _uiState.value.selectedStatus
                    if (status.queryParam != null) {
                        append("&status=${status.queryParam}")
                    }
                    val category = _uiState.value.selectedCategory
                    if (category != null) {
                        append("&category=$category")
                    }
                }
                val response = apiService.request<ReportsListResponse>("GET", query)
                _uiState.update {
                    it.copy(
                        reports = response.conversations,
                        total = response.total,
                        isLoading = false,
                        isRefreshing = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.message ?: "Failed to load reports",
                    )
                }
            }
        }
    }

    private fun loadCategories() {
        viewModelScope.launch {
            try {
                val response = apiService.request<ReportCategoriesResponse>("GET", "/api/reports/categories")
                _uiState.update { it.copy(categories = response.categories) }
            } catch (_: Exception) {
                // Non-critical — categories are optional
            }
        }
    }

    fun refresh() {
        loadReports()
    }

    fun setStatusFilter(filter: ReportStatusFilter) {
        _uiState.update { it.copy(selectedStatus = filter) }
        loadReports()
    }

    fun setCategoryFilter(category: String?) {
        _uiState.update { it.copy(selectedCategory = category) }
        loadReports()
    }

    fun selectReport(report: Report) {
        _uiState.update { it.copy(selectedReport = report) }
    }

    /**
     * Create a new encrypted report.
     *
     * Encrypts the report body using the same envelope pattern as notes,
     * then sends the title, optional category, and encrypted content to the API.
     */
    fun createReport(title: String, category: String?, body: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isCreating = true, actionError = null, createSuccess = false) }
            try {
                val encrypted = cryptoService.encryptNote(body, emptyList())
                val envelopes = encrypted.envelopes.map { env ->
                    ReportEnvelope(
                        pubkey = env.recipientPubkey,
                        wrappedKey = env.wrappedKey,
                        ephemeralPubkey = env.ephemeralPubkey,
                    )
                }
                val request = CreateReportRequest(
                    title = title,
                    category = category?.takeIf { it.isNotBlank() },
                    encryptedContent = encrypted.ciphertext,
                    readerEnvelopes = envelopes,
                )
                apiService.request<Report>("POST", "/api/reports", request)
                _uiState.update { it.copy(isCreating = false, createSuccess = true) }
                refresh()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isCreating = false,
                        actionError = e.message ?: "Failed to create report",
                    )
                }
            }
        }
    }

    /**
     * Clear the create success flag after the UI has navigated back.
     */
    fun clearCreateSuccess() {
        _uiState.update { it.copy(createSuccess = false) }
    }

    /**
     * Claim a report by assigning it to the current volunteer.
     *
     * Sends POST /reports/:id/assign with the current user's pubkey,
     * which also transitions the report status from "waiting" to "active".
     */
    fun claimReport(reportId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isClaiming = true, actionError = null) }
            val pubkey = cryptoService.pubkey
            if (pubkey == null) {
                _uiState.update {
                    it.copy(isClaiming = false, actionError = "No identity available")
                }
                return@launch
            }
            try {
                val request = AssignReportRequest(assignedTo = pubkey)
                val updated = apiService.request<Report>("POST", "/api/reports/$reportId/assign", request)
                _uiState.update {
                    it.copy(
                        isClaiming = false,
                        selectedReport = updated,
                    )
                }
                refresh()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isClaiming = false,
                        actionError = e.message ?: "Failed to claim report",
                    )
                }
            }
        }
    }

    /**
     * Close a report by updating its status to "closed".
     *
     * Sends PATCH /reports/:id with { status: "closed" }.
     */
    fun closeReport(reportId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isClosing = true, actionError = null) }
            try {
                val request = UpdateReportRequest(status = "closed")
                val updated = apiService.request<Report>("PATCH", "/api/reports/$reportId", request)
                _uiState.update {
                    it.copy(
                        isClosing = false,
                        selectedReport = updated,
                    )
                }
                refresh()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isClosing = false,
                        actionError = e.message ?: "Failed to close report",
                    )
                }
            }
        }
    }

    /**
     * Dismiss the action error message.
     */
    fun dismissActionError() {
        _uiState.update { it.copy(actionError = null) }
    }
}
