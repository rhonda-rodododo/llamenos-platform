package org.llamenos.hotline.ui.analytics

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.AnalyticsRepository
import org.llamenos.protocol.CallMetricsResponse
import org.llamenos.protocol.ConversationMetricsResponse
import org.llamenos.protocol.ShiftMetricsResponse
import org.llamenos.protocol.UserStatsResponse
import org.llamenos.protocol.UserStatsResponseUser
import java.time.Instant
import java.time.temporal.ChronoUnit
import javax.inject.Inject

enum class AnalyticsDateRangeOption { DAYS_7, DAYS_30, CUSTOM }
enum class UserSortField { CALLS, DURATION, NOTES }

data class AnalyticsUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val dateRangeOption: AnalyticsDateRangeOption = AnalyticsDateRangeOption.DAYS_30,
    val customFrom: Instant? = null,
    val customTo: Instant? = null,
    val callMetrics: CallMetricsResponse? = null,
    val conversationMetrics: ConversationMetricsResponse? = null,
    val shiftMetrics: ShiftMetricsResponse? = null,
    val userStats: UserStatsResponse? = null,
    val userSortField: UserSortField = UserSortField.CALLS,
    val showDatePicker: Boolean = false,
    val isPlatformScope: Boolean = false,
)

@HiltViewModel
class AnalyticsViewModel @Inject constructor(
    private val analyticsRepository: AnalyticsRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AnalyticsUiState())
    val uiState: StateFlow<AnalyticsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        val state = _uiState.value
        val (from, to) = dateRange(state)
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val callsDeferred = async { analyticsRepository.getCallMetrics(from, to) }
                val convsDeferred = async { analyticsRepository.getConversationMetrics(from, to) }
                val shiftsDeferred = async { analyticsRepository.getShiftMetrics() }
                val usersDeferred = async { analyticsRepository.getUserStats(from, to) }

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        callMetrics = callsDeferred.await(),
                        conversationMetrics = convsDeferred.await(),
                        shiftMetrics = shiftsDeferred.await(),
                        userStats = usersDeferred.await(),
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    fun setDateRange(option: AnalyticsDateRangeOption) {
        _uiState.update { it.copy(dateRangeOption = option, showDatePicker = false) }
        load()
    }

    fun setCustomDateRange(from: Instant, to: Instant) {
        _uiState.update {
            it.copy(
                dateRangeOption = AnalyticsDateRangeOption.CUSTOM,
                customFrom = from,
                customTo = to,
                showDatePicker = false,
            )
        }
        load()
    }

    fun showDatePicker() {
        _uiState.update { it.copy(showDatePicker = true) }
    }

    fun dismissDatePicker() {
        _uiState.update { it.copy(showDatePicker = false) }
    }

    fun setSortField(field: UserSortField) {
        _uiState.update { it.copy(userSortField = field) }
    }

    fun sortedUsers(): List<UserStatsResponseUser> {
        val users = _uiState.value.userStats?.users ?: return emptyList()
        return when (_uiState.value.userSortField) {
            UserSortField.CALLS -> users.sortedByDescending { it.callsAnswered }
            UserSortField.DURATION -> users.sortedByDescending { it.avgDurationSeconds }
            UserSortField.NOTES -> users.sortedByDescending { it.notesCreated }
        }
    }

    private fun dateRange(state: AnalyticsUiState): Pair<String?, String?> {
        val now = Instant.now()
        return when (state.dateRangeOption) {
            AnalyticsDateRangeOption.DAYS_7 -> {
                val from = now.minus(7, ChronoUnit.DAYS).toString()
                val to = now.toString()
                Pair(from, to)
            }
            AnalyticsDateRangeOption.DAYS_30 -> {
                val from = now.minus(30, ChronoUnit.DAYS).toString()
                val to = now.toString()
                Pair(from, to)
            }
            AnalyticsDateRangeOption.CUSTOM -> {
                Pair(state.customFrom?.toString(), state.customTo?.toString())
            }
        }
    }
}
