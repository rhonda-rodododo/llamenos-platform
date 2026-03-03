@backend
Feature: Telephony Adapter
  As the call routing system
  I want to validate and use telephony provider configurations
  So that calls can be routed through the correct provider

  Scenario: Twilio adapter requires Account SID, Auth Token, and TwiML App SID
    Given a Twilio provider configuration
    When I validate with missing Account SID
    Then validation should fail with required field error

  Scenario: SignalWire adapter requires Space URL and Project ID
    Given a SignalWire provider configuration
    When I validate with all required fields
    Then validation should pass

  Scenario: Vonage adapter requires API Key and Secret
    Given a Vonage provider configuration
    When I validate with all required fields
    Then validation should pass

  Scenario: Adapter factory returns correct provider type
    Given provider configurations for Twilio and SignalWire
    When the factory creates an adapter for "twilio"
    Then it should return a Twilio adapter instance

  Scenario: Invalid provider type returns error
    When the factory is asked for an unknown provider
    Then it should return a configuration error

  Scenario: Provider labels are human-readable
    Then each provider should have a display label and icon identifier
