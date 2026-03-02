@android @ios @desktop
Feature: Role Management
  As an admin
  I want to manage roles and permissions
  So that I can control access levels for volunteers

  Background:
    Given I am logged in as an admin

  Scenario: List default roles
    When I request the roles list
    Then I should see at least 5 roles
    And I should see "Super Admin" role
    And I should see "Hub Admin" role
    And I should see "Reviewer" role
    And I should see "Volunteer" role
    And I should see "Reporter" role

  Scenario: Super Admin has wildcard permission
    When I request the roles list
    Then the "Super Admin" role should have wildcard permission
    And the "Super Admin" role should be a system role
    And the "Super Admin" role should be the default role

  Scenario: Create a custom role
    When I create a custom role "Call Monitor" with permissions
    Then the role should be created successfully
    And the role slug should be "call-monitor"

  Scenario: Delete a custom role
    Given a custom role "Temp Role" exists
    When I delete the "Temp Role" role
    Then the role should be removed

  Scenario: Cannot delete system roles
    When I attempt to delete the "Super Admin" role
    Then the deletion should fail with a 403 error

  Scenario: Assign role to volunteer
    Given a volunteer exists
    When I assign the "Reviewer" role to the volunteer
    Then the volunteer should have the "Reviewer" role

  Scenario: Volunteer with Reviewer role can access notes
    Given a volunteer with the "Reviewer" role exists
    When the reviewer logs in
    Then they should see "Notes" in the navigation

  Scenario: Reporter role has limited permissions
    When I request the "Reporter" role details
    Then it should have "reports:create" permission
    And it should not have "notes:read" permission
