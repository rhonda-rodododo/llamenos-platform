@android
Feature: Hub switching
  Users can switch between hubs they belong to.

  Background:
    Given the app is launched with two test hubs

  Scenario: Switching hubs changes active hub indicator
    Given I am on the hub management screen
    When I tap the second hub in the list
    Then the second hub shows the active indicator
    And the first hub no longer shows the active indicator

  Scenario: Switching hubs reloads hub-scoped data
    Given I am on the hub management screen
    When I tap the second hub in the list
    And I navigate to the notes screen
    Then the notes screen loads without error
