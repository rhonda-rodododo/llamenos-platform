package org.llamenos.hotline.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.HubOnboardApi
import org.llamenos.protocol.ChannelConfig
import org.llamenos.protocol.ChannelConfigClass
import org.llamenos.protocol.HubChannelType
import org.llamenos.protocol.HubOnboardingState
import org.llamenos.protocol.HubQuota
import org.llamenos.protocol.HubSetupStatus
import org.llamenos.protocol.HubUsage
import org.llamenos.protocol.ProviderTemplate
import javax.inject.Inject

/**
 * UI state for hub communications settings and onboarding.
 */
data class HubCommunicationsUiState(
    // Overall loading — only true on first load when no data is available yet.
    // Subsequent refreshes don't set this, so the channel checklist remains visible.
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val error: String? = null,

    // Provider status
    val setupStatus: HubSetupStatus? = null,
    val providerConnected: Boolean = false,

    // Onboarding
    val onboardingState: HubOnboardingState? = null,
    val showOnboarding: Boolean = false,
    val isCompletingStep: Boolean = false,
    val isStartingOnboarding: Boolean = false,

    // Templates
    val templates: List<ProviderTemplate> = emptyList(),
    val isLoadingTemplates: Boolean = false,

    // Channels
    val channels: ChannelConfig = ChannelConfig(),
    val isSavingChannels: Boolean = false,
    val channelsSaved: Boolean = false,

    // Usage
    val currentUsage: HubUsage? = null,
    val quotas: HubQuota? = null,

    // Saving feedback
    val saveError: String? = null,
)

/**
 * ViewModel for hub communications settings.
 *
 * Manages the state for:
 * - Hub provider status and onboarding flow
 * - Channel enable/disable switches
 * - Provider template selection
 * - Usage display with quota limits
 */
