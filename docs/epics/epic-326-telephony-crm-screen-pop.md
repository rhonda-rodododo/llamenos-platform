# Epic 326: Telephony-CRM: Screen Pop & Auto-Link

**Status**: PENDING
**Priority**: High
**Depends on**: Epic 318 (Contact Entity), Epic 319 (Record Entity)
**Blocks**: None
**Branch**: `desktop`

## Summary

Integrate the telephony system (CallRouterDO) with the case management system (ContactDirectoryDO, CaseDO) so that incoming calls trigger automatic caller identification, screen pop with case history, and auto-linking of notes to the identified contact and their active cases. When a call arrives, the server computes an identifier hash from the caller's phone number and looks up the ContactDirectoryDO for a match. If found, a new Nostr event (`KIND_CONTACT_IDENTIFIED`, kind 1023) is published with the contactId and case count. The volunteer's client decrypts the contact profile and displays case history on the ring screen via a ContactPopover component. Notes created during or after calls are automatically linked to the identified contact, and the UI prompts to link to an active case. ~18 files created/modified.

## Problem Statement

Currently, when a call arrives, volunteers see only the caller's last 4 digits on the ring screen. There is no way to know:
- Whether this caller has called before
- Whether they have an existing case (arrest, medical encounter, etc.)
- What their risk level or medical needs are
- Which volunteer was previously working with them

This information gap means volunteers start every call from scratch, even for repeat callers in active cases. During a mass arrest, a support contact may call back multiple times over hours — each time, the volunteer has no context. Enterprise CRMs (Salesforce CTI, Freshdesk) solve this with "screen pop" — automatic caller identification and case history display. Llamenos has the unique advantage of a built-in telephony platform that can integrate deeply with case management, but must do so without exposing PII to the server (contact profile is E2EE, only the identifier hash is server-visible).

## Implementation

### Phase 1: API + Shared Specs

#### Task 1: Contact Lookup Integration in CallRouterDO

**File**: `apps/worker/durable-objects/call-router.ts` (modify)

Extend `handleIncomingCall()` to check ContactDirectoryDO for the caller:

```typescript
private async handleIncomingCall(data: {
  callSid: string
  callerNumber: string
  volunteerPubkeys: string[]
}): Promise<Response> {
  // ... existing call record creation ...

  // NEW: Check ContactDirectoryDO for caller identification
  const identifierHash = hashPhone(data.callerNumber, this.env.HMAC_SECRET)
  let contactMatch: { contactId: string; caseCount: number } | null = null

  try {
    const contactDir = this.env.CONTACT_DIRECTORY.get(
      this.env.CONTACT_DIRECTORY.idFromName(hubId)
    )
    const lookupRes = await contactDir.fetch(
      new Request(`http://do/contacts/lookup/${identifierHash}`)
    )
    if (lookupRes.ok) {
      const { contact } = await lookupRes.json() as { contact: Contact | null }
      if (contact) {
        contactMatch = {
          contactId: contact.id,
          caseCount: contact.caseCount,
        }
      }
    }
  } catch {
    // Contact lookup failure should not block call routing
  }

  // Publish ring event with optional contact identification
  this.publishEvent(KIND_CALL_RING, {
    type: 'call:ring',
    callId: call.id,
    callerLast4: call.callerLast4,
    startedAt: call.startedAt,
  })

  // If contact identified, publish a separate identification event
  if (contactMatch) {
    this.publishEvent(KIND_CONTACT_IDENTIFIED, {
      type: 'contact:identified',
      callId: call.id,
      contactId: contactMatch.contactId,
      caseCount: contactMatch.caseCount,
    })
  }

  return Response.json({ call, contactMatch })
}
```

Key design decisions:
- Contact lookup runs in parallel with call routing, not blocking ring delivery
- Lookup failure is caught and logged — never prevents a call from being routed
- The `KIND_CONTACT_IDENTIFIED` event is separate from `KIND_CALL_RING` so that existing clients that do not support case management still receive ring events normally

#### Task 2: Nostr Event Kind

**File**: `packages/shared/nostr-events.ts` (modify)

```typescript
// Case management integration events (Epic 326)
export const KIND_CONTACT_IDENTIFIED = 1023
```

Event payload (encrypted with hub key):
```typescript
interface ContactIdentifiedPayload {
  type: 'contact:identified'
  callId: string
  contactId: string             // UUID from ContactDirectoryDO
  caseCount: number             // Number of active cases for this contact
}
```

#### Task 3: Auto-Link Note to Contact

**File**: `apps/worker/routes/notes.ts` (modify)

When a note is created with a `callId`, check if the call has an identified contact:

```typescript
// After creating the note in RecordsDO:
if (body.callId && body.contactId) {
  // Link note to contact (increment interaction count)
  const contactDir = getScopedDOs(c.env, c.get('hubId')).contactDirectory
  await contactDir.fetch(new Request(`http://do/contacts/${body.contactId}/interaction`, {
    method: 'POST',
  }))
}

