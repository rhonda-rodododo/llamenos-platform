@backend
Feature: Hub-scoped push notification dispatch
  Push payloads carry hubId so mobile clients can route incoming notifications
  to the correct hub context without ambiguity across multi-hub installations.

  Background:
    Given the server is reset

  @backend
  Scenario: Push dispatch includes hubId in wake payload
    Given a volunteer is registered in the hub
    When the backend dispatches a push notification to the volunteer in the hub
    Then the push payload should include the hub identifier

  @backend
  Scenario: Push payload hubId matches the dispatching hub
    Given a volunteer is registered in the hub
    When the backend dispatches a push notification to the volunteer in the hub
    Then the push payload hubId should match the hub

  @backend
  Scenario: WakePayload carries required type and conversationId fields
    Given a volunteer is registered in the hub
    When the backend dispatches a push notification to the volunteer in the hub
    Then the push payload should have a type field
    And the push payload should have a conversationId field
