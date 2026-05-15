package org.llamenos.hotline.api

import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class SMSConfigDto(
    val enabled: Boolean = false,
    val autoResponse: String? = null,
    val afterHoursResponse: String? = null,
)

@Serializable
data class WhatsAppConfigDto(
    val integrationMode: String = "twilio",
    val phoneNumberId: String? = null,
    val businessAccountId: String? = null,
    val accessToken: String? = null,
    val verifyToken: String? = null,
    val appSecret: String? = null,
    val autoResponse: String? = null,
    val afterHoursResponse: String? = null,
)

@Serializable
data class SignalConfigDto(
    val bridgeUrl: String = "",
    val bridgeApiKey: String = "",
    val webhookSecret: String = "",
    val registeredNumber: String = "",
    val trustMode: String? = null,
    val autoResponse: String? = null,
    val afterHoursResponse: String? = null,
)

@Serializable
data class TelegramConfigDto(
    val enabled: Boolean = false,
    val botToken: String = "",
    val webhookSecret: String? = null,
    val botUsername: String? = null,
    val autoResponse: String? = null,
    val afterHoursResponse: String? = null,
)

@Serializable
data class RCSConfigDto(
    val agentId: String = "",
    val serviceAccountKey: String = "",
    val webhookSecret: String? = null,
    val fallbackToSms: Boolean = true,
    val autoResponse: String? = null,
    val afterHoursResponse: String? = null,
)

@Serializable
data class MessagingConfigDto(
    val enabledChannels: List<String> = emptyList(),
    val sms: SMSConfigDto? = null,
    val whatsapp: WhatsAppConfigDto? = null,
    val signal: SignalConfigDto? = null,
    val rcs: RCSConfigDto? = null,
    val telegram: TelegramConfigDto? = null,
    val autoAssign: Boolean = true,
    val inactivityTimeout: Int = 60,
    val maxConcurrentPerUser: Int = 3,
    val preferSignalDelivery: Boolean? = null,
    val smsContentMode: String? = null,
)

@Serializable
data class ConnectionTestDto(val connected: Boolean)

@Serializable
data class A2pRegistrationDto(
    val id: String = "",
    val hubId: String = "",
    val providerType: String = "",
    val brandStatus: String = "not_submitted",
    val campaignStatus: String = "not_submitted",
    val brandSidMasked: String? = null,
    val campaignSidMasked: String? = null,
    val error: String? = null,
    val submittedAt: String? = null,
    val approvedAt: String? = null,
)

@Singleton
class MessagingConfigRepository @Inject constructor(
    private val apiClient: ApiClient,
) {
    suspend fun getConfig(): MessagingConfigDto {
        return apiClient.get("/settings/messaging")
    }

    suspend fun updateConfig(updates: Map<String, Any?>): MessagingConfigDto {
        return apiClient.patch("/settings/messaging", updates)
    }

    suspend fun testChannel(channel: String): Boolean {
        val result: ConnectionTestDto = apiClient.post(
            "/settings/messaging/test",
            mapOf("channel" to channel),
        )
        return result.connected
    }

    suspend fun getA2pStatus(hubId: String): A2pRegistrationDto? {
        return try {
            apiClient.get("/provider-setup/a2p/status?hubId=$hubId")
        } catch (_: Exception) {
            null
        }
    }

    suspend fun submitBrand(hubId: String, brandInfo: Map<String, Any>): A2pRegistrationDto {
        return apiClient.post("/provider-setup/a2p/brand", mapOf(
            "hubId" to hubId,
            "brandInfo" to brandInfo,
        ))
    }

    suspend fun submitCampaign(
        registrationId: String,
        hubId: String,
        campaignInfo: Map<String, Any>,
    ): A2pRegistrationDto {
        return apiClient.post("/provider-setup/a2p/campaign", mapOf(
            "registrationId" to registrationId,
            "hubId" to hubId,
            "campaignInfo" to campaignInfo,
        ))
    }

    suspend fun skipA2p(hubId: String): A2pRegistrationDto {
        return apiClient.post("/provider-setup/a2p/skip", mapOf("hubId" to hubId))
    }
}
