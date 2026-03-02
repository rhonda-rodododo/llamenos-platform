@android @ios @desktop
Feature: Message Blasts
  As an admin
  I want to send bulk messages to volunteers
  So that I can communicate important updates quickly

  Background:
    Given I am logged in as an admin

  Scenario: Create a blast message
    When I navigate to the "Blasts" page
    And I click "New Blast"
    And I compose a blast message
    And I select recipients
    And I click "Send"
    Then the blast should appear in the blast list

  Scenario: Blast recipient selection
    When I navigate to the "Blasts" page
    And I click "New Blast"
    Then I should see the recipient selection interface
    And I should be able to select individual volunteers
    And I should be able to select all volunteers

  Scenario: Schedule a blast
    When I navigate to the "Blasts" page
    And I click "New Blast"
    And I compose a blast message
    And I set a future send time
    And I click "Schedule"
    Then the blast should appear as "Scheduled"

  Scenario: Blast delivery status
    Given a blast has been sent
    When I navigate to the "Blasts" page
    Then I should see the delivery status for the blast
