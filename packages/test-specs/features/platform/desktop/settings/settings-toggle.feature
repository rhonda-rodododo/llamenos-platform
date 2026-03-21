@desktop
Feature: Settings toggle confirmation dialogs
  Admins confirm before toggling destructive settings
  to prevent accidental changes to live system configuration.

  Background:
    Given I am logged in as admin

  Scenario: Toggling a live setting shows a confirmation dialog
    When I navigate to the "Hub Settings" page
    And I expand the "Spam Mitigation" section
    And I click the spam mitigation toggle
    Then I should see a confirmation dialog
    And I can cancel without applying the change

  Scenario: Command palette opens with keyboard shortcut
    When I press "Control+k"
    Then I should see the command palette
    And it should be focusable and searchable