@HiltViewModel
class HubCommunicationsViewModel @Inject constructor(
    private val hubOnboardApi: HubOnboardApi,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HubCommunicationsUiState())
    val uiState: StateFlow<HubCommunicationsUiState> = _uiState.asStateFlow()

    init {
        loadAll()
    }

    /**
     * Load provider status and usage in parallel.
     *
     * Does NOT auto-show the onboarding sheet — that is triggered explicitly
     * by the user clicking "Start Setup" via [showOnboarding].
     *
     * Uses isLoading only on first load (no prior data). Subsequent calls use
     * isRefreshing so the channel checklist and other content remain visible
     * during data fetch — prevents assertions failing because content is hidden
     * behind a full-screen loading spinner.
     */
    fun loadAll() {
        viewModelScope.launch {
            val isFirstLoad = _uiState.value.setupStatus == null
            _uiState.update {
                it.copy(
                    isLoading = isFirstLoad,
                    isRefreshing = !isFirstLoad,
                    error = null,
                )
            }

            // Fetch provider status and usage in parallel to avoid sequential latency.
            coroutineScope {
                val statusDeferred = async { hubOnboardApi.getProviderStatus() }
                val usageDeferred = async { hubOnboardApi.getUsage() }

                val statusResult = statusDeferred.await()
                statusResult.fold(
                    onSuccess = { status ->
                        _uiState.update {
                            it.copy(
                                setupStatus = status,
                                providerConnected = status.providerConnected,
                                channels = channelConfigFromStatus(status),
                            )
                        }
                    },
                    onFailure = { e ->
                        _uiState.update {
                            it.copy(error = e.message ?: "Failed to load provider status")
                        }
                    },
                )

                val usageResult = usageDeferred.await()
                usageResult.fold(
                    onSuccess = { response ->
                        _uiState.update {
                            it.copy(
                                currentUsage = response.usage.firstOrNull(),
                                quotas = response.quotas,
                            )
                        }
                    },
                    onFailure = { /* Usage is optional — don't fail the whole screen */ },
                )
            }

            _uiState.update { it.copy(isLoading = false, isRefreshing = false) }
        }
    }

    /**
     * Load available provider templates.
     */
    fun loadTemplates() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingTemplates = true) }
            val result = hubOnboardApi.getTemplates()
            result.fold(
                onSuccess = { templates ->
                    _uiState.update {
                        it.copy(
                            templates = templates.filter { t -> t.isActive },
                            isLoadingTemplates = false,
                        )
                    }
                },
                onFailure = { e ->
                    _uiState.update {
                        it.copy(
                            isLoadingTemplates = false,
                            saveError = e.message ?: "Failed to load templates",
                        )
                    }
                },
            )
        }
    }

    /**
     * Start onboarding with an optional template.
     */
    fun startOnboarding(templateId: String? = null) {
        viewModelScope.launch {
            // Use isStartingOnboarding instead of isCompletingStep so that
            // step-advance buttons (e.g. "Next: Provider") remain enabled
            // while the initial onboarding API call completes in the background.
            _uiState.update { it.copy(isStartingOnboarding = true, saveError = null) }
            val result = hubOnboardApi.startOnboarding(templateId = templateId)
            result.fold(
                onSuccess = { state ->
                    _uiState.update {
                        it.copy(
                            onboardingState = state,
                            isStartingOnboarding = false,
                            channels = state.channelConfig.toChannelConfig(),
                        )
                    }
                },
                onFailure = { e ->
                    _uiState.update {
                        it.copy(
                            isStartingOnboarding = false,
                            saveError = e.message ?: "Failed to start onboarding",
                        )
                    }
                },
            )
        }
    }

    /**
     * Complete a step in the onboarding flow.
     */
    fun completeStep(step: String, data: Map<String, String> = emptyMap()) {
        viewModelScope.launch {
            _uiState.update { it.copy(isCompletingStep = true, saveError = null) }
            val result = hubOnboardApi.completeStep(step = step, data = data)
            result.fold(
                onSuccess = { state ->
                    _uiState.update {
                        it.copy(
                            onboardingState = state,
                            isCompletingStep = false,
                        )
                    }
                    if (state.isComplete) {
                        // Onboarding finished — reload everything
                        loadAll()
                    }
                },
                onFailure = { e ->
                    _uiState.update {
                        it.copy(
                            isCompletingStep = false,
                            saveError = e.message ?: "Failed to complete step",
                        )
                    }
                },
            )
        }
    }

    /**
     * Toggle a communication channel on or off and persist to backend.
     */
    fun toggleChannel(channel: String, enabled: Boolean) {
        val current = _uiState.value.channels
        val updated = when (channel) {
            "voice" -> current.copy(voice = enabled)
            "sms" -> current.copy(sms = enabled)
            "email" -> current.copy(email = enabled)
            "signal" -> current.copy(signal = enabled)
            "whatsapp" -> current.copy(whatsapp = enabled)
            "telegram" -> current.copy(telegram = enabled)
            "rcs" -> current.copy(rcs = enabled)
            else -> current
        }

        _uiState.update { it.copy(channels = updated) }
        saveChannels(updated)
    }

    /**
     * Show the onboarding bottom sheet.
     */
    fun showOnboarding() {
        _uiState.update { it.copy(showOnboarding = true) }
        loadTemplates()
    }

    /**
     * Dismiss the onboarding bottom sheet.
     */
    fun dismissOnboarding() {
        _uiState.update { it.copy(showOnboarding = false) }
    }

    /**
     * Clear error messages.
     */
    fun clearError() {
        _uiState.update { it.copy(error = null, saveError = null) }
    }

    /**
     * Clear channels-saved confirmation.
     */
    fun clearChannelsSaved() {
        _uiState.update { it.copy(channelsSaved = false) }
    }

    fun refresh() {
        loadAll()
    }

    // ── Private helpers ─────────────────────────────────────────────────────

    private fun saveChannels(channels: ChannelConfig) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSavingChannels = true, saveError = null) }
            val result = hubOnboardApi.updateChannels(channels)
            result.fold(
                onSuccess = {
                    _uiState.update {
                        it.copy(isSavingChannels = false, channelsSaved = true)
                    }
                },
                onFailure = { e ->
                    _uiState.update {
                        it.copy(
                            isSavingChannels = false,
                            saveError = e.message ?: "Failed to save channel settings",
                        )
                    }
                },
            )
        }
    }

    private fun channelConfigFromStatus(status: HubSetupStatus): ChannelConfig {
        val configured = status.channelsConfigured
        return ChannelConfig(
            voice = HubChannelType.Voice in configured,
            sms = HubChannelType.SMS in configured,
            email = HubChannelType.Email in configured,
            signal = HubChannelType.Signal in configured,
            whatsapp = HubChannelType.Whatsapp in configured,
            telegram = HubChannelType.Telegram in configured,
            rcs = HubChannelType.RCS in configured,
        )
    }
}

/** Convert the codegen [ChannelConfigClass] (used inside [HubOnboardingState]) to the standalone [ChannelConfig]. */
private fun ChannelConfigClass.toChannelConfig(): ChannelConfig = ChannelConfig(
    voice = voice,
    sms = sms,
    email = email,
    signal = signal,
    whatsapp = whatsapp,
    telegram = telegram,
    rcs = rcs,
)
