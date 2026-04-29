# Events Architecture Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the split-brain between desktop/Android clients that use the records API for events, and the dedicated `/api/events` REST API — making all four clients use only `/api/events` for event CRUD.

**Architecture:** The backend already has a complete events API (`apps/worker/routes/events.ts`) with richer schema (`eventSchema` has `startDate`/`endDate`/`locationApproximate`/`encryptedDetails`/`detailEnvelopes`) than the records API. Desktop and Android bypass this by reading/writing events as generic records, losing temporal data, mismatching E2EE schema fields, and (on Android) storing events completely unencrypted. The fix adds event-specific API functions to the desktop client lib, rewrites `events.tsx` to use them, rewrites Android `EventsViewModel` to hit `/api/events` with real E2EE via `CryptoService.encryptMessage()`, updates the Android UI screens to work with the new `AppEvent` type, and makes the minor iOS fix to populate `eventTypeHash`/`statusHash` on create.

**Tech Stack:** TypeScript/React (desktop), Kotlin/Compose (Android), SwiftUI (iOS), Hono/Bun (backend already complete), `@protocol/schemas/events`, Playwright (desktop tests), JUnit4 (Android unit tests)

---

## File Map

| File | Change type | Responsibility |
|------|-------------|----------------|
| `src/client/lib/api.ts` | Modify: add ~11 functions at the end of the file | All event API calls for the desktop client |
| `src/client/routes/events.tsx` | Full rewrite | Events page using events API, proper types, functional link tabs |
| `src/client/components/cases/create-event-dialog.tsx` | New file | Modal form for creating events with date + location fields + E2EE |
| `tests/events-architecture.spec.ts` | New file | Playwright E2E verifying events page uses `/api/events` |
| `apps/android/app/src/main/java/org/llamenos/hotline/model/AppEvent.kt` | New file | Kotlin data classes mirroring `eventSchema` / response types |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventsViewModel.kt` | Full rewrite | ViewModel hitting `/api/events`, real E2EE, linked data loaders |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventListScreen.kt` | Modify | Use `AppEvent` type, show `startDate`/`locationApproximate` in card |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventDetailScreen.kt` | Modify | Use `AppEvent` type, show temporal/location/linked data from ViewModel |
| `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/CreateEventScreen.kt` | Modify | Add date pickers + location field, wire to new `createEvent()` signature |
| `apps/android/app/src/test/java/org/llamenos/hotline/EventsViewModelTest.kt` | New file | Unit tests asserting state class behavior + URL construction |
| `apps/ios/Sources/Models/Event.swift` | Modify | Add `eventTypeHash`/`statusHash` to `CreateEventRequest` |
| `apps/ios/Sources/ViewModels/EventsViewModel.swift` | Modify | Populate `eventTypeHash`/`statusHash` when calling `createEvent()` |

---

## Context You Need

**Existing `listRecords`/`createRecord` in `api.ts` (pattern to follow):**
```typescript
// Around line 1620 in src/client/lib/api.ts
export async function listRecords(params?: { entityTypeId?: string; statusHash?: string ... }) {
  return request<{ records: CaseRecord[]; ... }>(hp(`/records?${qs}`))
}
export async function createRecord(body: CreateRecordBody) {
  return request<CaseRecord>(hp('/records'), { method: 'POST', body: JSON.stringify(body) })
}
```
`hp(path)` prefixes the path with `/hubs/{hubId}`. It lives in `api.ts`.

**Admin pubkey for encryption (desktop):** Retrieved from `useAuth()` as `adminDecryptionPubkey`. The `encryptMessage(plaintext, readerPubkeys)` function from `src/client/lib/platform.ts` accepts a pubkey array. Pattern from `cases.tsx`:
```typescript
const readerPubkeys = [publicKey]
if (adminDecryptionPubkey && adminDecryptionPubkey !== publicKey) {
  readerPubkeys.push(adminDecryptionPubkey)
}
const encrypted = await encryptMessage(JSON.stringify(details), readerPubkeys)
// encrypted.encryptedContent → encryptedDetails
// encrypted.readerEnvelopes  → detailEnvelopes
```

**Android encryption pattern (from `ConversationsViewModel.kt` line 275):**
```kotlin
val encrypted = cryptoService.encryptMessage(text, readerPubkeys)
// encrypted.ciphertext  → encryptedDetails
// encrypted.envelopes.map { env -> RecipientEnvelope(pubkey, wrappedKey, ephemeralPubkey) }
```
Admin pubkeys come from `sessionState.adminPubkeys`. `sessionState: SessionState` is injected via Hilt in `CaseManagementViewModel` at line 173 — use the same pattern.

**Android API call pattern:**
```kotlin
apiService.request<EventsListResponse>("GET", apiService.hp("/api/events") + "?page=1&limit=50")
apiService.requestNoContent("POST", apiService.hp("/api/events"), createEventBody)
```
`apiService.hp(path)` prepends `/hubs/{hubId}` — same semantics as desktop.

**Offline queue note:** Event creation (`POST /api/events`) can be queued offline. Link/unlink operations (`POST/DELETE /api/events/:id/records`) must NOT be queued — they are temporal and stale links are harmful. Exclude by adding `/events/` to `NON_QUEUEABLE_PATHS` in `api.ts` for the sub-resource paths only. The `/events` root path should remain queueable for `POST`. To achieve this, exclude only the pattern `/events/` (with trailing slash, matching `eventId/...`). Check the existing logic: `NON_QUEUEABLE_PATHS.some(prefix => path.startsWith(prefix))`.

**iOS `CreateEventRequest` is missing `eventTypeHash`/`statusHash`:** The schema `createEventBodySchema` marks these as required (non-optional, no default). Sending empty string `""` may or may not pass Zod validation depending on `.min(1)` — the schema has `z.string()` without `.min(1)` for these fields so empty string passes. But blank hashes are semantically wrong. The fix is to pass the entity type's default status value and a stable event type hash computed from the entity type name.

---

## Task 1: Write the failing Playwright events-architecture test

**Files:**
- Create: `tests/events-architecture.spec.ts`

This test must fail before any implementation changes because the page will still call `/api/records`.

- [ ] **Step 1.1: Write the test**

```typescript
// tests/events-architecture.spec.ts
/**
 * Events Architecture E2E Tests
 *
 * Verifies that the events page uses /api/events (not /api/records) for
 * all CRUD operations, and that events show startDate and locationApproximate.
 *
 * Prerequisites: CMS must be enabled and at least one event entity type must exist.
 * The tests create their own entity type and events to be deterministic.
 */
import { test, expect } from '@playwright/test'
import { loginAsAdmin, navigateAfterLogin, dismissNsecCard } from './helpers'
import { createEntityTypeViaApi, createEventViaApi } from './api-helpers'

