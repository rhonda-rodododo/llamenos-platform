package org.llamenos.hotline

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import dagger.hilt.android.AndroidEntryPoint
import org.llamenos.hotline.api.NetworkMonitor
import org.llamenos.hotline.api.VersionChecker
import org.llamenos.hotline.api.WebSocketService
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.crypto.KeystoreService
import org.llamenos.hotline.ui.LlamenosNavigation
import org.llamenos.hotline.ui.theme.LlamenosTheme
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var cryptoService: CryptoService

    @Inject
    lateinit var webSocketService: WebSocketService

    @Inject
    lateinit var keystoreService: KeystoreService

    @Inject
    lateinit var networkMonitor: NetworkMonitor

    @Inject
    lateinit var versionChecker: VersionChecker

    private var backgroundTimestamp: Long? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            LlamenosTheme {
                LlamenosNavigation(
                    cryptoService = cryptoService,
                    webSocketService = webSocketService,
                    keystoreService = keystoreService,
                    networkMonitor = networkMonitor,
                    versionChecker = versionChecker,
                )
            }
        }
    }

    override fun onStop() {
        super.onStop()
        backgroundTimestamp = System.currentTimeMillis()
    }

    override fun onStart() {
        super.onStart()
        backgroundTimestamp?.let { timestamp ->
            val elapsed = System.currentTimeMillis() - timestamp
            if (elapsed > LOCK_TIMEOUT_MS) {
                cryptoService.lock()
            }
        }
        backgroundTimestamp = null
    }

    companion object {
        private const val LOCK_TIMEOUT_MS = 5L * 60L * 1000L // 5 minutes
    }
}
