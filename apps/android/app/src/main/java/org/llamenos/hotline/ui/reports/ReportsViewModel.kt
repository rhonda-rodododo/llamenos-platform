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
import org.llamenos.hotline.model.Report
import org.llamenos.hotline.model.ReportCategoriesResponse
import org.llamenos.hotline.model.ReportsListResponse
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
 * Supports pull-to-refresh and report selection for detail view.
 */
@HiltViewModel
class ReportsViewModel @Inject constructor(
    private val apiService: ApiService,
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
}