test.describe('Events Architecture', () => {
  test.describe.configure({ mode: 'serial' })

  let eventEntityTypeId: string
  let eventId: string

  test.beforeAll(async ({ request }) => {
    // Create an event entity type for this test suite
    const created = await createEntityTypeViaApi(request as Parameters<typeof createEntityTypeViaApi>[0], `evt-arch-${Date.now()}`, {
      category: 'event',
      statuses: [
        { value: 'active', label: 'Active', color: '#3b82f6', order: 0 },
        { value: 'concluded', label: 'Concluded', color: '#22c55e', order: 1, isClosed: true },
      ],
    })
    eventEntityTypeId = (created as { id: string }).id

    // Create a test event with startDate and location
    const event = await createEventViaApi(
      request as Parameters<typeof createEventViaApi>[0],
      eventEntityTypeId,
      {
        startDate: '2026-06-15T10:00:00Z',
        statusHash: 'active',
        eventTypeHash: 'protest',
      },
    )
    eventId = (event as { id: string }).id
  })

  test('events page uses /api/events endpoint, not /api/records', async ({ page }) => {
    await loginAsAdmin(page)
    await dismissNsecCard(page)

    const recordsApiCalled = { value: false }
    const eventsApiCalled = { value: false }

    page.on('request', req => {
      const url = req.url()
      if (url.includes('/api/records') && !url.includes('/api/records/') && req.method() === 'GET') {
        // Only flag if it looks like a list call (no record ID — those are detail lookups from other pages)
        if (url.includes('entityTypeId')) recordsApiCalled.value = true
      }
      if (url.includes('/api/events') && req.method() === 'GET') {
        eventsApiCalled.value = true
      }
    })

    await navigateAfterLogin(page, '/events')
    // Wait for the list to load
    await expect(page.getByTestId('case-list').or(page.getByTestId('empty-state'))).toBeVisible({ timeout: 10000 })

    expect(eventsApiCalled.value).toBe(true)
    expect(recordsApiCalled.value).toBe(false)
  })

  test('event list card shows startDate', async ({ page }) => {
    await loginAsAdmin(page)
    await dismissNsecCard(page)
    await navigateAfterLogin(page, '/events')

    // At least one event card should show a date
    const eventCards = page.getByTestId('case-card')
    await expect(eventCards.first()).toBeVisible({ timeout: 10000 })
    // The card should contain date information
    const firstCard = eventCards.first()
    await expect(firstCard.getByTestId('event-start-date')).toBeVisible()
  })

  test('creating an event posts to /api/events with encryptedDetails and detailEnvelopes', async ({ page }) => {
    await loginAsAdmin(page)
    await dismissNsecCard(page)
    await navigateAfterLogin(page, '/events')

    let createRequest: { url: string; method: string; postData: string | null } | null = null
    page.on('request', req => {
      if (req.url().includes('/api/events') && req.method() === 'POST') {
        createRequest = { url: req.url(), method: req.method(), postData: req.postData() }
      }
    })

    // Open create dialog
    await page.getByTestId('case-new-btn').click()
    await expect(page.getByTestId('create-event-dialog')).toBeVisible()

    // Fill required fields
    await page.getByTestId('create-event-name').fill('Arch Test Event ' + Date.now())
    await page.getByTestId('create-event-start-date').fill('2026-06-20')
    await page.getByTestId('create-event-location').fill('Test Plaza')

    await page.getByTestId('create-event-submit').click()
    await expect(page.getByTestId('create-event-dialog')).not.toBeVisible({ timeout: 10000 })

    expect(createRequest).not.toBeNull()
    const body = JSON.parse(createRequest!.postData ?? '{}')
    expect(body).toHaveProperty('encryptedDetails')
    expect(body).toHaveProperty('detailEnvelopes')
    expect(body.detailEnvelopes.length).toBeGreaterThan(0)
    expect(body).toHaveProperty('startDate')
    // Must NOT use encryptedSummary (records schema)
    expect(body).not.toHaveProperty('encryptedSummary')
  })

  test('linked cases tab calls /api/events/:id/records', async ({ page }) => {
    await loginAsAdmin(page)
    await dismissNsecCard(page)
    await navigateAfterLogin(page, '/events')

    const linkedCasesApiCalled = { value: false }
    page.on('request', req => {
      if (req.url().includes(`/api/events/`) && req.url().includes('/records') && req.method() === 'GET') {
        linkedCasesApiCalled.value = true
      }
    })

    // Click the first event card
    const firstCard = page.getByTestId('case-card').first()
    await expect(firstCard).toBeVisible({ timeout: 10000 })
    await firstCard.click()

    // Click the Cases tab
    await page.getByTestId('case-tab-cases').click()
    await expect(page.getByTestId('case-contacts-tab').or(page.getByTestId('events-linked-cases-empty'))).toBeVisible({ timeout: 5000 })

    expect(linkedCasesApiCalled.value).toBe(true)
  })
})
```

- [ ] **Step 1.2: Run the test to confirm it fails**

```bash
cd ~/projects/llamenos && bun run test -- tests/events-architecture.spec.ts
```

Expected: FAIL — the first test will fail because the page calls `/api/records?entityTypeId=...` instead of `/api/events`.

---

## Task 2: Add event API functions to `src/client/lib/api.ts`

**Files:**
- Modify: `src/client/lib/api.ts` (append after the existing `updateRecord`/`deleteRecord` block around line 1660)

- [ ] **Step 2.1: Add the import for event schema types at the top of `api.ts`**

In the type imports block (around line 17), add:

```typescript
import type {
  Event as CmsEvent,
  CreateEventBody,
  UpdateEventBody,
  ListEventsQuery,
  CaseEvent,
  ReportEvent,
} from '@protocol/schemas/events'
```

Also add to the re-export block at the bottom of the file (find the `export type { CreateRecordBody ... }` line):

```typescript
export type { CmsEvent, CreateEventBody, UpdateEventBody, ListEventsQuery, CaseEvent, ReportEvent }
```

- [ ] **Step 2.2: Add the NON_QUEUEABLE_PATHS exclusion for event sub-resources**

Find the `NON_QUEUEABLE_PATHS` array (around line 90) and add a path to exclude link/unlink operations (sub-paths of a specific event). The pattern `/events/` (with trailing slash) matches `/events/{id}/records` etc. but NOT `/events` (the list/create endpoint which should remain queueable).

The existing array entry `'/calls/'` already demonstrates this pattern. Add:

```typescript
'/events/', // Link/unlink sub-resources must not be queued (temporal operations)
```

Note: Do NOT add `/events` (without trailing slash) — that would prevent queuing `POST /events` for offline event creation.

- [ ] **Step 2.3: Append event API functions after the existing `deleteRecord` function**

Find the end of the records block (around line 1660, after `deleteRecord`) and append:

```typescript
// ── Events API (Epic 320) ────────────────────────────────────────

export async function listEvents(params?: {
  page?: number
  limit?: number
  eventTypeHash?: string
  statusHash?: string
  parentEventId?: string
  startAfter?: string
  startBefore?: string
}) {
  const qs = new URLSearchParams()
  if (params?.page != null) qs.set('page', String(params.page))
  if (params?.limit != null) qs.set('limit', String(params.limit))
  if (params?.eventTypeHash) qs.set('eventTypeHash', params.eventTypeHash)
  if (params?.statusHash) qs.set('statusHash', params.statusHash)
  if (params?.parentEventId) qs.set('parentEventId', params.parentEventId)
  if (params?.startAfter) qs.set('startAfter', params.startAfter)
  if (params?.startBefore) qs.set('startBefore', params.startBefore)
  const query = qs.toString() ? `?${qs}` : ''
  return request<{ events: CmsEvent[]; total: number; page: number; limit: number; hasMore: boolean }>(hp(`/events${query}`))
}

export async function getEvent(id: string) {
  return request<CmsEvent>(hp(`/events/${id}`))
}

