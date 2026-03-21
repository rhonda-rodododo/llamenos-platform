package org.llamenos.hotline.service

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Stub — full implementation added in Task 21 (Linphone integration).
 * Provides call-hub mapping so PushService can associate incoming calls with hubs.
 */
@Singleton
class LinphoneService @Inject constructor() {

    private val pendingCallHubs = java.util.concurrent.ConcurrentHashMap<String, String>()

    fun storePendingCallHub(callId: String, hubId: String) {
        pendingCallHubs[callId] = hubId
    }

    fun consumePendingCallHub(callId: String): String? =
        pendingCallHubs.remove(callId)
}
