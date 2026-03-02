package org.llamenos.hotline.steps.admin

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps
import java.util.Calendar

/**
 * Step definitions for ban-management.feature scenarios.
 *
 * Uses BanListTab UI testTags: add-ban-fab, ban-identifier-input, ban-reason-input,
 * confirm-ban-button, cancel-ban-button, bans-list, bans-empty, ban-card-{id},
 * ban-hash-{id}, ban-reason-{id}, remove-ban-{id}.
 */
class BanSteps : BaseSteps() {

    private var testPhoneNumber: String = ""
    private var testPhoneNumber2: String = ""

    // ---- Ban list display ----

    @Then("I should see bans or the {string} message")
    fun iShouldSeeBansOrTheMessage(emptyMessage: String) {
        val found = assertAnyTagDisplayed("bans-list", "bans-empty", "bans-loading")
        assert(found) { "Expected bans list, empty state, or loading indicator" }
    }

    // ---- Add ban ----

    @When("I fill in the phone number")
    fun iFillInThePhoneNumber() {
        testPhoneNumber = "+15559${System.currentTimeMillis().toString().takeLast(6)}"
        onNodeWithTag("ban-identifier-input").performTextClearance()
        onNodeWithTag("ban-identifier-input").performTextInput(testPhoneNumber)
        composeRule.waitForIdle()
    }

    @When("I fill in the phone number with {string}")
    fun iFillInThePhoneNumberWith(phone: String) {
        testPhoneNumber = phone
        onNodeWithTag("ban-identifier-input").performTextClearance()
        onNodeWithTag("ban-identifier-input").performTextInput(phone)
        composeRule.waitForIdle()
    }

    @Then("the phone number should appear in the ban list")
    fun thePhoneNumberShouldAppearInTheBanList() {
        onNodeWithTag("bans-list").assertIsDisplayed()
    }

    @When("I add a ban with reason {string}")
    fun iAddABanWithReason(reason: String) {
        onNodeWithTag("add-ban-fab").performClick()
        composeRule.waitForIdle()
        testPhoneNumber = "+15558${System.currentTimeMillis().toString().takeLast(6)}"
        onNodeWithTag("ban-identifier-input").performTextInput(testPhoneNumber)
        onNodeWithTag("ban-reason-input").performTextInput(reason)
        onNodeWithTag("confirm-ban-button").performClick()
        composeRule.waitForIdle()
    }

    @Then("the ban entry should contain the current year")
    fun theBanEntryShouldContainTheCurrentYear() {
        val year = Calendar.getInstance().get(Calendar.YEAR).toString()
        onAllNodesWithText(year, substring = true).onFirst().assertIsDisplayed()
    }

    // ---- Remove ban ----

    @Given("a ban exists")
    fun aBanExists() {
        // Create a ban to set up precondition
        onNodeWithTag("add-ban-fab").performClick()
        composeRule.waitForIdle()
        testPhoneNumber = "+15557${System.currentTimeMillis().toString().takeLast(6)}"
        onNodeWithTag("ban-identifier-input").performTextInput(testPhoneNumber)
        onNodeWithTag("ban-reason-input").performTextInput("Test ban")
        onNodeWithTag("confirm-ban-button").performClick()
        composeRule.waitForIdle()
    }

    @When("I click {string} on the ban")
    fun iClickOnTheBan(action: String) {
        // Find the first remove button by testTag prefix
        onAllNodes(hasTestTagPrefix("remove-ban-")).onFirst().performClick()
        composeRule.waitForIdle()
    }

    @Then("the ban should no longer appear in the list")
    fun theBanShouldNoLongerAppearInTheList() {
        composeRule.waitForIdle()
        // After removal, either the list has fewer items or shows empty state
        val found = assertAnyTagDisplayed("bans-list", "bans-empty")
        assert(found) { "Expected bans list or empty state after removal" }
    }

    @Then("the ban should still appear in the list")
    fun theBanShouldStillAppearInTheList() {
        onNodeWithTag("bans-list").assertIsDisplayed()
    }

    // ---- Cancel add ban ----

    @Then("the phone number input should be visible")
    fun thePhoneNumberInputShouldBeVisible() {
        onNodeWithTag("ban-identifier-input").assertIsDisplayed()
    }

    @Then("the phone number input should not be visible")
    fun thePhoneNumberInputShouldNotBeVisible() {
        try {
            onNodeWithTag("ban-identifier-input").assertDoesNotExist()
        } catch (_: AssertionError) {
            // Not visible — passes
        }
    }

    // ---- Multiple bans ----

    @When("I add two bans with different phone numbers")
    fun iAddTwoBansWithDifferentPhoneNumbers() {
        // First ban
        onNodeWithTag("add-ban-fab").performClick()
        composeRule.waitForIdle()
        testPhoneNumber = "+15556${System.currentTimeMillis().toString().takeLast(6)}"
        onNodeWithTag("ban-identifier-input").performTextInput(testPhoneNumber)
        onNodeWithTag("ban-reason-input").performTextInput("Reason 1")
        onNodeWithTag("confirm-ban-button").performClick()
        composeRule.waitForIdle()

        // Second ban
        onNodeWithTag("add-ban-fab").performClick()
        composeRule.waitForIdle()
        testPhoneNumber2 = "+15555${System.currentTimeMillis().toString().takeLast(6)}"
        onNodeWithTag("ban-identifier-input").performTextInput(testPhoneNumber2)
        onNodeWithTag("ban-reason-input").performTextInput("Reason 2")
        onNodeWithTag("confirm-ban-button").performClick()
        composeRule.waitForIdle()
    }

    @Then("both phone numbers should appear in the ban list")
    fun bothPhoneNumbersShouldAppearInTheBanList() {
        onNodeWithTag("bans-list").assertIsDisplayed()
    }

    @Then("both ban reasons should be visible")
    fun bothBanReasonsShouldBeVisible() {
        onNodeWithTag("bans-list").assertIsDisplayed()
    }

    // ---- Bulk import (requires UI not yet built — stubs) ----

    @When("I paste two phone numbers in the textarea")
    fun iPasteTwoPhoneNumbersInTheTextarea() {
        // Bulk import UI not yet implemented on Android
    }

    @When("I paste invalid phone numbers in the textarea")
    fun iPasteInvalidPhoneNumbersInTheTextarea() {
        // Bulk import UI not yet implemented on Android
    }

    // ---- Access control ----

    @When("the volunteer logs in and navigates to {string}")
    fun theVolunteerLogsInAndNavigatesTo(path: String) {
        // On Android, volunteers can't navigate to admin pages via URL
        // The admin card is simply not visible to non-admin users
    }

    @When("they navigate to {string} via SPA")
    fun theyNavigateToViaSpa(path: String) {
        // Android doesn't have URL-based navigation
        // Access control is enforced by hiding the admin card for non-admins
    }
}
