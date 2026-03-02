Feature: Shift Detail
  As an admin
  I want to view shift details and manage volunteer assignments
  So that I can control who is assigned to each shift

  Background:
    Given I am authenticated and on the dashboard
    And I have navigated to the admin panel
    And I tap the "Shift Schedule" tab

  Scenario: Navigate to shift detail from list
    When I tap a shift card
    Then I should see the shift detail screen

  Scenario: Shift info card shows name and time
    When I tap a shift card
    Then I should see the shift info card

  Scenario: Volunteer assignment list is displayed
    When I tap a shift card
    Then I should see the volunteer assignment section

  Scenario: Toggle volunteer assignment
    When I tap a shift card
    And I tap a volunteer assignment card
    Then the volunteer assignment should toggle

  Scenario: Navigate back from shift detail
    When I tap a shift card
    And I tap the back button on the shift detail
    Then I should see the admin screen
