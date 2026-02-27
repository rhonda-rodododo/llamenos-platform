# Epic 128: Mobile Records i18n & Detox Tests

## Summary

Add translation keys for all new records features (Epics 125-127) to all 13 mobile locale files, and write Detox E2E tests covering note threading, contacts page, conversation notes, and custom field context filtering.

**Prerequisites**: Epics 125-127 must be code-complete.

## Current State

### i18n locale files need updates

The mobile app has 13 locale files at `llamenos-mobile/src/locales/`:
- en.json, es.json, zh.json, tl.json, vi.json, ar.json, fr.json, ht.json, ko.json, ru.json, hi.json, pt.json, de.json

The desktop already has these translation keys (added in Epic 123). The mobile translations should use the same keys where possible for consistency.

### Detox test files exist

The mobile app uses Detox for E2E testing. Existing test files:
- `e2e/auth.test.ts` — login, onboarding
- `e2e/dashboard.test.ts` — dashboard screen
- `e2e/notes.test.ts` — notes list + detail
- `e2e/conversations.test.ts` — conversations list + thread
- `e2e/shifts.test.ts` — shift schedule
- `e2e/settings.test.ts` — settings screen
- `e2e/admin.test.ts` — admin nav
- `e2e/admin-volunteers.test.ts` — volunteer management
- `e2e/admin-settings.test.ts` — admin settings
- `e2e/navigation.test.ts` — nav flows
- `e2e/error-states.test.ts` — error handling

## Implementation Plan

### Phase 1: New Translation Keys

**Keys to add to `en.json`** (and translate to all 12 other locales):

```json
{
  "notes": {
    "reply": "Reply",
    "repliesCount": "{{count}} replies",
    "replyPlaceholder": "Write a reply...",
    "sendReply": "Send",
    "threadLoading": "Loading thread...",
    "addNote": "Add Note",
    "newConversationNote": "New conversation note",
    "linkedTo": "Linked to",
    "conversationNote": "Conversation note",
    "saved": "Note saved"
  },
  "contacts": {
    "title": "Contacts",
    "description": "View unified interaction history across calls, conversations, and reports.",
    "contact": "Contact",
    "firstSeen": "First seen",
    "lastSeen": "Last seen",
    "call": "Call",
    "conversation": "Conversation",
    "messages": "messages",
    "report": "Report",
    "noHistory": "No interaction history found",
    "noContacts": "No contacts found"
  },
  "customFields": {
    "context": "Appears In",
    "callNotes": "Call Notes",
    "conversationNotes": "Conversation Notes",
    "reports": "Reports",
    "allRecordTypes": "All Record Types"
  }
}
```

Most of these keys match the desktop's `en.json` exactly. The `customFields` keys are new for mobile but match the desktop admin settings labels.

### Phase 2: Translate to All Locales

Use the same translation approach as Epic 123 on desktop — create a script that adds the new keys to all 12 non-English locale files with appropriate translations.

Key considerations:
- Arabic (ar.json): RTL layout considerations for reply thread direction
- CJK languages (zh, ko): Ensure `{{count}}` interpolation works with CJK number formatting
- Haitian Creole (ht.json): Limited machine translation quality — verify with native speakers if possible

### Phase 3: Detox Tests — Note Threading

**File: `e2e/note-threading.test.ts`**

```typescript
describe('Note Threading', () => {
  beforeAll(async () => {
    // Login as admin
    await loginAsAdmin()
  })

  it('should show reply button on note cards', async () => {
    await element(by.id('tab-notes')).tap()
    await waitFor(element(by.id('note-card'))).toBeVisible().withTimeout(10000)
    await expect(element(by.id('note-reply-btn'))).toBeVisible()
  })

  it('should expand thread when reply button is tapped', async () => {
    await element(by.id('note-reply-btn')).atIndex(0).tap()
    await waitFor(element(by.id('note-thread'))).toBeVisible().withTimeout(5000)
    await expect(element(by.id('note-reply-input'))).toBeVisible()
  })

  it('should send a reply and update count', async () => {
    await element(by.id('note-reply-input')).typeText('Test reply from mobile')
    await element(by.id('note-reply-send')).tap()
    // Wait for reply to appear
    await waitFor(element(by.text('Test reply from mobile'))).toBeVisible().withTimeout(5000)
  })

  it('should collapse thread and show updated count', async () => {
    await element(by.id('note-reply-btn')).atIndex(0).tap()
    await waitFor(element(by.id('note-thread'))).not.toBeVisible().withTimeout(3000)
    // Reply count should be visible
    await expect(element(by.text(/1 repl/i))).toBeVisible()
  })
})
```

### Phase 4: Detox Tests — Contacts Page

