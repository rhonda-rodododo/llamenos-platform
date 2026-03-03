@backend
Feature: Permission System
  As the authorization layer
  I want to enforce role-based permissions
  So that users can only access resources they are authorized for

  Scenario: Super Admin has wildcard access
    Given a user with the "Super Admin" role
    Then they should pass permission checks for any action

  Scenario: Volunteer has limited permissions
    Given a user with the "Volunteer" role
    Then they should pass permission checks for "notes:create"
    And they should fail permission checks for "admin:settings"

  Scenario: Reporter can only create reports
    Given a user with the "Reporter" role
    Then they should pass permission checks for "reports:create"
    And they should fail permission checks for "notes:read"

  Scenario: Domain wildcard grants all actions in domain
    Given a role with "notes:*" permission
    Then it should grant "notes:create" and "notes:read" and "notes:delete"

  Scenario: Multi-role user gets union of permissions
    Given a user with "Volunteer" and "Reviewer" roles
    Then they should have permissions from both roles combined

  Scenario: Hub-scoped permissions restrict to specific hub
    Given a user with hub-scoped admin permissions
    Then they should only have admin access to their assigned hub

  Scenario: Custom role grants only specified permissions
    Given a custom role with "calls:answer" and "notes:create" permissions
    Then the user should pass checks for those permissions only
