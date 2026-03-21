package org.llamenos.hotline.ui.triage

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.hub.ActiveHubState
import org.llamenos.hotline.model.CmsReportTypesResponse
import org.llamenos.hotline.model.ConvertReportToCaseRequest
import org.llamenos.hotline.model.ConvertReportToCaseResponse
import org.llamenos.hotline.model.Report
import org.llamenos.hotline.model.ReportsListResponse
import org.llamenos.protocol.ReportTypeDefinition
import javax.inject.Inject

/**
 * Conversion status filters for the triage queue.
 */
enum class TriageStatusFilter(val apiValue: String?) {
    ALL(null),
    PENDING("pending"),
    IN_PROGRESS("in_progress"),
    COMPLETED("completed"),
}

data class TriageUiState(
    val reports: List<Report> = emptyList(),
    val total: Int = 0,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val selectedFilter: TriageStatusFilter = TriageStatusFilter.PENDING,
    val reportTypes: List<ReportTypeDefinition> = emptyList(),
    val isConverting: Boolean = false,
    val selectedReport: Report? = null,
)

/**
 * ViewModel for the triage queue screen.
 *
 * Fetches reports with `conversionEnabled=true` from the reports API.
 * Supports filtering by conversion status and converting reports to case records.
 */
@HiltViewModel
class TriageViewModel @Inject constructor(
    private val apiService: ApiService,
    private val activeHubState: ActiveHubState,
) : ViewModel() {

    private val _uiState = MutableStateFlow(TriageUiState())
    val uiState: StateFlow<TriageUiState> = _uiState.asStateFlow()

    init {
        activeHubState.activeHubId
            .filterNotNull()
            .onEach { loadTriageQueue() }
            .launchIn(viewModelScope)
    }

    fun loadTriageQueue() {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = it.reports.isEmpty(),
                    isRefreshing = it.reports.isNotEmpty(),
                    error = null,
                )
            }
            val reportsDeferred = async { fetchReports() }
            val typesDeferred = async { fetchReportTypes() }
            reportsDeferred.await()
            typesDeferred.await()
        }
    }

    private suspend fun fetchReports() {
        try {
            val filter = _uiState.value.selectedFilter
            val path = buildString {
                append(apiService.hp("/api/reports"))
                append("?conversionEnabled=true&limit=50")
                filter.apiValue?.let { append("&conversionStatus=$it") }
            }
            val response = apiService.request<ReportsListResponse>("GET", path)
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
                    error = e.message ?: "Failed to load triage queue",
                )
            }
        }
    }

    private suspend fun fetchReportTypes() {
        try {
            val response = apiService.request<CmsReportTypesResponse>(
                "GET",
                "/api/settings/cms/report-types",
            )
            _uiState.update { it.copy(reportTypes = response.reportTypes) }
        } catch (_: Exception) {
            // Report types are optional
        }
    }

    fun setFilter(filter: TriageStatusFilter) {
        _uiState.update { it.copy(selectedFilter = filter, reports = emptyList(), total = 0) }
        loadTriageQueue()
    }

    fun refresh() {
        loadTriageQueue()
    }

    fun selectReport(report: Report) {
        _uiState.update { it.copy(selectedReport = report) }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }

    /**
     * Convert a report to a case record.
     */
    fun convertToCase(report: Report) {
        viewModelScope.launch {
            _uiState.update { it.copy(isConverting = true, error = null) }
            try {
                val title = report.metadata?.reportTitle ?: "Untitled Report"
                val body = ConvertReportToCaseRequest(
                    reportId = report.id,
                    title = title,
                    reportTypeId = report.metadata?.reportTypeId,
                )
                apiService.request<ConvertReportToCaseResponse>(
                    "POST",
                    apiService.hp("/api/reports/${report.id}/convert-to-case"),
                    body = body,
                )
                _uiState.update { it.copy(isConverting = false, selectedReport = null) }
                // Reload the queue
                loadTriageQueue()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isConverting = false,
                        error = e.message ?: "Failed to convert report",
                    )
                }
            }
        }
    }

    /**
     * Resolve a report type label from its ID.
     */
    fun reportTypeLabel(typeId: String?): String? {
        if (typeId == null) return null
        return _uiState.value.reportTypes.find { it.id == typeId }?.label
    }
}
