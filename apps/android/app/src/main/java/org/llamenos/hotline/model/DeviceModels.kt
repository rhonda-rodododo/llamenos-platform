package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

/**
 * Request body for POST /api/devices/register.
 *
 * Registers or updates a device push endpoint on the backend.
 * The [pushToken] is the full UnifiedPush endpoint URL that the
 * backend will POST encrypted payloads to.
 */
@Serializable
data class RegisterDeviceRequest(
    val platform: String = "android",
    val pushToken: String,
    val wakeKeyPublic: String,
    val ed25519Pubkey: String? = null,
    val x25519Pubkey: String? = null,
    val deviceName: String? = null,
    val deviceModel: String? = null,
    val osVersion: String? = null,
    val appVersion: String? = null,
)

/**
 * Request body for DELETE /api/devices/push-token.
 *
 * Removes the device record for the given push endpoint URL.
 * Called when the UnifiedPush distributor unregisters the device.
 */
@Serializable
data class ClearPushTokenRequest(
    val pushToken: String,
)
