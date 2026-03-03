@backend
Feature: Shift Routing
  As the call router
  I want to route calls to on-shift volunteers
  So that callers are connected to available volunteers

  Scenario: Select ring group from active shift
    Given a shift is currently active with 3 volunteers
    When a call needs to be routed
    Then all 3 volunteers should be in the ring group

  Scenario: Exclude busy volunteers from ring group
    Given a shift with 3 volunteers and 1 is on a call
    When a call needs to be routed
    Then only 2 volunteers should be in the ring group

  Scenario: Fallback group used when no shift is active
    Given no shift is currently active
    And a fallback ring group is configured
    When a call needs to be routed
    Then the fallback group should be used

  Scenario: Overlapping shifts merge volunteer pools
    Given two overlapping shifts with different volunteers
    When a call needs to be routed during the overlap
    Then volunteers from both shifts should be in the ring group

  Scenario: Empty ring group returns no-volunteers-available
    Given no shift is active and no fallback is configured
    When a call needs to be routed
    Then the router should return a no-volunteers error

  Scenario: Shift time zone is respected
    Given a shift configured for 9am-5pm in America/New_York
    When the current time is 10am Eastern
    Then the shift should be considered active
