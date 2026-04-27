@backend @integration @signal @notifications
Feature: Signal Notification Service
  As the Signal notification sidecar
  I want to send security alerts and operational notifications via Signal
  So that volunteers and admins receive timely, reliable notifications

  # ── Contact Registration ──────────────────────────────────────────

  Scenario: Register Signal contact for notifications
    Given an admin is authenticated
    When the admin registers a Signal contact with number "+15550001111"
    Then the contact should be stored in the notification service
    And the contact registration should succeed

  # ── Security Alert Delivery ───────────────────────────────────────

  Scenario: Security alert sent on new login IP
    Given a volunteer has a registered Signal notification contact
    When a new login from IP "203.0.113.42" is detected for the volunteer
    Then a security alert notification should be dispatched
    And the notification should contain the login IP

  # ── Delivery Reliability ──────────────────────────────────────────

  Scenario: Notification delivery with retry on failure
    Given a registered Signal notification contact
    When the first delivery attempt fails
    Then the notification should be retried
    And the retry count should increment

  # ── Contact Management ────────────────────────────────────────────

  Scenario: Unregister Signal contact stops notifications
    Given a volunteer has a registered Signal notification contact
    When the contact is unregistered
    Then subsequent notifications should not be dispatched to that contact

  # ── Security Preferences ──────────────────────────────────────────

  Scenario: Security preferences control which alerts are sent
    Given a volunteer has security notification preferences set to "login_only"
    When a non-login security event occurs
    Then no notification should be dispatched for that event

  Scenario: All-alerts preference sends notification for every security event
    Given a volunteer has security notification preferences set to "all"
    When any security event occurs
    Then a notification should be dispatched

  # ── Health Check ──────────────────────────────────────────────────

  Scenario: Signal notification service health check returns healthy
    When the signal-notifier health endpoint is requested
    Then the notifier response status should be 200
