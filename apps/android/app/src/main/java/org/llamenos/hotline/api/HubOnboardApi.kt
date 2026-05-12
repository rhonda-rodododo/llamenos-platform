package org.llamenos.hotline.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import org.llamenos.hotline.hub.ActiveHubState
import org.llamenos.protocol.ChannelConfig
import org.llamenos.protocol.HubOnboardingState
import org.llamenos.protocol.HubQuota
import org.llamenos.protocol.HubSetupStatus
import org.llamenos.protocol.HubUsage
import org.llamenos.protocol.ProviderTemplate
import javax.inject.Inject
import javax.inject.Singleton

// ── Response / request wrappers (API-specific, not in protocol) ─────────────

@Serializable
data class ProviderTemplatesResponse(
    val templates: List<ProviderTemplate>,
)

@Serializable
data class HubUsageResponse(
    val usage: List<HubUsage>,
    val quotas: HubQuota? = null,
)

@Serializable
data class UpdateChannelsRequest(
    val channels: ChannelConfig,
)

@Serializable
data class CompleteStepRequest(
    val step: String,
    val data: Map<String, String> = emptyMap(),
)

/**
 * Repository for hub onboarding and communications management.
 *
 * Wraps the hub self-service API endpoints:
 * - GET/POST /api/hubs/:hubId/onboard — start/resume onboarding
 * - GET /api/hubs/:hubId/onboard/status — get progress
 * - PUT /api/hubs/:hubId/onboard/step — complete step
 * - GET /api/hubs/:hubId/provider-status — provider status
 * - GET /api/hubs/:hubId/usage — usage stats
 * - PUT /api/hubs/:hubId/channels — enable/disable channels
 * - GET /api/provider-templates — list templates
 */
@Singleton
class HubOnboardApi @Inject constructor(
    private val apiService: ApiService,
    private val activeHubState: ActiveHubState,
) {

    private fun requireHubId(): String =
        activeHubState.activeHubId.value
            ?: throw IllegalStateException("No active hub selected")

    // ── Onboarding ──────────────────────────────────────────────────────────

    suspend fun startOnboarding(
        templateId: String? = null,
    ): Result<HubOnboardingState> = withContext(Dispatchers.IO) {
        runCatching {
            val hubId = requireHubId()
            val body = buildMap<String, Any?> {
                if (templateId != null) put("templateId", templateId)
            }
            apiService.request("POST", "/api/hubs/$hubId/onboard", body)
        }
    }

    suspend fun getOnboarding(): Result<HubOnboardingState> = withContext(Dispatchers.IO) {
        runCatching {
            val hubId = requireHubId()
            apiService.request("GET", "/api/hubs/$hubId/onboard")
        }
    }

    suspend fun getOnboardingStatus(): Result<HubSetupStatus> = withContext(Dispatchers.IO) {
        runCatching {
            val hubId = requireHubId()
            apiService.request("GET", "/api/hubs/$hubId/onboard/status")
        }
    }

    suspend fun completeStep(
        step: String,
        data: Map<String, String> = emptyMap(),
    ): Result<HubOnboardingState> = withContext(Dispatchers.IO) {
        runCatching {
            val hubId = requireHubId()
            apiService.request(
                "PUT",
                "/api/hubs/$hubId/onboard/step",
                CompleteStepRequest(step = step, data = data),
            )
        }
    }

    // ── Provider & Usage ────────────────────────────────────────────────────

    suspend fun getProviderStatus(): Result<HubSetupStatus> = withContext(Dispatchers.IO) {
        runCatching {
            val hubId = requireHubId()
            apiService.request("GET", "/api/hubs/$hubId/provider-status")
        }
    }

    suspend fun getUsage(): Result<HubUsageResponse> = withContext(Dispatchers.IO) {
        runCatching {
            val hubId = requireHubId()
            apiService.request("GET", "/api/hubs/$hubId/usage")
        }
    }

    // ── Channels ────────────────────────────────────────────────────────────

    suspend fun updateChannels(
        channels: ChannelConfig,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val hubId = requireHubId()
            apiService.requestNoContent(
                "PUT",
                "/api/hubs/$hubId/channels",
                UpdateChannelsRequest(channels = channels),
            )
        }
    }

    // ── Templates ───────────────────────────────────────────────────────────

    suspend fun getTemplates(): Result<List<ProviderTemplate>> = withContext(Dispatchers.IO) {
        runCatching {
            val response: ProviderTemplatesResponse = apiService.request(
                "GET",
                "/api/provider-templates",
            )
            response.templates
        }
    }
}