**File: `e2e/contacts.test.ts`**

```typescript
describe('Contacts Page', () => {
  beforeAll(async () => {
    await loginAsAdmin()
  })

  it('admin can navigate to contacts from settings', async () => {
    await element(by.id('tab-settings')).tap()
    await element(by.id('admin-contacts-link')).tap()
    await waitFor(element(by.text('Contacts'))).toBeVisible().withTimeout(5000)
  })

  it('shows contacts list or empty state', async () => {
    // Either contact rows or empty state should be visible
    await waitFor(
      element(by.id('contact-row')).atIndex(0)
    ).toBeVisible().withTimeout(5000).catch(async () => {
      await expect(element(by.text(/no contacts found/i))).toBeVisible()
    })
  })

  it('volunteer cannot see contacts link in settings', async () => {
    await loginAsVolunteer()
    await element(by.id('tab-settings')).tap()
    await expect(element(by.id('admin-contacts-link'))).not.toBeVisible()
  })
})
```

### Phase 5: Detox Tests — Conversation Notes

**File: `e2e/conversation-notes.test.ts`**

```typescript
describe('Conversation Notes', () => {
  beforeAll(async () => {
    await loginAsAdmin()
  })

  it('conversation thread shows Add Note button', async () => {
    await element(by.id('tab-conversations')).tap()
    // Tap first conversation
    await element(by.id('conversation-item')).atIndex(0).tap()
    await waitFor(element(by.id('conv-add-note-btn'))).toBeVisible().withTimeout(5000)
  })

  it('Add Note opens note form modal', async () => {
    await element(by.id('conv-add-note-btn')).tap()
    await waitFor(element(by.id('note-form-modal'))).toBeVisible().withTimeout(3000)
    // Should show conversation context badge
    await expect(element(by.text(/conversation note/i))).toBeVisible()
  })

  it('can create a note linked to conversation', async () => {
    await element(by.id('note-text-input')).typeText('Mobile conversation note')
    await element(by.id('note-save-btn')).tap()
    // Modal should close
    await waitFor(element(by.id('note-form-modal'))).not.toBeVisible().withTimeout(3000)
  })
})
```

### Phase 6: Detox Tests — Custom Field Context

**File: `e2e/custom-field-context.test.ts`**

```typescript
describe('Custom Field Context Filtering', () => {
  // This test requires custom fields to be configured on the hub
  // with different contexts (call-notes, conversation-notes, all)

  it('call note form shows call-notes context fields', async () => {
    // Navigate to active call or notes screen
    // Open new note form in call context
    // Verify call-notes fields are visible
    // Verify conversation-notes fields are NOT visible
  })

  it('conversation note form shows conversation-notes context fields', async () => {
    // Navigate to conversation thread
    // Open Add Note
    // Verify conversation-notes fields are visible
    // Verify call-notes fields are NOT visible
  })

  it('fields with context "all" appear in both forms', async () => {
    // Verify "all" context fields appear in both call and conversation note forms
  })
})
```

## testID Inventory

New testIDs to add to mobile components (and to `src/test-ids.ts` if centralized):

| testID | Component | Purpose |
|--------|-----------|---------|
| `note-reply-btn` | NoteCard | Reply/expand thread button |
| `note-thread` | NotesScreen | Thread container |
| `note-reply-input` | NotesScreen | Reply text input |
| `note-reply-send` | NotesScreen | Reply send button |
| `contact-row` | ContactRow | Contact list item |
| `admin-contacts-link` | Settings | Admin nav link to contacts |
| `conv-add-note-btn` | ConversationThread | Add Note header button |
| `note-form-modal` | NoteFormModal | Modal container |
| `note-text-input` | NoteFormModal | Note text input |
| `note-save-btn` | NoteFormModal | Save button |
| `contact-timeline` | ContactDetail | Timeline container |

## Files Changed

| File | Action |
|------|--------|
| `src/locales/*.json` (13 files) | Add new translation keys |
| `e2e/note-threading.test.ts` | NEW — note threading Detox tests |
| `e2e/contacts.test.ts` | NEW — contacts page Detox tests |
| `e2e/conversation-notes.test.ts` | NEW — conversation notes Detox tests |
| `e2e/custom-field-context.test.ts` | NEW — custom field context filtering tests |
| `src/test-ids.ts` | Add new testID constants |

## Notes

- Detox tests run on actual iOS simulator / Android emulator — they need a running backend
- Test auth helpers (`loginAsAdmin`, `loginAsVolunteer`) should already exist in the Detox test setup
- Some tests may need to seed test data (notes, conversations) before running — use API calls in `beforeAll`
- Custom field context tests require admin to first configure fields with specific contexts
