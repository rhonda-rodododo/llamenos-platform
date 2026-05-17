package org.llamenos.hotline.steps

import android.util.Log
import androidx.test.platform.app.InstrumentationRegistry
import dagger.hilt.android.EntryPointAccessors
import io.cucumber.java.After
import io.cucumber.java.Before
import io.cucumber.java.Scenario
import kotlinx.coroutines.runBlocking
import org.llamenos.hotline.LlamenosApp
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.crypto.KeystoreService
import org.llamenos.hotline.di.ActiveHubEntryPoint
import org.llamenos.hotline.di.CryptoEntryPoint
import org.llamenos.hotline.di.KeystoreEntryPoint
import org.llamenos.hotline.helpers.SimulationClient
import org.llamenos.hotline.helpers.TestApiClient
import org.llamenos.hotline.hub.ActiveHubState

/**
 * Cucumber hooks for scenario lifecycle management.
 *
 * @Before(order = 0): Grant camera permissions.
 * @Before(order = 1): Create an isolated test hub for this scenario.
 *   Each scenario gets its own hub ID, scoping all test data within it.
 *   No global database reset needed — hub isolation replaces resetServerState().
 * @Before(order = 2): Wire the new hub ID into ActiveHubState so all ApiService.hp()
 *   calls in the instrumented app use the correct test hub.
 * @After: Close activity, wipe local identity.
 */
class ScenarioHooks {

    companion object {
        private const val TAG = "ScenarioHooks"

        /**
         * Fixed admin pubkey for test API client authentication.
         * Registered as role-super-admin via test-secret in each scenario's hub.
         * 64-char hex string (32 bytes) — same pattern as backend BDD tests.
         */
        private const val ADMIN_PUBKEY = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

        /**
         * The hub ID created for the current scenario.
         * Set in @Before(order = 1), readable by step definitions via ScenarioHooks.currentHubId.
         *
         * Thread-safe: Cucumber-Android runs scenarios sequentially within a single device,
         * so a single companion object var is safe.
         */
        @Volatile
        var currentHubId: String = ""
            private set

        /**
         * Admin-authenticated API client for real API data seeding.
         * Bootstrapped after hub creation in @Before(order = 1).
         * Accessible to all step definitions via ScenarioHooks.apiClient.
         */
        @Volatile
        var apiClient: TestApiClient? = null
            private set
    }

    private val cryptoService: CryptoService by lazy {
        EntryPointAccessors.fromApplication(
            LlamenosApp.instance,
            CryptoEntryPoint::class.java,
        ).cryptoService()
    }

