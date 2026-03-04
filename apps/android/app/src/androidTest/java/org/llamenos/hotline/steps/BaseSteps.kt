package org.llamenos.hotline.steps

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
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.test.platform.app.InstrumentationRegistry

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
     * Enter a 4-digit PIN by tapping pin-N buttons sequentially.
     */
    protected fun enterPin(pin: String) {
        for (digit in pin.toList()) {
            onNodeWithTag("pin-$digit").performClick()
        }
        composeRule.waitForIdle()
    }

    /**
     * Complete the full auth flow: create identity -> confirm backup -> PIN 1234 -> confirm 1234.
     * After this, the app is on the dashboard.
     *
     * Handles two cases:
     * 1. Fresh install → login screen → create identity → onboarding → PIN setup → dashboard
     * 2. Returning user → PIN unlock screen → enter PIN → dashboard
     */
    protected fun navigateToMainScreen() {
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
            // Already on dashboard (e.g., auto-unlock)
            return
        }
        val hasLogin = composeRule.onAllNodesWithTag("create-identity").fetchSemanticsNodes().isNotEmpty()
        if (hasLogin) {
            // Fresh install flow — enter hub URL before creating identity
            val hubUrlNodes = composeRule.onAllNodesWithTag("hub-url-input").fetchSemanticsNodes()
            if (hubUrlNodes.isNotEmpty()) {
                onNodeWithTag("hub-url-input").performTextInput(TEST_HUB_URL)
                composeRule.waitForIdle()
            }
            onNodeWithTag("create-identity").performClick()
            waitForNode("confirm-backup")
            onNodeWithTag("confirm-backup").performClick()
            waitForNode("pin-pad")
            enterPin("1234")
            enterPin("1234")
        } else {
            // Returning user — enter PIN to unlock
            enterPin("1234")
        }
        waitForNode("dashboard-title")
        onNodeWithTag("dashboard-title").assertIsDisplayed()
    }

    /**
     * Navigate to a bottom nav tab by its test tag.
     * Uses Espresso back press to dismiss any open dialogs/screens first if needed.
     */
    protected fun navigateToTab(tabTag: String) {
        try {
            onNodeWithTag(tabTag).performClick()
        } catch (_: AssertionError) {
            // Bottom nav may be hidden (in admin screen or dialog) — press back first
            try {
                androidx.test.espresso.Espresso.pressBack()
                composeRule.waitForIdle()
            } catch (_: Exception) { /* no-op */ }
            onNodeWithTag(tabTag).performClick()
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
            } catch (_: AssertionError) {
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
        val headerTag = "$sectionTag-header"
        onNodeWithTag(headerTag).performScrollTo()
        onNodeWithTag(headerTag).performClick()
        composeRule.waitForIdle()
    }

    /**
     * Navigate to a dashboard card by its test tag.
     * Navigates: Dashboard tab → Scroll to card → Click.
     */
    protected fun navigateViaDashboardCard(cardTag: String) {
        navigateToTab(NAV_DASHBOARD)
        onNodeWithTag(cardTag).performScrollTo()
        onNodeWithTag(cardTag).performClick()
        composeRule.waitForIdle()
    }

    /**
     * Navigate to a specific admin tab by name.
     * Navigates: Settings tab → Admin card → Target tab.
     */
    protected fun navigateToAdminTab(tabName: String) {
        navigateToTab(NAV_SETTINGS)
        onNodeWithTag("settings-admin-card").performScrollTo()
        onNodeWithTag("settings-admin-card").performClick()
        composeRule.waitForIdle()
        waitForNode("admin-tabs")
        val tabTag = when (tabName.lowercase()) {
            "volunteers" -> "admin-tab-volunteers"
            "bans", "ban list" -> "admin-tab-bans"
            "audit", "audit log" -> "admin-tab-audit"
            "invites" -> "admin-tab-invites"
            "fields", "custom fields" -> "admin-tab-fields"
            "shifts", "shift schedule" -> "admin-tab-shifts"
            "settings" -> "admin-tab-settings"
            else -> throw IllegalArgumentException("Unknown admin tab: $tabName")
        }
        // Admin tabs are in a horizontal ScrollableTabRow — performScrollTo() uses
        // vertical scroll semantics and fails. Instead, just click the tab directly.
        // If the tab is off-screen, swipe the tab row left to reveal later tabs.
        for (attempt in 0..3) {
            try {
                onNodeWithTag(tabTag).performClick()
                composeRule.waitForIdle()
                return
            } catch (_: AssertionError) {
                // Tab is off-screen — swipe the tab row left to reveal more tabs
                composeRule.onNodeWithTag("admin-tabs")
                    .performTouchInput { swipeLeft() }
                composeRule.waitForIdle()
            }
        }
        // Final attempt after swiping
        onNodeWithTag(tabTag).performClick()
        composeRule.waitForIdle()
    }

    companion object {
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
