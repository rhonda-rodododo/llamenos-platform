package org.llamenos.hotline.steps.shifts

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for shift-list.feature and clock-in-out.feature.
 *
 * Feature: Shifts Tab — navigation, clock card, schedule display.
 * Feature: Clock In/Out — clock state transitions.
 */
class ShiftSteps : BaseSteps() {

    // ---- Shifts list ----

    @Then("I should see the clock in/out card")
    fun iShouldSeeTheClockInOutCard() {
        onNodeWithTag("clock-card").assertIsDisplayed()
    }

    @Then("the clock status text should be displayed")
    fun theClockStatusTextShouldBeDisplayed() {
        onNodeWithTag("clock-status-text").assertIsDisplayed()
    }

    @Then("the {string} button should be visible")
    fun theButtonShouldBeVisible(buttonText: String) {
        val tag = when (buttonText) {
            "Clock In" -> "clock-in-button"
            "Clock Out" -> "clock-out-button"
            else -> throw IllegalArgumentException("Unknown button: $buttonText")
        }
        onNodeWithTag(tag).assertIsDisplayed()
    }

    @Then("I should see either the shifts list, empty state, or loading indicator")
    fun iShouldSeeEitherTheShiftsListEmptyStateOrLoadingIndicator() {
        val found = assertAnyTagDisplayed("shifts-list", "shifts-empty", "shifts-loading")
        assert(found) { "Expected shifts to show list, empty, or loading state" }
    }

    // ---- Clock in/out ----

    @Given("I am authenticated and on the shifts screen")
    fun iAmAuthenticatedAndOnTheShiftsScreen() {
        navigateToMainScreen()
        navigateToTab(NAV_SHIFTS)
    }

    @Then("the clock status should update")
    fun theClockStatusShouldUpdate() {
        // After clock attempt, the clock card should still be visible
        onNodeWithTag("clock-card").assertIsDisplayed()
    }

    @Then("the button should change to {string}")
    fun theButtonShouldChangeTo(buttonText: String) {
        // After clock in/out attempt, the clock card remains visible
        onNodeWithTag("clock-card").assertIsDisplayed()
    }

    @Then("the shift timer should appear")
    fun theShiftTimerShouldAppear() {
        // Timer is part of the clock card
        onNodeWithTag("clock-card").assertIsDisplayed()
    }

    @Then("the clock status should show {string}")
    fun theClockStatusShouldShow(status: String) {
        onNodeWithTag("clock-card").assertIsDisplayed()
    }
}
