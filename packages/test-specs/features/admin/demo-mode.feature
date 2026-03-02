@android @ios @desktop
Feature: Demo Mode
  As a potential user evaluating the app
  I want to try a demo mode with sample data
  So that I can explore the features without setting up real data

  Scenario: Summary step shows demo mode toggle
    Given I am logged in as an admin
    When I navigate to the setup wizard summary step
    Then I should see a "Populate with sample data" toggle
    And the toggle should be off by default

  Scenario: Complete setup with demo mode creates demo accounts
    Given I am logged in as an admin
    When I navigate to the setup wizard summary step
    And I enable the demo mode toggle
    And I click "Go to Dashboard"
    Then I should be redirected to the dashboard
    When I navigate to the "Volunteers" page
    Then I should see "Maria Santos"
    And I should see "James Chen"
    And I should see "Community Reporter"
    And I should see "Fatima Al-Rashid"

  Scenario: Login page shows demo account picker when demo mode is enabled
    Given demo mode has been enabled
    When I visit the login page
    Then I should see "Try the demo"
    And I should see "Pick a demo account to explore"
    And I should see "Demo Admin"
    And I should see "Maria Santos"
    And I should see "James Chen"
    And I should see "Demo data resets daily"

  Scenario: Clicking demo account logs in and redirects to dashboard
    Given demo mode has been enabled
    When I visit the login page
    And I click the "Maria Santos" demo account
    Then I should be redirected away from login
    And the navigation should show "Maria Santos"

  Scenario: Demo banner shows when logged in
    Given demo mode has been enabled
    And I am logged in as an admin
    Then I should see "You're exploring"
    And I should see "Deploy your own"
    When I dismiss the demo banner
    Then "You're exploring" should no longer be visible

  Scenario: Demo shifts are populated
    Given demo mode has been enabled
    And I am logged in as an admin
    When I navigate to the "Shifts" page
    Then I should see "Morning Team"
    And I should see "Evening Team"
    And I should see "Weekend Coverage"

  Scenario: Demo bans are populated
    Given demo mode has been enabled
    And I am logged in as an admin
    When I navigate to the "Ban List" page
    Then I should see "Repeated prank calls"
    And I should see "Threatening language"
