package org.llamenos.hotline.traditional

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performScrollTo
import org.junit.Test

class DashboardTest : BaseUiTest() {

    @Test
    fun dashboardShowsShiftStatusCard() {
        navigateToMainScreen()
        composeRule.onNodeWithTag("hubs-card").performScrollTo()
        composeRule.onNodeWithTag("hubs-card").assertIsDisplayed()
    }

    @Test
    fun dashboardShowsActiveCallsCard() {
        navigateToMainScreen()
        composeRule.onNodeWithTag("help-card").performScrollTo()
        composeRule.onNodeWithTag("help-card").assertIsDisplayed()
    }

    @Test
    fun navigationToNotesWorks() {
        navigateToMainScreen()
        navigateToTab("nav-notes")
        composeRule.onNodeWithTag("notes-empty").assertIsDisplayed()
    }
}
