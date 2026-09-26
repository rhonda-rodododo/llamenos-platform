@backend @global-setting @demo-dataset
Feature: Demo dataset and demo reset
  As the operator of a public demo instance
  I want a fixed, obviously fictional dataset that can be re-seeded and reset
  So that every visitor sees a populated hotline and the "data resets daily" promise is kept

  # These scenarios seed one fixed hub (and the five demo accounts), so they run in the
  # serial @global-setting project. The After hook removes the demo hub and accounts again.

  Scenario: Seeding builds the fixed fictional dataset in one hub
    When the demo dataset is seeded
    Then the demo hub has 12 calls in its history
    And the demo hub has 3 shifts covering all 7 days
    And the demo volunteer is on shift now
    And the demo hub has 8 contacts
    And the demo hub has 2 cases
    And the demo hub has one conversation for each configured messaging channel
    And the demo hub audit log is a valid hash chain with entries

  Scenario: Seeding twice leaves the same row counts as seeding once
    When the demo dataset is seeded
    And the demo hub row counts are recorded
    And the demo dataset is seeded
    Then the demo hub row counts are unchanged

  Scenario: The demo volunteer decrypts their own notes
    When the demo dataset is seeded
    Then every note written by the demo volunteer decrypts to its authored text for that volunteer

  Scenario: The demo admin decrypts every note and call record
    When the demo dataset is seeded
    Then every demo note decrypts to its authored text for the demo admin
    And every demo call record decrypts for the demo admin with the fictional caller number

  Scenario: The demo volunteer only sees their own notes
    When the demo dataset is seeded
    Then the demo volunteer sees only their own notes and the demo admin sees all of them

  Scenario: Demo reset is refused on an instance that is not a demo deployment
    Given the demo dataset is seeded
    When the demo admin requests a demo reset
    Then the response status is 403
    And the error message contains "DEMO_MODE"
    And the demo hub has 12 calls in its history

  Scenario: Demo reset is refused for a volunteer
    Given the demo dataset is seeded
    When the demo volunteer requests a demo reset
    Then the response status is 403
    And the demo hub has 12 calls in its history

  Scenario: Demo reset requires authentication
    When an unauthenticated client requests a demo reset
    Then the response status is 401
