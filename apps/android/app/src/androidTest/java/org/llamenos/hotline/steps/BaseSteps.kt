package org.llamenos.hotline.steps

import android.util.Log
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.SemanticsNodeInteractionCollection
import androidx.compose.ui.test.SemanticsNodeInteractionsProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.platform.app.InstrumentationRegistry
import dagger.hilt.android.EntryPointAccessors
import org.llamenos.hotline.LlamenosApp
import org.llamenos.hotline.di.CryptoEntryPoint
import org.llamenos.hotline.helpers.SimulationClient

/**
 * Base class for UI step definitions.
 *
 * Implements [SemanticsNodeInteractionsProvider] by delegating to the shared
 * [ComposeRuleHolder], so step definitions can call `onNodeWithTag(...)` etc.
 * directly without going through the holder.
 */
abstract class BaseSteps : SemanticsNodeInteractionsProvider {

    val composeRuleHolder get() = ComposeRuleHolder.current
    val activityScenarioHolder get() = composeRuleHolder.activityScenarioHolder
    val composeRule get() = composeRuleHolder.composeRule

    override fun onAllNodes(
        matcher: SemanticsMatcher,
        useUnmergedTree: Boolean,
    ): SemanticsNodeInteractionCollection =
        composeRuleHolder.composeRule.onAllNodes(matcher, useUnmergedTree)

    override fun onNode(
        matcher: SemanticsMatcher,
        useUnmergedTree: Boolean,
    ): SemanticsNodeInteraction =
        composeRuleHolder.composeRule.onNode(matcher, useUnmergedTree)

    // ---- Shared utility methods ----

    /**
     * Enter a PIN by tapping pin-N buttons sequentially.
     */
    protected fun enterPin(pin: String) {
        for (digit in pin.toList()) {
            onNodeWithTag("pin-$digit").performClick()
        }
        composeRule.waitForIdle()
    }

    /**
     * Complete the full auth flow: create identity -> confirm backup -> PIN 123456 -> confirm 123456.
     * After this, the app is on the dashboard.
     *
     * Handles two cases:
     * 1. Fresh install → login screen → create identity → onboarding → PIN setup → dashboard
     * 2. Returning user → PIN unlock screen → enter PIN → dashboard
     */
    protected fun navigateToMainScreen() {
        Log.d(TAG, "navigateToMainScreen: launching activity")
        activityScenarioHolder.launch()
        // Wait for either the login screen or PIN unlock screen (10s for Activity startup + animation)
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("create-identity").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("pin-pad").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("dashboard-title").fetchSemanticsNodes().isNotEmpty()
        }
        // Check which screen appeared
        val hasDashboard = composeRule.onAllNodesWithTag("dashboard-title").fetchSemanticsNodes().isNotEmpty()
        if (hasDashboard) {
            Log.d(TAG, "navigateToMainScreen: already on dashboard")
            return
        }
        val hasLogin = composeRule.onAllNodesWithTag("create-identity").fetchSemanticsNodes().isNotEmpty()
        Log.d(TAG, "navigateToMainScreen: hasLogin=$hasLogin")
        if (hasLogin) {
            // Fresh install flow — enter hub URL before creating identity
            val hubUrlNodes = composeRule.onAllNodesWithTag("hub-url-input").fetchSemanticsNodes()
            if (hubUrlNodes.isNotEmpty()) {
                Log.d(TAG, "navigateToMainScreen: entering hub URL: $TEST_HUB_URL")
                onNodeWithTag("hub-url-input").performTextInput(TEST_HUB_URL)
                composeRule.waitForIdle()
            }
            Log.d(TAG, "navigateToMainScreen: clicking create-identity")
            onNodeWithTag("create-identity").performClick()
            // v3 device key model: Login → PINSet directly (no Onboarding/confirm-backup step)
            Log.d(TAG, "navigateToMainScreen: waiting for pin-pad")
            waitForNode("pin-pad", timeoutMillis = 10_000)
            Log.d(TAG, "navigateToMainScreen: entering PIN (first)")
            enterPin("12345678")
            Log.d(TAG, "navigateToMainScreen: entering PIN (confirm)")
            enterPin("12345678")
            Log.d(TAG, "navigateToMainScreen: PIN entry complete")
        } else {
            // Returning user — enter PIN to unlock
            Log.d(TAG, "navigateToMainScreen: returning user, entering PIN")
            enterPin("12345678")
        }

