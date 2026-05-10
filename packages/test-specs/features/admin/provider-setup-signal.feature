@backend
Feature: Signal Bridge Registration
  As an admin
  I want to register a phone number with a Signal bridge
  So that the hotline can send and receive Signal messages

  Scenario: Register via SMS — bridge confirms automatically
    Given I am a signal registration admin
    When I POST to start Signal registration with SMS method
    Then the signal registration response is 200
    And the registration status is "pending"
    And the registration has a masked phone number

  Scenario: Register via voice — admin enters code — registration completes
    Given I am a signal registration admin
    When I POST to start Signal registration with voice method
    Then the signal registration response is 200
    And the registration status is "pending"
    When I POST to verify Signal registration with a valid code
    Then the signal registration response is 200
    And the registration status is "complete"

  Scenario: Wrong verification code 3 times — registration fails
    Given I am a signal registration admin
    When I POST to start Signal registration with voice method
    And I POST to verify Signal registration with a wrong code
    And I POST to verify Signal registration with a wrong code
    And I POST to verify Signal registration with a wrong code
    Then the registration status is "failed"

  Scenario: Get Signal registration status
    Given I am a signal registration admin
    And a Signal registration is in progress
    When I GET the Signal registration status by id
    Then the signal registration response is 200
    And the registration has a masked phone number

  Scenario: Unregister existing Signal number
    Given I am a signal registration admin
    And a Signal registration is in progress
    When I DELETE to unregister Signal
    Then the signal registration response is 200

  Scenario: Bridge URL with loopback address is rejected (SSRF)
    Given I am a signal registration admin
    When I POST to start Signal registration with a loopback bridge URL
    Then the signal registration response is 400

  Scenario: Non-admin cannot register Signal
    Given I am a signal registration volunteer
    When I POST to start Signal registration with SMS method
    Then the signal registration response is 403
