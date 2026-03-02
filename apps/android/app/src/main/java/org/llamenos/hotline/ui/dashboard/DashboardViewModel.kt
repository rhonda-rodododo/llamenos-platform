package org.llamenos.hotline.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import androidx.annotation.StringRes
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.llamenos.hotline.R
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.api.WebSocketService
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.model.ClockResponse
import org.llamenos.hotline.model.LlamenosEvent
import org.llamenos.hotline.model.ShiftStatusResponse
import javax.inject.Inject

data class DashboardUiState(
    val npub: String = "",
    val isOnShift: Boolean = false,
    val shiftStartedAt: String? = null,
    val activeCallCount: Int = 0,
    val connectionState: WebSocketService.ConnectionState = WebSocketService.ConnectionState.DISCONNECTED,
    val isRefreshing: Boolean = false,
    val isClockingInOut: Boolean = false,
    @StringRes val errorRes: Int? = null,
)

/**
 * ViewModel for the dashboard screen.
 *
 * Manages shift status display, active call count, WebSocket connection state,
 * and real-time event processing. Subscribes to the WebSocket event flow to
 * react to incoming calls, shift updates, and note creation in real time.
 */
@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val cryptoService: CryptoService,
    private val webSocketService: WebSocketService,
    private val apiService: ApiService,
) : ViewModel() {

    private val json = Json { ignoreUnknownKeys = true }

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        val npub = cryptoService.npub ?: ""
        _uiState.value = DashboardUiState(npub = npub)

        // Connect to the Nostr relay for real-time events
        webSocketService.connect()

        // Subscribe to connection state changes
        viewModelScope.launch {
            webSocketService.connectionState.collect { state ->
                _uiState.update { it.copy(connectionState = state) }
            }
        }

        // Subscribe to real-time events from the relay
        viewModelScope.launch {
            webSocketService.events.collect { nostrEvent ->
                processEvent(nostrEvent)
            }
        }

        // Load initial shift status
        viewModelScope.launch { loadShiftStatus() }
    }

    /**
     * Process a raw Nostr event into a typed application event and update UI state.
     */
    private fun processEvent(nostrEvent: WebSocketService.NostrEvent) {
        try {
            val eventData = json.parseToJsonElement(nostrEvent.content).jsonObject
            val type = eventData["type"]?.jsonPrimitive?.content ?: return

            val event = when (type) {
                "call_ring" -> {
                    val callId = eventData["callId"]?.jsonPrimitive?.content ?: return
                    LlamenosEvent.CallRing(callId)
                }
                "call_ended" -> {
                    val callId = eventData["callId"]?.jsonPrimitive?.content ?: return
                    LlamenosEvent.CallEnded(callId)
                }
                "shift_update" -> {
                    val shiftId = eventData["shiftId"]?.jsonPrimitive?.content ?: return
                    val status = eventData["status"]?.jsonPrimitive?.content ?: return
                    LlamenosEvent.ShiftUpdate(shiftId, status)
                }
                "note_created" -> {
                    val noteId = eventData["noteId"]?.jsonPrimitive?.content ?: return
                    LlamenosEvent.NoteCreated(noteId)
                }
                else -> LlamenosEvent.Unknown(type)
            }

            handleEvent(event)
        } catch (_: Exception) {
            // Malformed event content — silently ignore
        }
    }

    /**
     * React to typed application events by updating dashboard state.
     */
    private fun handleEvent(event: LlamenosEvent) {
        when (event) {
            is LlamenosEvent.CallRing -> {
                _uiState.update { it.copy(activeCallCount = it.activeCallCount + 1) }
            }
            is LlamenosEvent.CallEnded -> {
                _uiState.update {
                    it.copy(activeCallCount = maxOf(0, it.activeCallCount - 1))
                }
            }
            is LlamenosEvent.ShiftUpdate -> {
                viewModelScope.launch { loadShiftStatus() }
            }
            is LlamenosEvent.NoteCreated -> {
                // Notes list will refresh via its own ViewModel
            }
            is LlamenosEvent.MessageReceived -> {
                // Conversations list will refresh via its own ViewModel
            }
            is LlamenosEvent.ConversationUpdate -> {
                // Conversations list will refresh via its own ViewModel
            }
            is LlamenosEvent.Unknown -> {
                // Forward compatibility — ignore unknown events
            }
        }
    }

    /**
     * Load the current volunteer's shift status from the API.
     * Returns true on success, false on failure.
     */
    private suspend fun loadShiftStatus(): Boolean {
        return try {
            val status = apiService.request<ShiftStatusResponse>("GET", "/api/shifts/status")
            _uiState.update {
                it.copy(
                    isOnShift = status.isOnShift,
                    shiftStartedAt = status.startedAt,
                    activeCallCount = status.activeCallCount ?: it.activeCallCount,
                    errorRes = null,
                )
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Quick clock in from the dashboard.
     */
    fun clockIn() {
        viewModelScope.launch {
            _uiState.update { it.copy(isClockingInOut = true, errorRes = null) }
            try {
                apiService.request<ClockResponse>("POST", "/api/shifts/clock-in")
                loadShiftStatus()
            } catch (_: Exception) {
                _uiState.update { it.copy(errorRes = R.string.dashboard_error_clock_in) }
            }
            _uiState.update { it.copy(isClockingInOut = false) }
        }
    }

    /**
     * Quick clock out from the dashboard.
     */
    fun clockOut() {
        viewModelScope.launch {
            _uiState.update { it.copy(isClockingInOut = true, errorRes = null) }
            try {
                apiService.request<ClockResponse>("POST", "/api/shifts/clock-out")
                loadShiftStatus()
            } catch (_: Exception) {
                _uiState.update { it.copy(errorRes = R.string.dashboard_error_clock_out) }
            }
            _uiState.update { it.copy(isClockingInOut = false) }
        }
    }

    /**
     * Pull-to-refresh on the dashboard.
     */
    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, errorRes = null) }
            val success = loadShiftStatus()
            if (!success) {
                _uiState.update { it.copy(errorRes = R.string.dashboard_error_refresh) }
            }
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }

    /**
     * Dismiss the error message.
     */
    fun dismissError() {
        _uiState.update { it.copy(errorRes = null) }
    }

    override fun onCleared() {
        super.onCleared()
        webSocketService.disconnect()
    }
}
