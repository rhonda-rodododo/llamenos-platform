@backend
Feature: CMS Evidence
  Evidence files are tracked with chain-of-custody metadata
  and cryptographic integrity verification.

  @evidence
  Scenario: Upload evidence to case
    Given case management is enabled
    And an entity type "evidence_case_type" exists
    And a record of type "evidence_case_type" exists
    When the admin uploads evidence to the record
    Then the evidence should have a generated UUID id
    And the evidence should have classification "photo"
    And the evidence should have an integrity hash

  @evidence
  Scenario: Get custody chain
    Given case management is enabled
    And an entity type "custody_case_type" exists
    And a record of type "custody_case_type" exists
    And evidence exists on the record
    When the admin gets the custody chain for the evidence
    Then the custody chain should have at least 1 entry
    And the first custody entry should have action "uploaded"

  @evidence
  Scenario: Verify integrity hash
    Given case management is enabled
    And an entity type "verify_case_type" exists
    And a record of type "verify_case_type" exists
    And evidence exists on the record
    When the admin verifies evidence integrity with the correct hash
    Then the verification should return valid true
    When the admin verifies evidence integrity with a wrong hash
    Then the verification should return valid false
