@android @ios @desktop @security @wip
Feature: HTTPS Enforcement
  As a security-conscious app
  I want all network connections to use HTTPS/WSS
  So that traffic cannot be intercepted

  # NOTE: HTTPS enforcement is verified at the platform level:
  #   - Android: network_security_config.xml (cleartextTrafficPermitted=false)
  #   - iOS: SecurityHardeningTests.testAPIServiceRejectsHTTP (4 unit tests)
  #   - Desktop: platform.ts apiRequest() enforces HTTPS
  # The @wip tag excludes these until setup wizard step defs are available.

  Scenario: HTTP hub URL is rejected during setup
    Given I am on the setup or identity creation screen
    When I enter hub URL "http://insecure.example.org"
    And I submit the form
    Then I should see an error about insecure connection
    And the connection should not be established

  Scenario: HTTPS hub URL is accepted
    Given I am on the setup or identity creation screen
    When I enter hub URL "https://hub.llamenos.org"
    And I submit the form
    Then I should not see a connection security error