// If note also has caseId, create an interaction record in CaseDO
if (body.caseId) {
  const caseManager = getScopedDOs(c.env, c.get('hubId')).caseManager
  await caseManager.fetch(new Request(`http://do/records/${body.caseId}/interactions`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'note',
      sourceId: noteId,
      actorPubkey: c.get('pubkey'),
    }),
  }))
}
```

#### Task 4: Note Schema Extension

**File**: `apps/worker/schemas/notes.ts` (modify — if exists) / relevant note creation schema

Add optional `contactId` and `caseId` fields to the note creation body:

```typescript
// Add to create note body schema:
contactId: z.uuid().optional(),  // Auto-linked contact
caseId: z.uuid().optional(),     // Linked case (user-selected)
```

#### Task 5: Active Cases for Contact API

**File**: `apps/worker/routes/records.ts` (modify)

Add a route to fetch active cases for a contact:

```typescript
// GET /api/records/by-contact/:contactId — list active cases linked to a contact
recordsRouter.get('/by-contact/:contactId',
  requirePermission('cases:read-own'),
  async (c) => {
    const contactId = c.req.param('contactId')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.caseManager.fetch(
      new Request(`http://do/records/by-contact/${contactId}`)
    )
    return new Response(res.body, res)
  },
)
```

CaseDO handler:
```typescript
// GET /records/by-contact/:contactId
this.router.get('/records/by-contact/:contactId', async (req) => {
  const { contactId } = req.params
  // Scan reverse index: contactrecords:{contactId}:*
  const links = await this.ctx.storage.list({
    prefix: `contactrecords:${contactId}:`,
  })
  const recordIds = Array.from(links.keys()).map(k => k.split(':')[2])
  const records = await Promise.all(
    recordIds.map(id => this.ctx.storage.get(`record:${id}`))
  )
  // Filter to active (non-closed) records
  const active = records.filter(r =>
    r && !(r as Record).closedAt
  )
  return json({ records: active })
})
```

#### Task 6: BDD Feature File

**File**: `packages/test-specs/features/core/telephony-crm.feature` (new)

```gherkin
@backend
Feature: Telephony-CRM Screen Pop & Auto-Link
  Incoming calls trigger caller identification via ContactDirectoryDO.
  Identified callers show case history on ring screen.
  Notes created during calls auto-link to contacts and cases.

  Background:
    Given a registered admin "admin1"
    And case management is enabled
    And an entity type "arrest_case" with numberPrefix "JS"

  @telephony @crm
  Scenario: Caller identified from contact directory
    Given a contact "Carlos Martinez" with phone "+15551234567"
    And an active arrest case linked to "Carlos Martinez"
    When a call arrives from "+15551234567"
    Then a KIND_CONTACT_IDENTIFIED event should be published
    And the event should contain the contactId for "Carlos Martinez"
    And the event caseCount should be 1

  @telephony @crm
  Scenario: Unknown caller not identified
    Given no contact with phone "+15559999999" exists
    When a call arrives from "+15559999999"
    Then a KIND_CALL_RING event should be published
    And no KIND_CONTACT_IDENTIFIED event should be published

  @telephony @crm
  Scenario: Contact lookup failure does not block call routing
    Given ContactDirectoryDO is unavailable
    When a call arrives from "+15551234567"
    Then a KIND_CALL_RING event should still be published
    And the call should be routed to on-shift volunteers

  @telephony @crm
  Scenario: Auto-link note to identified contact
    Given a contact "Carlos Martinez" with phone "+15551234567"
    And a call from "+15551234567" was answered by "vol1"
    When volunteer "vol1" creates a note with contactId for "Carlos Martinez"
    Then the contact's interactionCount should increment by 1
    And the contact's lastInteractionAt should be updated

  @telephony @crm
  Scenario: Link note to active case
    Given a contact "Carlos Martinez" with an active arrest case "JS-2026-0001"
    And a call from "+15551234567" was answered by "vol1"
    When volunteer "vol1" creates a note linked to case "JS-2026-0001"
    Then the case should have a new interaction of type "note"
    And the case's interactionCount should increment

  @telephony @crm
  Scenario: Fetch active cases for identified contact
    Given a contact "Carlos Martinez" with 2 active cases and 1 closed case
    When admin "admin1" fetches active cases for "Carlos Martinez"
    Then 2 records should be returned
    And no closed records should be included

  @telephony @crm @permissions
  Scenario: Volunteer can only see own assigned cases for contact
    Given a contact "Carlos Martinez" with cases assigned to "vol1" and "vol2"
    When volunteer "vol1" fetches active cases for "Carlos Martinez"
    Then only cases assigned to "vol1" should be returned
