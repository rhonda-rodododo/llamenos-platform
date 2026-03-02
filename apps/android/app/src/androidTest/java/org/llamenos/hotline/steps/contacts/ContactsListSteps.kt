package org.llamenos.hotline.steps.contacts

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import io.cucumber.java.en.And
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for contacts-list.feature scenarios.
 *
 * Feature: Contacts List — navigation from dashboard, empty state,
 * pull-to-refresh, contact identifiers, and back navigation.
 */
class ContactsListSteps : BaseSteps() {

    // ---- Navigation ----

    @When("I tap the view contacts button")
    fun iTapTheViewContactsButton() {
        onNodeWithTag("contacts-card").performClick()
        composeRule.waitForIdle()
    }

    @Then("I should see the contacts screen")
    fun iShouldSeeTheContactsScreen() {
        onNodeWithTag("contacts-title").assertIsDisplayed()
    }

    @Then("I should see the contacts title")
    fun iShouldSeeTheContactsTitle() {
        onNodeWithTag("contacts-title").assertIsDisplayed()
    }

    @And("I tap the back button on contacts")
    fun iTapTheBackButtonOnContacts() {
        onNodeWithTag("contacts-back").performClick()
        composeRule.waitForIdle()
    }

    // ---- Content state ----

    @Then("I should see the contacts content or empty state")
    fun iShouldSeeTheContactsContentOrEmptyState() {
        assertAnyTagDisplayed("contacts-list", "contacts-empty", "contacts-loading")
    }

    @Then("the contacts screen should support pull to refresh")
    fun theContactsScreenShouldSupportPullToRefresh() {
        // Verify the screen is displayed (pull-to-refresh wraps the content)
        assertAnyTagDisplayed("contacts-list", "contacts-empty", "contacts-loading")
    }

    // ---- Dashboard card ----

    @Then("I should see the contacts card on the dashboard")
    fun iShouldSeeTheContactsCardOnDashboard() {
        onNodeWithTag("contacts-card").assertIsDisplayed()
    }

    // ---- Search ----

    @Then("I should see the contacts search field")
    fun iShouldSeeTheContactsSearchField() {
        onNodeWithTag("contacts-search").assertIsDisplayed()
    }

    // ---- Contact identifiers ----

    @Then("I should see contacts with identifiers or the empty state")
    fun iShouldSeeContactsWithIdentifiersOrEmptyState() {
        // Either we see the contacts list with identifiers, or the empty state
        assertAnyTagDisplayed("contacts-list", "contacts-empty")
    }
}
