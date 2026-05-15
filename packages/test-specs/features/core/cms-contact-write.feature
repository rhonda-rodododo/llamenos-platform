@backend
Feature: CMS contact write operations
  Admins and volunteers create and update encrypted contact profiles
  with blind indexes, and upload entity field files.

  @contact-write
  Scenario: Create a contact with E2EE profile
    Given case management is enabled
    When the admin creates a contact with encrypted profile
    Then the contact should have a generated UUID id
    And the contact should have an encrypted summary

  @contact-write
  Scenario: Update a contact's encrypted profile
    Given case management is enabled
    And a contact exists with identifier hash "testhash_write_update"
    When the admin updates the contact's encrypted profile
    Then the contact should have updated encrypted profile

  @contact-write
  Scenario: Upload an entity field file
    Given case management is enabled
    When the admin uploads a 1 KB encrypted blob to the entity file endpoint
    Then the response should contain a fileId
    And the blob should be stored in blob storage under the entity-files prefix