```

### Phase 2: Desktop UI

#### Task 7: ContactPopover Component

**File**: `src/client/components/ContactPopover.tsx` (new)

Displayed on the ring screen / active call panel when a caller is identified:

```typescript
interface ContactPopoverProps {
  contactId: string
  caseCount: number
  callId: string
}
```

Shows:
- Contact display name (decrypted from summary envelope)
- Case count badge
- Last interaction date
- Active case list (case number, status, severity badge)
- "Link to case" button for each active case

Uses shadcn/ui: `Popover`, `PopoverTrigger`, `PopoverContent`, `Badge`, `Button`, `ScrollArea`

Key `data-testid` attributes:
- `contact-popover` — the popover container
- `contact-name` — decrypted display name
- `contact-case-count` — number of active cases
- `contact-case-{caseNumber}` — each case entry
- `link-to-case-{caseNumber}` — link-to-case button per case
- `last-interaction-date` — last interaction timestamp

#### Task 8: ActiveCallPanel Integration

**File**: `src/client/components/ActiveCallPanel.tsx` (modify) / relevant call display component

Integrate `ContactPopover` into the call display:

```typescript
// When KIND_CONTACT_IDENTIFIED arrives via Nostr relay:
const [identifiedContact, setIdentifiedContact] = useState<{
  contactId: string
  caseCount: number
} | null>(null)

// In the useEffect for Nostr events:
if (event.kind === KIND_CONTACT_IDENTIFIED) {
  const payload = decryptEventContent(event, hubKey)
  if (payload.callId === currentCallId) {
    setIdentifiedContact({
      contactId: payload.contactId,
      caseCount: payload.caseCount,
    })
  }
}

