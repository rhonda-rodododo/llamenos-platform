@android @ios @desktop @regression
Feature: Note Editing
  As a volunteer
  I want to edit my existing notes
  So that I can correct or update information

  Background:
    Given I am authenticated and on the main screen

  Scenario: Edit button is visible on note detail
    Given I navigate to the notes tab
    And I open a note
    Then I should see the note edit button

  Scenario: Tapping edit enters edit mode
    Given I navigate to the notes tab
    And I open a note
    When I tap the note edit button
    Then I should see the note edit input

  Scenario: Canceling edit returns to read mode
    Given I navigate to the notes tab
    And I open a note
    When I tap the note edit button
    And I cancel editing
    Then I should see the note detail text
