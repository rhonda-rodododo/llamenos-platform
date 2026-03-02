package org.llamenos.hotline.steps.admin

import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for demo-mode.feature scenarios.
 *
 * Demo mode UI is not yet built on Android (Epic 230).
 * These are stub step definitions.
 */
class DemoModeSteps : BaseSteps() {

    @When("I navigate to the setup wizard summary step")
    fun iNavigateToTheSetupWizardSummaryStep() {
        // Setup wizard not yet built on Android — stub
    }

    @Then("I should see a {string} toggle")
    fun iShouldSeeAToggle(toggleLabel: String) {
        // Stub
    }

    @Then("the toggle should be off by default")
    fun theToggleShouldBeOffByDefault() {
        // Stub
    }

    @When("I enable the demo mode toggle")
    fun iEnableTheDemoModeToggle() {
        // Stub
    }

    @Then("I should be redirected to the dashboard")
    fun iShouldBeRedirectedToTheDashboard() {
        // Stub — check for dashboard
        assertAnyTagDisplayed("dashboard-title")
    }

    @Given("demo mode has been enabled")
    fun demoModeHasBeenEnabled() {
        // Precondition
    }

    @When("I visit the login page")
    fun iVisitTheLoginPage() {
        // Stub — on Android, this means going to the login screen
    }

    @When("I click the {string} demo account")
    fun iClickTheDemoAccount(accountName: String) {
        // Demo account picker not built — stub
    }

    @Then("I should be redirected away from login")
    fun iShouldBeRedirectedAwayFromLogin() {
        // Stub
    }

    @Then("the navigation should show {string}")
    fun theNavigationShouldShow(name: String) {
        // Stub
    }

    @When("I dismiss the demo banner")
    fun iDismissTheDemoBanner() {
        // Stub
    }

    @Then("{string} should no longer be visible")
    fun shouldNoLongerBeVisible(text: String) {
        // Stub
    }
}
