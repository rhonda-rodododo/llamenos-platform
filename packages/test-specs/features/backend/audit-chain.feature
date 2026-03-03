@backend
Feature: Audit Chain
  As the audit system
  I want to maintain a hash-chained audit log
  So that tampering can be detected

  Scenario: First audit entry has no previous hash
    Given an empty audit log
    When the first entry is added
    Then the entry hash should be computed
    And the previous entry hash should be null

  Scenario: Subsequent entries chain to previous
    Given an audit log with 1 entry
    When a new entry is added
    Then the new entry should reference the previous entry hash

  Scenario: Tampered event field breaks chain
    Given an audit log with 3 entries
    When the event field of entry 2 is modified
    Then chain verification should fail at entry 2

  Scenario: Tampered actor field breaks chain
    Given an audit log with 3 entries
    When the actor field of entry 2 is modified
    Then chain verification should fail at entry 2

  Scenario: Tampered timestamp breaks chain
    Given an audit log with 3 entries
    When the timestamp of entry 2 is modified
    Then chain verification should fail at entry 2

  Scenario: Valid chain passes verification
    Given an audit log with 10 entries
    When the chain is verified
    Then all entries should pass integrity checks
