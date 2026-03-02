@android @ios @desktop
Feature: Conversations (Desktop)
  As a volunteer or admin
  I want to manage messaging conversations
  So that I can respond to text-based contacts

  Background:
    Given I am logged in as an admin

  Scenario: View conversation thread
    Given a conversation exists
    When I navigate to the "Conversations" page
    And I click on a conversation
    Then I should see the conversation thread
    And I should see message timestamps

  Scenario: Send a message in conversation
    Given I have an open conversation
    When I type a message in the reply field
    And I click "Send"
    Then the message should appear in the thread

  Scenario: Conversation shows channel badge
    Given conversations from different channels exist
    When I navigate to the "Conversations" page
    Then each conversation should show its channel badge

  Scenario: Assign conversation to volunteer
    Given a conversation exists
    When I assign the conversation to a volunteer
    Then the conversation should show the assigned volunteer

  Scenario: Close a conversation
    Given an open conversation exists
    When I close the conversation
    Then the conversation status should change to "Closed"

  Scenario: Reopen a closed conversation
    Given a closed conversation exists
    When I reopen the conversation
    Then the conversation status should change to "Open"

  Scenario: Conversation search
    Given conversations exist
    When I search for a phone number
    Then matching conversations should be displayed
