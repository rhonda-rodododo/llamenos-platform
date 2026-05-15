@desktop
Feature: Account Erasure Self-Service
  As a volunteer
  I want to request deletion of my account data
  So that I can exercise my GDPR right to erasure

  Background:
    Given I am logged in as a volunteer

  Scenario: Account erasure section is visible in settings
    When I navigate to the "Settings" page
    And I expand the "Account Erasure" section
    Then I should see the erasure request button or pending state

  Scenario: Erasure section shows request button when no active request
    When I navigate to "/settings?section=account-erasure"
    Then I should see the erasure available state or pending state

  Scenario: Deep link to account-erasure section auto-expands it
    When I navigate to "/settings?section=account-erasure"
    Then the account erasure section should be visible
