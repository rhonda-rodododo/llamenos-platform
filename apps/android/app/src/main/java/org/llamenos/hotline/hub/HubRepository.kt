package org.llamenos.hotline.hub

import android.util.Log
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.model.Hub
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Orchestrates hub switching. Injects ActiveHubState and ApiService independently;
 * does not create a circular dependency because neither ApiService nor ActiveHubState
 * owns the other.
 */
@Singleton
class HubRepository @Inject constructor(
    private val apiService: ApiService,
    private val cryptoService: CryptoService,
    private val activeHubState: ActiveHubState,
) {

    /**
     * Switch to a different hub.
     *
     * 1. If the hub key is not cached, fetch it from the server and unwrap via CryptoService.
     * 2. Persist the new active hub ID via ActiveHubState.
     *
     * Hub key loading failure is non-fatal: the switch proceeds but E2EE data for that
     * hub won't decrypt until the key is loaded on a subsequent attempt. This mirrors
     * [loadAllHubKeys] which also swallows key failures gracefully.
     */
    suspend fun switchHub(hubId: String) {
        if (!cryptoService.hasHubKey(hubId)) {
            try {
                val envelope = apiService.getHubKey(hubId)
                cryptoService.loadHubKey(hubId, envelope)
            } catch (e: Exception) {
                Log.w("HubRepository", "Hub key load failed for $hubId (switch proceeds): ${e.message}")
            }
        }
        activeHubState.setActiveHub(hubId)
    }

    /**
     * Load hub keys for all hubs eagerly (called after login).
     * Failures are logged and skipped — missing keys mean relay events from that hub
     * cannot be decrypted, which is acceptable.
     */
    suspend fun loadAllHubKeys(hubs: List<Hub>) = coroutineScope {
        hubs.map { hub ->
            async {
                runCatching {
                    if (!cryptoService.hasHubKey(hub.id)) {
                        val envelope = apiService.getHubKey(hub.id)
                        cryptoService.loadHubKey(hub.id, envelope)
                    }
                }.onFailure { e ->
                    Log.w("HubRepository", "Failed to load key for hub ${hub.id}: ${e.message}")
                }
            }
        }.forEach { it.await() }
    }

    /**
     * Initialize hub selection after login. If no hub is persisted, select the first one.
     */
    suspend fun loadInitialHub(hubs: List<Hub>) {
        if (activeHubState.activeHubId.value != null) return
        hubs.firstOrNull()?.id?.let { switchHub(it) }
    }
}