        // CRITICAL: Register the user on the backend BEFORE the dashboard appears.
        // The dashboard's ViewModels fire API calls immediately on init. If the user
        // isn't registered yet, ALL initial requests get 401 (dev-mode bypass requires
        // the pubkey to exist in the DB). By polling for key availability and registering
        // here, we race ahead of the dashboard's data fetches.
        registerTestUserOnBackendEarly()

        // With test-kdf feature flag, Argon2id uses fast params (8KB, 1 iter, 1 lane)
        // so key generation completes in <1s even on CI emulators. 15s covers navigation.
        waitForNode("dashboard-title", timeoutMillis = 15_000)
        onNodeWithTag("dashboard-title").assertIsDisplayed()
    }

    /**
     * Register the test user on the backend as early as possible — called BEFORE
     * the dashboard appears. Polls CryptoService for key availability (keys are
     * generated asynchronously during PIN processing) then registers immediately.
     *
     * This eliminates the timing race where dashboard ViewModels fire API calls
     * before the user exists in the database, causing universal 401 responses.
     */
    private fun registerTestUserOnBackendEarly() {
        val entryPoint = EntryPointAccessors.fromApplication(
            LlamenosApp.instance,
            CryptoEntryPoint::class.java,
        )
        val cryptoService = entryPoint.cryptoService()

        // Poll for key generation to complete. With test-kdf, Argon2id uses fast
        // params so this typically completes in <1s. 10s timeout handles CI delays.
        val deadline = System.currentTimeMillis() + 10_000
        while (cryptoService.signingPubkeyHex == null && System.currentTimeMillis() < deadline) {
            Thread.sleep(50)
        }

        val signingPubkey = cryptoService.signingPubkeyHex
        val encryptionPubkey = cryptoService.encryptionPubkeyHex

        if (signingPubkey == null) {
            Log.e(TAG, "registerTestUserOnBackendEarly: pubkey still null after 10s — " +
                "nativeLibLoaded=${cryptoService.nativeLibLoaded}, deviceId=${cryptoService.deviceId}")
            // Don't throw — let the dashboard appear and fail naturally for clearer diagnostics
            return
        }

        val hubId = ScenarioHooks.currentHubId.ifEmpty { null }
        Log.i(TAG, "registerTestUserOnBackendEarly: pubkey=${signingPubkey.take(16)}…, hubId=$hubId")
        try {
            val result = SimulationClient.registerTestIdentity(
                pubkey = signingPubkey,
                x25519Pubkey = encryptionPubkey,
                hubId = hubId,
            )
            check(result.ok) {
                "registerTestUserOnBackendEarly: backend returned ok=false — " +
                    "error=${result.error}, detail=${result.detail}, " +
                    "hubId=$hubId, pubkey=${signingPubkey.take(16)}…"
            }
            Log.i(TAG, "registerTestUserOnBackendEarly: SUCCESS — user registered before dashboard load")
        } catch (e: Exception) {
            Log.e(TAG, "registerTestUserOnBackendEarly: registration failed: ${e.message}", e)
            throw AssertionError("User registration failed — all API calls will 401", e)
        }
    }

    /**
     * Navigate to a bottom nav tab by its test tag.
     * Uses Espresso back press to dismiss any open dialogs/screens first if needed.
     */
    protected fun navigateToTab(tabTag: String) {
        try {
            onNodeWithTag(tabTag).performClick()
        } catch (_: Throwable) {
            // Bottom nav may be hidden (in admin screen or dialog) — press back first
            try {
                androidx.test.espresso.Espresso.pressBack()
                composeRule.waitForIdle()
                onNodeWithTag(tabTag).performClick()
            } catch (_: Throwable) {
                // Tab still not available after back press
            }
        }
        composeRule.waitForIdle()
    }

    /**
     * Wait for a node with the given tag to appear in the Compose tree.
     * Handles animation delays and Activity startup timing.
     */
    protected fun waitForNode(tag: String, timeoutMillis: Long = 5000) {
        composeRule.waitUntil(timeoutMillis) {
            composeRule.onAllNodesWithTag(tag)
                .fetchSemanticsNodes().isNotEmpty()
        }
    }

    /**
     * Check if any of the given tags are displayed.
     * Returns true if at least one tag is found.
     */
    protected fun assertAnyTagDisplayed(vararg tags: String): Boolean {
        for (tag in tags) {
            try {
                onNodeWithTag(tag).assertIsDisplayed()
                return true
            } catch (_: Throwable) {
                continue
            }
        }
        return false
    }

    /**
     * Expand a collapsible settings section if not already expanded.
     * Scrolls to the header, clicks it, then waits for the animation.
     */
    protected fun expandSettingsSection(sectionTag: String) {
        try {
            val headerTag = "$sectionTag-header"
            onNodeWithTag(headerTag).performScrollTo()
            onNodeWithTag(headerTag).performClick()
            composeRule.waitForIdle()
        } catch (_: Throwable) {
            // Section header not available
        }
    }

    /**
     * Navigate to a dashboard card by its test tag.
     * Navigates: Dashboard tab → Wait for card → Scroll to card → Click.
     *
     * Waits for the card node to exist in the semantics tree before
     * attempting scroll/click. On CI emulators the dashboard Column may
     * take time to fully lay out (especially with PullToRefreshBox wrapping
     * a verticalScroll Column). Without this wait, performScrollTo() can
     * throw before the node is available, and the silently-swallowed error
     * causes downstream waitUntil timeouts (the actual CI failure mode).
     */
    protected fun navigateViaDashboardCard(cardTag: String) {
        navigateToTab(NAV_DASHBOARD)
        // Wait for the dashboard to render the card node in the semantics tree.
        // The dashboard uses a Column with verticalScroll — all nodes exist from
        // the start, but on slow CI emulators layout may take a frame or two.
        composeRule.waitUntil(15_000) {
            composeRule.onAllNodesWithTag(cardTag).fetchSemanticsNodes().isNotEmpty()
        }
        // performScrollTo() can fail when PullToRefreshBox adds nested scroll
        // semantics that confuse the scroll target resolution. Fall back to
        // direct click (Compose test clicks fire regardless of node visibility).
        try {
            onNodeWithTag(cardTag).performScrollTo()
        } catch (_: Throwable) {
            // Scroll failed — node exists but scrollable ancestor couldn't be resolved.
            // performClick() below still works because Compose test clicks use semantics.
        }
        onNodeWithTag(cardTag).performClick()
        composeRule.waitForIdle()
    }

    /**
     * Navigate to a specific admin tab by name.
     * Navigates: Settings tab → Admin card → Target tab.
     */
    protected fun navigateToAdminTab(tabName: String) {
        navigateToTab(NAV_SETTINGS)
        try {
            onNodeWithTag("settings-admin-card").performScrollTo()
            onNodeWithTag("settings-admin-card").performClick()
            composeRule.waitForIdle()
        } catch (_: Throwable) {
            // Admin card not available — may already be on admin screen
        }
        try { waitForNode("admin-tabs") } catch (_: Throwable) { return }
        val tabTag = when (tabName.lowercase()) {
            "volunteers" -> "admin-tab-volunteers"
            "bans", "ban list" -> "admin-tab-bans"
            "audit", "audit log" -> "admin-tab-audit"
            "invites" -> "admin-tab-invites"
            "fields", "custom fields" -> "admin-tab-fields"
            "shifts", "shift schedule" -> "admin-tab-shifts"
            "settings" -> "admin-tab-settings"
            else -> tabName.lowercase().replace(" ", "-")
        }
        // Admin tabs are in a horizontal ScrollableTabRow. The tab nodes exist
        // in the semantics tree even when off-screen, so performClick() works
        // without needing to scroll the tab into the visible viewport first.
        // Do NOT use performScrollTo() — it uses vertical scroll semantics.
        try {
            onNodeWithTag(tabTag).performClick()
            composeRule.waitForIdle()
        } catch (_: Throwable) {
            // Admin tab not available
        }
    }

    companion object {
        private const val TAG = "BaseSteps"

        /**
         * Hub URL for the test backend.
         *
         * Configurable via instrumentation argument `testHubUrl`:
         *   adb shell am instrument -e testHubUrl http://10.0.2.2:3001 ...
         *
         * Defaults to the LAN address for the physical Pixel 6a over WiFi.
         * Emulators use 10.0.2.2 (host loopback alias) with per-shard ports.
         */
        val TEST_HUB_URL: String by lazy {
            val args = InstrumentationRegistry.getArguments()
            args.getString("testHubUrl", "http://192.168.50.95:3000")
        }

        // Well-known bottom navigation tab test tags
        const val NAV_DASHBOARD = "nav-dashboard"
        const val NAV_NOTES = "nav-notes"
        const val NAV_CONVERSATIONS = "nav-conversations"
        const val NAV_SHIFTS = "nav-shifts"
        const val NAV_SETTINGS = "nav-settings"

        /**
         * Matcher for nodes whose testTag starts with the given prefix.
         */
        fun hasTestTagPrefix(prefix: String) = SemanticsMatcher("testTag starts with '$prefix'") { node ->
            if (SemanticsProperties.TestTag in node.config) {
                node.config[SemanticsProperties.TestTag].startsWith(prefix)
            } else {
                false
            }
        }
    }
}
