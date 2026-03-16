# Epic 349: Desktop: Case Field Encryption/Decryption Wiring

**Status**: PENDING
**Priority**: Critical (data display is fundamentally broken)
**Depends on**: Epic 330 (Desktop Case Management UI)
**Blocks**: None
**Branch**: `desktop`

## Summary

Wire up client-side decryption of case record encrypted tiers (`encryptedSummary`, `encryptedFields`) and encrypted save-on-edit for custom field values. Currently the case management UI creates records with proper E2EE encryption (via `create-record-dialog.tsx`), but the display side never decrypts anything -- case cards show only case numbers (no titles), and the Details tab renders empty forms. This is a ~150-line fix across one file (`cases.tsx`) plus BDD scenario additions. No API changes, no new files.

## Problem Statement

Three TODOs in `src/client/routes/cases.tsx` leave the CMS non-functional for real use:

1. **RecordCard (line 543)**: Shows `record.caseNumber || record.id.slice(0, 8)` but never decrypts `encryptedSummary` to show the case title. Every card in the case list is just a number or truncated UUID.

2. **DetailsTab (line 852-853)**: `fieldValues` state is initialized as `{}` with a TODO comment. `encryptedFields` is never decrypted, so the SchemaForm renders all fields empty even when the record has data.

3. **DetailsTab onChange (line 871-872)**: The SchemaForm `onChange` handler is a no-op arrow function. Editing fields does nothing -- no encryption, no API call, no save.

The create flow in `create-record-dialog.tsx` works correctly (encrypts summary + fields, sends envelopes). The decryption primitives exist in `platform.ts` (`decryptMessage`). The pattern for using them is established in `contacts-directory.tsx` and `notes.tsx`. This epic just wires the existing pieces together.

## Current Broken Code

### RecordCard -- no title displayed

```typescript
// cases.tsx line 543 -- shows only case number, never the title
<span className="truncate text-sm font-medium text-foreground flex-1">
  {record.caseNumber || record.id.slice(0, 8)}
</span>
```

The `record.encryptedSummary` and `record.summaryEnvelopes` fields are present on `CaseRecord` but never read.

### DetailsTab -- empty field values, no-op save

```typescript
// cases.tsx line 852-853
// TODO: integrate client-side decryption of encryptedFields
const [fieldValues] = useState<SchemaFieldValues>({})

// cases.tsx line 871-872
onChange={() => {
  // TODO: implement save with encryption on change
}}
```

## Implementation

### Phase 1: Summary Decryption in RecordCard

**Goal**: Case cards show decrypted title instead of just case number.

Convert `RecordCard` from a stateless render to a component that decrypts `encryptedSummary` on mount. Use the same pattern as `contacts-directory.tsx` lines 48-54.

```typescript
// In RecordCard component body, add:
import { decryptMessage } from '@/lib/platform'
import * as keyManager from '@/lib/key-manager'

function RecordCard({ record, entityType, isSelected, onSelect }: { ... }) {
  const { t } = useTranslation()
  const [decryptedTitle, setDecryptedTitle] = useState<string | null>(null)

  // Decrypt summary to extract title
  useEffect(() => {
    if (!record.encryptedSummary || !record.summaryEnvelopes?.length) return
    if (!keyManager.isUnlocked()) return

    let cancelled = false
    decryptMessage(record.encryptedSummary, record.summaryEnvelopes)
      .then(plaintext => {
        if (cancelled || !plaintext) return
        try {
          const summary = JSON.parse(plaintext) as { title?: string }
          if (summary.title) setDecryptedTitle(summary.title)
        } catch { /* malformed JSON -- leave title as null */ }
      })
      .catch(() => { /* decryption failed -- fallback to case number */ })
    return () => { cancelled = true }
  }, [record.encryptedSummary, record.summaryEnvelopes])

  // ... existing code, but replace the title span:
  // BEFORE:
  //   {record.caseNumber || record.id.slice(0, 8)}
  // AFTER:
  //   {decryptedTitle || record.caseNumber || record.id.slice(0, 8)}
}
```

The `RecordCard` renders many times in a list, so decryption is async and non-blocking. The `cancelled` flag prevents stale updates when cards unmount during scrolling/filtering.

### Phase 2: Fields Decryption in DetailsTab

**Goal**: When a record is selected, decrypt `encryptedFields` and populate the SchemaForm.

