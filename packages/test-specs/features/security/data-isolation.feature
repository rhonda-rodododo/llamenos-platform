@backend @security @permissions
Feature: Data Isolation
  As the security system
  I want to ensure strict data isolation between users and hubs
  So that no user can access another user's resources without authorization

  # ── Per-User Resource Isolation ──────────────────────────────────

  Scenario Outline: <role> can only see their own <resource>
    Given a "<role>" user "Alice" with resources
    And a "<role>" user "Bob" with resources
    When "Alice" lists their <resource>
    Then "Alice" should only see resources they created
    And "Bob"'s <resource> should not be visible to "Alice"

    Examples:
      | role      | resource |
      | volunteer | note     |
      | reporter  | report   |
      | volunteer | record   |

  # ── Hub-Scoped Isolation ─────────────────────────────────────────

  Scenario: Hub-scoped data isolation across resources
    Given hub "Alpha" with a volunteer "V1"
    And hub "Beta" with a volunteer "V2"
    When "V1" creates a note in hub "Alpha"
    And "V2" creates a note in hub "Beta"
    Then "V1" should not see notes from hub "Beta"
    And "V2" should not see notes from hub "Alpha"

  # ── Role Change Enforcement ──────────────────────────────────────

  Scenario Outline: Role change from <from> to <to> takes immediate effect
    Given a volunteer with role "<from>"
    When an admin changes the volunteer's role to "<to>"
    And the volunteer makes a request requiring "<from>" permissions
    Then the response status should reflect the "<to>" role permissions

    Examples:
      | from       | to        |
      | hub-admin  | volunteer |
      | volunteer  | reporter  |
      | reviewer   | volunteer |

  # ── Deactivation Enforcement ─────────────────────────────────────

  Scenario: Deactivated volunteer loses all access immediately
    Given an active volunteer with notes and shift access
    When an admin deactivates the volunteer
    Then the volunteer should receive 401 when listing notes
    And the volunteer should receive 401 when listing shifts
    And the volunteer should receive 401 when accessing their profile

  # ── Direct Note Mutation by Non-Author ───────────────────────────

  Scenario: Volunteer cannot update another volunteer's note via direct API call
    Given a "volunteer" user "PatchAlice" with resources
    And a "volunteer" user "PatchBob" with resources
    When "PatchBob" tries to update "PatchAlice"'s note
    Then the note update should be rejected with 403

  # ── Admin Reads All Notes; Volunteers Read Only Their Own ─────────

  Scenario: Admin sees all volunteers' notes but each volunteer only sees their own
    Given a "volunteer" user "NoteVis_Alice" with resources
    And a "volunteer" user "NoteVis_Bob" with resources
    When the admin lists all notes
    Then the admin should see notes from "NoteVis_Alice"
    And the admin should see notes from "NoteVis_Bob"
    When "NoteVis_Alice" lists their note
    Then "NoteVis_Alice" should only see resources they created
    And "NoteVis_Bob"'s note should not be visible to "NoteVis_Alice"

  # ── Cross-Hub Data Isolation ──────────────────────────────────────
  # Notes are tagged with the hub in which they were created.  Even when a
  # volunteer has global access, the hub-scoped listing endpoint only returns
  # notes created within that hub, so hub A data never leaks into hub B.

  Scenario: Hub-scoped notes do not bleed across hub boundaries
    Given volunteer "HubAlice" is a member of dedicated hub "hub-alpha"
    And volunteer "HubBob" is a member of dedicated hub "hub-beta"
    When "HubAlice" creates a note in dedicated hub "hub-alpha"
    Then "HubBob" cannot see "hub-alpha" notes when listing dedicated hub "hub-beta" notes
    And "HubBob" cannot see "HubAlice"'s notes when accessing dedicated hub "hub-alpha" directly
