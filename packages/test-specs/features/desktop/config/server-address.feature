@desktop
Feature: Desktop server address configuration (#738, #739)
  A packaged Tauri build loads over the tauri:// asset protocol, where a
  relative /api path resolves to nothing — the app has no default backend to
  reach. The user must be able to tell the app which Llámenos server to talk
  to on first run, change it later, and be confident the app can never reach
  an unconfigured host (the CSP connect-src allowlist is gone — enforcement
  moved to a runtime check against the configured address).

  Scenario: First run prompts for a server address
    Given the desktop app is simulating a packaged build with no server configured
    When I load the app
    Then I should see the server address screen
    And I should see the server address input

  Scenario: A bad address shows an unreachable error
    Given the desktop app is simulating a packaged build with no server configured
    When I load the app
    And I enter "127.0.0.1:1" as the server address and submit
    Then I should see a server address error
    And I should still see the server address screen

  Scenario: A good address reaches the login screen and requests actually land on it
    Given the desktop app is simulating a packaged build with no server configured
    And a real test backend server is running
    When I load the app
    And I enter the test backend server's address and submit
    Then I should be on the login screen
    And the test backend server should have received a request to "/api/health"
    And the test backend server should have received a request to "/api/config"

  Scenario: The address persists across a reload
    Given the desktop app is simulating a packaged build with no server configured
    And a real test backend server is running
    When I load the app
    And I enter the test backend server's address and submit
    And I reload the page
    Then I should be on the login screen
    And I should not see the server address screen

  Scenario: A request to an unconfigured host is blocked at runtime, not by CSP
    Given the desktop app is simulating a packaged build with no server configured
    And a real test backend server is running
    And I have configured that server and reached the login screen
    When the app attempts a network request to an unconfigured origin
    Then the request is blocked by the runtime allowlist

  Scenario: The address can be changed later from settings, clearing the old session
    Given a real test backend server is running
    And I am logged in as an admin
    And the desktop app is now simulating a packaged build
    When I open the settings server address section
    And I enter the test backend server's address and save
    Then the app reloads and requests land on the test backend server
    And my session is cleared