    private val keystoreService: KeystoreService by lazy {
        EntryPointAccessors.fromApplication(
            LlamenosApp.instance,
            KeystoreEntryPoint::class.java,
        ).keystoreService()
    }

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
            Log.w(TAG, "Camera permission grant failed: ${e.message}")
        }
    }

    /**
     * Create an isolated hub for this scenario.
     * Replaces the previous resetServerState() — no global database wipe.
     * Each scenario gets its own hub, so tests never share data.
     *
     * Retries up to 3 times with increasing delay to handle transient
     * backend startup delays (Docker container warming, CI resource contention).
     *
     * FAIL-FAST: Throws AssertionError if hub creation fails after all retries.
     * Without a hub, all hub-scoped API calls will silently return wrong data,
     * causing cascading timeouts that are impossible to debug.
     */
    @Before(order = 1)
    fun createScenarioHub() {
        Log.i(TAG, "=== createScenarioHub: hubUrl=${SimulationClient.hubUrl} ===")
        var lastError: Exception? = null
        for (attempt in 1..3) {
            try {
                val response = SimulationClient.createTestHub()
                if (response.id.isNotEmpty()) {
                    currentHubId = response.id
                    Log.i(TAG, "Created test hub: ${response.id} (${response.name}) [attempt $attempt]")
                    // Bootstrap admin-authenticated API client for real API calls
                    try {
                        apiClient = TestApiClient.bootstrapAdmin(
                            baseUrl = SimulationClient.hubUrl,
                            testSecret = SimulationClient.testSecret,
                            hubId = response.id,
                            adminPubkey = ADMIN_PUBKEY,
                        )
                    } catch (e: Exception) {
                        Log.w(TAG, "TestApiClient bootstrap failed (non-fatal): ${e.message}")
                    }
                    return
                } else {
                    val msg = "createTestHub returned empty ID — error: ${response.error} [attempt $attempt]"
                    Log.w(TAG, msg)
                    lastError = RuntimeException(msg)
                }
            } catch (e: Exception) {
                lastError = e
                Log.w(TAG, "createTestHub attempt $attempt failed: ${e.message}")
                if (attempt < 3) {
                    Thread.sleep((attempt * 2000).toLong())
                }
            }
        }
        val errorMsg = "createTestHub FAILED after 3 attempts (hubUrl=${SimulationClient.hubUrl}): ${lastError?.message}"
        Log.e(TAG, errorMsg)
        throw AssertionError(errorMsg, lastError)
    }

    /**
     * Wire the scenario hub ID into the app's ActiveHubState singleton.
     *
     * Runs after createScenarioHub() (order = 2) so currentHubId is already set.
     * Uses EntryPointAccessors to reach the Hilt SingletonComponent — the same
     * pattern used by CaseListSteps to access CryptoService from non-injected
     * test code. LlamenosApp.instance is safe to use here because the Application
     * is created before any instrumentation hooks fire.
     *
     * This ensures ApiService.hp() prefixes requests with /hubs/{testHubId} so
     * all app API calls are scoped to the scenario's isolated hub.
     */
    @Before(order = 2)
    fun setActiveHubForScenario() {
        if (currentHubId.isEmpty()) {
            Log.e(TAG, "setActiveHubForScenario: currentHubId is empty — hub creation must have failed")
            return
        }
        try {
            val entryPoint = EntryPointAccessors.fromApplication(
                LlamenosApp.instance,
                ActiveHubEntryPoint::class.java,
            )
            val hubState = entryPoint.activeHubState()
            runBlocking { hubState.setActiveHub(currentHubId) }
            // Verify it was set
            val confirmedId = hubState.activeHubId.value
            Log.i(TAG, "ActiveHubState set to: $currentHubId (confirmed: $confirmedId)")
            if (confirmedId != currentHubId) {
                Log.e(TAG, "ActiveHubState MISMATCH: expected=$currentHubId actual=$confirmedId")
            }
        } catch (e: Exception) {
            Log.e(TAG, "setActiveHub FAILED: ${e.message}", e)
            throw AssertionError("setActiveHub failed for hubId=$currentHubId", e)
        }
    }

    @After(order = 10000)
    fun closeActivity() {
        ComposeRuleHolder.current.activityScenarioHolder.close()
    }

    @After(order = 9000)
    fun clearIdentityState() {
        Log.d(TAG, "clearIdentityState: clearing keystore and crypto state (Hilt singletons)")
        try {
            keystoreService.clear()
            // clearAllState() clears pubkey fields + locks Rust secrets.
            // This ensures the next scenario's registerTestUserOnBackendEarly() poll
            // waits for genuinely new keys instead of finding stale ones from this scenario.
            cryptoService.clearAllState()
        } catch (t: Throwable) {
            Log.w(TAG, "clearIdentityState failed (best-effort): ${t.message}")
        }
    }

    /**
     * Log scenario outcome for CI diagnostics.
     */
    @After(order = 0)
    fun logScenarioResult(scenario: Scenario) {
        val status = if (scenario.isFailed) "FAILED" else "PASSED"
        Log.i(TAG, "=== Scenario ${status}: ${scenario.name} (hub=$currentHubId) ===")
    }
}
