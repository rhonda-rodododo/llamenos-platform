# Epic 124: Records Architecture E2E Tests

## Status: APPROVED

## Problem Statement

The records domain consolidation (Epics 119-123) introduces significant architectural changes:
- Report type filtering fix (security-critical)
- ConversationThread reuse in reports and note threads
- BlastDO extraction
- Per-record conversation storage
- Threaded notes (call notes + conversation notes)
- Report custom fields
- Conversation notes custom fields
- Contact-level unified view

Each of these changes needs comprehensive E2E testing to prevent regressions.

## Test Plan

### 1. Report Isolation Tests

**File: `tests/report-isolation.spec.ts`**

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

test('note thread uses shared thread component', async () => {
  // Create a call note
  // Reply to it
  // Verify reply renders in the thread
  // Verify admin can also reply
})
```

### 3. Custom Fields Tests

**File: `tests/custom-fields.spec.ts`**

```typescript
test('admin can create custom fields for reports', async () => {
  // Go to Settings > Custom Fields
  // Create a field with context 'reports'
  // Verify it appears in the field list
})

test('admin can create custom fields for conversation notes', async () => {
  // Create a field with context 'conversation-notes'
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

test('fields with context "all" appear everywhere', async () => {
  // Create a field with context 'all'
  // Verify it appears in call notes, conversation notes, and reports
})
```

### 4. Threaded Notes Tests

**File: `tests/threaded-notes.spec.ts`**

```typescript
test('volunteer can create a call note', async () => {
  // Navigate to call notes
  // Create a note with custom fields
  // Verify it appears in the list
})

test('admin can reply to a call note', async () => {
  // Create a call note
  // Login as admin
  // Open the note
  // Reply with a message
  // Verify reply appears in the thread
})

test('volunteer can reply back on a note', async () => {
  // Continue from admin reply
  // Login as volunteer
  // Reply to the admin's message
  // Verify back-and-forth thread
})

test('conversation note can be created from conversation detail', async () => {
  // Open a conversation
  // Click "Add Note"
  // Fill in note text and custom fields (conversation-notes context)
  // Save
  // Verify note appears in conversation detail
})

test('note replies are encrypted', async () => {
  // Create a note with replies
  // Verify stored content is encrypted
  // Verify author and admin can decrypt
})
```

### 5. Contact View Tests

**File: `tests/contact-view.spec.ts`**

```typescript
test('admin can see contact list', async () => {
  // Login as admin
  // Navigate to contacts page
  // Verify contacts are listed
})

test('contact detail shows unified timeline', async () => {
  // Create call + conversation + report for same contact
  // Navigate to contact detail
  // Verify all three appear in timeline
})

test('contact view is admin-only', async () => {
  // Login as volunteer
  // Verify contacts page is not accessible
})
```

### 6. Blast Route Tests (BlastDO)

**Update existing blast tests**

```typescript
test('blast routes work after DO split', async () => {
  // Create subscriber
  // Create blast
  // Send blast
  // Verify delivery
})
```

### 7. Storage Scaling Tests

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
| Shared thread | 3 | Update existing conversation tests |
| Custom fields | 5 | 0 |
| Threaded notes | 5 | Update existing note tests |
| Contact view | 3 | 0 |
| Blast DO split | 0 | Update existing blast tests |
| Pagination | 1 | Update existing list tests |
| **Total** | **20** | **~5 modified** |

## Dependencies

All Epics 119-123 should be complete before this epic runs. This epic is the verification gate.

## Verification

All 20+ new E2E tests pass. All existing tests pass without regression.
