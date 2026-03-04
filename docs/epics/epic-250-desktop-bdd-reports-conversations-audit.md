# Epic 250: Desktop BDD Behavioral Recovery — Reports, Conversations & Audit

## Goal

Recover the behavioral depth for reports lifecycle, conversation management, and audit log filtering. The original `reports.spec.ts` (583 lines) tested the full report lifecycle including reporter onboarding, status transitions, filtering, and reply messaging. The original `audit-log.spec.ts` (204 lines) tested filtering, search, event type badges, and actor links. Current step definitions are almost entirely presence checks with `.or()` fallbacks.

## What Was Lost

### Reports (original reports.spec.ts — 583 lines)
- **Full lifecycle**: Create report (fill title+details, submit) → appears in list → select → detail view with encryption note and "Waiting" status → admin claims → status "Active" → admin closes → removed from list
- **Status filter**: Create two reports, claim one, filter by Waiting/Active/All
- **Reply messaging**: Admin replies to claimed report → textarea clears → message appears in thread
- **Form validation**: Submit disabled when empty, enabled when filled
- **Reporter role onboarding**: Create reporter via invite → complete full PIN onboarding (PIN creation, confirmation, recovery key, backup download, acknowledge checkbox)
- **Reporter restrictions**: Navigation shows only "My Reports" (no Dashboard/Notes/Volunteers), reporter creates/replies to own report, reporter sees encryption note, reporter does NOT see Claim/Close buttons, reporter does NOT see status filter

### Audit Log (original audit-log.spec.ts — 204 lines)
- **Entries after actions**: Create volunteer → "Volunteer Added" audit entry appears
- **Timestamps**: Entries show timestamps
- **Actor links**: Audit entry actors displayed as links to volunteer profiles
- **Volunteer access denied**: Volunteer navigates to audit → access denied
- **Multiple action types**: Create+delete volunteer → both "Added" and "Removed" entries
- **Filter bar**: Search input, event type dropdown, date inputs all visible
- **Event type filter**: Filter by volunteers category → switch to calls → volunteer events gone
- **Search filter**: Type in search → results narrow
- **Clear button**: Resets filters
- **Category colors**: Purple for volunteer events

### Conversations (not in original .spec.ts, but feature files define scenarios)
- Assign conversation to volunteer
- Close conversation
- Reopen conversation
- Channel badges

## Current State (Hollow Step Definitions)

### report-steps.ts problems:
- `I should see the create report button` → `.or(page.getByTestId(TestIds.PAGE_TITLE))` — falls back to page title
- `I should see the report title input` → `.or(page.getByTestId(TestIds.PAGE_TITLE))` — falls back to page title
- `I should see the report submit button` → `.or()` chain to form save btn to PAGE TITLE
- `the report submit button should be disabled` → guarded with `if (visible)` — never fails
- `I should see the report detail screen` → `.or(page.getByTestId(TestIds.PAGE_TITLE))`
- `I should see the report claim button` → `.or(page.getByTestId(TestIds.PAGE_TITLE))`
- `I should not see the report claim button` → just checks page title visible (!!)
- `I should not see the report close button` → just checks page title visible (!!)
- `I tap the "Waiting" report status filter` → `waitForTimeout` only, no interaction
- `the "Waiting" report status filter should be selected` → just checks report list or page title visible
- `the reports screen should support pull to refresh` → just checks any content visible

### audit-steps.ts (not yet read but likely similar pattern)

### conversation-steps.ts problems:
- Likely all `.or()` and visibility checks
- Assign, close, reopen steps probably don't verify state changes

## Implementation

### Phase 1: Expand Feature Files

**report-create.feature — needs full lifecycle:**
```gherkin
  Scenario: Create and submit a report
    Given I navigate to the report creation form
    When I fill in the report title with "Test Incident Report"
    And I fill in the report body with "Caller reported suspicious activity"
    And I click "Submit"
    Then the report should appear in the reports list with status "Waiting"

  Scenario: Admin claims a waiting report
    Given a report with status "Waiting" exists
    When I open the report detail
    And I click the claim button
    Then the report status should change to "Active"
    And the claim button should no longer be visible

  Scenario: Admin closes an active report
    Given I have claimed a report
    When I click the close button on the report
    Then the report should be removed from the active list

  Scenario: Status filter shows correct reports
    Given multiple reports exist with different statuses
    When I filter by "Waiting" status
    Then I should only see reports with "Waiting" status
    When I filter by "Active" status
    Then I should only see reports with "Active" status
    When I filter by "All"
    Then I should see all reports

  Scenario: Admin replies to a claimed report
    Given I have claimed a report
    When I type a reply message "Following up on this incident"
    And I send the reply
    Then the reply should appear in the report thread
    And the reply textarea should be cleared

  Scenario: Submit button state depends on form content
    Given I navigate to the report creation form
    Then the submit button should be disabled
    When I fill in the title with "Test"
    And I fill in the body with "Content"
    Then the submit button should be enabled
```

