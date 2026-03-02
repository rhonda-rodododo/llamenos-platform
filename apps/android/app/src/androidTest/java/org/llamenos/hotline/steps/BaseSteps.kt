package org.llamenos.hotline.steps

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.SemanticsNodeInteractionCollection
import androidx.compose.ui.test.SemanticsNodeInteractionsProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import javax.inject.Inject

/**
 * Base class for UI step definitions.
 *
 * Implements [SemanticsNodeInteractionsProvider] by delegating to the shared
 * [ComposeRuleHolder], so step definitions can call `onNodeWithTag(...)` etc.
 * directly without going through the holder.
 */
abstract class BaseSteps : SemanticsNodeInteractionsProvider {

    @Inject
    lateinit var composeRuleHolder: ComposeRuleHolder

    @Inject
    lateinit var activityScenarioHolder: ActivityScenarioHolder

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
     */
    protected fun navigateToMainScreen() {
        activityScenarioHolder.launch()
        onNodeWithTag("create-identity").performClick()
        composeRule.waitForIdle()
        onNodeWithTag("confirm-backup").performClick()
        composeRule.waitForIdle()
        enterPin("1234")
        enterPin("1234")
        composeRule.waitForIdle()
        onNodeWithTag("dashboard-title").assertIsDisplayed()
    }

    /**
     * Navigate to a bottom nav tab by its test tag.
     */
    protected fun navigateToTab(tabTag: String) {
        onNodeWithTag(tabTag).performClick()
        composeRule.waitForIdle()
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
     * Navigate to a specific admin tab by name.
     * Navigates: Settings tab → Admin card → Target tab.
     */
    protected fun navigateToAdminTab(tabName: String) {
        navigateToTab(NAV_SETTINGS)
        onNodeWithTag("settings-admin-card").performScrollTo()
        onNodeWithTag("settings-admin-card").performClick()
        composeRule.waitForIdle()
        val tabTag = when (tabName.lowercase()) {
            "volunteers" -> "admin-tab-volunteers"
            "bans", "ban list" -> "admin-tab-bans"
            "audit", "audit log" -> "admin-tab-audit"
            "invites" -> "admin-tab-invites"
            else -> throw IllegalArgumentException("Unknown admin tab: $tabName")
        }
        onNodeWithTag(tabTag).performClick()
        composeRule.waitForIdle()
    }

    companion object {
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
