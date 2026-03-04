package org.llamenos.hotline.steps

import android.util.Log
import androidx.test.platform.app.InstrumentationRegistry
import io.cucumber.java.After
import io.cucumber.java.Before
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.crypto.KeystoreService
import java.net.HttpURLConnection
import java.net.URL

/**
 * Cucumber hooks for scenario lifecycle management.
 *
 * - @Before: Resets Docker backend state so each scenario starts clean.
 * - @After: Closes the Activity and wipes local identity (keystore + crypto lock)
 *   to prevent identity leaking between scenarios.
 */
class ScenarioHooks {

    private val keystoreService = KeystoreService(
        InstrumentationRegistry.getInstrumentation().targetContext
    )
    private val cryptoService = CryptoService()

    /**
     * Grant runtime permissions before each scenario to prevent system dialogs
     * from stealing focus from the Compose test harness.
     * Camera permission is needed for Device Linking QR scanner.
     */
    @Before(order = 0)
    fun grantPermissions() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val packageName = instrumentation.targetContext.packageName
        try {
            instrumentation.uiAutomation.executeShellCommand(
                "pm grant $packageName android.permission.CAMERA"
            ).close()
        } catch (e: Exception) {
            Log.w("ScenarioHooks", "Camera permission grant failed: ${e.message}")
        }
    }

    /**
     * Reset the Docker Compose backend before each scenario.
     * Calls POST /api/test-reset which clears all Durable Object state.
     * This ensures each scenario starts with a fresh server.
     */
    @Before(order = 1)
    fun resetServerState() {
        try {
            val url = URL("${BaseSteps.TEST_HUB_URL}/api/test-reset")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.connectTimeout = 5_000
            conn.readTimeout = 5_000
            conn.doOutput = true
            conn.outputStream.close() // Send empty POST body
            val code = conn.responseCode
            if (code == 200) {
                Log.d("ScenarioHooks", "Server state reset OK")
            } else {
                Log.w("ScenarioHooks", "Server reset returned HTTP $code — continuing")
            }
            conn.disconnect()
        } catch (e: Exception) {
            Log.w("ScenarioHooks", "Server reset failed (backend may be down): ${e.message}")
            // Don't fail the scenario — tests can still run against local-only state
        }
    }

    @After(order = 10000)
    fun closeActivity() {
        ComposeRuleHolder.current.activityScenarioHolder.close()
    }

    @After(order = 9000)
    fun clearIdentityState() {
        try {
            keystoreService.clear()
            cryptoService.lock()
        } catch (_: Throwable) {
            // Cleanup is best-effort
        }
    }
}
