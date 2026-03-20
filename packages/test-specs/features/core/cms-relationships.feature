@backend @contacts
Feature: Contact Relationships & Affinity Groups
  Admins manage relationships between encrypted contacts
  and organize contacts into affinity groups with roles.

  Scenario: Create a relationship between contacts
    Given case management is enabled
    And a contact "contact_a" exists
    And a contact "contact_b" exists
    When the admin creates a "support_contact" relationship from "contact_a" to "contact_b"
    Then the relationship should exist
    And "contact_a" relationships should include "contact_b"

  Scenario: Bidirectional relationship query
    Given case management is enabled
    And contacts "rel_c" and "rel_d" with a bidirectional "family" relationship
    When listing relationships for "rel_c"
    Then "rel_d" should appear in the results
    When listing relationships for "rel_d"
    Then "rel_c" should appear in the results

  Scenario: Delete a relationship
    Given case management is enabled
    And contacts "del_a" and "del_b" with a relationship
    When the admin deletes the relationship
    Then listing relationships for "del_a" should be empty

  Scenario: Create an affinity group
    Given case management is enabled
    When the admin creates an affinity group "Pine Street Collective"
    Then the group should exist with name "Pine Street Collective"

  Scenario: Add members to affinity group
    Given case management is enabled
    And an affinity group exists
    And a contact "member1" exists
    When the admin adds "member1" to the group with role "medic"
    Then the group should have 1 member
    And "member1" should be in the group with role "medic"

  Scenario: Remove member from affinity group
    Given case management is enabled
    And an affinity group with member "remove_me" exists
    When the admin removes "remove_me" from the group
    Then the group member count should be 0
