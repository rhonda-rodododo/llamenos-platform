@android @ios @desktop
Feature: Invite Onboarding
  As an admin
  I want to invite volunteers via invite links
  So that they can securely onboard with their own identity

  Scenario: Admin creates invite and volunteer completes onboarding
    Given I am logged in as an admin
    And I navigate to the "Volunteers" page
    When I create an invite for a new volunteer
    Then an invite link should be generated
    When the volunteer opens the invite link
    Then they should see a welcome screen with their name
    When the volunteer completes the onboarding flow
    Then they should arrive at the profile setup or dashboard

  Scenario: Invalid invite code shows error
    When I navigate to "/onboarding?code=invalidcode123"
    Then I should see "invalid invite"
    And I should see a "Go to Login" button

  Scenario: Missing invite code shows error
    When I navigate to "/onboarding"
    Then I should see "no invite code"

  Scenario: Admin can see pending invites and revoke them
    Given I am logged in as an admin
    And I navigate to the "Volunteers" page
    When I create an invite for a new volunteer
    And I dismiss the invite link card
    Then the volunteer name should appear in the pending invites list
    When I revoke the invite
    Then the volunteer name should no longer appear in the list
