@android @ios @desktop @regression
Feature: Call-to-Note Navigation
  As a volunteer reviewing call history
  I want to create notes linked to specific calls
  So that I can document incidents with call context

  Background:
    Given I am authenticated and on the main screen

  Scenario: Add note button is visible on call record cards
    Given I am on the call history screen
    Then each call record should have an add note button

  Scenario: Tapping add note navigates to note creation with call context
    Given I am on the call history screen
    When I tap the add note button on a call record
    Then I should see the note creation screen
