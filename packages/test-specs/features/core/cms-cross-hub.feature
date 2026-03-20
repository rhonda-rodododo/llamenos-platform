@backend @cases
Feature: Cross-Hub Case Visibility
  Hub admins can opt-in to share case summaries with super-admins
  for cross-organization coordination.

  Scenario: Enable cross-hub sharing for a hub
    Given case management is enabled
    When the admin enables cross-hub sharing
    Then cross-hub sharing should be enabled

  Scenario: Disable cross-hub sharing
    Given case management is enabled
    And cross-hub sharing is enabled
    When the admin disables cross-hub sharing
    Then cross-hub sharing should be disabled

  Scenario: Cross-hub sharing is disabled by default
    Given case management is enabled
    Then cross-hub sharing should be disabled
