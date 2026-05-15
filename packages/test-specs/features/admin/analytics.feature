@backend
Feature: Analytics API
  As an admin
  I want to view analytics about call activity, volunteer performance, and messaging
  So that I can monitor hub operations and identify trends

  Scenario: Hub admin fetches hourly call distribution
    Given I am authenticated as a hub admin
    And the hub has call records across multiple hours
    When I fetch hourly distribution for the last 7 days
    Then I receive 24 hour buckets
    And the total across buckets matches the call count

  Scenario: Hub admin fetches per-user stats
    Given I am authenticated as a hub admin
    And volunteers have answered calls and created notes
    When I fetch user stats for the last 30 days
    Then users are sorted by calls answered descending
    And each user entry includes callsAnswered, avgDurationSeconds, and notesCreated

  Scenario: Authenticated user fetches personal stats
    Given I am authenticated as a volunteer
    And I have answered 3 calls today
    When I fetch my personal stats
    Then callsToday is 3
    And the response does not include other users' data

  Scenario: Non-admin user gets 403 on analytics endpoints
    Given I am authenticated as a volunteer without audit:read
    When I try to fetch call metrics
    Then I receive a 403 Forbidden response

  Scenario: Analytics date range filters results
    Given I am authenticated as a hub admin
    And there are calls from May 1 through May 10
    When I fetch call metrics from May 5 to May 7
    Then only calls within that range are included

  Scenario: Platform admin fetches cross-hub metrics
    Given I am authenticated as a platform admin
    And there are calls in hub-A and hub-B
    When I fetch platform-scoped call metrics
    Then the totals aggregate across both hubs
