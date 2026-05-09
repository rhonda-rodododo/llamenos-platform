package org.llamenos.hotline.traditional

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import org.junit.Test

class HubManagementTest : BaseUiTest() {

    @Test
    fun hubListLoads() {
        navigateToMainScreen()
        navigateToTab("nav-settings")
        composeRule.onNodeWithTag("settings-hub-section").performScrollTo()
        composeRule.onNodeWithTag("settings-hub-section").assertIsDisplayed()
        composeRule.onNodeWithTag("settings-hub-section").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("hubs-empty").assertIsDisplayed()
    }
}
