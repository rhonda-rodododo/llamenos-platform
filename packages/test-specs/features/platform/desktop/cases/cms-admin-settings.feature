@desktop
Feature: Case Management Settings
  Admins configure entity types, apply templates, and manage
  the schema editor through the case management settings page.

  Background:
    Given I am logged in as an admin

  # --- CMS toggle ---

  Scenario: Case management settings page loads with toggle section
    When I navigate to the "Case Management" admin page
    Then I should see the "Case Management Settings" page title
    And the CMS toggle section should be visible

  Scenario: Enable case management via toggle
    Given case management is disabled
    When I navigate to the "Case Management" admin page
    And I expand the CMS toggle section
    And I toggle the CMS enable switch on
    Then a success toast should appear
    And the entity types section should become visible
    And the templates section should become visible

  Scenario: Disable case management via toggle
    Given case management is enabled
    When I navigate to the "Case Management" admin page
    And I expand the CMS toggle section
    And I toggle the CMS enable switch off
    Then a toast indicating disabled should appear
    And the entity types section should not be visible
    And the templates section should not be visible

  Scenario: CMS toggle section shows status summary when collapsed
    Given case management is enabled
    When I navigate to the "Case Management" admin page
    Then the CMS toggle section should show "Enabled" in its status summary

  # --- Templates ---

  Scenario: Template browser lists available templates
    Given case management is enabled
    When I navigate to the "Case Management" admin page
    And I expand the templates section
    Then at least one template card should be visible
    And each template card should show entity type count
    And each template card should show field count

  Scenario: Apply a template creates entity types
    Given case management is enabled
    And no entity types have been created
    When I navigate to the "Case Management" admin page
    And I expand the templates section
    And I click the apply button on the first template
    Then a success toast should appear
    And the applied badge should appear on the template card
    When I expand the entity types section
    Then at least one entity type row should be visible

  Scenario: Applied template shows "Applied" badge and disabled button
    Given case management is enabled
    And the "jail-support" template has been applied
    When I navigate to the "Case Management" admin page
    And I expand the templates section
    Then the applied template should show the applied badge
    And the apply button on the applied template should be disabled

  # --- Entity type list ---

  Scenario: Entity types section lists active types with metadata
    Given case management is enabled
    And the "jail-support" template has been applied
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    Then at least one entity type row should be visible
    And each entity type row should show label and category badge
    And each entity type row should show field and status counts

  Scenario: Entity type shows color swatch when color is set
    Given case management is enabled
    And an entity type with a color exists
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    Then the entity type row should display a color swatch

  # --- Create entity type ---

  Scenario: Create entity type button opens the editor form
    Given case management is enabled
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the create entity type button
    Then the entity type editor form should be visible
    And the general tab should be active
    And the name input should be visible
    And the label input should be visible

  Scenario: Create a custom entity type with name and statuses
    Given case management is enabled
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the create entity type button
    And I fill in entity type label "Custom Type"
    Then the name input should auto-populate with "custom_type"
    And the plural label should auto-populate with "Custom Types"
    And default statuses "Open" and "Closed" should be pre-populated
    When I click the entity type save button
    Then a success toast should appear
    And "Custom Type" should appear in the entity type list

  Scenario: Entity type name auto-generates from label on create
    Given case management is enabled
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the create entity type button
    And I fill in entity type label "Arrest Case"
    Then the name input should show "arrest_case"

  Scenario: Save button is disabled when required fields are missing
    Given case management is enabled
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the create entity type button
    Then the entity type save button should be disabled

  # --- Edit entity type ---

  Scenario: Edit button loads entity type data into the editor
    Given case management is enabled
    And the "jail-support" template has been applied
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the edit button on the first entity type
    Then the entity type editor form should be visible
    And the label input should be populated with the entity type label
    And the name input should not be visible for existing types

  # --- Entity type editor tabs ---

  Scenario: Fields tab shows field list and add button
    Given case management is enabled
    And the "jail-support" template has been applied
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the edit button on the first entity type
    And I click the "fields" editor tab
    Then field rows should be visible
    And the add field button should be visible

  Scenario: Add a text field to an entity type
    Given case management is enabled
    And the "jail-support" template has been applied
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the edit button on the first entity type
    And I click the "fields" editor tab
    And I click the add field button
    And I fill in the field label "Custom Field"
    Then the field name should auto-populate with "custom_field"
    When I click the field save button
    Then a field row for "Custom Field" should appear in the list

  Scenario: Field editor supports type selection
    Given case management is enabled
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the create entity type button
    And I click the "fields" editor tab
    And I click the add field button
    Then the field type select should be visible
    And it should offer types including text, number, select, and checkbox

  Scenario: Select field type shows options editor
    Given case management is enabled
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the create entity type button
    And I click the "fields" editor tab
    And I click the add field button
    And I select field type "select"
    Then the add option button should be visible

  Scenario: Reorder fields using up/down buttons
    Given case management is enabled
    And an entity type with multiple fields exists
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the edit button on the entity type
    And I click the "fields" editor tab
    Then the first field row should have a disabled up button
    And the last field row should have a disabled down button
    And middle field rows should have both buttons enabled

  Scenario: Delete a field from an entity type
    Given case management is enabled
    And an entity type with fields exists
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the edit button on the entity type
    And I click the "fields" editor tab
    And I note the field count
    And I click the delete button on a field
    Then the field count should decrease by one

  Scenario: Statuses tab shows status list with color and default indicators
    Given case management is enabled
    And the "jail-support" template has been applied
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the edit button on the first entity type
    And I click the "statuses" editor tab
    Then status rows should be visible
    And one status should show the "Default" badge
    And closed statuses should show the "Closed" badge
    And each status row should display a color swatch

  Scenario: Add a new status to an entity type
    Given case management is enabled
    And the "jail-support" template has been applied
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the edit button on the first entity type
    And I click the "statuses" editor tab
    And I click the add status button
    And I fill in the status label "New Status"
    And I click the status save button
    Then "New Status" should appear in the status list

  Scenario: Severities tab manages severity levels
    Given case management is enabled
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the create entity type button
    And I click the "severities" editor tab
    Then the add severity button should be visible

  Scenario: Contact roles tab manages contact role definitions
    Given case management is enabled
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the create entity type button
    And I click the "contactRoles" editor tab
    Then the add contact role button should be visible

  # --- Archive and delete ---

  Scenario: Archive an entity type moves it to archived section
    Given case management is enabled
    And an entity type "test_archive_type" exists
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the archive button on "test_archive_type"
    And I confirm the archive dialog
    Then "test_archive_type" should appear in the archived section
    And a success toast should appear

  Scenario: Delete an archived entity type removes it permanently
    Given case management is enabled
    And an archived entity type exists
    When I navigate to the "Case Management" admin page
    And I expand the entity types section
    And I click the delete button on the archived entity type
    And I confirm the delete dialog
    Then the entity type should be removed from the list
    And a success toast should appear

  # --- Deep link support ---

  Scenario: Deep link to templates section auto-expands it
    Given case management is enabled
    When I navigate to "/admin/case-management?section=templates"
    Then the templates section should be expanded
