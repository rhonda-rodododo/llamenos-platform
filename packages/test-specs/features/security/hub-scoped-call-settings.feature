@backend @security @hub-scoped-call-settings
Feature: Spam and call settings are scoped to the hub being edited
  As a hub admin
  I want changes to my hub's spam mitigation and call settings to affect only my hub
  So that no single hub admin can switch off rate limiting or force CAPTCHA on every other hub

  # Each scenario runs against its own isolated hub (the workerHub fixture) plus a
  # second hub created in the scenario. Nothing here writes the instance-wide values:
  # system_settings is a singleton shared with every concurrently-running scenario.

  Scenario: A hub admin editing their hub's spam settings leaves other hubs unchanged
    Given a second hub exists
    And the second hub's spam settings are set to rate limiting on and CAPTCHA off
    And a hub admin who administers only the first hub
    When the hub admin sets the first hub's spam settings to rate limiting off and CAPTCHA on
    Then the response status should be 200
    And the first hub's spam settings should show rate limiting off and CAPTCHA on
    And the second hub's spam settings should show rate limiting on and CAPTCHA off

  Scenario: A hub admin editing their hub's call settings leaves other hubs unchanged
    Given a second hub exists
    And the second hub's queue timeout is set to 200 seconds
    And a hub admin who administers only the first hub
    When the hub admin sets the first hub's queue timeout to 45 seconds
    Then the response status should be 200
    And the first hub's queue timeout should be 45 seconds
    And the second hub's queue timeout should be 200 seconds

  Scenario: A hub admin cannot edit spam settings platform-wide
    Given a hub admin who administers only the first hub
    When the hub admin sets the platform-wide spam settings to rate limiting off
    Then the response status should be 403

  Scenario: A hub admin cannot redirect a settings edit at another hub with a query parameter
    Given a second hub exists
    And the second hub's spam settings are set to rate limiting on and CAPTCHA off
    And a hub admin who administers only the first hub
    When the hub admin sets the first hub's spam settings to rate limiting off through the second hub's query parameter
    Then the second hub's spam settings should show rate limiting on and CAPTCHA off
