@android @ios @desktop @security @wip
Feature: SAS Verification Gate
  As a security-conscious app
  I want device linking to require SAS code confirmation
  So that man-in-the-middle attacks on provisioning are prevented

  # NOTE: These scenarios require a live Nostr relay and provisioning room.
  # SAS gate logic is covered by unit tests:
  #   - Android: DeviceLinkViewModelTest (22 tests)
  #   - iOS: SecurityHardeningTests.testDeviceLinkStepsRequireSASBeforeImport
  # The @wip tag excludes these from automated runs until relay mocking is available.

  Background:
    Given I am authenticated
    And I navigate to the device link screen from settings

  Scenario: Device linking shows SAS code on verify step
    Given a valid provisioning room is established
    When the ephemeral key exchange completes
    Then I should see a 6-digit SAS code displayed
    And I should see instructions to compare with the other device
    And I should see "Confirm" and "Reject" buttons

  Scenario: SAS confirmation required before nsec import
    Given a valid provisioning room is established
    And the ephemeral key exchange completes
    And an encrypted nsec is received from the other device
    When I have not yet confirmed the SAS code
    Then the nsec should not be imported
    And the crypto service should not have a new key

  Scenario: SAS confirmation allows nsec import
    Given a valid provisioning room is established
    And the ephemeral key exchange completes
    And an encrypted nsec is received from the other device
    When I confirm the SAS code matches
    Then the nsec should be imported
    And I should see the import success state

  Scenario: SAS rejection aborts device linking
    Given a valid provisioning room is established
    And the ephemeral key exchange completes
    When I reject the SAS code
    Then the provisioning room should be closed
    And I should see a "Linking cancelled" message
    And the nsec should not be imported
