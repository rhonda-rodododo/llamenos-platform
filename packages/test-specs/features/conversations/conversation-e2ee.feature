@android @ios @desktop @regression
Feature: Conversation E2EE Indicator
  As a volunteer
  I want to see that my conversations are end-to-end encrypted
  So that I have confidence in the security of communications

  Background:
    Given I am authenticated and on the main screen

  Scenario: E2EE indicator is visible on conversation detail
    Given I navigate to the conversations tab
    And I open a conversation
    Then I should see the E2EE encryption indicator

  Scenario: E2EE indicator shows lock icon and text
    Given I navigate to the conversations tab
    And I open a conversation
    Then I should see the E2EE encryption indicator
    And the indicator should display "End-to-end encrypted"
