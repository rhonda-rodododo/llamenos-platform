@desktop
Feature: Case Management
  Volunteers and coordinators manage cases through the desktop interface.
  The cases page shows a list/detail layout with entity type tabs,
  status filtering, schema-driven detail forms, timeline, and evidence.

  Background:
    Given I am logged in as an admin
    And case management is enabled
    And the "jail-support" template has been applied

  # --- Cases page loads with entity types from template ---

  Scenario: Cases page shows entity type tabs from applied template
    When I navigate to the "Cases" page
    Then I should see the "Cases" page title
    And the entity type tabs should be visible
    And I should see the "All" entity type tab as active
    And I should see the "Arrest Case" entity type tab

  Scenario: CMS not enabled shows disabled state for volunteer
    Given case management is disabled
    And I am logged in as a volunteer
    When I navigate to the "Cases" page
    Then the CMS not-enabled card should be visible
    And I should see "Case management is not enabled"

  Scenario: CMS not enabled shows enable hint for admin
    Given case management is disabled
    When I navigate to the "Cases" page
    Then the CMS not-enabled card should be visible
    And I should see "Enable case management"

  # --- Case creation flow ---

  Scenario: New Case button opens the create dialog
    When I navigate to the "Cases" page
    And I click the new case button
    Then the create case sheet should be visible
    And I should see "encrypted end-to-end"

  Scenario: Create a new arrest case with title and description
    When I navigate to the "Cases" page
    And I click the new case button
    And I select entity type "Arrest Case" in the create dialog
    And I fill in the case title with a unique name
    And I fill in the case description
    And I click the create case submit button
    Then a toast "Case created" should appear
    And the new case should appear in the case list
    And the new case should be auto-selected in the detail panel

  Scenario: Create case validates required title
    When I navigate to the "Cases" page
    And I click the new case button
    And I select entity type "Arrest Case" in the create dialog
    And I leave the case title empty
    Then the create case submit button should be disabled

  Scenario: Create dialog pre-selects entity type when filtered
    When I navigate to the "Cases" page
    And I click the "Arrest Case" entity type tab
    And I click the new case button
    Then the entity type selector should show "Arrest Case"

  # --- Case list interactions ---

  Scenario: Empty state shows create prompt when entity types exist
    Given no cases have been created
    When I navigate to the "Cases" page
    Then the empty state card should be visible
    And the empty state create button should be visible

  Scenario: Case list shows case cards with status and type badges
    Given arrest cases exist
    When I navigate to the "Cases" page
    Then at least one case card should be visible
    And each case card should show a status badge
    And each case card should show a relative timestamp

  Scenario: Clicking a case card loads the detail panel
    Given arrest cases exist
    When I navigate to the "Cases" page
    And I click the first case card
    Then the case detail header should be visible
    And the case number should be displayed
    And the status pill should be visible

  Scenario: Filter cases by entity type tab
    Given arrest cases exist
    When I navigate to the "Cases" page
    And I click the "Arrest Case" entity type tab
    Then all visible case cards should show "Arrest Case" type badge

  Scenario: Filter cases by status dropdown
    Given arrest cases with multiple statuses exist
    When I navigate to the "Cases" page
    And I select a status from the status filter dropdown
    Then only cases matching that status should appear in the list

  # --- Case detail panel ---

  Scenario: Case detail shows tabs for Details, Timeline, Contacts, Evidence, Related
    Given an arrest case exists
    When I navigate to the "Cases" page
    And I click the first case card
    Then the case detail tabs should be visible
    And I should see the "Details" tab
    And I should see the "Timeline" tab
    And I should see the "Contacts" tab
    And I should see the "Evidence" tab
    And I should see the "Related" tab

  Scenario: Details tab renders schema-driven fields with access indicators
    Given an arrest case exists
    When I navigate to the "Cases" page
    And I click the first case card
    And the "Details" tab is active
    Then the schema form should be visible
    And fields with restricted access levels should show access badges

  Scenario: Schema form groups fields by section with collapsible headers
    Given an arrest case exists with multiple field sections
    When I navigate to the "Cases" page
    And I click the first case card
    And the "Details" tab is active
    Then collapsible section headers should be visible

  # --- Status changes ---

  Scenario: Click status pill to open status dropdown
    Given an arrest case exists
    When I navigate to the "Cases" page
    And I click the first case card
    And I click the status pill
    Then the status dropdown should be visible
    And the status dropdown should list available statuses

  Scenario: Select a new status from the dropdown
    Given an arrest case with status "reported" exists
    When I navigate to the "Cases" page
    And I click the first case card
    And I click the status pill
    And I select a different status from the dropdown
    Then the status pill should reflect the new status
    And a toast "Status updated" should appear

  Scenario: Status pill is read-only for volunteer without update permission
    Given a volunteer without cases:update permission is logged in
    And an arrest case exists
    When I navigate to the "Cases" page
    And I click the first case card
    Then the status pill should not be clickable

  # --- Timeline tab ---

  Scenario: Timeline tab loads interactions for a case
    Given an arrest case with interactions exists
    When I navigate to the "Cases" page
    And I click the first case card
    And I click the "Timeline" tab
    Then the case timeline should be visible
    And at least one timeline item should be visible
    And each timeline item should show author and timestamp

  Scenario: Timeline shows interaction type labels
    Given an arrest case with a comment interaction exists
    When I navigate to the "Cases" page
    And I click the first case card
    And I click the "Timeline" tab
    Then at least one timeline item should show type "Comment"

  Scenario: Timeline sort toggle reverses order
    Given an arrest case with multiple interactions exists
    When I navigate to the "Cases" page
    And I click the first case card
    And I click the "Timeline" tab
    And I click the sort toggle button
    Then the timeline items should be in oldest-first order
    When I click the sort toggle button
    Then the timeline items should be in newest-first order

  Scenario: Timeline type filter narrows visible interactions
    Given an arrest case with comment and status_change interactions exists
    When I navigate to the "Cases" page
    And I click the first case card
    And I click the "Timeline" tab
    And I select "Comments" from the timeline type filter
    Then only comment interactions should be visible

  Scenario: Post a comment to the timeline
    Given an arrest case is selected with the Timeline tab active
    When I type a comment in the timeline comment input
    And I click the timeline comment submit button
    Then the comment should appear in the timeline items
    And the comment input should be cleared

  Scenario: Comment submit is disabled when input is empty
    Given an arrest case is selected with the Timeline tab active
    Then the timeline comment submit button should be disabled

  # --- Contacts tab ---

  Scenario: Contacts tab shows linked contacts with roles
    Given an arrest case with linked contacts exists
    When I navigate to the "Cases" page
    And I click the first case card
    And I click the "Contacts" tab
    Then the case contacts tab should be visible
    And at least one contact card should show a role badge

  Scenario: Contacts tab shows empty state when no contacts linked
    Given an arrest case with no linked contacts exists
    When I navigate to the "Cases" page
    And I click the first case card
    And I click the "Contacts" tab
    Then the contacts empty state should be visible
    And I should see "No contacts linked to this case"

  # --- Evidence tab ---

  Scenario: Evidence tab shows uploaded files with classification
    Given an arrest case with evidence exists
    When I navigate to the "Cases" page
    And I click the first case card
    And I click the "Evidence" tab
    Then the evidence tab should be visible
    And at least one evidence item should be visible
    And each evidence item should show a classification badge

  Scenario: Evidence tab toggles between grid and list view
    Given an arrest case with evidence exists
    When I navigate to the "Cases" page
    And I click the first case card
    And I click the "Evidence" tab
    And I click the list view button
    Then evidence should display in list layout
    When I click the grid view button
    Then evidence should display in grid layout

  Scenario: Evidence tab filters by classification
    Given an arrest case with photo and document evidence exists
    When I navigate to the "Cases" page
    And I click the first case card
    And I click the "Evidence" tab
    And I select "Photo" from the evidence classification filter
    Then only photo evidence should be visible

  Scenario: Evidence tab shows empty state when no evidence uploaded
    Given an arrest case with no evidence exists
    When I navigate to the "Cases" page
    And I click the first case card
    And I click the "Evidence" tab
    Then the evidence empty state should be visible
    And I should see "No evidence uploaded yet"

  Scenario: Upload evidence button is visible
    Given an arrest case exists
    When I navigate to the "Cases" page
    And I click the first case card
    And I click the "Evidence" tab
    Then the upload evidence button should be visible

  # --- Assignment ---

  Scenario: Assign to me button appears for unassigned cases
    Given an arrest case exists that is not assigned to me
    When I navigate to the "Cases" page
    And I click the first case card
    Then the "Assign to me" button should be visible

  Scenario: Clicking assign to me updates assignment
    Given an arrest case exists that is not assigned to me
    When I navigate to the "Cases" page
    And I click the first case card
    And I click the "Assign to me" button
    Then a toast "Assigned to you" should appear
    And the "Assign to me" button should no longer be visible

  # --- Pagination ---

  Scenario: Pagination appears when cases exceed page size
    Given more than 50 cases exist
    When I navigate to the "Cases" page
    Then the pagination controls should be visible
    And the page info should show "Page 1"

  Scenario: Navigating to next page loads more cases
    Given more than 50 cases exist
    When I navigate to the "Cases" page
    And I click the next page button
    Then the page info should show "Page 2"
    And the case list should reload with new records