```typescript
function DetailsTab({ record, entityType, isAdmin, hasPermission, isAssigned }: { ... }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { hasNsec, publicKey, adminDecryptionPubkey } = useAuth()

  const [fieldValues, setFieldValues] = useState<SchemaFieldValues>({})
  const [decrypting, setDecrypting] = useState(false)

  // Decrypt encryptedFields on record load
  useEffect(() => {
    if (!record.encryptedFields || !record.fieldEnvelopes?.length) {
      setFieldValues({})
      return
    }
    if (!keyManager.isUnlocked()) {
      setFieldValues({})
      return
    }

    let cancelled = false
    setDecrypting(true)

    decryptMessage(record.encryptedFields, record.fieldEnvelopes)
      .then(plaintext => {
        if (cancelled) return
        if (plaintext) {
          try {
            const parsed = JSON.parse(plaintext) as SchemaFieldValues
            setFieldValues(parsed)
          } catch {
            setFieldValues({})
          }
        } else {
          setFieldValues({})
        }
      })
      .catch(() => {
        if (!cancelled) setFieldValues({})
      })
      .finally(() => {
        if (!cancelled) setDecrypting(false)
      })

    return () => { cancelled = true }
  }, [record.id, record.encryptedFields, record.fieldEnvelopes])

  // ... rest of component
}
```

Show a loading spinner while decrypting:

```typescript
if (decrypting) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  )
}
```

### Phase 3: Encrypted Save on Field Edit

**Goal**: When a user edits a field in SchemaForm, encrypt the updated values and PATCH via the API.

Use a debounced save pattern to avoid excessive API calls on every keystroke. The `readerPubkeys` array must include the current user's pubkey and the admin decryption pubkey (matching the create flow in `create-record-dialog.tsx` lines 111-114).

```typescript
// Inside DetailsTab, after the decrypt useEffect:

const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

const handleFieldChange = useCallback((newValues: SchemaFieldValues) => {
  setFieldValues(newValues)

  // Debounce: wait 800ms after last change before saving
  if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)

  saveTimeoutRef.current = setTimeout(async () => {
    if (!publicKey || !hasNsec) return

    setSaveStatus('saving')
    try {
      // Build reader pubkeys (same as create flow)
      const readerPubkeys = [publicKey]
      if (adminDecryptionPubkey && adminDecryptionPubkey !== publicKey) {
        readerPubkeys.push(adminDecryptionPubkey)
      }

      // Filter out empty values
      const nonEmpty = Object.fromEntries(
        Object.entries(newValues).filter(
          ([, v]) => v !== '' && v !== undefined && v !== false,
        ),
      )

      // Encrypt
      const encrypted = await encryptMessage(JSON.stringify(nonEmpty), readerPubkeys)

      // PATCH
      await updateRecord(record.id, {
        encryptedFields: encrypted.encryptedContent,
        fieldEnvelopes: encrypted.readerEnvelopes,
      })

      setSaveStatus('saved')
      // Reset to idle after 2s
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
      toast(t('cases.fieldSaveError', { defaultValue: 'Failed to save field changes' }), 'error')
    }
  }, 800)
}, [publicKey, hasNsec, adminDecryptionPubkey, record.id, toast, t])

// Cleanup timeout on unmount
useEffect(() => {
  return () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
  }
}, [])

const canEdit = hasPermission('cases:update') || (hasPermission('cases:update-own') && isAssigned)
```

Wire the save handler and show save status indicator:

```typescript
return (
  <div data-testid="case-details-tab">
    {/* Save status indicator */}
    {saveStatus !== 'idle' && (
      <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        {saveStatus === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
        {saveStatus === 'saving' && t('cases.saving', { defaultValue: 'Saving...' })}
        {saveStatus === 'saved' && <span className="text-green-600">{t('cases.saved', { defaultValue: 'Saved' })}</span>}
        {saveStatus === 'error' && <span className="text-destructive">{t('cases.saveError', { defaultValue: 'Save failed' })}</span>}
      </div>
    )}
    <SchemaForm
      entityType={entityType}
      values={fieldValues}
      onChange={canEdit ? handleFieldChange : undefined}
      readOnly={!canEdit}
      showAccessIndicators
    />
  </div>
)
```

### Phase 4: Summary Display in Detail Header

**Goal**: Show decrypted title and description in the record detail header, not just case number.

Add summary decryption in `RecordDetail`:

