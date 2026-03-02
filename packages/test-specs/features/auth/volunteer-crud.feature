@android @ios @desktop
Feature: Volunteer CRUD
  As an admin
  I want to manage volunteers
  So that I can control who answers calls

  Background:
    Given I am logged in as an admin

  Scenario: Volunteer can login after admin creates account
    Given an admin has created a volunteer
    When the volunteer logs in with their nsec
    Then they should see the dashboard or profile setup

  Scenario: Volunteer completes profile setup
    Given a volunteer has logged in
    When they complete the profile setup
    Then they should see the dashboard

  Scenario: Volunteer sees limited navigation
    Given a volunteer is logged in and on the dashboard
    Then they should see "Dashboard" in the navigation
    And they should see "Notes" in the navigation
    And they should see "Settings" in the navigation
    But they should not see "Volunteers" in the navigation
    And they should not see "Shifts" in the navigation
    And they should not see "Ban List" in the navigation

  Scenario: Volunteer can toggle on-break status
    Given a volunteer is logged in and on the dashboard
    When they tap the break button
    Then they should see "On Break"

  Scenario: Volunteer cannot access admin pages via URL
    Given a volunteer is logged in and on the dashboard
    When they navigate to "/volunteers" via SPA
    Then they should see "Access Denied"

  Scenario: Volunteer cannot access shifts page via URL
    Given a volunteer is logged in and on the dashboard
    When they navigate to "/shifts" via SPA
    Then they should see "Access Denied"

  Scenario: Volunteer cannot access bans page via URL
    Given a volunteer is logged in and on the dashboard
    When they navigate to "/bans" via SPA
    Then they should see "Access Denied"

  Scenario: Volunteer can navigate to notes
    Given a volunteer is logged in and on the dashboard
    When they click the "Notes" link
    Then they should see the "Call Notes" heading

  Scenario: Volunteer can navigate to settings
    Given a volunteer is logged in and on the dashboard
    When they click the "Settings" link
    Then they should see the "Account Settings" heading
    And they should not see "Spam Mitigation"
