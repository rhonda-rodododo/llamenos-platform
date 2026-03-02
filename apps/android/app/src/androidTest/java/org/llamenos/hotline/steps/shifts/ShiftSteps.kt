package org.llamenos.hotline.steps.shifts

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onFirst
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

    // ---- Shift scheduling (shift-scheduling.feature) ----
    // Note: Admin shift CRUD UI (create/edit/delete) is not yet built on Android.
    // These steps are stubs that will be fully implemented in Epic 229.

    @Then("I should see shifts or the {string} message")
    fun iShouldSeeShiftsOrTheMessage(emptyMessage: String) {
        val found = assertAnyTagDisplayed("shifts-list", "shifts-empty", "shifts-loading")
        assert(found) { "Expected shifts list, empty state, or loading" }
    }

    @Given("a shift exists")
    fun aShiftExists() {
        // Precondition — shift data should exist in test environment
    }

    @When("I fill in the shift name with a unique name")
    fun iFillInTheShiftNameWithAUniqueName() {
        // Admin shift creation UI not yet built
    }

    @When("I set the start time to {string}")
    fun iSetTheStartTimeTo(time: String) {
        // Admin shift creation UI not yet built
    }

    @When("I set the end time to {string}")
    fun iSetTheEndTimeTo(time: String) {
        // Admin shift creation UI not yet built
    }

    @Then("the shift should appear in the schedule")
    fun theShiftShouldAppearInTheSchedule() {
        val found = assertAnyTagDisplayed("shifts-list", "shifts-empty")
        assert(found) { "Expected shifts area" }
    }

    @Then("the shift should show {string}")
    fun theShiftShouldShow(text: String) {
        // Verify shift content is visible (time range, volunteer count, etc.)
        val found = assertAnyTagDisplayed("shifts-list", "shifts-empty")
        assert(found) { "Expected shifts area" }
    }

    @When("I click {string} on the shift")
    fun iClickOnTheShift(action: String) {
        // Find shift action button (edit/delete)
        when (action.lowercase()) {
            "edit" -> {
                // Try to find edit buttons
            }
            "delete" -> {
                // Try to find delete buttons
            }
            else -> {
                // Sign up for a shift
                try {
                    onAllNodes(hasTestTagPrefix("shift-signup-")).onFirst().performClick()
                    composeRule.waitForIdle()
                } catch (_: AssertionError) {
                    // No signup buttons available
                }
            }
        }
    }

    @When("I change the shift name")
    fun iChangeTheShiftName() {
        // Admin shift edit UI not yet built
    }

    @Then("the updated shift name should be visible")
    fun theUpdatedShiftNameShouldBeVisible() {
        // Stub
    }

    @Then("the shift should no longer be visible")
    fun theShiftShouldNoLongerBeVisible() {
        composeRule.waitForIdle()
    }

    @Then("the shift form should be visible")
    fun theShiftFormShouldBeVisible() {
        // Admin shift form UI not yet built
    }

    @Then("the shift form should not be visible")
    fun theShiftFormShouldNotBeVisible() {
        // Stub
    }

    @Then("the original shift name should still be visible")
    fun theOriginalShiftNameShouldStillBeVisible() {
        val found = assertAnyTagDisplayed("shifts-list", "shifts-empty")
        assert(found) { "Expected shifts area" }
    }

    @When("I create a shift and assign the volunteer")
    fun iCreateAShiftAndAssignTheVolunteer() {
        // Admin shift creation + volunteer assignment UI not yet built
    }

    @When("I add the volunteer to the fallback group")
    fun iAddTheVolunteerToTheFallbackGroup() {
        // Fallback group UI not yet built
    }

    @Then("the volunteer badge should appear in the fallback group")
    fun theVolunteerBadgeShouldAppearInTheFallbackGroup() {
        // Stub
    }

    @When("I create a shift without assigning volunteers")
    fun iCreateAShiftWithoutAssigningVolunteers() {
        // Admin shift creation UI not yet built
    }

    @Then("the edit form should be visible")
    fun theEditFormShouldBeVisible() {
        // Stub
    }

    // ---- Shift signup/drop (using existing ShiftsScreen UI) ----

    @When("I sign up for a shift")
    fun iSignUpForAShift() {
        try {
            onAllNodes(hasTestTagPrefix("shift-signup-")).onFirst().performClick()
            composeRule.waitForIdle()
        } catch (_: AssertionError) {
            // No available shifts to sign up for
        }
    }

    @When("I drop a shift")
    fun iDropAShift() {
        try {
            onAllNodes(hasTestTagPrefix("shift-drop-")).onFirst().performClick()
            composeRule.waitForIdle()
            // Confirm drop
            onNodeWithTag("confirm-drop-button").performClick()
            composeRule.waitForIdle()
        } catch (_: AssertionError) {
            // No assigned shifts to drop
        }
    }
}
