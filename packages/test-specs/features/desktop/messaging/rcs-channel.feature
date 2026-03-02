@desktop
Feature: RCS Channel Configuration
  As an admin
  I want to configure RCS messaging
  So that the hotline can communicate via rich messaging

  Background:
    Given I am logged in as an admin

  Scenario: RCS settings form displays
    When I navigate to the messaging channel settings
    Then I should see the RCS configuration section

  Scenario: Save RCS configuration
    When I fill in valid RCS settings
    And I click "Save"
    Then I should see a success message