**Add report-reporter.feature (new file — reporter role testing):**
```gherkin
@desktop @regression
Feature: Reporter Role Access
  As a reporter
  I want to create reports with limited access
  So that I can document incidents without seeing other data

  Scenario: Reporter onboarding flow
    Given an admin creates a reporter invite
    When the reporter opens the invite link
    And completes PIN setup and recovery key backup
    Then the reporter should be logged in

  Scenario: Reporter navigation is restricted
    Given I am logged in as a reporter
    Then I should see "My Reports" in the navigation
    And I should not see "Dashboard" in the navigation
    And I should not see "Notes" in the navigation
    And I should not see "Volunteers" in the navigation

  Scenario: Reporter creates a report
    Given I am logged in as a reporter
    When I create a report with title "Reporter Incident"
    Then the report should appear in my reports list

  Scenario: Reporter cannot claim or close reports
    Given I am logged in as a reporter
    And a report I created exists
    When I open the report
    Then I should not see the claim button
    And I should not see the close button
```

**audit-log.feature — expand with behavioral scenarios:**
```gherkin
  Scenario: Audit log shows entry after volunteer creation
    Given I have created a volunteer
    When I navigate to the "Audit Log" page
    Then I should see "Volunteer Added" in the audit entries
    And the entry should show a timestamp

  Scenario: Audit log shows multiple action types
    Given I have created and then deleted a volunteer
    When I navigate to the "Audit Log" page
    Then I should see "Volunteer Added" in the audit entries
    And I should see "Volunteer Removed" in the audit entries

  Scenario: Event type filter narrows results
    When I filter audit entries by "Volunteers" category
    Then I should only see volunteer-related entries
    When I switch filter to "Calls" category
    Then volunteer entries should no longer be visible

  Scenario: Search filter works
    Given I have created a volunteer named "SearchTarget"
    When I navigate to the "Audit Log" page
    And I search for "SearchTarget"
    Then the results should contain the "SearchTarget" entry

  Scenario: Clear filters resets view
    When I apply search and category filters
    And I click "Clear"
    Then all audit entries should be visible again
```

### Phase 2: Rewrite Report Step Definitions

Replace `tests/steps/reports/report-steps.ts`:

**Key changes:**
- Remove ALL `.or(page.getByTestId(TestIds.PAGE_TITLE))` fallbacks
- `I should see the create report button` → hard assert `REPORT_NEW_BTN` visible
- After creating a report, verify it appears in the list with correct title and status
- Claim/close actions: verify status badge changes
- Filter: actually click filter chips and verify list contents change
- Reply: verify message appears in thread after send
- Reporter restrictions: hard assert buttons NOT visible (not "page title is visible")

### Phase 3: Rewrite Audit Step Definitions

New `tests/steps/admin/audit-steps.ts` with behavioral assertions:

- After creating a volunteer, verify "Volunteer Added" entry via UI text search within audit entries
- Event type filter: click dropdown, select category, verify entries change
- Search: fill search input, verify filtered results
- Clear: click clear, verify all entries return

### Phase 4: Rewrite Conversation Step Definitions

Update `tests/steps/conversations/conversation-steps.ts`:

- Assign: click assign button, select volunteer, verify assignment badge/text
- Close: click close, verify status changes to "Closed"
- Reopen: click reopen, verify status changes back to "Active"
- Verify state changes persist after page reload

## Files Changed

| File | Action |
|------|--------|
| `tests/steps/reports/report-steps.ts` | Full rewrite — lifecycle assertions |
| `tests/steps/admin/audit-steps.ts` | Full rewrite — filtering, search, action verification |
| `tests/steps/conversations/conversation-steps.ts` | Rewrite — assign, close, reopen with verification |
| `packages/test-specs/features/reports/report-create.feature` | Expand — lifecycle, filter, reply |
| `packages/test-specs/features/reports/report-reporter.feature` | New — reporter role restrictions |
| `packages/test-specs/features/admin/audit-log.feature` | Expand — filter, search, action verification |
| `packages/test-specs/features/desktop/admin/admin-flow.feature` | Add audit verification scenarios |

## Verification

1. Full report lifecycle: create → appears with "Waiting" → claim → "Active" → close
2. Status filter switches show correct reports
3. Reporter can only see/create reports, cannot claim/close
4. Audit log shows entries after admin actions
5. Audit filter by event type, search, and clear all work
6. Conversation assign/close/reopen persist
7. Zero `.or()` fallback patterns
8. `bun run test` passes
