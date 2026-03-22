package org.llamenos.hotline.service

import android.util.Log
import org.llamenos.hotline.telephony.LinphoneService

/**
 * Pure routing helper for push notification wake payloads.
 *
 * Extracted from PushService to be unit-testable without Firebase.
 *
 * Multi-hub routing axiom: the active hub context must NEVER be switched
 * from a background wake-payload handler. Push notifications arrive for
 * any hub the user belongs to, regardless of which hub is active in the UI.
 *
 * The only correct places for setActiveHub are:
 * - When the user explicitly taps a notification (notification tap handler).
 * - When the app is unlocked and the user is about to answer a call
 *   (LinphoneService.onCallStateChanged via storePendingCallHub).
 */
class PushNotificationRouter(
    private val linphoneService: LinphoneService,
) {
    companion object {
        private const val TAG = "PushNotificationRouter"
    }

    fun routeWakePayload(type: String, hubId: String, callId: String?) {
        Log.d(TAG, "routeWakePayload: type=$type hubId=${hubId.take(8)}...")
        when (type) {
            "incoming_call" -> {
                if (!callId.isNullOrEmpty() && hubId.isNotEmpty()) {
                    linphoneService.storePendingCallHub(callId, hubId)
                    Log.d(TAG, "Stored pending call hub: callId=$callId hubId=${hubId.take(8)}...")
                }
            }
            else -> {
                Log.d(TAG, "Non-call wake payload type=$type — no routing action")
            }
        }
    }
}
