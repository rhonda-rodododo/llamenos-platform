@android @ios @desktop @regression
Feature: Conversation Note Creation
  As a volunteer
  I want to add notes linked to a conversation
  So that I can document important details from the interaction

  Background:
    Given I am authenticated and on the main screen

  Scenario: Add Note button is visible on conversation detail
    Given I navigate to the conversations tab
    And I open a conversation
    Then I should see the add note button

  Scenario: Tapping Add Note navigates to note creation
    Given I navigate to the conversations tab
    And I open a conversation
    When I tap the add note button
    Then I should see the note creation screen
