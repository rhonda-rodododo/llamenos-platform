@android
Feature: Hub Self-Service Communications
  Admins configure telephony providers, communication channels,
  and view usage statistics through the hub communications settings.

  Background:
    Given the app is launched
    And I am authenticated and on the dashboard

  # ── Onboarding Flow ──────────────────────────────────────────────────────

  Scenario: Full onboarding flow completes successfully
    When I navigate to hub communications settings
    And I start the communications setup
    Then the onboarding bottom sheet should appear
    When I select a provider template
    And I configure communication channels
    And I proceed to the provider connection step
    And I proceed to the phone number step
    And I complete the onboarding summary
    Then the onboarding should be marked complete

  Scenario: Onboarding can start from scratch without template
    When I navigate to hub communications settings
    And I start the communications setup
    Then the onboarding bottom sheet should appear
    When I choose to start from scratch
    Then the channel selection step should be visible

  Scenario: Onboarding bottom sheet can be dismissed
    When I navigate to hub communications settings
    And I start the communications setup
    Then the onboarding bottom sheet should appear
    When I dismiss the onboarding sheet
    Then the communications settings screen should be visible

  # ── Channel Management ───────────────────────────────────────────────────

  Scenario: Channel toggles are visible on communications screen
    When I navigate to hub communications settings
    Then the channel checklist should be visible
    And all communication channel switches should be displayed

  Scenario: Channel toggle round-trip
    When I navigate to hub communications settings
    And I toggle the "sms" channel
    Then the channel setting should persist
    When I navigate away and return to hub communications
    Then the channel state should be preserved

  # ── Settings Panel ───────────────────────────────────────────────────────

  Scenario: Communications settings shows provider status
    When I navigate to hub communications settings
    Then the provider status card should be visible

  Scenario: Usage card displays statistics
    When I navigate to hub communications settings
    Then the usage card should be visible

  Scenario: Refresh button reloads settings
    When I navigate to hub communications settings
    And I tap the refresh button
    Then the communications data should reload
