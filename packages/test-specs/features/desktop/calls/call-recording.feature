@desktop
Feature: Call Recording
  As an admin
  I want to view call recordings
  So that I can review past calls for quality and training

  Background:
    Given I am logged in as an admin

  Scenario: Call history shows recording badge
    Given a call with a recording exists
    When I navigate to the "Calls" page
    Then the call entry should show a recording badge

  Scenario: Play recording from call detail
    Given a call with a recording exists
    When I open the call detail
    Then I should see the recording player
    And the play button should be visible

  Scenario: Recording player controls
    Given I am viewing a call with a recording
    Then I should see play, pause, and progress controls

  Scenario: Call without recording shows no badge
    Given a call without a recording exists
    When I navigate to the "Calls" page
    Then the call entry should not show a recording badge
