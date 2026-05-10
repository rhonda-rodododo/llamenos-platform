package org.llamenos.hotline

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.ProviderSetupRepository
import javax.inject.Inject

/**
 * Handles OAuth callback deep links from the provider setup flow.
 *
 * Registered in AndroidManifest.xml with an intent filter for
 * `llamenos://oauth/callback`. Parses the callback URL and updates
 * the provider setup state accordingly.
 */
@AndroidEntryPoint
class DeepLinkActivity : ComponentActivity() {

    @Inject
    lateinit var providerSetupRepository: ProviderSetupRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val data = intent?.data
        if (data != null && data.scheme == "llamenos" && data.host == "oauth") {
            handleOAuthCallback(data)
        } else {
            finish()
        }
    }

    private fun handleOAuthCallback(uri: android.net.Uri) {
        val status = uri.getQueryParameter("status")
        val message = uri.getQueryParameter("message")

        Log.d(TAG, "OAuth callback: status=$status, message=$message")

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
    }
}
