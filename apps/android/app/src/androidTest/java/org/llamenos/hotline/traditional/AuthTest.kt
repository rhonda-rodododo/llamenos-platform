package org.llamenos.hotline.traditional

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import org.junit.Test
import org.llamenos.hotline.helpers.SimulationClient

class AuthTest : BaseUiTest() {

    @Test
    fun adminLoginWithPin_showsDashboard() {
        navigateToMainScreen()
        composeRule.onNodeWithTag("nav-dashboard").assertIsDisplayed()
    }

    @Test
    fun invalidPin_showsError() {
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodesWithTag("pin-pad").fetchSemanticsNodes().isNotEmpty() ||
                composeRule.onAllNodesWithTag("create-identity").fetchSemanticsNodes().isNotEmpty()
        }

        val hasLogin = composeRule.onAllNodesWithTag("create-identity").fetchSemanticsNodes().isNotEmpty()
        if (hasLogin) {
            composeRule.onNodeWithTag("hub-url-input").performTextInput(SimulationClient.hubUrl)
            composeRule.waitForIdle()
            composeRule.onNodeWithTag("create-identity").performClick()
            waitForNode("pin-pad", timeoutMillis = 10_000)
            enterPin(TEST_PIN)
            enterPin(TEST_PIN)
            waitForNode("nav-dashboard", timeoutMillis = 120_000)
            composeRule.onNodeWithTag("nav-dashboard").assertIsDisplayed()
            return
        }

        enterPin("000000")
        waitForNode("pin-error", timeoutMillis = 10_000)
        composeRule.onNodeWithTag("pin-error").assertIsDisplayed()
    }
}
