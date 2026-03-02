@android @ios @desktop
Feature: Profile Settings
  As a user
  I want to manage my profile settings
  So that my information is up to date

  Scenario: Admin can edit profile name and it persists
    Given I am logged in as an admin
    When I navigate to the "Settings" page
    And I change my display name
    And I click "Update Profile"
    Then I should see "Profile updated"
    When I reload and re-authenticate
    Then the new display name should persist

  Scenario: Admin can save a valid phone number
    Given I am logged in as an admin
    When I navigate to the "Settings" page
    And I enter a valid phone number
    And I click "Update Profile"
    Then I should see "Profile updated"

  Scenario: Profile rejects invalid phone
    Given I am logged in as an admin
    When I navigate to the "Settings" page
    And I enter an invalid phone number "+123"
    And I click "Update Profile"
    Then I should see "invalid phone"

  Scenario: Volunteer sees profile card in settings
    Given a volunteer is logged in
    When they navigate to the "Settings" page
    Then they should see the "Profile" section
    And they should see a name input
    And they should see a phone input
    And they should see their public key

  Scenario: Admin sees key backup in user settings
    Given I am logged in as an admin
    When I navigate to the "Settings" page
    Then I should see the "Key Backup" section

  Scenario: Admin sees spam mitigation in hub settings
    Given I am logged in as an admin
    When I navigate to the "Hub Settings" page
    Then I should see the "Spam Mitigation" section

  Scenario: Admin sees passkeys in user settings
    Given I am logged in as an admin
    When I navigate to the "Settings" page
    Then I should see the "Passkeys" section

  Scenario: Volunteer does not see admin settings link
    Given a volunteer is logged in
    When they navigate to the "Settings" page
    Then they should not see a "Hub Settings" link
    And they should not see "Passkey Policy"
    And they should not see "Spam Mitigation"

  Scenario: Volunteer can update name and phone
    Given a volunteer is logged in
    When they navigate to the "Settings" page
    And they update their name and phone
    And they click "Update Profile"
    Then they should see "Profile updated"

  Scenario: Spoken language selection works
    Given I am logged in as an admin
    When I navigate to the "Settings" page
    And I toggle a language option
    And I click "Update Profile"
    Then I should see "Profile updated"

  Scenario: Deep link expands and scrolls to section
    Given I am logged in as an admin
    When I navigate to "/settings?section=transcription"
    Then the transcription section should be expanded

  Scenario: Sections collapse and expand on click
    Given I am logged in as an admin
    When I navigate to the "Settings" page
    Then the profile section should be expanded
    When I click the "Profile" header
    Then the profile section should collapse
    When I click the "Profile" header again
    Then the profile section should expand

  Scenario: Multiple sections can be open simultaneously
    Given I am logged in as an admin
    When I navigate to the "Settings" page
    And I expand the "Transcription" section
    Then both "Profile" and "Transcription" sections should be visible

  Scenario: Copy link button is present on each section
    Given I am logged in as an admin
    When I navigate to the "Settings" page
    Then each settings section should have a "Copy Link" button
