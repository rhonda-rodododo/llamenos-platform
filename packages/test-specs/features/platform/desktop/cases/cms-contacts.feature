@desktop
Feature: Contact Directory
  Users search and manage contacts through the directory.
  Contacts support encrypted profiles, blind-index search,
  type filtering, and tabbed detail views with cases,
  relationships, and groups.

  Background:
    Given I am logged in as an admin
    And case management is enabled
    And the "jail-support" template has been applied

  # --- Page loads and navigation ---

  Scenario: Contact directory page loads with title and controls
    When I navigate to the "Contact Directory" page
    Then I should see the "Contact Directory" page title
    And the new contact button should be visible
    And the contact search input should be visible
    And the contact type filter should be visible

  Scenario: Empty state shows create prompt when no contacts exist
    Given no contacts have been created
    When I navigate to the "Contact Directory" page
    Then the empty state card should be visible
    And the empty state create button should be visible

  # --- Search ---

  Scenario: Search contacts by name filters the list
    Given contacts "Carlos Martinez" and "Maria Garcia" exist
    When I navigate to the "Contact Directory" page
    And I type "Carlos" in the contact search input
    Then the contact list should update after debounce
    And a contact card for "Carlos Martinez" should be visible
    And a contact card for "Maria Garcia" should not be visible

  Scenario: Clearing search restores the full contact list
    Given contacts "Carlos Martinez" and "Maria Garcia" exist
    When I navigate to the "Contact Directory" page
    And I type "Carlos" in the contact search input
    And I clear the contact search input
    Then both "Carlos Martinez" and "Maria Garcia" should be visible

  Scenario: Search with no results shows empty message
    Given contacts exist
    When I navigate to the "Contact Directory" page
    And I type "zzz_no_match_zzz" in the contact search input
    Then the contact list should show "No contacts match your search"

  # --- Type filter ---

  Scenario: Filter contacts by type
    Given contacts of type "individual" and "organization" exist
    When I navigate to the "Contact Directory" page
    And I select "Individual" from the contact type filter
    Then only individual contacts should appear in the list

  Scenario: "All types" filter shows all contacts
    Given contacts of type "individual" and "organization" exist
    When I navigate to the "Contact Directory" page
    And I select "Individual" from the contact type filter
    And I select "All types" from the contact type filter
    Then both individual and organization contacts should be visible

  # --- Contact creation ---

  Scenario: New Contact button opens the create dialog
    When I navigate to the "Contact Directory" page
    And I click the new contact button
    Then the create contact dialog should be visible
    And the contact name input should be focused

  Scenario: Create a new individual contact with phone identifier
    When I navigate to the "Contact Directory" page
    And I click the new contact button
    And I fill in the contact name with "Test Contact"
    And I select contact type "Individual"
    And I fill in the first identifier value with a phone number
    Then the primary checkbox for the first identifier should be checked
    When I click the create contact submit button
    Then a toast "Contact created" should appear
    And "Test Contact" should appear in the contact list
    And "Test Contact" should be auto-selected in the detail panel

  Scenario: Create contact validates display name is required
    When I navigate to the "Contact Directory" page
    And I click the new contact button
    And I leave the contact name empty
    Then the create contact submit button should be disabled

  Scenario: Add multiple identifiers to a new contact
    When I navigate to the "Contact Directory" page
    And I click the new contact button
    And I fill in the contact name with "Multi-ID Contact"
    And I click the add identifier button
    Then 2 identifier rows should be visible
    And only one identifier should have the primary checkbox checked

  Scenario: Remove an identifier row
    When I navigate to the "Contact Directory" page
    And I click the new contact button
    And I click the add identifier button
    Then 2 identifier rows should be visible
    When I click the remove button on the second identifier
    Then 1 identifier row should be visible

  # --- Contact profile detail ---

  Scenario: Clicking a contact loads the detail panel with profile tabs
    Given a contact "Carlos Martinez" exists
    When I navigate to the "Contact Directory" page
    And I click on the "Carlos Martinez" contact card
    Then the contact profile header should be visible
    And the contact profile tabs should be visible
    And I should see the "Profile" tab
    And I should see the "Identifiers" tab
    And I should see the "Cases" tab
    And I should see the "Relationships" tab
    And I should see the "Groups" tab

  Scenario: Profile tab shows contact details when decryptable
    Given a contact "Carlos Martinez" exists with profile data
    When I navigate to the "Contact Directory" page
    And I click on the "Carlos Martinez" contact card
    And the "Profile" tab is active
    Then the contact profile content should be visible

  Scenario: Profile tab shows empty state when no details added
    Given a contact exists with no profile data
    When I navigate to the "Contact Directory" page
    And I click on the contact card
    And the "Profile" tab is active
    Then the contact profile empty state should be visible
    And I should see "No profile details have been added yet"

  # --- Identifiers tab ---

  Scenario: Identifiers tab shows phone and email identifiers
    Given a contact exists with phone and email identifiers
    When I navigate to the "Contact Directory" page
    And I click on the contact card
    And I click the "Identifiers" tab
    Then the contact identifiers list should be visible
    And identifier cards should show type and value
    And the primary identifier should show a "Primary" badge

  Scenario: Identifiers tab shows empty state when none exist
    Given a contact exists with no identifiers
    When I navigate to the "Contact Directory" page
    And I click on the contact card
    And I click the "Identifiers" tab
    Then the contact identifiers empty state should be visible
    And I should see "No identifiers have been added"

  # --- Cases tab ---

  Scenario: Cases tab shows linked case records
    Given a contact exists with linked cases
    When I navigate to the "Contact Directory" page
    And I click on the contact card
    And I click the "Cases" tab
    Then the contact cases list should be visible
    And each case link should show a case number and role

  Scenario: Cases tab shows empty state when no cases linked
    Given a contact exists with no linked cases
    When I navigate to the "Contact Directory" page
    And I click on the contact card
    And I click the "Cases" tab
    Then the contact cases empty state should be visible
    And I should see "This contact is not linked to any cases"

  # --- Relationships tab ---

  Scenario: Relationships tab shows related contacts
    Given a contact exists with relationships
    When I navigate to the "Contact Directory" page
    And I click on the contact card
    And I click the "Relationships" tab
    Then the contact relationships list should be visible

  Scenario: Relationships tab shows empty state when none defined
    Given a contact exists with no relationships
    When I navigate to the "Contact Directory" page
    And I click on the contact card
    And I click the "Relationships" tab
    Then the contact relationships empty state should be visible
    And I should see "No relationships defined for this contact"

  # --- Groups tab ---

  Scenario: Groups tab shows group memberships
    Given a contact exists in groups
    When I navigate to the "Contact Directory" page
    And I click on the contact card
    And I click the "Groups" tab
    Then the contact groups list should be visible
    And each group should show a member count

  Scenario: Groups tab shows empty state when not in any groups
    Given a contact exists not in any groups
    When I navigate to the "Contact Directory" page
    And I click on the contact card
    And I click the "Groups" tab
    Then the contact groups empty state should be visible
    And I should see "This contact does not belong to any groups"

  # --- Privacy-aware display ---

  Scenario: Restricted contact shows lock indicator instead of name
    Given a contact with PII data exists
    And I am logged in as a volunteer without PII access
    When I navigate to the "Contact Directory" page
    And I click on the restricted contact card
    Then the contact profile header should show a lock icon
    And the display name should show "Restricted"

  Scenario: Restricted profile tab shows shield and restricted message
    Given a contact with PII data exists
    And I am logged in as a volunteer without PII access
    When I navigate to the "Contact Directory" page
    And I click on the restricted contact card
    And the "Profile" tab is active
    Then the restricted placeholder should be visible
    And I should see "Restricted"
