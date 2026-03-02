package org.llamenos.hotline.steps.admin

import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for reports.feature scenarios.
 *
 * Reports UI is not yet built on Android (Epic 229).
 * These are stub step definitions.
 */
class ReportSteps : BaseSteps() {

    @When("I fill in the report details")
    fun iFillInTheReportDetails() {
        // Reports UI not yet built
    }

    @Then("the report should appear in the reports list")
    fun theReportShouldAppearInTheReportsList() {
        // Stub
    }

    @Given("at least one report exists")
    fun atLeastOneReportExists() {
        // Precondition
    }

    @Then("I should see reports in the list")
    fun iShouldSeeReportsInTheList() {
        // Stub
    }

    @Given("a report exists")
    fun aReportExists() {
        // Precondition
    }

    @When("I click on the report")
    fun iClickOnTheReport() {
        // Stub
    }

    @Then("I should see the report detail view")
    fun iShouldSeeTheReportDetailView() {
        // Stub
    }

    @Then("I should see the report content")
    fun iShouldSeeTheReportContent() {
        // Stub
    }

    @Given("a reporter has been invited and onboarded")
    fun aReporterHasBeenInvitedAndOnboarded() {
        // Precondition
    }

    @When("the reporter logs in")
    fun theReporterLogsIn() {
        // Stub — reporter login flow
    }

    @When("they create a new report")
    fun theyCreateANewReport() {
        // Stub
    }

    @Then("the report should be saved successfully")
    fun theReportShouldBeSavedSuccessfully() {
        // Stub
    }

    @Given("a reporter is logged in")
    fun aReporterIsLoggedIn() {
        // Precondition
    }
}
