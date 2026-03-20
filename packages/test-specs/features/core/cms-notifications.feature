@backend @cases
Feature: Support Contact Notifications
  When a case status changes, support contacts linked to the case
  can be notified via their preferred messaging channel.
  The API accepts pre-rendered messages from the client (E2EE constraint)
  and dispatches them via the appropriate MessagingAdapter.

  Background:
    And case management is enabled

  Scenario: Notify support contacts dispatches per recipient
    And an entity type "notify_test" exists
    And a record of type "notify_test" exists
    And a contact with role "support_contact" is linked to the record
    When the admin triggers notifications for the record with recipients
    Then the notify response should include 1 recipient result

  Scenario: Multiple recipients each get a dispatch attempt
    And an entity type "notify_multi_test" exists
    And a record of type "notify_multi_test" exists
    And 2 contacts with role "support_contact" are linked to the record
    When the admin triggers notifications for the record with all support contact recipients
    Then the notify response should include 2 recipient results

  Scenario: Empty recipients returns validation error
    And an entity type "notify_empty_test" exists
    And a record of type "notify_empty_test" exists
    When the admin triggers notifications with no recipients
    Then the response status should be 400

  Scenario: Volunteer without cases:update cannot send notifications
    And an entity type "notify_perm_test" exists
    And a record of type "notify_perm_test" exists
    And a volunteer exists without cases:update permission
    When the volunteer tries to send notifications for the record
    Then the response status should be 403

  Scenario: Contacts without support_contact role are not auto-included
    And an entity type "notify_skip_test" exists
    And a record of type "notify_skip_test" exists
    And a contact with role "arrestee" is linked to the record
    When the admin lists contacts linked to the record
    Then the linked contact should have role "arrestee"
