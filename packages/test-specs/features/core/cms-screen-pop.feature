@backend @cases @telephony
Feature: Telephony-CRM Screen Pop & Auto-Link
  When calls come in, the system identifies known contacts and enables
  automatic linking of notes to contacts and cases.

  Scenario: Identify known caller by phone hash
    Given case management is enabled
    And a screen-pop contact exists with identifier hash "phonehash_5551234"
    When a call arrives from identifier hash "phonehash_5551234"
    Then the contact identification should return the matching contact

  Scenario: Unknown caller returns no match
    Given case management is enabled
    When a call arrives from identifier hash "phonehash_unknown_999"
    Then the contact identification should return no match

  Scenario: Lookup contact by identifier hash via API
    Given case management is enabled
    And a screen-pop contact exists with identifier hash "phonehash_lookup_test"
    When the admin looks up identifier hash "phonehash_lookup_test"
    Then the lookup result should include the contact

  Scenario: List active records for a contact
    Given case management is enabled
    And a screen-pop contact exists with identifier hash "phonehash_records_test"
    And 2 open records are linked to the contact
    And 1 closed record is linked to the contact
    When the admin lists records for the contact
    Then the contact record list should have 2 records
    And no closed records should be included

  Scenario: Contact interaction count increments on identification
    Given case management is enabled
    And a screen-pop contact exists with identifier hash "phonehash_interact_test"
    When a call arrives from identifier hash "phonehash_interact_test"
    Then the contact identification should return the matching contact
    And the contact interactionCount should be 1
