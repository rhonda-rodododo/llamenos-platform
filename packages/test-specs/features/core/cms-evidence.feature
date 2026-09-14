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

  # ── Evidence Chain-of-Custody Audit Trail (Issue #730) ────────────
  # These reuse the Epic 77 hash-chained audit_log table — every access to
  # an evidence item is recorded there, not in a separate unchained table.

  @evidence
  Scenario: Evidence access writes a tamper-evident audit entry
    Given case management is enabled
    And an entity type "access_log_case_type" exists
    And a record of type "access_log_case_type" exists
    And evidence exists on the record
    When the admin views the evidence metadata
    And the admin reads the evidence access log
    Then the evidence access log should contain an entry with access type "metadata_read"

  @evidence
  Scenario: A denied evidence access attempt is logged, not dropped
    Given case management is enabled
    And an entity type "access_denied_case_type" exists
    And a record of type "access_denied_case_type" exists
    And evidence exists on the record
    And a volunteer without evidence permissions exists
    When the volunteer tries to view the evidence
    Then the request should be forbidden
    And the admin reads the evidence access log
    And the evidence access log should contain an entry with access type "denied"

  @evidence
  Scenario: Non-admin cannot read the evidence access log
    Given case management is enabled
    And an entity type "access_log_perm_case_type" exists
    And a record of type "access_log_perm_case_type" exists
    And evidence exists on the record
    And a volunteer without audit:read permission exists
    When the volunteer tries to read the evidence access log
    Then the request should be forbidden

  @evidence @audit
  Scenario: Tampered evidence access entry is detected by the verify endpoint
    Given case management is enabled
    And an entity type "tamper_case_type" exists
    And a record of type "tamper_case_type" exists
    And evidence exists on the record
    When the admin views the evidence via the hub-scoped API
    And the audit chain is verified via the API endpoint
    Then the verification result should be valid
    When the action field of the latest audit entry is tampered in the database
    And the audit chain is verified via the API endpoint
    Then the verification result should be invalid
    And the verification result should identify the broken entry
