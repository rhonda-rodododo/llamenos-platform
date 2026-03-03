@backend
Feature: Conversation Routing
  As the messaging system
  I want to route conversations to the right handler
  So that messages are delivered correctly

  Scenario: Inbound SMS creates new conversation
    Given a new phone number sends an SMS
    When the webhook is received
    Then a new conversation should be created

  Scenario: Inbound message to existing conversation appends
    Given an existing conversation with a phone number
    When a new message arrives from the same number
    Then the message should be appended to the existing thread

  Scenario: Conversation is assigned to available volunteer
    Given a new conversation arrives
    And volunteers are available
    Then the conversation should be assigned to a volunteer

  Scenario: Auto-assign balances load across volunteers
    Given 3 volunteers with 2, 5, and 1 active conversations
    When a new conversation arrives
    Then it should be assigned to the volunteer with 1 conversation

  Scenario: Channel badge reflects message source
    Given messages from SMS and WhatsApp channels
    Then each conversation should have the correct channel type

  Scenario: Closed conversation can be reopened
    Given a conversation with status "closed"
    When a new inbound message arrives
    Then the conversation status should change to "active"
