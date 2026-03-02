@android @ios @desktop
Feature: Notes with Custom Fields
  As a volunteer
  I want to fill in custom fields when creating notes
  So that structured data is captured alongside free-text notes

  Background:
    Given I am logged in as an admin

  Scenario: Custom fields appear in new note form
    Given a text custom field "Priority Level" exists
    When I navigate to the "Notes" page
    And I click "New Note"
    Then I should see a "Priority Level" input in the form

  Scenario: Create note with custom field value shows badge
    Given a text custom field "Priority Level" exists
    When I create a note with "Priority Level" set to "High"
    Then I should see "Priority Level: High" as a badge

  Scenario: Edit form shows custom fields pre-filled
    Given a text custom field "Priority Level" exists
    And a note exists with "Priority Level" set to "High"
    When I click edit on the note
    Then the "Priority Level" input should have value "High"

  Scenario: Can update custom field value via edit
    Given a text custom field "Priority Level" exists
    And a note exists with "Priority Level" set to "High"
    When I click edit on the note
    And I change "Priority Level" to "Critical"
    And I click "Save"
    Then I should see "Priority Level: Critical"
    And I should not see "Priority Level: High"

  Scenario: Edit preserves note text when changing field value
    Given a text custom field "Priority Level" exists
    And a note exists with text "Note text to preserve" and "Priority Level" set to "Medium"
    When I click edit on the note
    And I change "Priority Level" to "Low"
    And I click "Save"
    Then I should see "Note text to preserve"
    And I should see "Priority Level: Low"

  Scenario: Note card shows call ID in header
    When I create a note with a specific call ID
    Then the note card header should show a truncated call ID

  Scenario: Notes grouped under same call share one header
    When I create two notes with the same call ID
    Then both notes should appear under a single call header

  Scenario: Edit saves updated text correctly
    Given a note exists
    When I click edit on the note
    And I change the note text to "Updated content"
    And I click "Save"
    Then I should see "Updated content"
    And I should not see the original text
