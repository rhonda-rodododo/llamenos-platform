package org.llamenos.hotline.steps

import android.util.Log
import androidx.test.platform.app.InstrumentationRegistry
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import io.cucumber.java.After
import io.cucumber.java.Before
import kotlinx.coroutines.runBlocking
import org.llamenos.hotline.LlamenosApp
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.crypto.KeystoreService
import org.llamenos.hotline.helpers.SimulationClient
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

    /**
     * Hilt entry point to access ActiveHubState from test code.
     *
     * ScenarioHooks uses direct instantiation (not @AndroidEntryPoint injection),
     * so we access Hilt singletons via EntryPointAccessors — the same pattern
     * used by CaseListSteps to access CryptoService.
     */
    @EntryPoint
    @InstallIn(SingletonComponent::class)
    interface ActiveHubEntryPoint {
        fun activeHubState(): ActiveHubState
    }

    companion object {
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
    }

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
     * Create an isolated hub for this scenario.
     * Replaces the previous resetServerState() — no global database wipe.
     * Each scenario gets its own hub, so tests never share data.
     */
    @Before(order = 1)
    fun createScenarioHub() {
        try {
            val response = SimulationClient.createTestHub()
            if (response.id.isNotEmpty()) {
                currentHubId = response.id
                Log.d("ScenarioHooks", "Created test hub: ${response.id} (${response.name})")
            } else {
                Log.w("ScenarioHooks", "createTestHub returned empty ID — error: ${response.error}")
            }
        } catch (e: Exception) {
            Log.w("ScenarioHooks", "createTestHub failed: ${e.message}")
            // Best-effort — don't fail the scenario if hub creation fails
        }
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
        if (currentHubId.isEmpty()) return
        try {
            val entryPoint = EntryPointAccessors.fromApplication(
                LlamenosApp.instance,
                ActiveHubEntryPoint::class.java,
            )
            runBlocking { entryPoint.activeHubState().setActiveHub(currentHubId) }
            Log.d("ScenarioHooks", "ActiveHubState set to: $currentHubId")
        } catch (e: Exception) {
            Log.w("ScenarioHooks", "setActiveHub failed: ${e.message}")
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
