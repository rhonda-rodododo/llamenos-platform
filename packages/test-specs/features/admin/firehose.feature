@desktop @backend
Feature: Firehose Inference Agent
  As a hub admin
  I want to manage firehose connections that extract structured reports from Signal groups
  So that incoming field reports are automatically processed by AI

  Background:
    Given I am logged in as an admin

  Scenario: Create a firehose connection
    When I create a firehose connection with display name "Portland Observers" and report type "incident"
    Then the connection should be created with status "pending"
    And the connection should have an agent pubkey

  Scenario: List firehose connections
    Given a firehose connection exists with display name "PDX Team"
    When I list firehose connections
    Then I should see the connection "PDX Team" in the list

  Scenario: Update a firehose connection
    Given a firehose connection exists
    When I update the connection display name to "Updated Name"
    Then the connection display name should be "Updated Name"

  Scenario: Activate a firehose connection
    Given a firehose connection exists with status "pending"
    When I activate the connection
    Then the connection status should be "active"

  Scenario: Pause a firehose connection
    Given a firehose connection exists with status "active"
    When I pause the connection
    Then the connection status should be "paused"

  Scenario: Delete a firehose connection
    Given a firehose connection exists
    When I delete the firehose connection
    Then the connection should no longer exist

  Scenario: Get firehose health status
    Given a firehose connection exists
    When I request firehose health status
    Then I should receive health data with buffer size

  Scenario: Get buffer info for a connection
    Given a firehose connection exists
    When I request buffer info for the connection
    Then I should see the buffer size and agent running status

  Scenario: Notification opt-out
    Given a firehose connection exists
    When I opt out of notifications for the connection
    Then my notification opt-out should be recorded

  Scenario: Notification opt-in after opt-out
    Given a firehose connection exists
    And I have opted out of notifications for the connection
    When I opt in to notifications for the connection
    Then my notification opt-out should be removed

  Scenario: Connection requires firehose seal key
    Given the firehose seal key is not configured
    When I try to create a firehose connection
    Then I should receive a 503 error about missing seal key
