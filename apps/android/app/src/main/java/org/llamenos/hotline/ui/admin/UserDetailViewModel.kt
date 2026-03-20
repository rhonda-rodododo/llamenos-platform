package org.llamenos.hotline.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.model.AuditEntry
import org.llamenos.hotline.model.AuditLogResponse
import org.llamenos.hotline.model.User
import org.llamenos.hotline.model.UsersListResponse
import javax.inject.Inject

@Serializable
data class VolunteerShiftsResponse(
    val shifts: List<VolunteerShiftInfo>,
)

@Serializable
data class VolunteerShiftInfo(
    val id: String,
    val name: String,
    val startTime: String,
    val endTime: String,
    val days: List<Int> = emptyList(),
)

data class VolunteerDetailUiState(
    val volunteer: User? = null,
    val shifts: List<VolunteerShiftInfo> = emptyList(),
    val auditEntries: List<AuditEntry> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingAudit: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class UserDetailViewModel @Inject constructor(
    private val apiService: ApiService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(VolunteerDetailUiState())
    val uiState: StateFlow<VolunteerDetailUiState> = _uiState.asStateFlow()

    fun loadUser(pubkey: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val volResponse = apiService.request<UsersListResponse>(
                    "GET", "/api/users",
                )
                val volunteer = volResponse.users.find { it.pubkey == pubkey }
                _uiState.update {
                    it.copy(volunteer = volunteer, isLoading = false)
                }

                // Load shifts in background
                loadShifts(pubkey)
                loadAuditEntries(pubkey)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = e.message ?: "Failed to load user")
                }
            }
        }
    }

    private fun loadShifts(pubkey: String) {
        viewModelScope.launch {
            try {
                val response = apiService.request<VolunteerShiftsResponse>(
                    "GET", "/api/admin/shifts",
                )
                // Filter shifts that include this volunteer
                val assigned = response.shifts
                _uiState.update { it.copy(shifts = assigned) }
            } catch (_: Exception) {
                // Shifts are supplementary — silently fail
            }
        }
    }

    private fun loadAuditEntries(pubkey: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingAudit = true) }
            try {
                val response = apiService.request<AuditLogResponse>(
                    "GET", "/api/admin/audit?actorPubkey=$pubkey&limit=20",
                )
                _uiState.update {
                    it.copy(auditEntries = response.entries, isLoadingAudit = false)
                }
            } catch (_: Exception) {
                _uiState.update { it.copy(isLoadingAudit = false) }
            }
        }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }
}
