package org.llamenos.hotline.api

import org.llamenos.hotline.crypto.KeyValueStore
import org.llamenos.hotline.model.MeResponse
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Holds runtime session state fetched from the API (e.g., GET /api/auth/me).
 * Injected as a singleton so all ViewModels share the same state.
 */
@Singleton
class SessionState @Inject constructor(
    private val keyValueStore: KeyValueStore,
) {
    /** Admin decryption pubkey for E2EE envelope encryption. */
    @Volatile
    var adminDecryptionPubkey: String? = keyValueStore.retrieve(KEY_ADMIN_DECRYPTION_PUBKEY)
        set(value) {
            field = value
            if (value != null) {
                keyValueStore.store(KEY_ADMIN_DECRYPTION_PUBKEY, value)
            } else {
                keyValueStore.delete(KEY_ADMIN_DECRYPTION_PUBKEY)
            }
        }

    /** Convenience: returns a list containing the admin pubkey, or empty if not set. */
    val adminPubkeys: List<String>
        get() = listOfNotNull(adminDecryptionPubkey)

    /**
     * Ensure admin decryption pubkey is loaded before encryption.
     * If already cached (from persistence or prior fetch), returns immediately.
     * Otherwise fetches from /api/auth/me.
     */
    suspend fun ensureAdminPubkeyLoaded(apiService: ApiService) {
        if (adminDecryptionPubkey != null) return
        try {
            val me = apiService.request<MeResponse>("GET", "/api/auth/me")
            adminDecryptionPubkey = me.adminDecryptionPubkey
        } catch (_: Exception) {
            // Non-fatal — use whatever is cached (may be empty on very first login)
        }
    }

    /** Clear session state (on logout). */
    fun clear() {
        adminDecryptionPubkey = null
    }

    companion object {
        private const val KEY_ADMIN_DECRYPTION_PUBKEY = "admin-decryption-pubkey"
    }
}