```typescript
function RecordDetail({ record, entityType, ... }: { ... }) {
  // ... existing state ...
  const [decryptedSummary, setDecryptedSummary] = useState<{
    title?: string
    description?: string
  } | null>(null)

  useEffect(() => {
    if (!record.encryptedSummary || !record.summaryEnvelopes?.length) return
    if (!keyManager.isUnlocked()) return

    let cancelled = false
    decryptMessage(record.encryptedSummary, record.summaryEnvelopes)
      .then(plaintext => {
        if (cancelled || !plaintext) return
        try {
          setDecryptedSummary(JSON.parse(plaintext))
        } catch { /* ignore */ }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [record.id, record.encryptedSummary, record.summaryEnvelopes])

  // In the header, after case number:
  // {decryptedSummary?.title && (
  //   <span className="text-sm font-medium text-foreground truncate max-w-xs">
  //     {decryptedSummary.title}
  //   </span>
  // )}
  // {decryptedSummary?.description && (
  //   <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
  //     {decryptedSummary.description}
  //   </p>
  // )}
}
```

### Phase 5: BDD Scenarios

**File**: `packages/test-specs/features/platform/desktop/cases/cms-case-management.feature`

Add three new scenarios after the existing "Case list shows case cards with status and type badges" scenario:

```gherkin
  Scenario: Case card shows decrypted title
    Given an arrest case with title "Arrest at 5th and Main" exists
    When I navigate to the "Cases" page
    Then the first case card should display the title "Arrest at 5th and Main"

  Scenario: Case detail shows decrypted custom field values
    Given an arrest case with custom field "location" set to "5th and Main" exists
    When I navigate to the "Cases" page
    And I click the first case card
    And the "Details" tab is active
    Then the schema form should display "5th and Main" in the "location" field

  Scenario: Editing case fields encrypts and saves
    Given an arrest case exists
    When I navigate to the "Cases" page
    And I click the first case card
    And the "Details" tab is active
    And I edit the "location" field to "Updated Location"
    Then the save indicator should show "Saved"
    When I navigate away and return to the case
    Then the "location" field should display "Updated Location"
```

**File**: `tests/steps/cases/cms-cases-steps.ts`

Add step definitions for the new scenarios. Key steps:

- `Given an arrest case with title {string} exists` -- create via API with encrypted summary containing the title
- `Then the first case card should display the title {string}` -- assert `getByTestId('case-card').first()` contains the text
- `Then the schema form should display {string} in the {string} field` -- assert form field value
- `And I edit the {string} field to {string}` -- fill the input
- `Then the save indicator should show {string}` -- assert save status text

## Key Files

| File | Change | Lines ~Changed |
|------|--------|---------------|
| `src/client/routes/cases.tsx` | Decrypt summary in RecordCard + RecordDetail, decrypt fields in DetailsTab, encrypt+save on change | ~120 |
| `packages/test-specs/features/platform/desktop/cases/cms-case-management.feature` | 3 new scenarios | ~20 |
| `tests/steps/cases/cms-cases-steps.ts` | Step definitions for new scenarios | ~60 |

## New Imports Required in `cases.tsx`

```typescript
import { decryptMessage, encryptMessage } from '@/lib/platform'
import * as keyManager from '@/lib/key-manager'
import { useRef } from 'react'  // already imported useState, useEffect, useCallback
```

Also need `useAuth` destructured with `{ hasNsec, publicKey, isAdmin, hasPermission, adminDecryptionPubkey }` -- currently `CasesPage` already imports `useAuth`, but `DetailsTab` and `RecordCard` don't have direct access. Thread `publicKey`, `hasNsec`, and `adminDecryptionPubkey` as props to `DetailsTab` (or import `useAuth` directly in the sub-components since they're in the same file).

## Existing Decryption Patterns to Follow

### contacts-directory.tsx (decryptMessage for summary tier)

```typescript
// contacts-directory.tsx lines 48-54
if (raw.encryptedSummary && raw.summaryEnvelopes?.length) {
  const plaintext = await decryptMessage(raw.encryptedSummary, raw.summaryEnvelopes)
  if (plaintext) {
    const summary = JSON.parse(plaintext) as DirectoryContactSummary
    displayName = summary.displayName || displayName
  }
}
```

### create-record-dialog.tsx (encryptMessage for field tier)

