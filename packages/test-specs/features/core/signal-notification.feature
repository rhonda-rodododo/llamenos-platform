@backend @integration @signal @notifications
Feature: Signal Notification Service
  As the Signal notification sidecar
  I want to send security alerts and operational notifications via Signal
  So that volunteers and admins receive timely, reliable notifications

  # ── Contact Registration ──────────────────────────────────────────

  Scenario: Register Signal contact for notifications
    Given the admin is authenticated
    When the admin registers a Signal contact with number "+15550001111"
    Then the contact should be stored in the notification service
    And the contact registration should succeed

  # ── Security Alert Delivery ───────────────────────────────────────

  # @fixme: requires POST /api/notify to actually deliver via signal-cli, which
  # requires a real registered Signal account. Neither CI nor local dev provisions
  # one (SIGNAL_REGISTERED_NUMBER is a placeholder +1555... value) — signal-cli-rest-api
  # returns 400 "Specified account does not exist" for /v2/send in that state. This is
  # a pre-existing gap (not caused by the @signal-unreachable-resilience fix that added
  # this tag), unmasked because the step definitions no longer vacuously pass when the
  # sidecar rejects the request. Needs either a provisioned test Signal number or a
  # delivery mock in signal-notifier before this can run in CI.
  @fixme
  Scenario: Security alert sent on new login IP
    Given a volunteer has a registered Signal notification contact
    When a new login from IP "203.0.113.42" is detected for the volunteer
    Then a security alert notification should be dispatched
    And the notification should contain the login IP

  # ── Delivery Reliability ──────────────────────────────────────────

  # @fixme: signal-notifier's POST /api/notify is a single synchronous call with no
  # persisted retry queue and no GET /notify/:id endpoint (see signal-notifier/src/routes.ts)
  # — this scenario tests a retry-tracking feature that does not exist in the current
  # implementation. Needs either retry tracking added to signal-notifier or this
  # scenario rewritten to match the sidecar's actual synchronous contract.
  @fixme
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

  # @fixme: signal-notifier has no preference model of its own (preference filtering,
  # if it exists, is app-level). The real alert model (apps/worker/services/
  # user-notifications.ts AlertInput) has no generic "security event" case and no
  # "login_only"/"all" preference — this scenario's semantics don't map onto the
  # actual implementation. Needs rewriting once the real alert-type filtering design
  # (alertOnNewDevice / alertOnPasskeyChange / alertOnPinChange) is reflected here.
  @fixme
  Scenario: Security preferences control which alerts are sent
    Given a volunteer has security notification preferences set to "login_only"
    When a non-login security event occurs
    Then no notification should be dispatched for that event

  @fixme
  Scenario: All-alerts preference sends notification for every security event
    Given a volunteer has security notification preferences set to "all"
    When any security event occurs
    Then a notification should be dispatched

  # ── Health Check ──────────────────────────────────────────────────

  Scenario: Signal notification service health check returns healthy
    When the signal-notifier health endpoint is requested
    Then the notifier response status should be 200
