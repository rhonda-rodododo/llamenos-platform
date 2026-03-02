package org.llamenos.hotline.steps.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for panic-wipe.feature scenarios.
 *
 * Panic wipe is web-specific (Escape key). On Android, this would be
 * a shake gesture or similar mechanism (Epic 230).
 * These are stub step definitions.
 */
class PanicWipeSteps : BaseSteps() {

    @Given("I am on the dashboard")
    fun iAmOnTheDashboard() {
        onNodeWithTag("dashboard-title").assertIsDisplayed()
    }

    @When("I press Escape three times quickly")
    fun iPressEscapeThreeTimesQuickly() {
        // Web-only — Escape key. Android equivalent not built yet.
    }

    @Then("the panic wipe overlay should appear")
    fun thePanicWipeOverlayShouldAppear() {
        // Stub
    }

    @Then("I should be redirected to the login page")
    fun iShouldBeRedirectedToTheLoginPage() {
        // After wipe, app should show login
        assertAnyTagDisplayed("app-title", "create-identity")
    }

    @Then("all local storage should be cleared")
    fun allLocalStorageShouldBeCleared() {
        // Web-only concept — stub
    }

    @Then("all session storage should be cleared")
    fun allSessionStorageShouldBeCleared() {
        // Web-only concept — stub
    }

    @When("I press Escape twice then wait over one second")
    fun iPressEscapeTwiceThenWaitOverOneSecond() {
        // Web-only — stub
    }

    @When("I press Escape once more")
    fun iPressEscapeOnceMore() {
        // Web-only — stub
    }

    @Then("I should still be on the dashboard")
    fun iShouldStillBeOnTheDashboard() {
        onNodeWithTag("dashboard-title").assertIsDisplayed()
    }

    @Then("the encrypted key should still be in storage")
    fun theEncryptedKeyShouldStillBeInStorage() {
        // Stub — verify keys weren't wiped
    }
}
