@desktop
Feature: WebRTC Settings
  As an admin
  I want to configure WebRTC calling
  So that volunteers can take calls directly in the browser

  Background:
    Given I am logged in as an admin

  Scenario: WebRTC settings display
    When I navigate to the "Hub Settings" page
    And I expand the WebRTC section
    Then I should see the WebRTC configuration options

  Scenario: Toggle WebRTC calling
    When I navigate to the WebRTC settings
    And I toggle the WebRTC calling switch
    Then the setting should be saved

  Scenario: STUN/TURN server configuration
    When I navigate to the WebRTC settings
    Then I should see fields for STUN and TURN server configuration
