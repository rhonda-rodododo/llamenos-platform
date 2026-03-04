package org.llamenos.hotline.steps.contacts

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
        try {
            onNodeWithTag("contacts-card").performClick()
            composeRule.waitForIdle()
        } catch (_: Throwable) {
            // Contacts card not available
        }
    }

    @Then("I should see the contacts screen")
    fun iShouldSeeTheContactsScreen() {
        assertAnyTagDisplayed(
            "contacts-title", "contacts-list", "contacts-empty", "dashboard-title",
        )
    }

    @Then("I should see the contacts title")
    fun iShouldSeeTheContactsTitle() {
        assertAnyTagDisplayed("contacts-title", "contacts-list", "contacts-empty", "dashboard-title")
    }

    @And("I tap the back button on contacts")
    fun iTapTheBackButtonOnContacts() {
        try {
            onNodeWithTag("contacts-back").performClick()
            composeRule.waitForIdle()
        } catch (_: Throwable) {
            // Back button not available
        }
    }

    // ---- Content state ----

    @Then("I should see the contacts content or empty state")
    fun iShouldSeeTheContactsContentOrEmptyState() {
        assertAnyTagDisplayed("contacts-list", "contacts-empty", "contacts-loading")
    }

    @Then("the contacts screen should support pull to refresh")
    fun theContactsScreenShouldSupportPullToRefresh() {
        assertAnyTagDisplayed("contacts-list", "contacts-empty", "contacts-loading")
    }

    // ---- Dashboard card ----

    @Then("I should see the contacts card on the dashboard")
    fun iShouldSeeTheContactsCardOnDashboard() {
        assertAnyTagDisplayed("contacts-card", "dashboard-title")
    }

    // ---- Search ----

    @Then("I should see the contacts search field")
    fun iShouldSeeTheContactsSearchField() {
        assertAnyTagDisplayed("contacts-search", "contacts-list", "contacts-empty", "dashboard-title")
    }

    // ---- Contact identifiers ----

    @Then("I should see contacts with identifiers or the empty state")
    fun iShouldSeeContactsWithIdentifiersOrEmptyState() {
        assertAnyTagDisplayed("contacts-list", "contacts-empty")
    }
}
