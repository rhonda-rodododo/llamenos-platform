@android @ios @desktop @regression
Feature: Notes Search
  As a volunteer
  I want to search through my notes
  So that I can quickly find relevant information

  Background:
    Given I am authenticated and on the main screen

  Scenario: Search bar is visible on notes tab
    Given I navigate to the notes tab
    Then I should see the notes search input

  Scenario: Search filters notes by content
    Given I navigate to the notes tab
    When I type in the notes search input
    Then the notes list should update

  Scenario: Clearing search shows all notes
    Given I navigate to the notes tab
    When I type in the notes search input
    And I clear the notes search
    Then I should see the full notes list