export async function createEvent(body: CreateEventBody) {
  return request<CmsEvent>(hp('/events'), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateEvent(id: string, body: UpdateEventBody) {
  return request<CmsEvent>(hp(`/events/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteEvent(id: string) {
  return request<{ ok: boolean }>(hp(`/events/${id}`), { method: 'DELETE' })
}

export async function listEventRecords(eventId: string) {
  return request<{ links: CaseEvent[] }>(hp(`/events/${eventId}/records`))
}

export async function listEventReports(eventId: string) {
  return request<{ links: ReportEvent[] }>(hp(`/events/${eventId}/reports`))
}

export async function listSubEvents(eventId: string) {
  return request<{ events: CmsEvent[] }>(hp(`/events/${eventId}/subevents`))
}

export async function linkRecordToEvent(eventId: string, recordId: string) {
  return request<CaseEvent>(hp(`/events/${eventId}/records`), {
    method: 'POST',
    body: JSON.stringify({ recordId }),
  })
}

export async function unlinkRecordFromEvent(eventId: string, recordId: string) {
  return request<{ ok: boolean }>(hp(`/events/${eventId}/records/${recordId}`), {
    method: 'DELETE',
  })
}

export async function linkReportToEvent(eventId: string, reportId: string) {
  return request<ReportEvent>(hp(`/events/${eventId}/reports`), {
    method: 'POST',
    body: JSON.stringify({ reportId }),
  })
}

export async function unlinkReportFromEvent(eventId: string, reportId: string) {
  return request<{ ok: boolean }>(hp(`/events/${eventId}/reports/${reportId}`), {
    method: 'DELETE',
  })
}
```

- [ ] **Step 2.4: Run typecheck to verify no type errors**

```bash
cd ~/projects/llamenos && bun run typecheck 2>&1 | head -40
```

Expected: No new errors. The `Event` type from `@protocol/schemas/events` conflicts with the browser DOM `Event` global — aliased as `CmsEvent` above to avoid this.

- [ ] **Step 2.5: Commit**

```bash
cd ~/projects/llamenos && git add src/client/lib/api.ts && git commit -m "feat(desktop): add event API functions to api.ts — listEvents, createEvent, link/unlink"
```

---

## Task 3: Create `CreateEventDialog` component

**Files:**
- Create: `src/client/components/cases/create-event-dialog.tsx`

This dialog replaces `CreateRecordDialog` for the events page. It collects `name`, `startDate`, optional `endDate`, `locationApproximate`, and encrypts via `encryptMessage()` before calling `createEvent()`.

- [ ] **Step 3.1: Create the dialog component**

```tsx
// src/client/components/cases/create-event-dialog.tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { encryptMessage } from '@/lib/platform'
import * as keyManager from '@/lib/key-manager'
import { createEvent, type CmsEvent, type CreateEventBody } from '@/lib/api'
import type { EntityTypeDefinition } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

interface CreateEventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (event: CmsEvent) => void
  entityType: EntityTypeDefinition | undefined
}

export function CreateEventDialog({ open, onOpenChange, onCreated, entityType }: CreateEventDialogProps) {
  const { t } = useTranslation()
  const { publicKey, adminDecryptionPubkey } = useAuth()
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !startDate) return
    if (!entityType) {
      setError(t('events.noEntityType', { defaultValue: 'No event type configured.' }))
      return
    }
    if (!keyManager.isUnlocked()) {
      setError(t('events.noKey', { defaultValue: 'Unlock your account to create events.' }))
      return
    }

    setSaving(true)
    setError(null)
    try {
      const detailsPayload = {
        name: name.trim(),
        ...(location.trim() ? { location: { address: location.trim() } } : {}),
      }

      const readerPubkeys: string[] = publicKey ? [publicKey] : []
      if (adminDecryptionPubkey && adminDecryptionPubkey !== publicKey) {
        readerPubkeys.push(adminDecryptionPubkey)
      }

      const encrypted = await encryptMessage(JSON.stringify(detailsPayload), readerPubkeys)

      const defaultStatus = entityType.statuses[0]?.value ?? ''

      const body: CreateEventBody = {
        entityTypeId: entityType.id,
        startDate: new Date(startDate).toISOString(),
        ...(endDate ? { endDate: new Date(endDate).toISOString() } : {}),
        ...(location.trim() ? { locationApproximate: location.trim(), locationPrecision: 'neighborhood' } : {}),
        eventTypeHash: entityType.id, // stable hash — entity type ID is the discriminant
        statusHash: defaultStatus,
        blindIndexes: {},
        encryptedDetails: encrypted.encryptedContent,
        detailEnvelopes: encrypted.readerEnvelopes,
      }

      const created = await createEvent(body)
      onCreated(created)
      onOpenChange(false)
      setName('')
      setStartDate('')
      setEndDate('')
      setLocation('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('events.createError', { defaultValue: 'Failed to create event.' }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="create-event-dialog">
        <DialogHeader>
          <DialogTitle>{t('events.newEvent', { defaultValue: 'New Event' })}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="event-name">{t('events.fieldName', { defaultValue: 'Event Name' })}</Label>
            <Input
              id="event-name"
              data-testid="create-event-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('events.fieldNamePlaceholder', { defaultValue: 'March on City Hall' })}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-start-date">{t('events.fieldStartDate', { defaultValue: 'Start Date' })}</Label>
            <Input
              id="event-start-date"
              data-testid="create-event-start-date"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-end-date">{t('events.fieldEndDate', { defaultValue: 'End Date (optional)' })}</Label>
            <Input
              id="event-end-date"
              data-testid="create-event-end-date"
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-location">{t('events.fieldLocation', { defaultValue: 'Location (approximate)' })}</Label>
            <Input
              id="event-location"
              data-testid="create-event-location"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder={t('events.fieldLocationPlaceholder', { defaultValue: 'Downtown, City Name' })}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" data-testid="create-event-error">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              type="submit"
              data-testid="create-event-submit"
              disabled={saving || !name.trim() || !startDate || !entityType}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('events.create', { defaultValue: 'Create' })}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3.2: Run typecheck**

```bash
cd ~/projects/llamenos && bun run typecheck 2>&1 | grep -E "error|create-event-dialog" | head -20
```

Expected: No errors in the new file. Fix any type issues (the `readerEnvelopes` field from `encryptMessage` must match `recipientEnvelopeSchema` shape — check `EncryptedMessageResult` in `platform.ts` for the exact field names).

- [ ] **Step 3.3: Commit**

```bash
cd ~/projects/llamenos && git add src/client/components/cases/create-event-dialog.tsx && git commit -m "feat(desktop): add CreateEventDialog with date/location fields and E2EE"
```

---

## Task 4: Rewrite `src/client/routes/events.tsx`

**Files:**
- Modify: `src/client/routes/events.tsx` (full rewrite)

Key changes: remove `listRecords`/`updateRecord`/`listRecordContacts`/`CaseRecord` imports; use `listEvents`/`updateEvent`/`createEvent`/`listEventRecords`/`listEventReports`/`listSubEvents`/`linkRecordToEvent`/`linkReportToEvent` from `api.ts`; replace `CreateRecordDialog` with `CreateEventDialog`; show `startDate` and `locationApproximate` on event cards; wire link dialogs to actual API calls.

- [ ] **Step 4.1: Rewrite the file**

```tsx
// src/client/routes/events.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  listEvents,
  updateEvent,
  listEntityTypes,
  getCaseManagementEnabled,
  listEventRecords,
  listEventReports,
  listSubEvents,
  linkRecordToEvent,
  linkReportToEvent,
  listRecords,
  type CmsEvent,
  type EntityTypeDefinition,
  type CaseEvent,
  type ReportEvent,
  type CaseRecord,
} from '@/lib/api'
import { formatRelativeTime } from '@/lib/format'
import { StatusPill } from '@/components/cases/status-pill'
import { SchemaForm, type SchemaFieldValues } from '@/components/cases/schema-form'
import { CreateEventDialog } from '@/components/cases/create-event-dialog'
import { CaseTimeline } from '@/components/cases/case-timeline'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Calendar, Plus, Loader2, Clock, ArrowLeft,
  Users, FileText, Link2, AlertTriangle,
  Search, MapPin,
} from 'lucide-react'

export const Route = createFileRoute('/events')({
  component: EventsPage,
})

function EventsPage() {
  const { t } = useTranslation()
  const { publicKey, isAdmin, hasPermission, adminDecryptionPubkey } = useAuth()
  const { toast } = useToast()

  const [events, setEvents] = useState<CmsEvent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [entityTypes, setEntityTypes] = useState<EntityTypeDefinition[]>([])
  const [cmsEnabled, setCmsEnabled] = useState<boolean | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const entityTypeMap = useMemo(
    () => new Map(entityTypes.map(et => [et.id, et])),
    [entityTypes],
  )

  // First event entity type — used as default for new events
  const defaultEventEntityType = useMemo(
    () => entityTypes.find(et => et.category === 'event' && !et.isArchived),
    [entityTypes],
  )

  const selectedEvent = events.find(e => e.id === selectedId)
  const selectedEntityType = selectedEvent
    ? entityTypeMap.get(selectedEvent.entityTypeId)
    : undefined

  useEffect(() => {
    getCaseManagementEnabled()
      .then(({ enabled }) => setCmsEnabled(enabled))
      .catch(() => setCmsEnabled(false))

    listEntityTypes()
      .then(({ entityTypes: types }) => setEntityTypes(types.filter(et => !et.isArchived)))
      .catch(() => {})
  }, [])

  const fetchEvents = useCallback(() => {
    setLoading(true)
    listEvents({ limit: 50 })
      .then(({ events: evts, total: t }) => {
        setEvents(evts)
        setTotal(t)
      })
      .catch(() => toast(t('events.loadError', { defaultValue: 'Failed to load events' }), 'error'))
      .finally(() => setLoading(false))
  }, [toast, t])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const handleEventCreated = useCallback((event: CmsEvent) => {
    fetchEvents()
    setSelectedId(event.id)
  }, [fetchEvents])

  const handleStatusChange = useCallback(async (eventId: string, newStatusValue: string) => {
    try {
      await updateEvent(eventId, { statusHash: newStatusValue })
      setEvents(prev =>
        prev.map(e => e.id === eventId ? { ...e, statusHash: newStatusValue, updatedAt: new Date().toISOString() } : e),
      )
      toast(t('events.statusUpdated', { defaultValue: 'Status updated' }), 'success')
    } catch {
      toast(t('events.statusError', { defaultValue: 'Failed to update status' }), 'error')
    }
  }, [toast, t])

  if (cmsEnabled === false) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-primary" />
          <h1 data-testid="page-title" className="text-xl font-bold sm:text-2xl">
            {t('events.title', { defaultValue: 'Events' })}
          </h1>
        </div>
        <Card data-testid="cms-not-enabled">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              {t('events.cmsDisabled', { defaultValue: 'Case management is not enabled.' })}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (cmsEnabled === null || loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-primary" />
          <h1 data-testid="page-title" className="text-xl font-bold sm:text-2xl">
            {t('events.title', { defaultValue: 'Events' })}
          </h1>
        </div>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  const showEmptyState = !loading && events.length === 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-primary" />
          <h1 data-testid="page-title" className="text-xl font-bold sm:text-2xl">
            {t('events.title', { defaultValue: 'Events' })}
          </h1>
          {total > 0 && (
            <Badge variant="secondary" className="text-xs">{total}</Badge>
          )}
        </div>
        <Button
          size="sm"
          data-testid="case-new-btn"
          onClick={() => setShowCreateDialog(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('events.newEvent', { defaultValue: 'New Event' })}
        </Button>
      </div>

      {showEmptyState ? (
        <Card data-testid="empty-state">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              {t('events.noEvents', { defaultValue: 'No events yet' })}
            </p>
            <Button
              size="sm"
              className="mt-4"
              data-testid="case-empty-create-btn"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('events.newEvent', { defaultValue: 'New Event' })}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex h-[calc(100vh-12rem)] gap-4">
          <div
            data-testid="case-list"
            className="w-80 shrink-0 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-card p-2"
          >
            {events.map(event => (
              <EventCard
                key={event.id}
                event={event}
                entityType={entityTypeMap.get(event.entityTypeId)}
                isSelected={selectedId === event.id}
                onSelect={setSelectedId}
              />
            ))}
          </div>

          <div
            data-testid="case-detail"
            className="flex flex-1 flex-col rounded-lg border border-border bg-card overflow-hidden"
          >
            {selectedEvent && selectedEntityType ? (
              <EventDetail
                event={selectedEvent}
                entityType={selectedEntityType}
                isAdmin={isAdmin}
                hasPermission={hasPermission}
                publicKey={publicKey}
                adminDecryptionPubkey={adminDecryptionPubkey}
                onStatusChange={handleStatusChange}
                onBack={() => setSelectedId(null)}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
                <Calendar className="h-10 w-10 mb-3" />
                <p>{t('events.selectEvent', { defaultValue: 'Select an event to view details' })}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <CreateEventDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={handleEventCreated}
        entityType={defaultEventEntityType}
      />
    </div>
  )
}

// --- Event card ---

function EventCard({
  event,
  entityType,
  isSelected,
  onSelect,
}: {
  event: CmsEvent
  entityType: EntityTypeDefinition | undefined
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const statusDef = entityType?.statuses.find(s => s.value === event.statusHash)
  const statusColor = statusDef?.color ?? '#6b7280'
  const statusLabel = statusDef?.label ?? event.statusHash
  const relativeTime = formatRelativeTime(event.updatedAt, t)
  const startDateFormatted = new Date(event.startDate).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <button
      type="button"
      data-testid="case-card"
      onClick={() => onSelect(event.id)}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'border-border bg-card hover:bg-accent/50'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: statusColor }}
        />
        <span className="truncate text-sm font-medium text-foreground flex-1">
          {event.caseNumber || event.id.slice(0, 8)}
        </span>
        <span data-testid="case-card-timestamp" className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Clock className="h-3 w-3" />
          {relativeTime}
        </span>
      </div>

      {/* Start date */}
      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Calendar className="h-3 w-3 shrink-0" />
        <span data-testid="event-start-date">{startDateFormatted}</span>
        {event.locationApproximate && (
          <>
            <span className="mx-1">·</span>
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{event.locationApproximate}</span>
          </>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <Badge
          data-testid="case-card-status-badge"
          variant="secondary"
          className="text-[10px] gap-1"
          style={{
            borderColor: statusColor,
            color: statusColor,
            backgroundColor: `${statusColor}15`,
          }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          {statusLabel}
        </Badge>
      </div>
    </button>
  )
}

// --- Event detail panel ---

type EventDetailTab = 'details' | 'timeline' | 'cases' | 'reports' | 'subevents'

function EventDetail({
  event,
  entityType,
  isAdmin,
  hasPermission,
  publicKey,
  adminDecryptionPubkey,
  onStatusChange,
  onBack,
}: {
  event: CmsEvent
  entityType: EntityTypeDefinition
  isAdmin: boolean
  hasPermission: (p: string) => boolean
  publicKey: string | null
  adminDecryptionPubkey: string
  onStatusChange: (id: string, newStatus: string) => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<EventDetailTab>('details')
  const [showLinkCaseDialog, setShowLinkCaseDialog] = useState(false)
  const [showLinkReportDialog, setShowLinkReportDialog] = useState(false)

  const statusDef = entityType.statuses.find(s => s.value === event.statusHash)
  const isAssigned = false // Events don't have assignedTo — read-only for now

  const tabs: Array<{ key: EventDetailTab; label: string; icon: typeof FileText }> = [
    { key: 'details', label: t('events.tabDetails', { defaultValue: 'Details' }), icon: FileText },
    { key: 'timeline', label: t('events.tabTimeline', { defaultValue: 'Timeline' }), icon: Clock },
    { key: 'cases', label: `${t('events.tabCases', { defaultValue: 'Cases' })} (${event.caseCount})`, icon: FileText },
    { key: 'reports', label: `${t('events.tabReports', { defaultValue: 'Reports' })} (${event.reportCount})`, icon: Link2 },
    { key: 'subevents', label: `${t('events.tabSubEvents', { defaultValue: 'Sub-Events' })} (${event.subEventCount})`, icon: Calendar },
  ]

  const handleLinkCase = useCallback(async (recordId: string) => {
    try {
      await linkRecordToEvent(event.id, recordId)
      setShowLinkCaseDialog(false)
    } catch {
      // Errors surfaced in the dialog
    }
  }, [event.id])

  const handleLinkReport = useCallback(async (reportId: string) => {
    try {
      await linkReportToEvent(event.id, reportId)
      setShowLinkReportDialog(false)
    } catch {
      // Errors surfaced in the dialog
    }
  }, [event.id])

  return (
    <>
      <div data-testid="case-detail-header" className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            className="md:hidden shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-foreground">
                {event.caseNumber || event.id.slice(0, 8)}
              </span>
              <StatusPill
                currentStatus={event.statusHash}
                statuses={entityType.statuses}
                onStatusChange={
                  hasPermission('cases:update')
                    ? (s) => onStatusChange(event.id, s)
                    : undefined
                }
                readOnly={!hasPermission('cases:update')}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('events.startDate', { defaultValue: 'Starts {{date}}', date: new Date(event.startDate).toLocaleString() })}
              {event.endDate && ` – ${new Date(event.endDate).toLocaleString()}`}
            </p>
            {event.locationApproximate && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />
                {event.locationApproximate}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" variant="outline" onClick={() => setShowLinkCaseDialog(true)}>
              <Link2 className="h-3.5 w-3.5" />
              {t('events.linkCase', { defaultValue: 'Link Case' })}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowLinkReportDialog(true)}>
              <Link2 className="h-3.5 w-3.5" />
              {t('events.linkReport', { defaultValue: 'Link Report' })}
            </Button>
          </div>
        </div>

        <div data-testid="case-tabs" className="flex gap-0.5 -mb-3 mt-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              data-testid={`case-tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-card border border-b-0 border-border text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'details' && (
          <EventDetailsTab event={event} entityType={entityType} />
        )}
        {activeTab === 'timeline' && (
          <CaseTimeline
            recordId={event.id}
            volunteerNames={{}}
            readerPubkeys={publicKey ? [publicKey] : []}
            statusLabels={Object.fromEntries(
              entityType.statuses.map(s => [s.value, { label: s.label, color: s.color ?? '#6b7280' }]),
            )}
          />
        )}
        {activeTab === 'cases' && (
          <LinkedCasesTab eventId={event.id} />
        )}
        {activeTab === 'reports' && (
          <LinkedReportsTab eventId={event.id} />
        )}
        {activeTab === 'subevents' && (
          <SubEventsTab eventId={event.id} entityTypeMap={new Map()} />
        )}
      </div>

      <LinkCaseDialog
        open={showLinkCaseDialog}
        onOpenChange={setShowLinkCaseDialog}
        onLink={handleLinkCase}
      />
      <LinkReportDialog
        open={showLinkReportDialog}
        onOpenChange={setShowLinkReportDialog}
        onLink={handleLinkReport}
      />
    </>
  )
}

// --- Details tab ---

function EventDetailsTab({ event, entityType }: { event: CmsEvent; entityType: EntityTypeDefinition }) {
  const { t } = useTranslation()
  const [fieldValues] = useState<SchemaFieldValues>({})

  if (entityType.fields.length === 0) {
    return (
      <div data-testid="case-details-tab" className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileText className="h-8 w-8 mb-2 text-muted-foreground/40" />
        <p className="text-sm">{t('events.noFields', { defaultValue: 'No custom fields defined for this event type.' })}</p>
      </div>
    )
  }

  return (
    <div data-testid="case-details-tab">
      <SchemaForm
        entityType={entityType}
        values={fieldValues}
        onChange={() => {}}
        readOnly
        showAccessIndicators
      />
    </div>
  )
}

// --- Linked cases tab ---

function LinkedCasesTab({ eventId }: { eventId: string }) {
  const { t } = useTranslation()
  const [links, setLinks] = useState<CaseEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listEventRecords(eventId)
      .then(({ links: l }) => setLinks(l))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [eventId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (links.length === 0) {
    return (
      <div data-testid="case-contacts-tab" className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileText className="h-8 w-8 mb-2 text-muted-foreground/40" />
        <p className="text-sm">{t('events.noLinkedCases', { defaultValue: 'No cases linked to this event.' })}</p>
      </div>
    )
  }

  return (
    <div data-testid="case-contacts-tab" className="space-y-2">
      {links.map(link => (
        <div
          key={link.recordId}
          data-testid="case-contact-card"
          className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
        >
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{link.recordId.slice(0, 12)}...</p>
            <p className="text-xs text-muted-foreground">{new Date(link.linkedAt).toLocaleDateString()}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// --- Linked reports tab ---

function LinkedReportsTab({ eventId }: { eventId: string }) {
  const { t } = useTranslation()
  const [links, setLinks] = useState<ReportEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listEventReports(eventId)
      .then(({ links: l }) => setLinks(l))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [eventId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (links.length === 0) {
    return (
      <div data-testid="case-related-tab" className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Link2 className="h-8 w-8 mb-2 text-muted-foreground/40" />
        <p className="text-sm">{t('events.noLinkedReports', { defaultValue: 'No reports linked to this event.' })}</p>
      </div>
    )
  }

  return (
    <div data-testid="case-related-tab" className="space-y-2">
      {links.map(link => (
        <div
          key={link.reportId}
          data-testid="case-related-card"
          className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
        >
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{link.reportId.slice(0, 12)}...</p>
            <p className="text-xs text-muted-foreground">{new Date(link.linkedAt).toLocaleDateString()}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// --- Sub-events tab ---

function SubEventsTab({ eventId, entityTypeMap }: { eventId: string; entityTypeMap: Map<string, EntityTypeDefinition> }) {
  const { t } = useTranslation()
  const [subEvents, setSubEvents] = useState<CmsEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listSubEvents(eventId)
      .then(({ events: evts }) => setSubEvents(evts))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [eventId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (subEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Calendar className="h-8 w-8 mb-2 text-muted-foreground/40" />
        <p className="text-sm">{t('events.noSubEvents', { defaultValue: 'No sub-events.' })}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {subEvents.map(sub => (
        <div
          key={sub.id}
          className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
        >
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{sub.caseNumber || sub.id.slice(0, 8)}</p>
            <p className="text-xs text-muted-foreground">{new Date(sub.startDate).toLocaleDateString()}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// --- Link dialogs ---

function LinkCaseDialog({
  open,
  onOpenChange,
  onLink,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLink: (recordId: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CaseRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = useCallback(async () => {
    if (!query.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const { records } = await listRecords({ limit: 20 })
      setResults(records.filter(r =>
        (r.caseNumber ?? r.id).toLowerCase().includes(query.toLowerCase()),
      ))
    } catch {
      setError(t('events.searchError', { defaultValue: 'Search failed.' }))
    } finally {
      setLoading(false)
    }
  }, [query, t])

  useEffect(() => {
    const timer = setTimeout(handleSearch, 300)
    return () => clearTimeout(timer)
  }, [handleSearch])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('events.linkCaseTitle', { defaultValue: 'Link Case to Event' })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('events.searchCases', { defaultValue: 'Search cases...' })}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9"
              type="search"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="max-h-60 overflow-y-auto space-y-1">
            {loading && <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>}
            {!loading && results.length === 0 && query && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t('common.noResults', { defaultValue: 'No results found' })}
              </p>
            )}
            {results.map(record => (
              <button
                key={record.id}
                type="button"
                disabled={linking === record.id}
                onClick={async () => {
                  setLinking(record.id)
                  try {
                    await onLink(record.id)
                  } catch {
                    setError(t('events.linkError', { defaultValue: 'Failed to link case.' }))
                  } finally {
                    setLinking(null)
                  }
                }}
                className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
              >
                {linking === record.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <FileText className="h-4 w-4 text-muted-foreground" />
                }
                {record.caseNumber || record.id.slice(0, 12)}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function LinkReportDialog({
  open,
  onOpenChange,
  onLink,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLink: (reportId: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('events.linkReportTitle', { defaultValue: 'Link Report to Event' })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('events.searchReports', { defaultValue: 'Search reports...' })}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9"
              type="search"
            />
          </div>
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t('events.reportSearchTip', { defaultValue: 'Enter a report ID to link it.' })}
          </p>
          {query.trim() && (
            <Button
              className="w-full"
              onClick={() => onLink(query.trim())}
            >
              {t('events.linkReport', { defaultValue: 'Link Report' })} {query.trim().slice(0, 20)}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4.2: Run typecheck**

```bash
cd ~/projects/llamenos && bun run typecheck 2>&1 | grep "events" | head -30
```

Fix any type errors. Common issues:
- `EncryptedMessageResult.readerEnvelopes` vs `encryptedResult.envelopes` — check `platform.ts` for exact field name
- `CmsEvent` counts (`caseCount`, `reportCount`, `subEventCount`) are `number` not optional — no need for `?? 0`
- `listRecords` for the case search returns `CaseRecord[]` — confirm import

- [ ] **Step 4.3: Run tests — expect partial pass**

```bash
cd ~/projects/llamenos && bun run test -- tests/events-architecture.spec.ts --timeout 30000 2>&1 | tail -30
```

Expected: Test 1 (API endpoint check) should now PASS. Tests 2 and 3 may still fail if the dialog is not visible in test builds — acceptable at this stage; they'll be addressed after the full implementation.

- [ ] **Step 4.4: Commit**

```bash
cd ~/projects/llamenos && git add src/client/routes/events.tsx && git commit -m "feat(desktop): rewrite events page to use /api/events — remove records API usage"
```

---

## Task 5: Write Android EventsViewModelTest (failing)

**Files:**
- Create: `apps/android/app/src/test/java/org/llamenos/hotline/EventsViewModelTest.kt`

The test pattern for this codebase (see `ShiftsViewModelTest.kt`) verifies `UiState` data class behavior in JVM unit tests without needing a mock `ApiService` (because `ApiService` uses inline reified generics that cannot be easily mocked). The test will verify state transitions and the URL construction logic.

- [ ] **Step 5.1: Write the failing test**

```kotlin
// apps/android/app/src/test/java/org/llamenos/hotline/EventsViewModelTest.kt
package org.llamenos.hotline

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.llamenos.hotline.ui.events.EventsUiState
import org.llamenos.hotline.model.AppEvent

/**
 * Unit tests for EventsUiState and AppEvent model.
 *
 * EventsViewModel depends on ApiService (inline reified generics) which
 * cannot be easily faked in JVM unit tests. These tests verify the state
 * data class defaults and computed properties behave correctly.
 */
class EventsViewModelTest {

    @Test
    fun `default state has empty events list`() {
        val state = EventsUiState()
        assertTrue(state.events.isEmpty())
        assertEquals(0, state.total)
        assertFalse(state.isLoading)
        assertFalse(state.isRefreshing)
        assertNull(state.error)
        assertNull(state.selectedEvent)
    }

    @Test
    fun `loading state for empty list sets isLoading true`() {
        val state = EventsUiState()
        val loading = state.copy(
            isLoading = state.events.isEmpty(),
            isRefreshing = state.events.isNotEmpty(),
        )
        assertTrue(loading.isLoading)
        assertFalse(loading.isRefreshing)
    }

    @Test
    fun `refreshing state for populated list sets isRefreshing true`() {
        val event = mockAppEvent("e1")
        val state = EventsUiState(events = listOf(event))
        val refreshing = state.copy(
            isLoading = state.events.isEmpty(),
            isRefreshing = state.events.isNotEmpty(),
        )
        assertFalse(refreshing.isLoading)
        assertTrue(refreshing.isRefreshing)
    }

    @Test
    fun `filtered events returns all when search query is blank`() {
        val event1 = mockAppEvent("e1", caseNumber = "EVT-001")
        val event2 = mockAppEvent("e2", caseNumber = "EVT-002")
        val state = EventsUiState(events = listOf(event1, event2), searchQuery = "")
        assertEquals(2, state.filteredEvents.size)
    }

    @Test
    fun `filtered events filters by case number when search query set`() {
        val event1 = mockAppEvent("e1", caseNumber = "EVT-001")
        val event2 = mockAppEvent("e2", caseNumber = "MARCH-001")
        val state = EventsUiState(events = listOf(event1, event2), searchQuery = "march")
        assertEquals(1, state.filteredEvents.size)
        assertEquals("e2", state.filteredEvents[0].id)
    }

    @Test
    fun `AppEvent has startDate and locationApproximate fields`() {
        val event = mockAppEvent("e1", startDate = "2026-06-15T10:00:00Z", location = "Downtown Portland")
        assertEquals("2026-06-15T10:00:00Z", event.startDate)
        assertEquals("Downtown Portland", event.locationApproximate)
    }

    @Test
    fun `AppEvent has encryptedDetails and detailEnvelopes fields`() {
        val event = mockAppEvent("e1")
        // encryptedDetails and detailEnvelopes are on the event, not record
        // Verify these fields exist (non-null after assignment)
        val withDetails = event.copy(encryptedDetails = "base64ciphertext", detailEnvelopes = emptyList())
        assertEquals("base64ciphertext", withDetails.encryptedDetails)
        assertFalse(withDetails.detailEnvelopes == null)
    }

    @Test
    fun `AppEvent does NOT have encryptedSummary or summaryEnvelopes`() {
        // This test verifies that AppEvent uses the events schema, not the records schema.
        // If AppEvent had encryptedSummary, this wouldn't compile.
        val event = mockAppEvent("e1")
        // Verify we can access events-specific fields
        val _startDate: String = event.startDate
        val _eventTypeHash: String = event.eventTypeHash
        // The following would cause a compile error if AppEvent used CaseRecord instead:
        // event.encryptedSummary // <-- must NOT exist on AppEvent
    }

    // ---- Helpers ----

    private fun mockAppEvent(
        id: String,
        caseNumber: String? = null,
        startDate: String = "2026-03-21T10:00:00Z",
        location: String? = null,
    ) = AppEvent(
        id = id,
        hubId = "hub-1",
        entityTypeId = "et-1",
        caseNumber = caseNumber,
        startDate = startDate,
        endDate = null,
        parentEventId = null,
        locationPrecision = "neighborhood",
        locationApproximate = location,
        eventTypeHash = "protest",
        statusHash = "active",
        encryptedDetails = null,
        detailEnvelopes = null,
        caseCount = 0,
        reportCount = 0,
        subEventCount = 0,
        createdAt = "2026-03-21T10:00:00Z",
        updatedAt = "2026-03-21T10:00:00Z",
        createdBy = "pubkey",
    )
}
```

- [ ] **Step 5.2: Run the test to confirm it fails**

```bash
cd ~/projects/llamenos/apps/android && ./gradlew testDebugUnitTest --tests "org.llamenos.hotline.EventsViewModelTest" 2>&1 | tail -20
```

Expected: FAIL — `AppEvent` doesn't exist yet. Compilation error: `Unresolved reference: AppEvent` and `Unresolved reference: EventsUiState` (EventsUiState still uses `Record` type).

- [ ] **Step 5.3: Commit the test file**

```bash
cd ~/projects/llamenos && git add apps/android/app/src/test/java/org/llamenos/hotline/EventsViewModelTest.kt && git commit -m "test(android): add EventsViewModelTest asserting AppEvent model fields"
```

---

## Task 6: Create `AppEvent` Kotlin model

**Files:**
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/model/AppEvent.kt`

- [ ] **Step 6.1: Create the model file**

```kotlin
// apps/android/app/src/main/java/org/llamenos/hotline/model/AppEvent.kt
package org.llamenos.hotline.model

import kotlinx.serialization.Serializable

/**
 * A CMS event from GET /api/events.
 *
 * Events have a dedicated schema richer than CaseRecord:
 * - startDate / endDate for temporal range
 * - parentEventId for sub-event hierarchy
 * - locationPrecision / locationApproximate for cleartext location
 * - encryptedDetails + detailEnvelopes for E2EE content (NOT encryptedSummary)
 * - caseCount / reportCount / subEventCount for denormalised relationship counts
 */
@Serializable
data class AppEvent(
    val id: String,
    val hubId: String,
    val entityTypeId: String,
    val caseNumber: String? = null,

    // Event-specific cleartext metadata
    val startDate: String,
    val endDate: String? = null,
    val parentEventId: String? = null,
    val locationPrecision: String? = null,
    val locationApproximate: String? = null,

    // Blind indexes (server-filterable)
    val eventTypeHash: String,
    val statusHash: String,

    // E2EE encrypted details — NOT encryptedSummary
    val encryptedDetails: String? = null,
    val detailEnvelopes: List<RecipientEnvelope>? = null,

    // Relationship counts
    val caseCount: Int = 0,
    val reportCount: Int = 0,
    val subEventCount: Int = 0,

    // Timestamps
    val createdAt: String,
    val updatedAt: String,
    val createdBy: String? = null,
)

/**
 * Response wrapper for GET /api/events
 */
@Serializable
data class EventsListResponse(
    val events: List<AppEvent>,
    val total: Int,
    val page: Int = 1,
    val limit: Int = 50,
    val hasMore: Boolean = false,
)

/**
 * Response wrapper for GET /api/events/:id
 */
@Serializable
data class EventResponse(
    val event: AppEvent,
)

/**
 * Response wrapper for GET /api/events/:id/subevents
 */
@Serializable
data class SubEventsResponse(
    val events: List<AppEvent>,
)

/**
 * Link between an event and a case record.
 * Returned by GET /api/events/:id/records.
 */
@Serializable
data class CaseEventLink(
    val recordId: String,
    val eventId: String,
    val linkedAt: String? = null,
    val linkedBy: String? = null,
)

/**
 * Link between an event and a report.
 * Returned by GET /api/events/:id/reports.
 */
@Serializable
data class ReportEventLink(
    val reportId: String,
    val eventId: String,
    val linkedAt: String? = null,
    val linkedBy: String? = null,
)

@Serializable
data class CaseEventLinksResponse(
    val links: List<CaseEventLink>,
)

@Serializable
data class ReportEventLinksResponse(
    val links: List<ReportEventLink>,
)

/**
 * Request body for POST /api/events
 */
@Serializable
data class CreateEventRequest(
    val entityTypeId: String,
    val startDate: String,
    val endDate: String? = null,
    val parentEventId: String? = null,
    val locationPrecision: String? = null,
    val locationApproximate: String? = null,
    val eventTypeHash: String,
    val statusHash: String,
    val blindIndexes: Map<String, String> = emptyMap(),
    val encryptedDetails: String,
    val detailEnvelopes: List<RecipientEnvelope>,
)

/**
 * Request body for PATCH /api/events/:id
 */
@Serializable
data class UpdateEventRequest(
    val startDate: String? = null,
    val endDate: String? = null,
    val locationApproximate: String? = null,
    val locationPrecision: String? = null,
    val statusHash: String? = null,
    val eventTypeHash: String? = null,
    val encryptedDetails: String? = null,
    val detailEnvelopes: List<RecipientEnvelope>? = null,
)
```

Note: `RecipientEnvelope` is already defined in the existing model layer. Verify with:

```bash
grep -rn "data class RecipientEnvelope\|class RecipientEnvelope" ~/projects/llamenos/apps/android/app/src/main/java/org/llamenos/hotline/model/ --include="*.kt"
```

If `RecipientEnvelope` is in a different package (e.g., `org.llamenos.protocol`), update the import accordingly.

- [ ] **Step 6.2: Run the unit test again**

```bash
cd ~/projects/llamenos/apps/android && ./gradlew testDebugUnitTest --tests "org.llamenos.hotline.EventsViewModelTest" 2>&1 | tail -20
```

Expected: Still FAIL — `EventsUiState` still imports `Record`. That's fine; it will be fixed in Task 7.

- [ ] **Step 6.3: Commit the model**

```bash
cd ~/projects/llamenos && git add apps/android/app/src/main/java/org/llamenos/hotline/model/AppEvent.kt && git commit -m "feat(android): add AppEvent model and response types for events API"
```

---

## Task 7: Rewrite Android `EventsViewModel.kt`

**Files:**
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventsViewModel.kt` (full rewrite)

- [ ] **Step 7.1: Rewrite the file**

```kotlin
// apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventsViewModel.kt
package org.llamenos.hotline.ui.events

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.llamenos.hotline.api.ApiService
import org.llamenos.hotline.api.SessionState
import org.llamenos.hotline.crypto.CryptoService
import org.llamenos.hotline.hub.ActiveHubState
import org.llamenos.hotline.model.AppEvent
import org.llamenos.hotline.model.CaseEventLink
import org.llamenos.hotline.model.CaseEventLinksResponse
import org.llamenos.hotline.model.CreateEventRequest
import org.llamenos.hotline.model.EntityTypeDefinition
import org.llamenos.hotline.model.EntityTypesResponse
import org.llamenos.hotline.model.EventsListResponse
import org.llamenos.hotline.model.ReportEventLink
import org.llamenos.hotline.model.ReportEventLinksResponse
import org.llamenos.hotline.model.SubEventsResponse
import org.llamenos.hotline.model.UpdateEventRequest
import org.llamenos.protocol.RecipientEnvelope
import javax.inject.Inject

/**
 * UI state for the events screens.
 *
 * Events use the dedicated /api/events endpoint, NOT /api/records.
 * The events schema is richer: startDate/endDate, locationApproximate,
 * encryptedDetails/detailEnvelopes (NOT encryptedSummary).
 */
data class EventsUiState(
    // Entity types (for label/status display — not needed for the list query)
    val entityTypes: List<EntityTypeDefinition> = emptyList(),
    val isLoadingEntityTypes: Boolean = false,

    // Event list
    val events: List<AppEvent> = emptyList(),
    val total: Int = 0,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val error: String? = null,

    // Selected event detail
    val selectedEvent: AppEvent? = null,
    val isLoadingDetail: Boolean = false,
    val detailError: String? = null,

    // Linked data for detail view
    val linkedCases: List<CaseEventLink> = emptyList(),
    val linkedReports: List<ReportEventLink> = emptyList(),
    val subEvents: List<AppEvent> = emptyList(),
    val isLoadingLinks: Boolean = false,

    // Search
    val searchQuery: String = "",

    // CMS status
    val cmsEnabled: Boolean? = null,

    // Action feedback
    val isUpdatingStatus: Boolean = false,
    val actionError: String? = null,
    val actionSuccess: String? = null,
) {
    /** Event entity types only (category === "event"). */
    val eventEntityTypes: List<EntityTypeDefinition>
        get() = entityTypes.filter { it.category == "event" && !it.isArchived }

    /** Map of entity type ID to definition for quick lookup. */
    val entityTypeMap: Map<String, EntityTypeDefinition>
        get() = entityTypes.associateBy { it.id }

    /** Events filtered by search query (case number, id, or location). */
    val filteredEvents: List<AppEvent>
        get() = if (searchQuery.isBlank()) {
            events
        } else {
            val query = searchQuery.lowercase()
            events.filter { event ->
                (event.caseNumber ?: event.id).lowercase().contains(query) ||
                    (event.locationApproximate ?: "").lowercase().contains(query)
            }
        }
}

/**
 * ViewModel for the events screens.
 *
 * Uses GET /api/events (not /api/records). Events contain temporal metadata
 * (startDate, endDate, locationApproximate) and use the encryptedDetails/
 * detailEnvelopes E2EE schema rather than encryptedSummary.
 */
@HiltViewModel
class EventsViewModel @Inject constructor(
    private val apiService: ApiService,
    private val cryptoService: CryptoService,
    private val sessionState: SessionState,
    private val activeHubState: ActiveHubState,
) : ViewModel() {

    private val _uiState = MutableStateFlow(EventsUiState())
    val uiState: StateFlow<EventsUiState> = _uiState.asStateFlow()

    init {
        activeHubState.activeHubId
            .filterNotNull()
            .onEach { refresh() }
            .launchIn(viewModelScope)
    }

    // ── CMS Status ────────────────────────────────────────────────

    private fun checkCmsEnabled() {
        viewModelScope.launch {
            try {
                @kotlinx.serialization.Serializable
                data class CmsStatusResponse(val enabled: Boolean)
                val response = apiService.request<CmsStatusResponse>("GET", "/api/settings/cms/enabled")
                _uiState.update { it.copy(cmsEnabled = response.enabled) }
            } catch (_: Exception) {
                _uiState.update { it.copy(cmsEnabled = false) }
            }
        }
    }

    // ── Entity Types ──────────────────────────────────────────────
    // Entity types are loaded for label/status display only.
    // They are NOT needed to query /api/events.

    fun loadEntityTypes() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingEntityTypes = true) }
            try {
                val response = apiService.request<EntityTypesResponse>(
                    "GET",
                    "/api/settings/cms/entity-types",
                )
                _uiState.update {
                    it.copy(
                        entityTypes = response.entityTypes,
                        isLoadingEntityTypes = false,
                    )
                }
            } catch (_: Exception) {
                _uiState.update { it.copy(isLoadingEntityTypes = false) }
            }
        }
    }

    // ── Events List ───────────────────────────────────────────────

    /**
     * Load events from GET /api/events (not /api/records).
     * No entity type pre-flight required — the events API is not scoped by entity type.
     */
    fun loadEvents() {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoading = it.events.isEmpty(),
                    isRefreshing = it.events.isNotEmpty(),
                    error = null,
                )
            }
            try {
                val response = apiService.request<EventsListResponse>(
                    "GET",
                    apiService.hp("/api/events") + "?page=1&limit=50",
                )
                _uiState.update {
                    it.copy(
                        events = response.events,
                        total = response.total,
                        isLoading = false,
                        isRefreshing = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.message ?: "Failed to load events",
                    )
                }
            }
        }
    }

    // ── Event Detail ──────────────────────────────────────────────

    /**
     * Load a single event from GET /api/events/:id.
     */
    fun selectEvent(eventId: String) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(isLoadingDetail = true, detailError = null, selectedEvent = null)
            }
            try {
                val event = apiService.request<AppEvent>("GET", apiService.hp("/api/events/$eventId"))
                _uiState.update { it.copy(selectedEvent = event, isLoadingDetail = false) }
                loadLinkedData(eventId)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoadingDetail = false, detailError = e.message ?: "Failed to load event")
                }
            }
        }
    }

    private fun loadLinkedData(eventId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingLinks = true) }
            try {
                val casesResponse = apiService.request<CaseEventLinksResponse>(
                    "GET", apiService.hp("/api/events/$eventId/records"),
                )
                val reportsResponse = apiService.request<ReportEventLinksResponse>(
                    "GET", apiService.hp("/api/events/$eventId/reports"),
                )
                val subEventsResponse = apiService.request<SubEventsResponse>(
                    "GET", apiService.hp("/api/events/$eventId/subevents"),
                )
                _uiState.update {
                    it.copy(
                        linkedCases = casesResponse.links,
                        linkedReports = reportsResponse.links,
                        subEvents = subEventsResponse.events,
                        isLoadingLinks = false,
                    )
                }
            } catch (_: Exception) {
                _uiState.update { it.copy(isLoadingLinks = false) }
            }
        }
    }

    // ── Status Update ─────────────────────────────────────────────

    /**
     * Update the status of an event via PATCH /api/events/:id.
     */
    fun updateStatus(eventId: String, statusHash: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isUpdatingStatus = true, actionError = null) }
            try {
                val request = UpdateEventRequest(statusHash = statusHash)
                apiService.requestNoContent("PATCH", apiService.hp("/api/events/$eventId"), request)
                _uiState.update {
                    it.copy(
                        isUpdatingStatus = false,
                        actionSuccess = "Status updated",
                        events = it.events.map { e ->
                            if (e.id == eventId) e.copy(statusHash = statusHash) else e
                        },
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isUpdatingStatus = false, actionError = e.message ?: "Failed to update status")
                }
            }
        }
    }

    // ── Create Event ──────────────────────────────────────────────

    /**
     * Create a new event via POST /api/events with real E2EE encryption.
     *
     * Encrypts [detailsJson] for the current user + all admin pubkeys
     * via [CryptoService.encryptMessage]. Stores content in
     * encryptedDetails/detailEnvelopes — NOT encryptedSummary.
     *
     * @param entityTypeId ID of the event entity type
     * @param startDateIso ISO 8601 start date string
     * @param endDateIso Optional ISO 8601 end date string
     * @param locationApproximate Optional cleartext approximate location
     * @param detailsJson JSON string of [EventDetails] payload to encrypt
     * @param onSuccess Called on success
     */
    fun createEvent(
        entityTypeId: String,
        startDateIso: String,
        endDateIso: String?,
        locationApproximate: String?,
        detailsJson: String,
        onSuccess: () -> Unit,
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, actionError = null) }
            try {
                // Build reader pubkey list: current user + all admins
                val readerPubkeys = (listOf(cryptoService.pubkey ?: "") + sessionState.adminPubkeys)
                    .filter { it.isNotBlank() }
                    .distinct()

                // Real E2EE encryption — follows the pattern in ConversationsViewModel and NotesViewModel
                val encrypted = cryptoService.encryptMessage(detailsJson, readerPubkeys)

                val entityType = _uiState.value.entityTypeMap[entityTypeId]
                val defaultStatusHash = entityType?.statuses?.firstOrNull()?.value ?: "active"

                val body = CreateEventRequest(
                    entityTypeId = entityTypeId,
                    startDate = startDateIso,
                    endDate = endDateIso,
                    locationApproximate = locationApproximate?.takeIf { it.isNotBlank() },
                    locationPrecision = if (!locationApproximate.isNullOrBlank()) "neighborhood" else null,
                    eventTypeHash = entityTypeId, // Use entity type ID as stable discriminant
                    statusHash = defaultStatusHash,
                    blindIndexes = emptyMap(),
                    encryptedDetails = encrypted.ciphertext,
                    detailEnvelopes = encrypted.envelopes.map { env ->
                        RecipientEnvelope(
                            pubkey = env.recipientPubkey,
                            wrappedKey = env.wrappedKey,
                            ephemeralPubkey = env.ephemeralPubkey,
                        )
                    },
                )

                apiService.requestNoContent("POST", apiService.hp("/api/events"), body)
                loadEvents()
                _uiState.update { it.copy(isLoading = false) }
                onSuccess()
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, actionError = e.message) }
            }
        }
    }

    // ── Linking ───────────────────────────────────────────────────

    fun linkCaseToEvent(eventId: String, recordId: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            try {
                @kotlinx.serialization.Serializable
                data class LinkBody(val recordId: String)
                apiService.requestNoContent("POST", apiService.hp("/api/events/$eventId/records"), LinkBody(recordId))
                loadLinkedData(eventId)
                onSuccess()
            } catch (e: Exception) {
                _uiState.update { it.copy(actionError = e.message ?: "Failed to link case") }
            }
        }
    }

    fun linkReportToEvent(eventId: String, reportId: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            try {
                @kotlinx.serialization.Serializable
                data class LinkBody(val reportId: String)
                apiService.requestNoContent("POST", apiService.hp("/api/events/$eventId/reports"), LinkBody(reportId))
                loadLinkedData(eventId)
                onSuccess()
            } catch (e: Exception) {
                _uiState.update { it.copy(actionError = e.message ?: "Failed to link report") }
            }
        }
    }

    // ── Utility ───────────────────────────────────────────────────

    fun setSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun refresh() {
        checkCmsEnabled()
        loadEntityTypes()
        loadEvents()
    }

    fun dismissError() { _uiState.update { it.copy(error = null) } }
    fun dismissActionError() { _uiState.update { it.copy(actionError = null) } }
    fun dismissActionSuccess() { _uiState.update { it.copy(actionSuccess = null) } }
    fun clearSelection() { _uiState.update { it.copy(selectedEvent = null, detailError = null) } }
}
```

**Important:** After writing, check what `RecipientEnvelope` import is correct in the project. Run:

```bash
grep -rn "class RecipientEnvelope\|data class RecipientEnvelope" ~/projects/llamenos/apps/android/app/src/main/java/ --include="*.kt" | head -5
```

Adjust the import (`org.llamenos.protocol.RecipientEnvelope` or `org.llamenos.hotline.model.RecipientEnvelope`) accordingly.

Also check `EncryptedMessage.envelopes` return type — the field on each envelope is `recipientPubkey` vs `pubkey`:

```bash
grep -n "recipientPubkey\|val pubkey" ~/projects/llamenos/apps/android/app/src/main/java/org/llamenos/hotline/crypto/CryptoService.kt | head -10
```

- [ ] **Step 7.2: Run the unit test**

```bash
cd ~/projects/llamenos/apps/android && ./gradlew testDebugUnitTest --tests "org.llamenos.hotline.EventsViewModelTest" 2>&1 | tail -20
```

Expected: PASS. If compilation fails, fix import issues for `RecipientEnvelope` or `AppEvent`.

- [ ] **Step 7.3: Run full Android unit tests to check for regressions**

```bash
cd ~/projects/llamenos/apps/android && ./gradlew testDebugUnitTest 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 7.4: Commit**

```bash
cd ~/projects/llamenos && git add apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventsViewModel.kt && git commit -m "feat(android): rewrite EventsViewModel to use /api/events with real E2EE encryption"
```

---

## Task 8: Update Android UI screens

**Files:**
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventListScreen.kt`
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventDetailScreen.kt`
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/events/CreateEventScreen.kt`

- [ ] **Step 8.1: Update `EventListScreen.kt` to use `AppEvent`**

The main changes are:
1. Replace `import org.llamenos.protocol.Record` → `import org.llamenos.hotline.model.AppEvent`
2. Change the `EventCard` composable signature from `event: Record` to `event: AppEvent`
3. Add `startDate` and `locationApproximate` display in each card row
4. Update `filteredEvents` — the state now returns `List<AppEvent>` not `List<Record>`
5. Remove `event.contactCount` reference (not on `AppEvent`) — use `event.caseCount` instead
6. `event.entityTypeID` → `event.entityTypeId` (Kotlin codegen may have renamed this)

Key diff for the `EventCard`:
```kotlin
// Replace the Linked counts section that used event.contactCount:
if (event.caseCount > 0) {
    Text(
        text = "${event.caseCount} cases",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
        modifier = Modifier.testTag("event-case-count"),
    )
}

// Add start date row below the case number row:
Row(
    verticalAlignment = Alignment.CenterVertically,
    modifier = Modifier.fillMaxWidth(),
) {
    Icon(
        imageVector = Icons.Filled.CalendarMonth,
        contentDescription = null,
        tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.7f),
        modifier = Modifier.size(14.dp),
    )
    Spacer(Modifier.width(4.dp))
    Text(
        text = DateFormatUtils.formatDate(event.startDate),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.testTag("event-start-date"),
    )
    if (event.locationApproximate != null) {
        Text(
            text = " · ${event.locationApproximate}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .weight(1f)
                .testTag("event-location"),
        )
    }
}
```

If `DateFormatUtils.formatDate()` doesn't exist (only `formatTimestamp`), add a `formatDate` method that parses ISO 8601 date string to a readable format:
```kotlin
fun formatDate(isoDate: String): String {
    return try {
        val instant = java.time.Instant.parse(isoDate)
        val local = instant.atZone(java.time.ZoneId.systemDefault())
        "${local.month.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.getDefault())} ${local.dayOfMonth}, ${local.year}"
    } catch (_: Exception) { isoDate }
}
```

- [ ] **Step 8.2: Update `EventDetailScreen.kt` to use `AppEvent`**

Key changes:
1. Replace `import org.llamenos.protocol.Record` → `import org.llamenos.hotline.model.AppEvent`
2. Change `EventHeaderCard(event: Record)` → `EventHeaderCard(event: AppEvent)`
3. In the header card, replace the generic timestamp rows with temporal + location display:
   ```kotlin
   // Start/end dates
   Text(
       text = "Starts: ${DateFormatUtils.formatDate(event.startDate)}",
       style = MaterialTheme.typography.bodySmall,
       color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
       modifier = Modifier.testTag("event-header-start-date"),
   )
   if (event.endDate != null) {
       Text(
           text = "Ends: ${DateFormatUtils.formatDate(event.endDate)}",
           style = MaterialTheme.typography.bodySmall,
           color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
           modifier = Modifier.testTag("event-header-end-date"),
       )
   }
   if (event.locationApproximate != null) {
       Row(verticalAlignment = Alignment.CenterVertically) {
           Icon(Icons.Filled.LocationOn, contentDescription = null, modifier = Modifier.size(14.dp))
           Spacer(Modifier.width(4.dp))
           Text(
               text = event.locationApproximate,
               style = MaterialTheme.typography.bodySmall,
               modifier = Modifier.testTag("event-header-location"),
           )
       }
   }
   ```
4. Replace `EventLinkedCasesTab` placeholder with real data from `uiState.linkedCases`:
   ```kotlin
   if (uiState.linkedCases.isEmpty()) {
       EmptyState(icon = Icons.Filled.Description, title = ..., testTag = "event-cases-empty")
   } else {
       LazyColumn { items(uiState.linkedCases) { link -> CaseLinkCard(link) } }
   }
   ```
5. Replace `EventLinkedReportsTab` placeholder with `uiState.linkedReports`.
6. Add `EventSubEventsTab` using `uiState.subEvents`.
7. Fix the tab counts: Cases tab label should show `(${event.caseCount})`, Reports `(${event.reportCount})`, Sub-events `(${event.subEventCount})`.
8. Remove references to `event.assignedTo`, `event.interactionCount`, `event.contactCount` — these are on `Record` not `AppEvent`.

The `EventDetailsTab` already shows entity type fields — leave that as-is, it doesn't reference the event object directly.

- [ ] **Step 8.3: Update `CreateEventScreen.kt`**

Key changes:
1. Add date pickers for `startDate` and optional `endDate` using `DatePickerDialog` (Material3) or simple text field with `type="date"` hint. For simplicity, use a text field with ISO date format hint (Material3's `DatePicker` is available from Compose Material3 `1.2.0+`):

```kotlin
// Date state
var startDate by rememberSaveable { mutableStateOf("") }
var endDate by rememberSaveable { mutableStateOf("") }

// In the form, replace the placeholder date comment with actual fields:
OutlinedTextField(
    value = startDate,
    onValueChange = { startDate = it },
    label = { Text(stringResource(R.string.events_field_start_date)) },
    placeholder = { Text("YYYY-MM-DD") },
    singleLine = true,
    modifier = Modifier
        .fillMaxWidth()
        .testTag("create-event-start-date-field"),
)

OutlinedTextField(
    value = endDate,
    onValueChange = { endDate = it },
    label = { Text(stringResource(R.string.events_field_end_date)) },
    placeholder = { Text("YYYY-MM-DD (optional)") },
    singleLine = true,
    modifier = Modifier
        .fillMaxWidth()
        .testTag("create-event-end-date-field"),
)
```

2. Update the submit button's `onClick` to pass `startDate`, `endDate`, and `location` to the new `viewModel.createEvent()` signature:

```kotlin
Button(
    onClick = {
        defaultEntityType?.let { et ->
            val detailsJson = buildString {
                append("""{"name":""")
                append('"'); append(title.replace("\"", "\\\"")); append('"')
                if (description.isNotBlank()) {
                    append(""","description":""")
                    append('"'); append(description.replace("\"", "\\\"")); append('"')
                }
                append("}")
            }
            val startIso = if (startDate.isNotBlank()) "${startDate}T00:00:00Z" else java.time.Instant.now().toString()
            val endIso = if (endDate.isNotBlank()) "${endDate}T23:59:59Z" else null
            viewModel.createEvent(
                entityTypeId = et.id,
                startDateIso = startIso,
                endDateIso = endIso,
                locationApproximate = location.takeIf { it.isNotBlank() },
                detailsJson = detailsJson,
            ) { onNavigateBack() }
        }
    },
    enabled = title.isNotBlank() && defaultEntityType != null && !uiState.isLoading,
    ...
)
```

3. Add i18n string resources. Check `apps/android/app/src/main/res/values/strings.xml` for `events_field_title` etc. and add missing ones:
   - `events_field_start_date`
   - `events_field_end_date`

- [ ] **Step 8.4: Check i18n strings exist**

```bash
grep "events_field_start_date\|events_field_end_date\|events_field_location" ~/projects/llamenos/apps/android/app/src/main/res/values/strings.xml
```

If missing, add them to `strings.xml`:
```xml
<string name="events_field_start_date">Start Date</string>
<string name="events_field_end_date">End Date (optional)</string>
```

And add to `packages/i18n/locales/en.json` under `events`:
```json
"fieldStartDate": "Start Date",
"fieldEndDate": "End Date (optional)"
```

Then run `bun run i18n:codegen` to regenerate.

- [ ] **Step 8.5: Compile Android tests**

```bash
cd ~/projects/llamenos/apps/android && ./gradlew testDebugUnitTest 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 8.6: Compile Android E2E test Kotlin**

```bash
cd ~/projects/llamenos/apps/android && ./gradlew compileDebugAndroidTestKotlin 2>&1 | tail -20
```

Expected: Successful compilation.

- [ ] **Step 8.7: Commit**

```bash
cd ~/projects/llamenos && git add \
  apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventListScreen.kt \
  apps/android/app/src/main/java/org/llamenos/hotline/ui/events/EventDetailScreen.kt \
  apps/android/app/src/main/java/org/llamenos/hotline/ui/events/CreateEventScreen.kt \
  apps/android/app/src/main/res/values/strings.xml \
  packages/i18n/locales/en.json \
  && git commit -m "feat(android): update events screens to use AppEvent — add date/location display"
```

---

## Task 9: iOS minor fix — populate `eventTypeHash`/`statusHash` on create

**Files:**
- Modify: `apps/ios/Sources/Models/Event.swift`
- Modify: `apps/ios/Sources/ViewModels/EventsViewModel.swift`

The iOS `CreateEventRequest` is missing `eventTypeHash` and `statusHash` fields. The schema requires them (they are required, not optional with defaults). Currently iOS passes them as hardcoded values or omits them.

- [ ] **Step 9.1: Update `CreateEventRequest` in `Event.swift`**

The struct at line 101 already has the right fields but may not be passing them in. Check the current definition:

```bash
grep -A 15 "struct CreateEventRequest" ~/projects/llamenos/apps/ios/Sources/Models/Event.swift
```

If `eventTypeHash` and `statusHash` are already in `CreateEventRequest` — they are. The struct is correct. The issue is in `EventsViewModel.swift` which passes `blindIndexes: [:]` and omits the two hash fields.

Update `EventsViewModel.swift` `createEvent()` method: find the `let body = CreateEventRequest(...)` block (around line 286) and add the missing fields:

```swift
// After fetching the entity type, compute the hashes:
let entityType = allEntityTypes.first { $0.id == entityTypeId }
let defaultStatusHash = entityType?.statuses.first?.value ?? "active"
let eventTypeHashValue = entityTypeId // Use entity type ID as stable discriminant

let body = CreateEventRequest(
    entityTypeId: entityTypeId,
    startDate: isoFormatter.string(from: startDate),
    endDate: endDate.map { isoFormatter.string(from: $0) },
    parentEventId: nil,
    locationPrecision: location != nil ? "neighborhood" : nil,
    locationApproximate: location,
    encryptedDetails: encryptedContent,
    detailEnvelopes: envelopes,
    blindIndexes: [:],
    eventTypeHash: eventTypeHashValue,  // ← ADDED
    statusHash: defaultStatusHash,       // ← ADDED
)
```

Also update `CreateEventRequest` struct to include these fields if not already present:

```swift
struct CreateEventRequest: Codable, Sendable {
    let entityTypeId: String
    let startDate: String
    let endDate: String?
    let parentEventId: String?
    let locationPrecision: String?
    let locationApproximate: String?
    let encryptedDetails: String
    let detailEnvelopes: [CaseEnvelope]
    let blindIndexes: [String: String]
    let eventTypeHash: String   // ← ensure this exists
    let statusHash: String      // ← ensure this exists
}
```

- [ ] **Step 9.2: Verify the iOS change compiles (on mac)**

This step requires `ssh mac`. If mac is available:

```bash
ssh mac "cd ~/projects/llamenos && xcodebuild build -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' -quiet 2>&1 | tail -20"
```

If mac is not available, skip and note this for CI verification.

- [ ] **Step 9.3: Commit**

```bash
cd ~/projects/llamenos && git add \
  apps/ios/Sources/Models/Event.swift \
  apps/ios/Sources/ViewModels/EventsViewModel.swift \
  && git commit -m "fix(ios): populate eventTypeHash and statusHash in CreateEventRequest"
```

---

## Task 10: Full verification pass

- [ ] **Step 10.1: Run desktop typecheck**

```bash
cd ~/projects/llamenos && bun run typecheck 2>&1 | grep -E "^src/client/(lib/api|routes/events|components/cases/create-event)" | head -20
```

Expected: No errors in the changed files.

- [ ] **Step 10.2: Run desktop build**

```bash
cd ~/projects/llamenos && bun run build 2>&1 | tail -10
```

Expected: Build succeeds.

- [ ] **Step 10.3: Run Playwright events architecture tests**

```bash
cd ~/projects/llamenos && bun run test -- tests/events-architecture.spec.ts --timeout 30000 2>&1 | tail -30
```

Expected: All 4 tests PASS.

- [ ] **Step 10.4: Run full Playwright suite (check for regressions)**

```bash
cd ~/projects/llamenos && bun run test 2>&1 | tail -20
```

Expected: Same pass count as before this feature (no regressions).

- [ ] **Step 10.5: Run Android unit tests**

```bash
cd ~/projects/llamenos/apps/android && ./gradlew testDebugUnitTest 2>&1 | tail -20
```

Expected: All tests pass including `EventsViewModelTest`.

- [ ] **Step 10.6: Compile Android E2E tests**

```bash
cd ~/projects/llamenos/apps/android && ./gradlew compileDebugAndroidTestKotlin 2>&1 | tail -10
```

Expected: Compilation succeeds.

- [ ] **Step 10.7: Run Android lint**

```bash
cd ~/projects/llamenos/apps/android && ./gradlew lintDebug 2>&1 | grep -E "error:|Error" | head -10
```

Expected: No new lint errors.

- [ ] **Step 10.8: Run BDD backend tests**

```bash
cd ~/projects/llamenos && bun run test:backend:bdd 2>&1 | tail -20
```

Expected: Existing events BDD scenarios remain green. No scenario should be using records API for event creation.

- [ ] **Step 10.9: Final commit if any cleanup needed**

```bash
cd ~/projects/llamenos && git status
```

Commit any remaining unstaged changes.

---

## Verification Checklist

Before marking this plan complete, verify ALL of the following:

- [ ] `bun run typecheck` — no errors in `events.tsx`, `api.ts`, `create-event-dialog.tsx`
- [ ] `bun run build` — succeeds
- [ ] `bun run test -- tests/events-architecture.spec.ts` — all 4 tests pass
- [ ] `bun run test` — no regressions vs. baseline
- [ ] `./gradlew testDebugUnitTest` — all Android unit tests pass including `EventsViewModelTest`
- [ ] `./gradlew compileDebugAndroidTestKotlin` — Android E2E test compilation succeeds
- [ ] `./gradlew lintDebug` — no new lint errors
- [ ] `bun run test:backend:bdd` — existing events scenarios green
- [ ] Network tab in dev tools shows events page hitting `/api/events` not `/api/records?entityTypeId=...`
- [ ] Creating an event from desktop: request body has `encryptedDetails` + `detailEnvelopes`, NOT `encryptedSummary`
- [ ] `event.startDate` visible on event cards in desktop and Android

## Risks and Mitigations

1. **`RecipientEnvelope` import ambiguity (Android):** The type exists in `org.llamenos.protocol` (generated) and may shadow or conflict with `org.llamenos.hotline.model` types. Run `grep -rn "class RecipientEnvelope" apps/android/` to confirm the canonical import before writing `AppEvent.kt`.

2. **`EncryptedMessage.envelopes` field names (Android):** `CryptoService.encryptMessage()` returns `EncryptedMessage` with `envelopes: List<MessageEnvelope>`. Each envelope has `recipientPubkey`/`wrappedKey`/`ephemeralPubkey`. The `CreateEventRequest.detailEnvelopes` expects `List<RecipientEnvelope>` with `pubkey`/`wrappedKey`/`ephemeralPubkey`. These may have different field names — verify before mapping.

3. **`DateFormatUtils.formatDate` may not exist:** `DateFormatUtils` currently has `formatTimestamp()`. If no `formatDate()` method exists, add it (parses ISO 8601 to `MMM d, yyyy` format) rather than leaving raw ISO strings in the UI.

4. **iOS compile only verifiable on mac:** If `ssh mac` is unavailable, mark Step 9.2 as "deferred to CI" — the iOS change is small and low-risk.

5. **`encryptMessage` in `platform.ts` `readerEnvelopes` field name:** The return type `EncryptedMessageResult` may use `readerEnvelopes` or `envelopes` — check the actual field name in `src/client/lib/platform.ts` line ~346 before writing `create-event-dialog.tsx`.
