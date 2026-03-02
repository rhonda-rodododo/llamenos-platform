@android @ios @desktop
Feature: Custom Fields Administration
  As an admin
  I want to define custom note fields
  So that volunteers capture structured data during calls

  Background:
    Given I am logged in as an admin
    And I navigate to the "Hub Settings" page
    And I expand the "Custom Note Fields" section

  Scenario: Custom fields section visible in admin settings
    Then I should see the "Custom Note Fields" heading

  Scenario: Admin can add a text custom field
    When I click "Add Field"
    And I fill in the field label with "Severity"
    Then the field name should auto-generate as "severity"
    When I click "Save"
    Then I should see a success message
    And "Severity" should appear in the field list

  Scenario: Admin can add a select custom field with options
    When I click "Add Field"
    And I fill in the field label with "Category"
    And I change the field type to "select"
    And I add option "Crisis"
    And I add option "Information"
    And I click "Save"
    Then I should see a success message
    And "Category" should appear in the field list

  Scenario: Admin can delete a custom field
    Given a custom field "ToDelete" exists
    When I click the delete button on "ToDelete"
    And I confirm the deletion
    Then "ToDelete" should no longer appear in the field list
