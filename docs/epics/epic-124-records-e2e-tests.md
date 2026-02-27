# Epic 124: Records Architecture E2E Tests

## Status: PROPOSED (awaiting review)

## Problem Statement

The records domain consolidation (Epics 119-123) introduces significant architectural changes:
- Report type filtering fix (security-critical)
- ConversationThread reuse in reports
- BlastDO extraction
- Per-record conversation storage
- Conversation notes
- Report custom fields

Each of these changes needs comprehensive E2E testing to prevent regressions.

## Test Plan

### 1. Report Isolation Tests

**File: `tests/report-isolation.spec.ts`**

Verify that reports and conversations are properly isolated:

```typescript
test('reports list does not include conversations', async () => {
  // Create a conversation (via incoming SMS webhook mock)
  // Create a report (via reporter role)
  // GET /api/reports should return only the report
  // GET /api/conversations should return only the conversation
})

test('conversation API cannot access reports', async () => {
  // Create a report
  // GET /api/conversations/:reportId should 404 or exclude it
})

test('report API cannot access conversations', async () => {
  // Create a conversation
  // GET /api/reports/:convId should 404 or exclude it
})
```

### 2. Shared ConversationThread Tests

**File: `tests/conversation-thread.spec.ts`**

Verify thread rendering works in both contexts:

```typescript
test('conversation thread renders messages correctly', async () => {
  // Navigate to a conversation
  // Verify inbound/outbound bubbles render
  // Verify timestamps display
  // Send a message, verify it appears
})

test('report detail uses shared thread component', async () => {
  // Navigate to a report
  // Verify same bubble rendering as conversations
  // Reply to report, verify message appears
})
```

### 3. Report Custom Fields Tests

**File: `tests/report-custom-fields.spec.ts`**

```typescript
test('admin can create custom fields for reports', async () => {
  // Go to Settings > Custom Fields
  // Create a field with context 'reports'
  // Verify it appears in the field list
})

test('reporter sees custom fields in report form', async () => {
  // Login as reporter
  // Create a report
  // Verify report-context custom fields are shown
  // Fill in field values, submit
})

test('custom field values display in report detail', async () => {
  // Create report with custom field values
  // View report detail
  // Verify field values appear as badges
})

test('fields with context "both" appear in notes and reports', async () => {
  // Create a field with context 'both'
  // Verify it appears in both note creation and report creation
})
```

### 4. Conversation Notes Tests

**File: `tests/conversation-notes.spec.ts`**

```typescript
test('volunteer can add note to conversation', async () => {
  // Open a conversation
  // Click "Add Note"
  // Fill in note text and custom fields
  // Save
  // Verify note appears in conversation detail
})

test('conversation notes appear in notes list', async () => {
  // Create a conversation note
  // Navigate to Notes page
  // Verify the note appears with conversation link
})

test('conversation note is encrypted', async () => {
  // Create a conversation note
  // Verify the stored content is encrypted
  // Verify author and admin can decrypt
})
```

### 5. Blast Route Tests (BlastDO)

**File: `tests/blast-do.spec.ts`** (update existing blast tests)

```typescript
test('blast routes work after DO split', async () => {
  // Create subscriber
  // Create blast
  // Send blast
  // Verify delivery
})
```

### 6. Storage Scaling Tests

These are harder to E2E test but can be verified via:

```typescript
test('conversation list paginates correctly', async () => {
  // Create 10+ conversations
  // Verify page 1 returns first batch
  // Verify page 2 returns second batch
  // Verify total count is correct
})
```

## Test Matrix

| Test Area | New Tests | Modified Tests |
|-----------|-----------|----------------|
| Report isolation | 3 | 0 |
| Shared thread | 2 | Update existing conversation tests |
| Report custom fields | 4 | 0 |
| Conversation notes | 3 | 0 |
| Blast DO split | 0 | Update existing blast tests |
| Pagination | 1 | Update existing list tests |
| **Total** | **13** | **~5 modified** |

## Dependencies

All Epics 119-123 should be complete before this epic runs. This epic is the verification gate.

## Verification

All 13+ new E2E tests pass. All existing tests pass without regression.
