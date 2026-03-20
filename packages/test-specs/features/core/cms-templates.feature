@backend
Feature: CMS Templates
  Admins can browse, inspect, and apply bundled case management
  templates that pre-configure entity types and relationships.

  @cases
  Scenario: List available templates
    Given case management is enabled
    When the admin lists available templates
    Then the template catalog should have at least 3 templates
    And each template should have an id, name, and description

  @cases
  Scenario: Get template details
    Given case management is enabled
    When the admin gets details for template "jail-support"
    Then the template should have entity types
    And the template should have relationship types

  @cases
  Scenario: Apply jail-support template
    Given case management is enabled
    When the admin applies template "jail-support"
    Then the template should be applied successfully
    And entity types from the template should exist
    And relationship types from the template should exist

  @cases
  Scenario: Apply multiple templates
    Given case management is enabled
    When the admin applies template "jail-support"
    And the admin applies template "street-medic"
    Then entity types from both templates should exist

  @cases @permissions
  Scenario: Volunteer cannot apply templates
    Given case management is enabled
    When a volunteer tries to apply template "jail-support"
    Then the response status should be 403
