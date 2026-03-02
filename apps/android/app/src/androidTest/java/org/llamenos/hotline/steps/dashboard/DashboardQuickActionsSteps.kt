package org.llamenos.hotline.steps.dashboard

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import io.cucumber.java.en.Then
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for dashboard-quick-actions.feature scenarios.
 *
 * Feature: Dashboard Quick Actions Grid — 2x2 grid of quick action
 * cards (Reports, Contacts, Blasts, Help) and navigation.
 */
class DashboardQuickActionsSteps : BaseSteps() {

    @Then("I should see the quick actions grid")
    fun iShouldSeeTheQuickActionsGrid() {
        onNodeWithTag("quick-actions-grid").assertIsDisplayed()
    }

    @Then("I should see the reports card on the dashboard")
    fun iShouldSeeTheReportsCardOnDashboard() {
        onNodeWithTag("reports-card").assertIsDisplayed()
    }

    @Then("I should see the help card on the dashboard")
    fun iShouldSeeTheHelpCardOnDashboard() {
        onNodeWithTag("help-card").assertIsDisplayed()
    }
}
