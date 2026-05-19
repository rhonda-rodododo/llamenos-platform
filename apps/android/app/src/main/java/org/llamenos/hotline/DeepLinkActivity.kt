package org.llamenos.hotline

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.ProviderSetupRepository
import java.security.SecureRandom
import javax.inject.Inject

/**
 * Handles deep links into the app.
 *
 * All incoming URIs are validated against [DeepLinkValidator] before processing.
 * Sensitive actions (e.g. hub switching) require user confirmation.
 *
 * Registered in AndroidManifest.xml with intent filters for:
 * - `llamenos://oauth/callback` (OAuth provider callbacks)
 * - `llamenos://call/answer` (call deep links)
 * - `llamenos://hub/switch` (hub switch deep links, user confirmation required)
 */
@AndroidEntryPoint
class DeepLinkActivity : ComponentActivity() {

    @Inject
    lateinit var providerSetupRepository: ProviderSetupRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val data = intent?.data
        if (data == null || !DeepLinkValidator.isAllowed(data)) {
            Log.w(TAG, "Deep link rejected — not in allowlist or invalid: $data")
            finish()
            return
        }

        if (DeepLinkValidator.requiresConfirmation(data)) {
            showConfirmationDialog(data)
        } else {
            routeDeepLink(data)
        }
    }

    private fun showConfirmationDialog(uri: android.net.Uri) {
        android.app.AlertDialog.Builder(this)
            .setTitle(getString(R.string.deep_link_confirm_title))
            .setMessage(getString(R.string.deep_link_confirm_message, uri.host))
            .setPositiveButton(getString(R.string.deep_link_confirm_proceed)) { _, _ ->
                routeDeepLink(uri)
            }
            .setNegativeButton(getString(R.string.deep_link_confirm_cancel)) { _, _ ->
                finish()
            }
            .setOnCancelListener { finish() }
            .show()
    }

    private fun routeDeepLink(uri: android.net.Uri) {
        when (uri.host) {
            "oauth" -> handleOAuthCallback(uri)
            "call" -> handleCallDeepLink(uri)
            "hub" -> handleHubDeepLink(uri)
            else -> finish()
        }
    }

    private fun handleCallDeepLink(uri: android.net.Uri) {
        val callId = uri.getQueryParameter("callId")
        if (callId != null) {
            Log.d(TAG, "Call deep link: callId=$callId")
            // TODO: route to active call screen via MainActivity intent
        }
        finish()
    }

    private fun handleHubDeepLink(uri: android.net.Uri) {
        val hubId = uri.getQueryParameter("hubId")
        if (hubId != null) {
            Log.d(TAG, "Hub deep link: hubId=$hubId")
            // TODO: call hubRepository.switchToHub(hubId) after user confirmation
            // Hub switch must be driven by explicit user action (confirmation dialog above),
            // never by automatic background processing.
        }
        finish()
    }

    private fun handleOAuthCallback(uri: android.net.Uri) {
        val incomingState = uri.getQueryParameter("state")
        val expectedState = pendingOAuthState

        if (expectedState == null || incomingState != expectedState) {
            Log.w(TAG, "OAuth state mismatch — possible CSRF. Expected=$expectedState, got=$incomingState")
            setResult(RESULT_CANCELED, Intent().apply {
                putExtra("status", "error")
                putExtra("message", "OAuth state validation failed")
            })
            finish()
            return
        }

        pendingOAuthState = null

        val status = uri.getQueryParameter("status")
        val message = uri.getQueryParameter("message")

        Log.d(TAG, "OAuth callback: status=$status")

        when (status) {
            "success" -> {
                lifecycleScope.launch {
                    setResult(RESULT_OK, Intent().apply {
                        putExtra("status", "success")
                    })
                    finish()
                }
            }
            "error" -> {
                setResult(RESULT_CANCELED, Intent().apply {
                    putExtra("status", "error")
                    putExtra("message", message ?: "Unknown error")
                })
                finish()
            }
            else -> {
                setResult(RESULT_CANCELED)
                finish()
            }
        }
    }

    companion object {
        private const val TAG = "DeepLinkActivity"
        private val secureRandom = SecureRandom()

        @Volatile
        var pendingOAuthState: String? = null
            private set

        fun generateOAuthState(): String {
            val bytes = ByteArray(32)
            secureRandom.nextBytes(bytes)
            val state = bytes.joinToString("") { "%02x".format(it) }
            pendingOAuthState = state
            return state
        }
    }
}
