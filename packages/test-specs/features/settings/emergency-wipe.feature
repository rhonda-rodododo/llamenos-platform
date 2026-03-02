@android @ios @desktop @regression
Feature: Emergency Wipe
  As a volunteer
  I want a panic button that instantly wipes all local data
  So that I can protect sensitive information in an emergency

  Background:
    Given I am on the settings screen

  Scenario: Emergency wipe button is visible
    Then I should see the emergency wipe button

  Scenario: Emergency wipe shows confirmation dialog
    When I tap the emergency wipe button
    Then I should see the emergency wipe confirmation dialog
    And the dialog should warn about permanent data loss

  Scenario: Confirming emergency wipe clears all data
    When I tap the emergency wipe button
    And I confirm the emergency wipe
    Then all local data should be erased
    And I should be returned to the login screen

  Scenario: Cancelling emergency wipe keeps data intact
    When I tap the emergency wipe button
    And I cancel the emergency wipe
    Then the confirmation dialog should close
    And I should still be on the settings screen
