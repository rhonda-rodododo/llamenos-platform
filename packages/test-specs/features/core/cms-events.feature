@backend
Feature: CMS Events — Unified Entity System
  Events are CMS records whose entity type has category='event'.
  The /api/events routes are deprecated and return 301 redirects.
  Event data uses 3-tier E2EE like all other records.

  @events @deprecated-api
  Scenario: Deprecated /api/events returns 301 redirect
    Given case management is enabled
    When a client sends GET /api/events
    Then the response status should be 301
    And the response Location header should contain /api/records
    And the response should include a Deprecation header

  @events @entity-system
  Scenario: Create event record via /api/records with event entity type
    Given case management is enabled
    And an entity type with category "event" exists for the hub
    When the admin creates a record with that entity type
    Then the record should be persisted
    And the record entity type category should be "event"
    And the record should use 3-tier encryption (summary + fields + pii tiers)

  @events @blind-index
  Scenario: Filter event records by date blind index token
    Given case management is enabled
    And an entity type with category "event" exists for the hub
    And a record exists with blindIndexes containing "month:2026-05" for field "start_date"
    And a record exists with blindIndexes containing "month:2026-06" for field "start_date"
    When the admin lists records with blindIndexToken "month:2026-05" and field "start_date"
    Then the result should contain 1 record
    And that record's blind indexes should contain "month:2026-05"
