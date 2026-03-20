@backend
Feature: Volunteer Profiles & Case Workload
  Volunteers can have specializations, capacity limits, team membership,
  and supervisor assignment. Admins can query volunteer workload metrics
  and list cases assigned to a volunteer.

  @cases
  Scenario: Volunteer specializations can be set during creation
    Given case management is enabled
    When the admin creates a volunteer with specializations "immigration,legal_observer"
    Then the volunteer should have specializations "immigration" and "legal_observer"

  @cases
  Scenario: Volunteer can self-update specializations
    Given case management is enabled
    And a volunteer exists with self-update permissions
    When the volunteer updates their specializations to "domestic_violence,immigration"
    Then the volunteer should have specializations "domestic_violence" and "immigration"

  @cases
  Scenario: Admin can set capacity limit and team assignment
    Given case management is enabled
    And a volunteer exists for profile update
    When the admin sets the volunteer max case assignments to 10
    And the admin sets the volunteer team to "team-alpha"
    Then the volunteer should have max case assignments 10
    And the volunteer should have team "team-alpha"

  @cases
  Scenario: Volunteer case count reflects assignments
    Given case management is enabled
    And an entity type "profile_test_case" exists
    And a volunteer "vol1" exists for case assignment
    And 3 records of type "profile_test_case" are assigned to volunteer "vol1"
    When the admin fetches volunteer "vol1" metrics
    Then the active case count should be 3
    And the total cases handled should be 3

  @cases
  Scenario: Volunteer cases endpoint returns assigned records
    Given case management is enabled
    And an entity type "cases_list_type" exists
    And a volunteer "vol2" exists for case assignment
    And 2 records of type "cases_list_type" are assigned to volunteer "vol2"
    When the admin lists cases for volunteer "vol2"
    Then 2 assigned records should be returned

  @cases
  Scenario: Metrics endpoint returns zero for volunteer with no cases
    Given case management is enabled
    And a volunteer "vol3" exists for case assignment
    When the admin fetches volunteer "vol3" metrics
    Then the active case count should be 0
    And the total cases handled should be 0
    And the average resolution days should be null
