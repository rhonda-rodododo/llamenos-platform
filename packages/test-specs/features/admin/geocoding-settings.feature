@backend
Feature: Geocoding Settings
  As an admin
  I want to configure and test the geocoding provider
  So that volunteers can use address autocomplete and GPS capture in reports

  Scenario: Admin configures geocoding provider
    Given I am logged in as an admin
    When I configure the geocoding provider to "opencage"
    Then the geocoding settings response is 200
    And the geocoding settings do not expose the apiKey

  Scenario: Configured geocoding settings are retrievable
    Given I am logged in as an admin
    And geocoding is configured with provider "opencage" and enabled
    When I GET the geocoding settings
    Then the geocoding settings response is 200
    And the provider is "opencage"
    And geocoding is enabled

  Scenario: Non-admin cannot update geocoding settings
    Given I am logged in as a volunteer
    When I configure the geocoding provider to "opencage"
    Then the geocoding settings response is 403

  Scenario: Volunteer can access geocoding autocomplete route
    Given I am logged in as a volunteer
    When I POST geocoding autocomplete with query "Main St"
    Then the geocoding response is 200
    And the autocomplete result is an array

  Scenario: Geocoding autocomplete returns empty when not configured
    Given I am logged in as a volunteer
    And geocoding is not configured
    When I POST geocoding autocomplete with query "Main St"
    Then the geocoding response is 200
    And the autocomplete result is an empty array

  Scenario: Unauthenticated request to geocoding autocomplete is rejected
    When I POST geocoding autocomplete without authentication
    Then the geocoding response is 401

  Scenario: Unauthenticated request to geocoding settings is rejected
    When I GET geocoding settings without authentication
    Then the geocoding response is 401