```typescript
// create-record-dialog.tsx lines 111-134
const readerPubkeys = [publicKey]
if (adminDecryptionPubkey && adminDecryptionPubkey !== publicKey) {
  readerPubkeys.push(adminDecryptionPubkey)
}

const nonEmptyFields = Object.entries(fieldValues).filter(
  ([, v]) => v !== '' && v !== undefined && v !== false,
)
if (nonEmptyFields.length > 0) {
  const fieldsPayload = JSON.stringify(Object.fromEntries(nonEmptyFields))
  encryptedFields = await encryptMessage(fieldsPayload, readerPubkeys)
}
```

## Type References

### CaseRecord (from api.ts)

```typescript
export interface CaseRecord {
  id: string
  hubId: string
  entityTypeId: string
  caseNumber?: string
  statusHash: string
  severityHash?: string
  assignedTo: string[]
  blindIndexes: Record<string, string | string[]>
  encryptedSummary: string
  summaryEnvelopes: import('@shared/types').RecipientEnvelope[]
  encryptedFields?: string
  fieldEnvelopes?: import('@shared/types').RecipientEnvelope[]
  encryptedPII?: string
  piiEnvelopes?: import('@shared/types').RecipientEnvelope[]
  contactCount: number
  createdAt: string
  updatedAt: string
}
```

### RecordSummary (from protocol/schemas/records.ts)

```typescript
export const recordSummarySchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  status: z.string(),
  severity: z.string().optional(),
  category: z.string().optional(),
})
```

### RecordFieldValues (from protocol/schemas/records.ts)

```typescript
export const recordFieldValuesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
)
```

### UpdateRecordBody (from api.ts)

```typescript
export interface UpdateRecordBody extends Partial<CreateRecordBody> {
  statusChangeTypeHash?: string
  statusChangeContent?: string
  statusChangeEnvelopes?: import('@shared/types').RecipientEnvelope[]
  closedAt?: string
}
```

Since `UpdateRecordBody extends Partial<CreateRecordBody>`, it already accepts `encryptedFields` and `fieldEnvelopes` -- no API changes needed.

## Security Considerations

- **Decrypted values in component state**: Field values live in React state while the detail tab is open. This is acceptable -- the webview process already has access to the decryption key (via CryptoState in Rust). Navigating away from the tab unmounts the component and clears state.
- **Reader pubkeys on save**: Must always include `[publicKey, adminDecryptionPubkey]` so both the author and admin(s) can decrypt. Omitting the admin key would create fields only the author can read.
- **`adminDecryptionPubkey` can be empty string**: In `useAuth()`, `adminDecryptionPubkey` initializes as `''` and is populated from the `/api/auth/me` response. If it's empty (e.g., hub not fully configured), records are encrypted only for the volunteer — admins cannot decrypt. The `if (adminDecryptionPubkey && ...)` guard handles this correctly but the implication is that records saved without an admin key are admin-unreadable. This matches the existing create-record-dialog behavior and is a pre-existing constraint, not new to this epic.
- **No PII tier in this epic**: `encryptedPII` and `piiEnvelopes` are not handled here. That tier is for contact PII linked to records and will be wired when contact linking is fully implemented.
- **Debounce prevents envelope churn**: Each save generates new ECIES envelopes (new ephemeral keys). The 800ms debounce ensures we don't generate hundreds of envelopes during fast typing.

## Testing

```bash
# Verify backend accepts the encrypted update body
bun run test:backend:bdd

# Run desktop BDD tests (includes new scenarios)
bun run test:desktop

# Manual verification
# 1. Create a record with title + custom fields
# 2. Navigate to Cases, verify title shows in case card
# 3. Click the record, verify Details tab shows field values
# 4. Edit a field, verify "Saved" indicator appears
# 5. Refresh page, verify field value persists
```

## Acceptance Criteria

- [ ] Case cards in the list show decrypted title (not just case number/UUID)
- [ ] Record detail header shows decrypted title and description
- [ ] Details tab renders custom field values from decrypted `encryptedFields`
- [ ] Editing a field encrypts the new values and PATCHes via updateRecord API
- [ ] Save indicator shows saving/saved/error states
- [ ] Fields persist across page navigation (encrypt -> save -> reload -> decrypt)
- [ ] Decryption failure shows graceful fallback (case number, empty fields)
- [ ] BDD scenario "Case card shows decrypted title" passes
- [ ] BDD scenario "Case detail shows decrypted custom field values" passes
- [ ] BDD scenario "Editing case fields encrypts and saves" passes
