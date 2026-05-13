package org.llamenos.hotline.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.ApiService
import javax.inject.Inject

data class ErasureRequest(
    val id: String = "",
    val status: String = "",
    val requestedAt: String? = null,
    val executeAt: String? = null,
)

data class ErasureUiState(
    val activeRequest: ErasureRequest? = null,
    val isLoading: Boolean = false,
    val isMutating: Boolean = false,
    val error: String? = null,
    val success: String? = null,
    val showRequestConfirmation: Boolean = false,
    val showCancelConfirmation: Boolean = false,
)

/**
 * ViewModel for user-facing erasure request lifecycle.
 *
 * Provides load/request/cancel operations for the self-service erasure
 * flow accessible from Settings. Uses StateFlow for Compose state collection.
 */
@HiltViewModel
class ErasureViewModel @Inject constructor(
    private val apiService: ApiService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ErasureUiState())
    val uiState: StateFlow<ErasureUiState> = _uiState.asStateFlow()

    fun loadStatus() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                val response = apiService.request<Map<String, Any?>>("GET", "/api/erasure/me")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        activeRequest = parseErasureResponse(response),
                    )
                }
            } catch (e: Exception) {
                // 404 means no active request — that's fine
                if (e.message?.contains("404") != true) {
                    _uiState.update { it.copy(isLoading = false, error = e.message) }
                } else {
                    _uiState.update { it.copy(isLoading = false, activeRequest = null) }
                }
            }
        }
    }

    fun showRequestConfirmation() {
        _uiState.update { it.copy(showRequestConfirmation = true) }
    }

    fun dismissRequestConfirmation() {
        _uiState.update { it.copy(showRequestConfirmation = false) }
    }

    fun requestErasure() {
        viewModelScope.launch {
            _uiState.update { it.copy(isMutating = true, error = null, success = null) }
            try {
                val response = apiService.request<Map<String, Any?>>("POST", "/api/erasure/me")
                _uiState.update {
                    it.copy(
                        isMutating = false,
                        activeRequest = parseErasureResponse(response),
                        showRequestConfirmation = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isMutating = false, error = e.message) }
            }
        }
    }

    fun showCancelConfirmation() {
        _uiState.update { it.copy(showCancelConfirmation = true) }
    }

    fun dismissCancelConfirmation() {
        _uiState.update { it.copy(showCancelConfirmation = false) }
    }

    fun cancelErasure() {
        viewModelScope.launch {
            _uiState.update { it.copy(isMutating = true, error = null, success = null) }
            try {
                apiService.requestNoContent("DELETE", "/api/erasure/me")
                _uiState.update {
                    it.copy(
                        isMutating = false,
                        activeRequest = null,
                        showCancelConfirmation = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isMutating = false, error = e.message) }
            }
        }
    }

    private fun parseErasureResponse(response: Map<String, Any?>): ErasureRequest? {
        val request = response["request"] as? Map<String, Any?> ?: return null
        return ErasureRequest(
            id = request["id"] as? String ?: "",
            status = request["status"] as? String ?: "",
            requestedAt = request["requestedAt"] as? String,
            executeAt = request["executeAt"] as? String,
        )
    }
}