// In render: show ContactPopover when identified
{identifiedContact && (
  <ContactPopover
    contactId={identifiedContact.contactId}
    caseCount={identifiedContact.caseCount}
    callId={currentCallId}
  />
)}
```

#### Task 9: Link-to-Case Dialog

**File**: `src/client/components/LinkToCaseDialog.tsx` (new)

Shown when a volunteer creates a note for an identified contact with active cases:

```typescript
interface LinkToCaseDialogProps {
  contactId: string
  onSelect: (caseId: string) => void
  onSkip: () => void
  open: boolean
}
```

Fetches active cases for the contact via `GET /api/records/by-contact/:contactId`, displays them as selectable cards, and returns the selected caseId to the note creation flow.

Key `data-testid` attributes:
- `link-to-case-dialog` — dialog root
- `case-option-{caseNumber}` — each selectable case
- `link-case-confirm` — confirm selection button
- `link-case-skip` — skip button

#### Task 10: Note Form Extension

**File**: `src/client/components/NoteForm.tsx` (modify) / relevant note creation component

When a note is being created during or after a call:
1. If caller was identified, auto-set `contactId` on the note
2. If contact has active cases, show `LinkToCaseDialog`
3. Selected `caseId` is submitted with the note

#### Task 11: i18n Strings

**File**: `packages/i18n/locales/en.json` (modify)

```json
{
  "telephonyCrm": {
    "callerIdentified": "Known caller",
    "activeCases": "Active cases",
    "noCases": "No active cases",
    "linkToCase": "Link to case",
    "skipLinking": "Skip",
    "linkToCasePrompt": "This caller has active cases. Link this note to a case?",
    "unknownCaller": "Unknown caller",
    "contactLookupFailed": "Could not look up caller",
    "lastInteraction": "Last interaction",
    "caseHistory": "Case history"
  }
}
```

#### Task 12: Desktop BDD Feature File

**File**: `packages/test-specs/features/platform/desktop/cases/screen-pop.feature` (new)

```gherkin
@desktop
Feature: Screen Pop & Auto-Link (Desktop)
  Volunteer sees caller identification and case history on ring screen.
  Notes auto-link to identified contacts and cases.

  Background:
    Given the user is logged in as a volunteer
    And case management is enabled

  @screen-pop
  Scenario: Contact popover appears for identified caller
    Given a contact "Carlos Martinez" exists with 2 active cases
    When an incoming call from "Carlos Martinez" rings
    Then the contact popover should be visible
    And the contact name should show "Carlos Martinez"
    And the case count badge should show "2"

  @screen-pop
  Scenario: No popover for unknown caller
    When an incoming call from an unknown number rings
    Then no contact popover should appear
    And the caller last 4 digits should be visible

  @auto-link
  Scenario: Link to case dialog shown during note creation
    Given a call from identified contact "Carlos Martinez" is active
    And "Carlos Martinez" has active case "JS-2026-0001"
    When the volunteer creates a note
    Then the "Link to case" dialog should appear
    And case "JS-2026-0001" should be listed as an option

  @auto-link
  Scenario: Note linked to selected case
    Given a call from identified contact "Carlos Martinez" is active
    And the volunteer creates a note
    When the volunteer selects case "JS-2026-0001" in the link dialog
    Then the note should be linked to case "JS-2026-0001"
    And the case interaction count should increase

  @auto-link
  Scenario: Volunteer skips case linking
    Given a call from identified contact "Carlos Martinez" is active
    When the volunteer creates a note and clicks "Skip"
    Then the note should be created without a case link
    But the note should still be linked to the contact
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/client/components/ContactPopover.tsx` | Contact info + case history popover on ring screen |
| `src/client/components/LinkToCaseDialog.tsx` | Case selection dialog for note linking |
| `packages/test-specs/features/core/telephony-crm.feature` | Backend BDD scenarios |
| `packages/test-specs/features/platform/desktop/cases/screen-pop.feature` | Desktop BDD scenarios |
| `tests/steps/backend/telephony-crm.steps.ts` | Backend step definitions |
| `tests/steps/cases/screen-pop-steps.ts` | Desktop step definitions |

## Files to Modify

| File | Change |
|------|--------|
| `apps/worker/durable-objects/call-router.ts` | Add ContactDirectoryDO lookup in handleIncomingCall |
| `apps/worker/durable-objects/case-do.ts` | Add /records/by-contact/:contactId handler |
| `apps/worker/routes/records.ts` | Add GET /api/records/by-contact/:contactId route |
| `apps/worker/routes/notes.ts` | Add contactId/caseId auto-linking on note creation |
| `packages/shared/nostr-events.ts` | Add KIND_CONTACT_IDENTIFIED = 1023 |
| `src/client/components/ActiveCallPanel.tsx` | Integrate ContactPopover on ring |
| `src/client/components/NoteForm.tsx` | Add contactId/caseId linking UI |
| `packages/i18n/locales/en.json` | Add telephonyCrm i18n section |
| `packages/i18n/locales/*.json` | Propagate to all 13 locales |
| `tests/test-ids.ts` | Add screen-pop related test IDs |

## Testing

### Backend BDD
- `bun run test:backend:bdd` -- 7 scenarios in `telephony-crm.feature`

### Desktop BDD
- `bun run test:desktop` -- 5 scenarios in `screen-pop.feature`

## Acceptance Criteria & Test Scenarios

- [ ] Incoming call triggers ContactDirectoryDO lookup by identifier hash
  -> `packages/test-specs/features/core/telephony-crm.feature: "Caller identified from contact directory"`
- [ ] Unknown callers do not trigger identification events
  -> `packages/test-specs/features/core/telephony-crm.feature: "Unknown caller not identified"`
- [ ] Contact lookup failure does not block call routing
  -> `packages/test-specs/features/core/telephony-crm.feature: "Contact lookup failure does not block call routing"`
- [ ] Notes auto-link to identified contacts
  -> `packages/test-specs/features/core/telephony-crm.feature: "Auto-link note to identified contact"`
- [ ] Notes can be linked to active cases
  -> `packages/test-specs/features/core/telephony-crm.feature: "Link note to active case"`
- [ ] Active cases fetched per contact (excluding closed)
  -> `packages/test-specs/features/core/telephony-crm.feature: "Fetch active cases for identified contact"`
- [ ] Permission enforcement on case visibility
  -> `packages/test-specs/features/core/telephony-crm.feature: "Volunteer can only see own assigned cases for contact"`
- [ ] ContactPopover displays on ring screen for identified callers
  -> `packages/test-specs/features/platform/desktop/cases/screen-pop.feature: "Contact popover appears for identified caller"`
- [ ] Link-to-case dialog appears during note creation for callers with active cases
  -> `packages/test-specs/features/platform/desktop/cases/screen-pop.feature: "Link to case dialog shown during note creation"`
- [ ] All platform BDD suites pass
- [ ] Backlog files updated

## Feature Files

| File | Status | Description |
|------|--------|-------------|
| `packages/test-specs/features/core/telephony-crm.feature` | New | 7 backend scenarios for telephony-CRM integration |
| `packages/test-specs/features/platform/desktop/cases/screen-pop.feature` | New | 5 desktop scenarios for screen pop + auto-link |
| `tests/steps/backend/telephony-crm.steps.ts` | New | Backend step definitions |
| `tests/steps/cases/screen-pop-steps.ts` | New | Desktop step definitions |

## Risk Assessment

- **Medium risk**: CallRouterDO modification (Task 1) -- adding a cross-DO call (ContactDirectoryDO) in the hot path of incoming call routing. Mitigated by wrapping in try/catch, setting a tight timeout, and treating lookup failure as non-blocking. The ring event is always published regardless of lookup outcome.
- **Medium risk**: Event ordering (Task 2) -- `KIND_CONTACT_IDENTIFIED` must arrive at the client before or concurrently with `KIND_CALL_RING`. If it arrives after the volunteer has already answered, the screen pop is less useful. Mitigated by publishing both events in the same handler execution, so Nostr relay ordering is consistent.
- **Low risk**: Note schema extension (Task 4) -- adding optional fields to an existing schema. Backward-compatible; existing notes without contactId/caseId continue to work.
- **Low risk**: Desktop UI (Tasks 7-10) -- standard React component work using existing shadcn/ui primitives and established patterns.

## Execution

- **Phase 1**: Nostr event kind -> CallRouterDO lookup -> Note schema extension -> Auto-link routes -> CaseDO by-contact handler -> BDD scenarios -> gate
- **Phase 2**: ContactPopover -> ActiveCallPanel integration -> LinkToCaseDialog -> NoteForm extension -> i18n -> Desktop BDD -> gate
- **Phase 3**: `bun run test:all`
