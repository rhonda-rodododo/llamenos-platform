package org.llamenos.hotline.ui.components

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
import javax.inject.Inject

/**
 * Response from `GET /api/config` -- only the fields needed to gate the demo
 * banner. Extra fields are ignored thanks to `ignoreUnknownKeys = true` in
 * [ApiService.json]. Mirrors the subset of `configResponseSchema`
 * (packages/protocol/schemas/config.ts) that `useConfig()` reads on desktop.
 */
@Serializable
data class DemoBannerConfigResponse(
    val demoMode: Boolean = false,
    val demoResetSchedule: String? = null,
)

data class DemoBannerUiState(
    val demoMode: Boolean = false,
    val demoResetSchedule: String? = null,
    val dismissed: Boolean = false,
) {
    /** Shown iff the server reports demo mode and the user hasn't dismissed it this session. */
    val visible: Boolean get() = demoMode && !dismissed
}

/**
 * Backs [DemoBanner]. Fetches the server's demo-mode flag from `/api/config`
 * -- the same signal the desktop client uses (`useConfig().demoMode`) -- and
 * tracks the dismiss action for the lifetime of this ViewModel (session-scoped,
 * matching desktop's `sessionStorage` dismiss flag).
 */
@HiltViewModel
class DemoBannerViewModel @Inject constructor(
    private val apiService: ApiService,
) : ViewModel() {
    private val _uiState = MutableStateFlow(DemoBannerUiState())
    val uiState: StateFlow<DemoBannerUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            try {
                val config = apiService.request<DemoBannerConfigResponse>(
                    method = "GET",
                    path = "/api/config",
                )
                _uiState.update {
                    it.copy(demoMode = config.demoMode, demoResetSchedule = config.demoResetSchedule)
                }
            } catch (_: Exception) {
                // Network error -- leave demo mode at its last known state (default hidden).
            }
        }
    }

    fun dismiss() {
        _uiState.update { it.copy(dismissed = true) }
    }
}
