@backend
Feature: A2P/10DLC Compliance Registration
  As an admin
  I want to register my brand and campaign for A2P/10DLC compliance
  So that my SMS messages are delivered without carrier filtering

  Scenario: Submit brand registration — pending status returned
    Given I am an a2p registration admin
    When I POST to submit A2P brand registration
    Then the a2p registration response is 200
    And the brand status is "pending"

  Scenario: Submit campaign after brand approved
    Given I am an a2p registration admin
    And an A2P brand is in approved state
    When I POST to submit A2P campaign
    Then the a2p registration response is 200
    And the campaign status is "pending"

  Scenario: Submit campaign before brand approved returns 400
    Given I am an a2p registration admin
    And an A2P brand is in pending state
    When I POST to submit A2P campaign
    Then the a2p registration response is 400

  Scenario: Get A2P registration status
    Given I am an a2p registration admin
    And an A2P brand is in pending state
    When I GET the A2P status by registration id
    Then the a2p registration response is 200
    And the brand status is "pending"

  Scenario: Skip A2P registration
    Given I am an a2p registration admin
    When I POST to skip A2P registration
    Then the a2p registration response is 200
    And the brand status is "skipped"
    And the campaign status is "skipped"

  Scenario: Provider does not support A2P returns 400
    Given I am an a2p registration admin
    When I POST to submit A2P brand registration for provider "vonage"
    Then the a2p registration response is 400

  Scenario: Non-admin cannot submit A2P brand
    Given I am an a2p registration volunteer
    When I POST to submit A2P brand registration
    Then the a2p registration response is 403
