package org.llamenos.hotline.steps.notes

import io.cucumber.java.en.Given
import io.cucumber.java.en.Then
import io.cucumber.java.en.When
import org.llamenos.hotline.steps.BaseSteps

/**
 * Step definitions for custom-fields-admin.feature and notes-custom-fields.feature scenarios.
 *
 * Custom fields admin UI and note custom field integration are not yet built on Android (Epics 229/230).
 * These are stub step definitions.
 */
class CustomFieldSteps : BaseSteps() {

    // ---- Custom fields admin ----

    @When("I fill in the field label with {string}")
    fun iFillInTheFieldLabelWith(label: String) {
        // Custom fields admin UI not built — stub
    }

    @Then("the field name should auto-generate as {string}")
    fun theFieldNameShouldAutoGenerateAs(name: String) {
        // Stub
    }

    @Then("I should see a success message")
    fun iShouldSeeASuccessMessage() {
        // Stub
    }

    @Then("{string} should appear in the field list")
    fun shouldAppearInTheFieldList(fieldName: String) {
        // Stub
    }

    @When("I change the field type to {string}")
    fun iChangeTheFieldTypeTo(fieldType: String) {
        // Stub
    }

    @When("I add option {string}")
    fun iAddOption(optionText: String) {
        // Stub
    }

    @Given("a custom field {string} exists")
    fun aCustomFieldExists(fieldName: String) {
        // Precondition
    }

    @When("I click the delete button on {string}")
    fun iClickTheDeleteButtonOn(fieldName: String) {
        // Stub
    }

    @When("I confirm the deletion")
    fun iConfirmTheDeletion() {
        // Stub
    }

    @Then("{string} should no longer appear in the field list")
    fun shouldNoLongerAppearInTheFieldList(fieldName: String) {
        // Stub
    }

    // ---- Notes with custom fields ----

    @Given("a text custom field {string} exists")
    fun aTextCustomFieldExists(fieldName: String) {
        // Precondition
    }

    @Then("I should see a {string} input in the form")
    fun iShouldSeeAnInputInTheForm(inputLabel: String) {
        // Stub
    }

    @When("I create a note with {string} set to {string}")
    fun iCreateANoteWithFieldSetTo(fieldName: String, fieldValue: String) {
        // Stub
    }

    @Then("I should see {string} as a badge")
    fun iShouldSeeAsABadge(badgeText: String) {
        // Stub
    }

    @Given("a note exists with {string} set to {string}")
    fun aNoteExistsWithFieldSetTo(fieldName: String, fieldValue: String) {
        // Precondition
    }

    @When("I click edit on the note")
    fun iClickEditOnTheNote() {
        // Stub
    }

    @Then("the {string} input should have value {string}")
    fun theInputShouldHaveValue(inputLabel: String, expectedValue: String) {
        // Stub
    }

    @When("I change {string} to {string}")
    fun iChangeFieldTo(fieldName: String, newValue: String) {
        // Stub
    }

    @Given("a note exists with text {string} and {string} set to {string}")
    fun aNoteExistsWithTextAndFieldSetTo(noteText: String, fieldName: String, fieldValue: String) {
        // Precondition
    }

    @When("I change the note text to {string}")
    fun iChangeTheNoteTextTo(newText: String) {
        // Stub
    }

    @Then("I should not see the original text")
    fun iShouldNotSeeTheOriginalText() {
        // Stub
    }

    @When("I create a note with a specific call ID")
    fun iCreateANoteWithASpecificCallId() {
        // Stub
    }

    @Then("the note card header should show a truncated call ID")
    fun theNoteCardHeaderShouldShowATruncatedCallId() {
        // Stub
    }

    @When("I create two notes with the same call ID")
    fun iCreateTwoNotesWithTheSameCallId() {
        // Stub
    }

    @Then("both notes should appear under a single call header")
    fun bothNotesShouldAppearUnderASingleCallHeader() {
        // Stub
    }

    @Given("a note exists")
    fun aNoteExists() {
        // Precondition
    }
}
