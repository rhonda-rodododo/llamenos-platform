@backend
Feature: CMS Contacts
  Admins and volunteers manage encrypted contact profiles
  in the contact directory with blind-index lookups.

  @contacts
  Scenario: Create contact with encrypted profile
    Given case management is enabled
    When the admin creates a contact with encrypted profile
    Then the contact should have a generated UUID id
    And the contact should have an encrypted summary

  @contacts
  Scenario: List contacts paginated
    Given case management is enabled
    And 3 contacts exist
    When the admin lists contacts with limit 2
    Then the contact list should have 2 contacts
    And the contact list should indicate more pages

  @contacts
  Scenario: Lookup contact by identifier hash
    Given case management is enabled
    And a contact exists with identifier hash "testhash_lookup_abc123"
    When the admin looks up contact by identifier hash "testhash_lookup_abc123"
    Then the looked-up contact should match the created contact

  @contacts
  Scenario: Update contact profile
    Given case management is enabled
    And a contact exists
    When the admin updates the contact encrypted summary
    Then the contact should have the updated summary

  @contacts
  Scenario: Delete contact
    Given case management is enabled
    And a contact exists
    When the admin deletes the contact
    Then the contact should no longer exist

  @contacts @permissions
  Scenario: Volunteer with contacts:view can list but not create
    Given case management is enabled
    And a volunteer exists with only contacts:view permission
    When the volunteer lists contacts
    Then the contact list request should succeed
    When the volunteer tries to create a contact
    Then the response status should be 403

  @contacts @contact-cases
  Scenario: List the cases linked to a contact
    Given case management is enabled
    And an entity type "contact_cases_type" exists
    And a record of type "contact_cases_type" exists
    And a contact exists
    When the admin links the contact to the record with role "defendant"
    And the admin lists the cases of the contact
    Then the response status should be 200
    And the contact's case list should have 1 linked record
    And the contact's case list should include the linked record with role "defendant"

  @contacts @contact-cases
  Scenario: A contact with no linked cases has an empty case list
    Given case management is enabled
    And a contact exists
    When the admin lists the cases of the contact
    Then the response status should be 200
    And the contact's case list should have 0 linked records

  @contacts @contact-cases
  Scenario: Cases of a contact from another hub are refused
    Given case management is enabled
    And a contact exists in another hub
    When the admin lists the cases of the other hub's contact through this hub
    Then the response status should be 404
    And the response should not disclose any cases
