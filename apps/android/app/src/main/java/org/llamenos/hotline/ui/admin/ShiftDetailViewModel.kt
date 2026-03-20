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
import org.llamenos.hotline.model.AdminShiftDetail
import org.llamenos.hotline.model.AdminShiftsListResponse
import org.llamenos.hotline.model.CreateShiftRequest
import org.llamenos.hotline.model.User
import org.llamenos.hotline.model.UsersListResponse
import javax.inject.Inject

data class ShiftDetailUiState(
    val shift: AdminShiftDetail? = null,
    val allVolunteers: List<User> = emptyList(),
    val assignedPubkeys: Set<String> = emptySet(),
    val isLoading: Boolean = false,
    val isSaving: Boolean = false,
    val error: String? = null,
    val saveSuccess: Boolean = false,
)

@HiltViewModel
class ShiftDetailViewModel @Inject constructor(
    private val apiService: ApiService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ShiftDetailUiState())
    val uiState: StateFlow<ShiftDetailUiState> = _uiState.asStateFlow()

    fun loadShift(shiftId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val shiftsResponse = apiService.request<AdminShiftsListResponse>(
                    "GET", "/api/admin/shifts",
                )
                val shift = shiftsResponse.shifts.find { it.id == shiftId }

                val volResponse = apiService.request<UsersListResponse>(
                    "GET", "/api/users",
                )

                val assignedPubkeys = shift?.volunteers?.map { it.pubkey }?.toSet() ?: emptySet()

                _uiState.update {
                    it.copy(
                        shift = shift,
                        allVolunteers = volResponse.users,
                        assignedPubkeys = assignedPubkeys,
                        isLoading = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = e.message ?: "Failed to load shift")
                }
            }
        }
    }

    fun toggleVolunteer(pubkey: String) {
        _uiState.update { state ->
            val current = state.assignedPubkeys
            val updated = if (pubkey in current) current - pubkey else current + pubkey
            state.copy(assignedPubkeys = updated)
        }
    }

    fun saveAssignments() {
        val shift = _uiState.value.shift ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null) }
            try {
                // Map pubkeys to volunteer IDs for the API
                val assignedPubkeys = _uiState.value.assignedPubkeys
                val volunteerIds = _uiState.value.allVolunteers
                    .filter { it.pubkey in assignedPubkeys }
                    .map { it.id }

                val request = CreateShiftRequest(
                    name = shift.name,
                    startTime = shift.startTime,
                    endTime = shift.endTime,
                    days = shift.days,
                    volunteerIds = volunteerIds,
                )
                apiService.requestNoContent("PUT", "/api/admin/shifts/${shift.id}", request)
                _uiState.update { it.copy(isSaving = false, saveSuccess = true) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSaving = false, error = e.message ?: "Failed to save assignments")
                }
            }
        }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }
}
