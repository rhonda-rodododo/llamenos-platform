package org.llamenos.hotline.steps.admin

import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for roles.feature scenarios.
 *
 * Roles management is API-level and UI is not yet built on Android (Epic 229).
 * These are stub step definitions.
 */
class RoleSteps : BaseSteps() {

    @When("I request the roles list")
    fun iRequestTheRolesList() {
        // API-level — stub
    }

    @Then("I should see at least {int} roles")
    fun iShouldSeeAtLeastRoles(count: Int) {
        // Stub
    }

    @Then("I should see {string} role")
    fun iShouldSeeRole(roleName: String) {
        // Stub
    }

    @Then("the {string} role should have wildcard permission")
    fun theRoleShouldHaveWildcardPermission(roleName: String) {
        // Stub
    }

    @Then("the {string} role should be a system role")
    fun theRoleShouldBeASystemRole(roleName: String) {
        // Stub
    }

    @Then("the {string} role should be the default role")
    fun theRoleShouldBeTheDefaultRole(roleName: String) {
        // Stub
    }

    @When("I create a custom role {string} with permissions")
    fun iCreateACustomRoleWithPermissions(roleName: String) {
        // Stub
    }

    @Then("the role should be created successfully")
    fun theRoleShouldBeCreatedSuccessfully() {
        // Stub
    }

    @Then("the role slug should be {string}")
    fun theRoleSlugShouldBe(slug: String) {
        // Stub
    }

    @Given("a custom role {string} exists")
    fun aCustomRoleExists(roleName: String) {
        // Precondition
    }

    @When("I delete the {string} role")
    fun iDeleteTheRole(roleName: String) {
        // Stub
    }

    @Then("the role should be removed")
    fun theRoleShouldBeRemoved() {
        // Stub
    }

    @When("I attempt to delete the {string} role")
    fun iAttemptToDeleteTheRole(roleName: String) {
        // Stub
    }

    @Then("the deletion should fail with a 403 error")
    fun theDeletionShouldFailWithA403Error() {
        // Stub
    }

    @When("I assign the {string} role to the volunteer")
    fun iAssignTheRoleToTheVolunteer(roleName: String) {
        // Stub
    }

    @Then("the volunteer should have the {string} role")
    fun theVolunteerShouldHaveTheRole(roleName: String) {
        // Stub
    }

    @Given("a volunteer with the {string} role exists")
    fun aVolunteerWithTheRoleExists(roleName: String) {
        // Precondition
    }

    @When("the reviewer logs in")
    fun theReviewerLogsIn() {
        // Stub — reviewer login flow
    }

    @When("I request the {string} role details")
    fun iRequestTheRoleDetails(roleName: String) {
        // API-level stub
    }

    @Then("it should have {string} permission")
    fun itShouldHavePermission(permission: String) {
        // Stub
    }

    @Then("it should not have {string} permission")
    fun itShouldNotHavePermission(permission: String) {
        // Stub
    }
}
