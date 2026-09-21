@backend
Feature: Per-hub IVR language menu override
  As a hub admin
  I want my hub's caller-facing IVR language menu to be independently configurable
  So that callers to my hub only hear languages relevant to my community, regardless
  of what other hubs on the same instance offer

  # Each scenario runs against its own isolated hub (the workerHub fixture), so
  # setting a hub override or a hub telephony provider here never leaks into any
  # other scenario. Nothing here writes the instance-wide (global) IVR language
  # list — it is a shared singleton read by every concurrently-running scenario.

  @backend
  Scenario: A hub-specific override takes effect for that hub's IVR menu
    When the admin sets the hub's IVR languages to "fr,de"
    Then the response status should be 200
    When the admin gets the hub's IVR languages
    Then the response status should be 200
    And the hub's IVR languages should be exactly "fr,de"

  @backend
  Scenario: A hub with no override inherits the instance-wide IVR language list
    Given the admin gets the instance-wide IVR languages
    When the admin gets the hub's IVR languages
    Then the response status should be 200
    And the hub's IVR languages should equal the instance-wide IVR languages

  @backend
  Scenario: A hub override naming a language the active provider cannot speak is rejected
    Given the hub's telephony provider is configured as "vonage"
    When the admin sets the hub's IVR languages to "en,ht"
    Then the response status should be 400
    And the error message contains "ht"
