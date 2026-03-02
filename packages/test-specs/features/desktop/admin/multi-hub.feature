@desktop
Feature: Multi-Hub Management
  As a super admin
  I want to manage multiple hubs
  So that different organizations can use the same deployment

  Background:
    Given I am logged in as an admin

  Scenario: Create a new hub
    When I navigate to the hub management page
    And I click "Create Hub"
    And I fill in the hub name
    And I click "Save"
    Then the new hub should appear in the hub list

  Scenario: Switch between hubs
    Given multiple hubs exist
    When I select a different hub
    Then the app should switch to the selected hub context

  Scenario: Hub settings display
    When I navigate to the hub settings
    Then I should see the hub-specific configuration

  Scenario: Hub-specific volunteer list
    Given multiple hubs exist
    When I switch to a specific hub
    And I navigate to the "Volunteers" page
    Then I should see only volunteers for that hub

  Scenario: Hub deletion confirmation
    Given a non-default hub exists
    When I click "Delete" on the hub
    Then I should see a confirmation dialog
    When I confirm the deletion
    Then the hub should be removed
