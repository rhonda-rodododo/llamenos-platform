package org.llamenos.hotline.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.ChannelConfig
import org.llamenos.hotline.api.HubOnboardApi
import org.llamenos.hotline.api.HubOnboardingState
import org.llamenos.hotline.api.HubQuota
import org.llamenos.hotline.api.HubSetupStatus
import org.llamenos.hotline.api.HubUsage
import org.llamenos.hotline.api.ProviderTemplate
import javax.inject.Inject

/**
 * UI state for hub communications settings and onboarding.
 */
data class HubCommunicationsUiState(
    // Overall loading
    val isLoading: Boolean = false,
    val error: String? = null,

    // Provider status
    val setupStatus: HubSetupStatus? = null,
    val providerConnected: Boolean = false,

    // Onboarding
    val onboardingState: HubOnboardingState? = null,
    val showOnboarding: Boolean = false,
    val isCompletingStep: Boolean = false,

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
     * Load provider status, usage, and onboarding state in parallel.
     */
    fun loadAll() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            // Load provider status
            val statusResult = hubOnboardApi.getProviderStatus()
            statusResult.fold(
                onSuccess = { status ->
                    _uiState.update {
                        it.copy(
                            setupStatus = status,
                            providerConnected = status.providerConnected,
                            channels = channelConfigFromStatus(status),
                            showOnboarding = !status.onboardingComplete && !status.providerConnected,
                        )
                    }
                },
                onFailure = { e ->
                    _uiState.update {
                        it.copy(
                            error = e.message ?: "Failed to load provider status",
                            showOnboarding = true,
                        )
                    }
                },
            )

            // Load usage
            val usageResult = hubOnboardApi.getUsage()
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

            _uiState.update { it.copy(isLoading = false) }
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
            _uiState.update { it.copy(isCompletingStep = true, saveError = null) }
            val result = hubOnboardApi.startOnboarding(templateId = templateId)
            result.fold(
                onSuccess = { state ->
                    _uiState.update {
                        it.copy(
                            onboardingState = state,
                            isCompletingStep = false,
                            channels = state.channelConfig,
                        )
                    }
                },
                onFailure = { e ->
                    _uiState.update {
                        it.copy(
                            isCompletingStep = false,
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
            voice = "voice" in configured,
            sms = "sms" in configured,
            email = "email" in configured,
            signal = "signal" in configured,
            whatsapp = "whatsapp" in configured,
            telegram = "telegram" in configured,
            rcs = "rcs" in configured,
        )
    }
}
