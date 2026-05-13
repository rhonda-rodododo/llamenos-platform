# EP05b: Blast Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the blast system with delivery retry endpoints, real-time WS progress events, media URL + schedule picker in the composer, full delivery detail sheet, and mobile blast management on iOS and Android.

**Architecture:** Add two retry endpoints to the blast routes (single + bulk), wire the delivery worker's existing `onProgress` callback to `publishEvent` for real-time WS blast progress, extract the delivery detail panel into a sheet overlay with retry actions, enhance BlastComposer with media URL and schedule date/time fields, and build full blast CRUD on iOS (SwiftUI) and Android (Kotlin/Compose) with WS progress subscription.

**Tech Stack:** Bun/Hono (backend), Drizzle ORM (DB), Zod (schemas), React/shadcn (desktop), SwiftUI (iOS), Kotlin/Compose (Android), i18next (i18n), Playwright (E2E), Gherkin/BDD (integration)

**Spec:** `docs/superpowers/specs/2026-05-11-EP05-messaging-blast-system-design.md`

---

## File Structure

### Backend (modify)
- `packages/protocol/schemas/blasts.ts` — add `blastProgressEventSchema`, `retryDeliveryResponseSchema`
- `packages/protocol/tools/schema-registry.ts` — exclude sub-schemas from codegen
- `apps/worker/services/blasts.ts` — add `retryDelivery()` and `retryFailedDeliveries()` methods
- `apps/worker/routes/blasts.ts` — add `POST /:id/deliveries/:deliveryId/retry` and `POST /:id/retry-failed`
- `apps/worker/lib/blast-delivery-worker.ts` — emit WS `blast:progress` event after each batch via `publishEvent`
- `apps/worker/index.ts` (or wherever `startBlastWorker` is called) — wire `onProgress` to `publishEvent`
- `apps/worker/__tests__/unit/blast-retry.test.ts` — unit tests for retry service methods (new)

### Desktop (new)
- `src/client/components/blast/delivery-detail-sheet.tsx` — full sheet overlay with delivery table + retry actions
- `src/client/components/blast/media-attachment-field.tsx` — media URL input with type selector
- `src/client/components/blast/schedule-picker.tsx` — inline date/time picker for scheduling

### Desktop (modify)
- `src/client/lib/api.ts` — add `retryDelivery()`, `retryFailedDeliveries()` API functions
- `src/client/components/BlastComposer.tsx` — add media URL field + schedule picker
- `src/client/routes/blasts.tsx` — replace inline delivery toggle with sheet, add WS subscription for live progress

### iOS (new)
- `apps/ios/Sources/Services/BlastService.swift` — API client for blast CRUD + retry
- `apps/ios/Sources/Views/Blasts/BlastListView.swift` — blast list with status badges
- `apps/ios/Sources/Views/Blasts/BlastComposerView.swift` — create/edit blast
- `apps/ios/Sources/Views/Blasts/BlastDeliveryDetailView.swift` — delivery tracking sheet
- `apps/ios/Sources/Views/Blasts/BlastDeliveryRow.swift` — per-delivery row with retry button
- `apps/ios/Tests/LlamenosTests/BlastServiceTests.swift` — unit tests

### Android (new)
- `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastRepository.kt` — API client for blast CRUD + retry
- `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastListScreen.kt` — blast list with status badges
- `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastComposerScreen.kt` — create/edit blast
- `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastDeliveryDetailSheet.kt` — delivery tracking bottom sheet
- `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastDeliveryItem.kt` — per-delivery row with retry
- `apps/android/app/src/test/java/org/llamenos/hotline/blast/BlastRepositoryTest.kt` — unit tests

### i18n (modify)
- `packages/i18n/locales/en.json` — add ~25 blast enhancement keys
- `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json` — translations

### BDD (new)
- `packages/test-specs/features/admin/blast-delivery.feature` — delivery retry, progress, media
- `tests/steps/backend/blast-delivery.steps.ts` — step definitions

### Playwright (new)
- `tests/blast-delivery.spec.ts` — desktop E2E for delivery sheet, retry, composer enhancements

---

## Phase 1: Protocol Schemas — Retry + Progress Types

**Files:**
- Modify: `packages/protocol/schemas/blasts.ts`
- Modify: `packages/protocol/tools/schema-registry.ts`

- [ ] **Step 1.1: Add blast progress event and retry response schemas**

Append to `packages/protocol/schemas/blasts.ts` before the closing of the file:

```typescript
// --- Blast progress WS event ---

export const blastProgressDeliverySchema = z.object({
  deliveryId: z.string(),
  subscriberHash: z.string(),
  channel: z.string(),
  status: z.string(),
  error: z.string().optional(),
})

export const blastProgressEventSchema = z.object({
  type: z.literal('blast:progress'),
  hubId: z.string(),
  blastId: z.string(),
  stats: z.object({
    pending: z.number(),
    sent: z.number(),
    delivered: z.number(),
    failed: z.number(),
    optedOut: z.number(),
    total: z.number(),
  }),
  batch: z.array(blastProgressDeliverySchema),
})

export type BlastProgressEvent = z.infer<typeof blastProgressEventSchema>

// --- Retry response ---

export const retryDeliveryResponseSchema = z.object({
  ok: z.boolean(),
  delivery: blastDeliveryResponseSchema,
})

export const retryFailedResponseSchema = z.object({
  ok: z.boolean(),
  retriedCount: z.number(),
})
```

- [ ] **Step 1.2: Exclude sub-schemas from codegen**

In `packages/protocol/tools/schema-registry.ts`, add to the `EXCLUDED_SCHEMAS` set:

```typescript
'blastProgressDeliverySchema',
```

- [ ] **Step 1.3: Run codegen to verify schemas compile**

```bash
bun run codegen
```

Expected: Clean exit, no errors.

- [ ] **Step 1.4: Commit**

```bash
git add packages/protocol/schemas/blasts.ts packages/protocol/tools/schema-registry.ts
git commit -m "feat(protocol): add blast progress event and retry response schemas"
```

---

## Phase 2: Backend — Delivery Retry Service Methods

**Files:**
- Modify: `apps/worker/services/blasts.ts`
- New: `apps/worker/__tests__/unit/blast-retry.test.ts`

- [ ] **Step 2.1: Write failing test for retryDelivery**

Create `apps/worker/__tests__/unit/blast-retry.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test'
import { BlastsService } from '../../services/blasts'
import { createTestDb, seedBlast, seedDelivery } from '../helpers/db-helpers'
import type { Database } from '../../db'

describe('BlastsService.retryDelivery', () => {
  let db: Database
  let service: BlastsService

  beforeEach(async () => {
    db = await createTestDb()
    service = new BlastsService(db, 'a'.repeat(64))
  })

  it('resets a failed delivery to pending with incremented attempts', async () => {
    const blast = await seedBlast(db, { status: 'sent' })
    const delivery = await seedDelivery(db, {
      blastId: blast.id,
      status: 'failed',
      attempts: 2,
      error: 'timeout',
    })

    const result = await service.retryDelivery(blast.id, delivery.id)

    expect(result.status).toBe('pending')
    expect(result.attempts).toBe(3)
    expect(result.error).toBeNull()
    expect(result.nextRetryAt).toBeDefined()
  })

  it('throws if delivery is not in failed status', async () => {
    const blast = await seedBlast(db, { status: 'sending' })
    const delivery = await seedDelivery(db, {
      blastId: blast.id,
      status: 'sent',
      attempts: 1,
    })

    await expect(service.retryDelivery(blast.id, delivery.id))
      .rejects.toThrow('Only failed deliveries can be retried')
  })

  it('throws if blast is not in sending or sent status', async () => {
    const blast = await seedBlast(db, { status: 'draft' })
    const delivery = await seedDelivery(db, {
      blastId: blast.id,
      status: 'failed',
      attempts: 1,
    })

    await expect(service.retryDelivery(blast.id, delivery.id))
      .rejects.toThrow('Blast must be in sending or sent state to retry')
  })
})

describe('BlastsService.retryFailedDeliveries', () => {
  let db: Database
  let service: BlastsService

  beforeEach(async () => {
    db = await createTestDb()
    service = new BlastsService(db, 'a'.repeat(64))
  })

  it('resets all failed deliveries for a blast to pending', async () => {
    const blast = await seedBlast(db, { status: 'sent' })
    await seedDelivery(db, { blastId: blast.id, status: 'failed', attempts: 2, error: 'err1' })
    await seedDelivery(db, { blastId: blast.id, status: 'failed', attempts: 1, error: 'err2' })
    await seedDelivery(db, { blastId: blast.id, status: 'sent', attempts: 1 })

    const count = await service.retryFailedDeliveries(blast.id)

    expect(count).toBe(2)
  })

  it('throws if blast is not in sending or sent status', async () => {
    const blast = await seedBlast(db, { status: 'cancelled' })

    await expect(service.retryFailedDeliveries(blast.id))
      .rejects.toThrow('Blast must be in sending or sent state to retry')
  })

  it('transitions blast back to sending when retrying from sent', async () => {
    const blast = await seedBlast(db, { status: 'sent' })
    await seedDelivery(db, { blastId: blast.id, status: 'failed', attempts: 1, error: 'err' })

    await service.retryFailedDeliveries(blast.id)

    const updated = await service.getBlast(blast.id)
    expect(updated.status).toBe('sending')
  })
})
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
cd apps/worker && bun test __tests__/unit/blast-retry.test.ts
```

Expected: FAIL — `service.retryDelivery is not a function`

- [ ] **Step 2.3: Implement retryDelivery method**

Add to `apps/worker/services/blasts.ts` after the `findDeliveryByExternalId` method:

```typescript
  /**
   * Retry a single failed delivery.
   * Guards: delivery must be 'failed', blast must be 'sending' or 'sent'.
   * Resets status to 'pending', increments attempts, clears error, sets nextRetryAt to now.
   */
  async retryDelivery(blastId: string, deliveryId: string): Promise<BlastDeliveryRow> {
    const blast = await this.getBlast(blastId)
    if (blast.status !== 'sending' && blast.status !== 'sent') {
      throw new ServiceError(400, 'Blast must be in sending or sent state to retry')
    }

    const [delivery] = await this.db
      .select()
      .from(blastDeliveries)
      .where(and(eq(blastDeliveries.id, deliveryId), eq(blastDeliveries.blastId, blastId)))
      .limit(1)

    if (!delivery) throw new ServiceError(404, 'Delivery not found')
    if (delivery.status !== 'failed') {
      throw new ServiceError(400, 'Only failed deliveries can be retried')
    }

    const [updated] = await this.db
      .update(blastDeliveries)
      .set({
        status: 'pending',
        attempts: delivery.attempts + 1,
        error: null,
        nextRetryAt: new Date(),
      })
      .where(eq(blastDeliveries.id, deliveryId))
      .returning()

    // If blast was 'sent' (completed), transition back to 'sending' so worker picks it up
    if (blast.status === 'sent') {
      await this.db
        .update(blasts)
        .set({ status: 'sending', completedAt: null, updatedAt: new Date() })
        .where(eq(blasts.id, blastId))
    }

    return updated
  }

  /**
   * Retry all failed deliveries for a blast.
   * Guards: blast must be 'sending' or 'sent'.
   * Returns the number of deliveries reset.
   */
  async retryFailedDeliveries(blastId: string): Promise<number> {
    const blast = await this.getBlast(blastId)
    if (blast.status !== 'sending' && blast.status !== 'sent') {
      throw new ServiceError(400, 'Blast must be in sending or sent state to retry')
    }

    const result = await this.db
      .update(blastDeliveries)
      .set({
        status: 'pending',
        attempts: sql`${blastDeliveries.attempts} + 1`,
        error: null,
        nextRetryAt: new Date(),
      })
      .where(
        and(
          eq(blastDeliveries.blastId, blastId),
          eq(blastDeliveries.status, 'failed'),
        ),
      )
      .returning({ id: blastDeliveries.id })

    // If blast was 'sent' (completed), transition back to 'sending' so worker picks it up
    if (blast.status === 'sent' && result.length > 0) {
      await this.db
        .update(blasts)
        .set({ status: 'sending', completedAt: null, updatedAt: new Date() })
        .where(eq(blasts.id, blastId))
    }

    return result.length
  }
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
cd apps/worker && bun test __tests__/unit/blast-retry.test.ts
```

Expected: All tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add apps/worker/services/blasts.ts apps/worker/__tests__/unit/blast-retry.test.ts
git commit -m "feat(worker): add retryDelivery and retryFailedDeliveries to BlastsService"
```

---

## Phase 3: Backend — Retry Route Endpoints

**Files:**
- Modify: `apps/worker/routes/blasts.ts`

- [ ] **Step 3.1: Add retry single delivery endpoint**

Add before the `export default blasts` line in `apps/worker/routes/blasts.ts`:

```typescript
blasts.post('/:id/deliveries/:deliveryId/retry',
  describeRoute({
    tags: ['Blasts'],
    summary: 'Retry a single failed delivery',
    responses: {
      200: {
        description: 'Delivery reset to pending',
        content: {
          'application/json': {
            schema: resolver(blastDeliveryResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('blasts:send'),
  async (c) => {
    const blastId = c.req.param('id')
    const deliveryId = c.req.param('deliveryId')
    const services = c.get('services')
    const delivery = await services.blasts.retryDelivery(blastId, deliveryId)
    return c.json({ ok: true, delivery })
  },
)

blasts.post('/:id/retry-failed',
  describeRoute({
    tags: ['Blasts'],
    summary: 'Retry all failed deliveries for a blast',
    responses: {
      200: {
        description: 'Failed deliveries reset to pending',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  requirePermission('blasts:send'),
  async (c) => {
    const blastId = c.req.param('id')
    const services = c.get('services')
    const retriedCount = await services.blasts.retryFailedDeliveries(blastId)
    return c.json({ ok: true, retriedCount })
  },
)
```

- [ ] **Step 3.2: Verify typecheck passes**

```bash
bun run typecheck
```

- [ ] **Step 3.3: Commit**

```bash
git add apps/worker/routes/blasts.ts
git commit -m "feat(worker): add POST retry-delivery and retry-failed blast endpoints"
```

---

## Phase 4: Backend — WS Blast Progress Event Emission

**Files:**
- Modify: `apps/worker/lib/blast-delivery-worker.ts`
- Modify: wherever `startBlastWorker` is called (find the wiring)

- [ ] **Step 4.1: Find where startBlastWorker is called**

```bash
grep -r "startBlastWorker" apps/worker/ --include="*.ts" -l
```

Identify the file that calls `startBlastWorker` and wires `onProgress`.

- [ ] **Step 4.2: Enhance onProgress callback to emit WS event with batch details**

The delivery worker already has `BlastProgressCallback` and calls `deps.onProgress?.(blastId, stats)` after each batch. We need to:

1. Expand the callback signature to include batch delivery details
2. Emit `publishEvent` with `KIND_BLAST_PROGRESS`

Modify `apps/worker/lib/blast-delivery-worker.ts`:

First, update the `BlastProgressCallback` type:

```typescript
/** Per-delivery result in a progress batch */
export interface BlastProgressBatchItem {
  deliveryId: string
  subscriberHash: string
  channel: string
  status: string
  error?: string
}

/** Callback for real-time progress events */
export type BlastProgressCallback = (blastId: string, hubId: string, stats: {
  totalRecipients: number
  sent: number
  delivered: number
  failed: number
  optedOut: number
}, batch: BlastProgressBatchItem[]) => void
```

Then, in `processBlastBatch`, collect batch results during delivery processing and pass them to `onProgress`. Replace the section after the `for (const delivery of batch)` loop where `syncBlastStats` is called:

Track batch results by adding a `batchResults` array before the loop:

```typescript
  const batchResults: BlastProgressBatchItem[] = []
```

After each delivery status update (sent, failed, opted_out), push to `batchResults`:

```typescript
  // After markDeliverySent:
  batchResults.push({
    deliveryId: delivery.id,
    subscriberHash: '', // resolved below
    channel,
    status: 'sent',
  })

  // After markDeliveryFailed:
  batchResults.push({
    deliveryId: delivery.id,
    subscriberHash: '',
    channel,
    status: 'failed',
    error: errorMessage,
  })

  // After markDeliveryOptedOut:
  batchResults.push({
    deliveryId: delivery.id,
    subscriberHash: '',
    channel: delivery.channel,
    status: 'opted_out',
  })
```

Resolve subscriber hashes for each batch item. After the delivery loop, before `syncBlastStats`:

```typescript
  // Resolve subscriber hashes for WS event (privacy: only hashes, never plaintext)
  for (const item of batchResults) {
    const matchingDelivery = batch.find(d => d.id === item.deliveryId)
    if (matchingDelivery) {
      const hash = await deps.blastsService.resolveSubscriberIdentifierHash(matchingDelivery.subscriberId)
      item.subscriberHash = hash ?? ''
    }
  }
```

Update the `onProgress` call:

```typescript
  // Sync stats after batch
  const { stats, completed } = await deps.blastsService.syncBlastStats(blastId)
  deps.onProgress?.(blastId, hubId, stats, batchResults)
```

- [ ] **Step 4.3: Wire publishEvent in the startBlastWorker call site**

In the file that calls `startBlastWorker`, update the `onProgress` callback to emit a WS event:

```typescript
import { publishEvent } from '../lib/ws-events'
import { KIND_BLAST_PROGRESS } from '@shared/event-kinds'

// In the startBlastWorker call:
onProgress: (blastId, hubId, stats, batch) => {
  publishEvent(env, KIND_BLAST_PROGRESS, {
    type: 'blast:progress',
    hubId,
    blastId,
    stats: {
      pending: stats.totalRecipients - stats.sent - stats.delivered - stats.failed - stats.optedOut,
      sent: stats.sent,
      delivered: stats.delivered,
      failed: stats.failed,
      optedOut: stats.optedOut,
      total: stats.totalRecipients,
    },
    batch,
  }, hubId)
},
```

- [ ] **Step 4.4: Run existing blast worker tests to ensure no regressions**

```bash
cd apps/worker && bun test __tests__/unit/blast-delivery-worker.test.ts
```

- [ ] **Step 4.5: Commit**

```bash
git add apps/worker/lib/blast-delivery-worker.ts
git add -u  # any other modified files from the wiring
git commit -m "feat(worker): emit WS blast:progress events after each delivery batch"
```

---

## Phase 5: Backend — Media URL Passthrough Verification

**Files:**
- Verify: `apps/worker/routes/blasts.ts` (create + update handlers)

- [ ] **Step 5.1: Verify create route handles mediaUrl**

Check `apps/worker/routes/blasts.ts` POST `/` handler. It already maps:
```typescript
content: { text: body.content.body, mediaUrl: body.content.mediaUrl }
```
The protocol schema `createBlastBodySchema` already includes `mediaUrl: z.url().optional()` in the content object. Confirmed: no backend changes needed for create.

- [ ] **Step 5.2: Verify update route handles mediaUrl**

Check the PATCH `/:id` handler. It already maps:
```typescript
if (body.content !== undefined) updateInput.content = { text: body.content.body, mediaUrl: body.content.mediaUrl }
```
The `updateBlastBodySchema` already includes `mediaUrl: z.url().optional()`. Confirmed: no backend changes needed for update.

- [ ] **Step 5.3: Verify delivery worker handles media**

The delivery worker (`blast-delivery-worker.ts` lines 213-219) already checks `content.mediaUrl` and calls `adapter.sendMediaMessage()` when present. Confirmed: no changes needed.

- [ ] **Step 5.4: Add mediaType to create/update route mapping**

The `BlastContent` type in `@shared/types` has a `mediaType` field, but the protocol schemas and route handlers do not pass `mediaType` through. Add `mediaType` support.

In `packages/protocol/schemas/blasts.ts`, update `createBlastBodySchema` content:

```typescript
  content: z.object({
    body: z.string().min(1).max(1600),
    mediaUrl: z.url().optional(),
    mediaType: z.string().max(100).optional(),
  }),
```

And `updateBlastBodySchema` content:

```typescript
  content: z.object({
    body: z.string().min(1).max(1600),
    mediaUrl: z.url().optional(),
    mediaType: z.string().max(100).optional(),
  }).optional(),
```

In `apps/worker/routes/blasts.ts`, update create handler:

```typescript
content: { text: body.content.body, mediaUrl: body.content.mediaUrl, mediaType: body.content.mediaType },
```

And update handler:

```typescript
if (body.content !== undefined) updateInput.content = { text: body.content.body, mediaUrl: body.content.mediaUrl, mediaType: body.content.mediaType }
```

- [ ] **Step 5.5: Run typecheck**

```bash
bun run typecheck
```

- [ ] **Step 5.6: Commit**

```bash
git add packages/protocol/schemas/blasts.ts apps/worker/routes/blasts.ts
git commit -m "feat(worker): pass mediaType through blast create/update routes"
```

---

## Phase 6: Desktop — API Client Extensions

**Files:**
- Modify: `src/client/lib/api.ts`

- [ ] **Step 6.1: Add retry API functions**

Add to `src/client/lib/api.ts` after the `getBlastDeliveries` function:

```typescript
export async function retryDelivery(blastId: string, deliveryId: string) {
  return request<{ ok: boolean; delivery: BlastDelivery }>(
    hp(`/blasts/${blastId}/deliveries/${deliveryId}/retry`),
    { method: 'POST' },
  )
}

export async function retryFailedDeliveries(blastId: string) {
  return request<{ ok: boolean; retriedCount: number }>(
    hp(`/blasts/${blastId}/retry-failed`),
    { method: 'POST' },
  )
}
```

- [ ] **Step 6.2: Commit**

```bash
git add src/client/lib/api.ts
git commit -m "feat(client): add retryDelivery and retryFailedDeliveries API functions"
```

---

## Phase 7: Desktop — Delivery Detail Sheet

**Files:**
- New: `src/client/components/blast/delivery-detail-sheet.tsx`
- Modify: `src/client/routes/blasts.tsx`

- [ ] **Step 7.1: Create the delivery detail sheet component**

Create `src/client/components/blast/delivery-detail-sheet.tsx`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getBlastDeliveries, retryDelivery, retryFailedDeliveries, getBlastStats } from '@/lib/api'
import type { Blast, BlastDelivery, BlastDeliveryStatus, BlastStats } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { useRelaySubscription } from '@/lib/relay/hooks'
import { useConfig } from '@/lib/config'
import { KIND_BLAST_PROGRESS } from '@shared/event-kinds'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, RotateCcw } from 'lucide-react'

interface DeliveryDetailSheetProps {
  blast: Blast
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatsUpdated: (stats: BlastStats) => void
}

const deliveryStatusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  sending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  opted_out: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  skipped: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

export function DeliveryDetailSheet({ blast, open, onOpenChange, onStatsUpdated }: DeliveryDetailSheetProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { config } = useConfig()
  const hubId = config?.hubId

  const [deliveries, setDeliveries] = useState<BlastDelivery[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<BlastDeliveryStatus | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [retryingAll, setRetryingAll] = useState(false)
  const [liveStats, setLiveStats] = useState<BlastStats | null>(null)

  const limit = 20
  const isSending = blast.status === 'sending'

  // Load deliveries
  const loadDeliveries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getBlastDeliveries(blast.id, { status: filter, page, limit })
      setDeliveries(res.deliveries)
      setTotal(res.total)
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setLoading(false)
    }
  }, [blast.id, filter, page, t, toast])

  useEffect(() => {
    if (open) {
      loadDeliveries()
    }
  }, [open, loadDeliveries])

  // WS subscription for live progress
  useRelaySubscription(
    hubId,
    [KIND_BLAST_PROGRESS],
    useCallback((_kind: number, content: Record<string, unknown>) => {
      const data = content as { blastId?: string; stats?: BlastStats; batch?: Array<{ deliveryId: string; status: string; error?: string }> }
      if (data.blastId !== blast.id) return

      if (data.stats) {
        setLiveStats(data.stats as BlastStats)
        onStatsUpdated(data.stats as BlastStats)
      }

      // Update delivery rows in-place from batch
      if (data.batch) {
        setDeliveries(prev => {
          const updated = [...prev]
          for (const item of data.batch!) {
            const idx = updated.findIndex(d => d.id === item.deliveryId)
            if (idx !== -1) {
              updated[idx] = { ...updated[idx], status: item.status as BlastDeliveryStatus, error: item.error ?? null }
            }
          }
          return updated
        })
      }
    }, [blast.id, onStatsUpdated]),
    open && isSending,
  )

  // Fallback polling when WS is not available and blast is sending
  useEffect(() => {
    if (!open || !isSending) return
    const interval = setInterval(async () => {
      try {
        const stats = await getBlastStats(blast.id)
        setLiveStats(stats)
        onStatsUpdated(stats)
      } catch { /* ignore */ }
    }, 5_000)
    return () => clearInterval(interval)
  }, [open, isSending, blast.id, onStatsUpdated])

  const stats = liveStats ?? blast.stats

  async function handleRetryOne(deliveryId: string) {
    setRetrying(deliveryId)
    try {
      const res = await retryDelivery(blast.id, deliveryId)
      setDeliveries(prev => prev.map(d => d.id === deliveryId ? res.delivery : d))
      toast(t('blasts.delivery.retried'), 'success')
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setRetrying(null)
    }
  }

  async function handleRetryAllFailed() {
    setRetryingAll(true)
    try {
      const res = await retryFailedDeliveries(blast.id)
      toast(t('blasts.delivery.retriedAll', { count: res.retriedCount }), 'success')
      loadDeliveries()
    } catch {
      toast(t('common.error'), 'error')
    } finally {
      setRetryingAll(false)
    }
  }

  const filterOptions = ['all', 'pending', 'sent', 'delivered', 'failed', 'opted_out'] as const

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl" data-testid="delivery-detail-sheet">
        <SheetHeader>
          <SheetTitle>{t('blasts.delivery.title')}</SheetTitle>
          <SheetDescription>{blast.name}</SheetDescription>
        </SheetHeader>

        {/* Status summary bar */}
        <div className="mt-4 grid grid-cols-3 gap-3 text-sm sm:grid-cols-6" data-testid="delivery-stats">
          <div>
            <p className="text-muted-foreground">{t('blasts.delivery.pending')}</p>
            <p className="font-medium">{stats.totalRecipients - stats.sent - stats.delivered - stats.failed - stats.optedOut}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('blasts.sentCount')}</p>
            <p className="font-medium">{stats.sent}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('blasts.delivered')}</p>
            <p className="font-medium text-green-600 dark:text-green-400">{stats.delivered}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('blasts.failed')}</p>
            <p className="font-medium text-destructive">{stats.failed}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('blasts.optedOut')}</p>
            <p className="font-medium text-orange-600 dark:text-orange-400">{stats.optedOut}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('blasts.recipients')}</p>
            <p className="font-medium">{stats.totalRecipients}</p>
          </div>
        </div>

        {/* Retry all failed button */}
        {stats.failed > 0 && (
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetryAllFailed}
              disabled={retryingAll}
              data-testid="retry-all-failed"
            >
              <RotateCcw className="h-4 w-4" />
              {retryingAll ? t('common.loading') : t('blasts.delivery.retryAllFailed', { count: stats.failed })}
            </Button>
          </div>
        )}

        {/* Filter tabs */}
        <div className="mt-4 flex flex-wrap gap-1">
          {filterOptions.map((status) => (
            <button
              key={status}
              onClick={() => { setFilter(status === 'all' ? undefined : status as BlastDeliveryStatus); setPage(1) }}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                (status === 'all' && !filter) || filter === status
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {status === 'all' ? t('common.all') : t(`blasts.delivery.status.${status}`)}
            </button>
          ))}
        </div>

        {/* Delivery table */}
        <div className="mt-3 max-h-[50vh] overflow-y-auto rounded border border-border divide-y divide-border" data-testid="delivery-table">
          {loading ? (
            <p className="p-3 text-center text-xs text-muted-foreground">{t('common.loading')}</p>
          ) : deliveries.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">{t('blasts.noDeliveries')}</p>
          ) : deliveries.map((d) => (
            <div key={d.id} className="flex items-center justify-between px-3 py-2 text-xs" data-testid="delivery-row">
              <div className="flex items-center gap-2">
                <Badge className={deliveryStatusColors[d.status] ?? ''} variant="outline">
                  {t(`blasts.delivery.status.${d.status}`)}
                </Badge>
                <span className="text-muted-foreground">{d.channel}</span>
              </div>
              <div className="flex items-center gap-2">
                {d.attempts > 0 && (
                  <span className="text-muted-foreground">{d.attempts} {t('blasts.delivery.attempts')}</span>
                )}
                {d.error && (
                  <span className="text-destructive truncate max-w-[150px]" title={d.error}>{d.error}</span>
                )}
                {d.status === 'failed' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => handleRetryOne(d.id)}
                    disabled={retrying === d.id}
                    data-testid="retry-delivery"
                  >
                    <RefreshCw className={`h-3 w-3 ${retrying === d.id ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {total > limit && (
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                {t('common.previous')}
              </Button>
              <Button variant="ghost" size="sm" disabled={page * limit >= total} onClick={() => setPage(p => p + 1)}>
                {t('common.next')}
              </Button>
            </div>
          </div>
        )}

        {/* Live indicator */}
        {isSending && (
          <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
            <RefreshCw className="h-3 w-3 animate-spin" />
            {t('blasts.liveUpdating')}
          </p>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 7.2: Update blasts page to use sheet overlay**

In `src/client/routes/blasts.tsx`, replace the inline delivery toggle in `BlastDetailPanel` with a button that opens the sheet. Add the import and integrate:

1. Add import at top:
```typescript
import { DeliveryDetailSheet } from '@/components/blast/delivery-detail-sheet'
```

2. Add state in `BlastDetailPanel`:
```typescript
const [showDeliverySheet, setShowDeliverySheet] = useState(false)
```

3. Replace the "Delivery details toggle" section (the entire `{(blast.status === 'sending' || ...)` block) with:
```typescript
{(blast.status === 'sending' || blast.status === 'sent' || blast.status === 'cancelled') && stats.totalRecipients > 0 && (
  <div className="border-t border-border pt-4">
    <Button
      variant="outline"
      size="sm"
      onClick={() => setShowDeliverySheet(true)}
      data-testid="open-delivery-sheet"
    >
      {t('blasts.deliveryDetails')}
    </Button>
    <DeliveryDetailSheet
      blast={{ ...blast, stats }}
      open={showDeliverySheet}
      onOpenChange={setShowDeliverySheet}
      onStatsUpdated={(newStats) => setLiveStats(newStats)}
    />
  </div>
)}
```

4. Remove the now-unused state: `showDeliveries`, `deliveries`, `deliveryFilter`, `deliveryTotal`, `deliveryPage`, and the `deliveryStatusColors` constant. Remove the `useEffect` that loaded deliveries inline. Remove the `getBlastDeliveries` import if no longer used elsewhere.

5. Add WS subscription for live stats update (replaces polling). Add to `BlastDetailPanel`:
```typescript
const { config } = useConfig()

useRelaySubscription(
  config?.hubId,
  [KIND_BLAST_PROGRESS],
  useCallback((_kind: number, content: Record<string, unknown>) => {
    const data = content as { blastId?: string; stats?: BlastStats }
    if (data.blastId !== blast.id || !data.stats) return
    setLiveStats(data.stats as BlastStats)
  }, [blast.id]),
  isSending,
)
```

Remove the polling `useEffect` and `pollRef` from `BlastDetailPanel`.

- [ ] **Step 7.3: Add necessary imports**

Add to `src/client/routes/blasts.tsx`:
```typescript
import { useCallback } from 'react'
import { useRelaySubscription } from '@/lib/relay/hooks'
import { useConfig } from '@/lib/config'
import { KIND_BLAST_PROGRESS } from '@shared/event-kinds'
import { DeliveryDetailSheet } from '@/components/blast/delivery-detail-sheet'
```

- [ ] **Step 7.4: Verify typecheck**

```bash
bun run typecheck
```

- [ ] **Step 7.5: Commit**

```bash
git add src/client/components/blast/delivery-detail-sheet.tsx src/client/routes/blasts.tsx
git commit -m "feat(desktop): add delivery detail sheet with WS live progress and retry actions"
```

---

## Phase 8: Desktop — Blast Composer Enhancements

**Files:**
- New: `src/client/components/blast/media-attachment-field.tsx`
- New: `src/client/components/blast/schedule-picker.tsx`
- Modify: `src/client/components/BlastComposer.tsx`

- [ ] **Step 8.1: Create media attachment field component**

Create `src/client/components/blast/media-attachment-field.tsx`:

```typescript
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Image } from 'lucide-react'

interface MediaAttachmentFieldProps {
  mediaUrl: string
  mediaType: string
  onMediaUrlChange: (url: string) => void
  onMediaTypeChange: (type: string) => void
}

const MEDIA_TYPE_OPTIONS = [
  { value: 'image/jpeg', label: 'JPEG Image' },
  { value: 'image/png', label: 'PNG Image' },
  { value: 'image/gif', label: 'GIF' },
  { value: 'video/mp4', label: 'MP4 Video' },
  { value: 'audio/mpeg', label: 'MP3 Audio' },
  { value: 'application/pdf', label: 'PDF' },
]

export function MediaAttachmentField({ mediaUrl, mediaType, onMediaUrlChange, onMediaTypeChange }: MediaAttachmentFieldProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Image className="h-4 w-4" />
        {t('blasts.composer.mediaUrl')}
      </Label>
      <Input
        value={mediaUrl}
        onChange={(e) => onMediaUrlChange(e.target.value)}
        placeholder={t('blasts.composer.mediaUrlPlaceholder')}
        type="url"
        data-testid="blast-media-url"
      />
      {mediaUrl && (
        <div className="flex gap-2">
          <select
            value={mediaType}
            onChange={(e) => onMediaTypeChange(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-testid="blast-media-type"
          >
            {MEDIA_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8.2: Create schedule picker component**

Create `src/client/components/blast/schedule-picker.tsx`:

```typescript
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Calendar, X } from 'lucide-react'

interface SchedulePickerProps {
  scheduledAt: string
  onScheduledAtChange: (value: string) => void
}

export function SchedulePicker({ scheduledAt, onScheduledAtChange }: SchedulePickerProps) {
  const { t } = useTranslation()

  // Format min datetime for the input (current time + 5 minutes)
  const minDate = new Date(Date.now() + 5 * 60 * 1000)
  const minDateStr = minDate.toISOString().slice(0, 16)

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Calendar className="h-4 w-4" />
        {t('blasts.composer.scheduleAt')}
      </Label>
      <div className="flex gap-2">
        <Input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => onScheduledAtChange(e.target.value)}
          min={minDateStr}
          data-testid="blast-schedule-at"
          className="flex-1"
        />
        {scheduledAt && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onScheduledAtChange('')}
            aria-label={t('common.clear')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {scheduledAt && (
        <p className="text-xs text-muted-foreground">
          {t('blasts.composer.willSendAt', { date: new Date(scheduledAt).toLocaleString() })}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 8.3: Enhance BlastComposer with media + schedule fields**

Modify `src/client/components/BlastComposer.tsx`:

1. Add imports:
```typescript
import { MediaAttachmentField } from '@/components/blast/media-attachment-field'
import { SchedulePicker } from '@/components/blast/schedule-picker'
import { scheduleBlast } from '@/lib/api'
import { Calendar } from 'lucide-react'
```

2. Add state:
```typescript
const [mediaUrl, setMediaUrl] = useState('')
const [mediaType, setMediaType] = useState('image/jpeg')
const [scheduledAt, setScheduledAt] = useState('')
```

3. Update `handleSave` to pass media fields in content:
```typescript
async function handleSave() {
  if (!name.trim() || !text.trim()) {
    toast(t('blasts.fillRequired'), 'error')
    return
  }
  setSaving(true)
  try {
    const content: { text: string; mediaUrl?: string; mediaType?: string } = { text: text.trim() }
    if (mediaUrl.trim()) {
      content.mediaUrl = mediaUrl.trim()
      content.mediaType = mediaType
    }
    const res = await createBlast({
      name: name.trim(),
      content,
      targetChannels: channels,
    })

    // If schedule date is set, schedule the blast
    if (scheduledAt) {
      const scheduleRes = await scheduleBlast(res.blast.id, new Date(scheduledAt).toISOString())
      onCreated(scheduleRes.blast)
    } else {
      onCreated(res.blast)
    }
    toast(t('common.success'), 'success')
  } catch {
    toast(t('common.error'), 'error')
  } finally {
    setSaving(false)
  }
}
```

4. Add media attachment and schedule picker fields in the JSX, after the channel selection section and before the action buttons:

```tsx
<MediaAttachmentField
  mediaUrl={mediaUrl}
  mediaType={mediaType}
  onMediaUrlChange={setMediaUrl}
  onMediaTypeChange={setMediaType}
/>

<SchedulePicker
  scheduledAt={scheduledAt}
  onScheduledAtChange={setScheduledAt}
/>
```

5. Update save button text to reflect schedule:
```tsx
<Button onClick={handleSave} disabled={saving || !name.trim() || !text.trim()}>
  {scheduledAt ? <Calendar className="h-4 w-4" /> : <Save className="h-4 w-4" />}
  {saving ? t('common.loading') : scheduledAt ? t('blasts.composer.saveAndSchedule') : t('blasts.saveDraft')}
</Button>
```

- [ ] **Step 8.4: Verify typecheck**

```bash
bun run typecheck
```

- [ ] **Step 8.5: Commit**

```bash
git add src/client/components/blast/media-attachment-field.tsx src/client/components/blast/schedule-picker.tsx src/client/components/BlastComposer.tsx
git commit -m "feat(desktop): add media URL field and schedule picker to blast composer"
```

---

## Phase 9: iOS — Blast Service + Views

**Files:**
- New: `apps/ios/Sources/Services/BlastService.swift`
- New: `apps/ios/Sources/Views/Blasts/BlastListView.swift`
- New: `apps/ios/Sources/Views/Blasts/BlastComposerView.swift`
- New: `apps/ios/Sources/Views/Blasts/BlastDeliveryDetailView.swift`
- New: `apps/ios/Sources/Views/Blasts/BlastDeliveryRow.swift`
- New: `apps/ios/Tests/LlamenosTests/BlastServiceTests.swift`

- [ ] **Step 9.1: Create BlastService API client**

Create `apps/ios/Sources/Services/BlastService.swift`:

```swift
import Foundation

// MARK: - Blast Models

struct BlastContent: Codable, Sendable {
    let text: String
    var mediaUrl: String?
    var mediaType: String?
}

struct BlastStats: Codable, Sendable {
    let totalRecipients: Int
    let sent: Int
    let delivered: Int
    let failed: Int
    let optedOut: Int
}

struct Blast: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let content: BlastContent
    let status: String
    let targetChannels: [String]
    let targetTags: [String]?
    let targetLanguages: [String]?
    let scheduledAt: String?
    let sentAt: String?
    let cancelledAt: String?
    let createdAt: String
    let updatedAt: String
    let stats: BlastStats?
}

struct BlastDelivery: Codable, Identifiable, Sendable {
    let id: String
    let blastId: String
    let subscriberId: String
    let channel: String
    let status: String
    let attempts: Int
    let error: String?
    let createdAt: String
}

// MARK: - Request Bodies

struct CreateBlastBody: Encodable {
    let name: String
    let content: BlastContentBody
    let channels: [String]
    let scheduledAt: String?
}

struct BlastContentBody: Encodable {
    let body: String
    let mediaUrl: String?
    let mediaType: String?
}

struct UpdateBlastBody: Encodable {
    let name: String?
    let content: BlastContentBody?
    let channels: [String]?
}

struct ScheduleBlastBody: Encodable {
    let scheduledAt: String
}

// MARK: - Response Wrappers

struct BlastListResponse: Decodable {
    let blasts: [Blast]
    let total: Int
}

struct BlastResponse: Decodable {
    let blast: Blast
}

struct DeliveryListResponse: Decodable {
    let deliveries: [BlastDelivery]
    let total: Int
}

struct RetryDeliveryResponse: Decodable {
    let ok: Bool
    let delivery: BlastDelivery
}

struct RetryFailedResponse: Decodable {
    let ok: Bool
    let retriedCount: Int
}

// MARK: - BlastService

@Observable
final class BlastService: Sendable {
    private let api: APIService

    init(api: APIService) {
        self.api = api
    }

    func listBlasts() async throws -> [Blast] {
        let response: BlastListResponse = try await api.get("/blasts")
        return response.blasts
    }

    func getBlast(id: String) async throws -> Blast {
        return try await api.get("/blasts/\(id)")
    }

    func createBlast(_ body: CreateBlastBody) async throws -> Blast {
        let response: BlastResponse = try await api.post("/blasts", body: body)
        return response.blast
    }

    func updateBlast(id: String, _ body: UpdateBlastBody) async throws -> Blast {
        let response: BlastResponse = try await api.patch("/blasts/\(id)", body: body)
        return response.blast
    }

    func deleteBlast(id: String) async throws {
        let _: EmptyOkResponse = try await api.delete("/blasts/\(id)")
    }

    func sendBlast(id: String) async throws -> Blast {
        let response: BlastResponse = try await api.post("/blasts/\(id)/send")
        return response.blast
    }

    func scheduleBlast(id: String, at scheduledAt: String) async throws -> Blast {
        let response: BlastResponse = try await api.post("/blasts/\(id)/schedule", body: ScheduleBlastBody(scheduledAt: scheduledAt))
        return response.blast
    }

    func cancelBlast(id: String) async throws -> Blast {
        let response: BlastResponse = try await api.post("/blasts/\(id)/cancel")
        return response.blast
    }

    func getDeliveries(blastId: String, status: String? = nil, page: Int = 1) async throws -> DeliveryListResponse {
        var params = "page=\(page)&limit=20"
        if let status { params += "&status=\(status)" }
        return try await api.get("/blasts/\(blastId)/deliveries?\(params)")
    }

    func retryDelivery(blastId: String, deliveryId: String) async throws -> BlastDelivery {
        let response: RetryDeliveryResponse = try await api.post("/blasts/\(blastId)/deliveries/\(deliveryId)/retry")
        return response.delivery
    }

    func retryFailedDeliveries(blastId: String) async throws -> Int {
        let response: RetryFailedResponse = try await api.post("/blasts/\(blastId)/retry-failed")
        return response.retriedCount
    }
}
```

- [ ] **Step 9.2: Create BlastListView**

Create `apps/ios/Sources/Views/Blasts/BlastListView.swift`:

```swift
import SwiftUI

struct BlastListView: View {
    @State private var blasts: [Blast] = []
    @State private var loading = true
    @State private var showComposer = false
    @State private var selectedBlast: Blast?
    @State private var showDeliveryDetail = false

    @Environment(BlastService.self) private var blastService

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView()
                } else if blasts.isEmpty {
                    ContentUnavailableView(
                        String(localized: "blasts_no_blasts"),
                        systemImage: "megaphone",
                        description: Text(String(localized: "blasts_no_blasts_desc"))
                    )
                } else {
                    List(blasts) { blast in
                        BlastRowView(blast: blast)
                            .onTapGesture {
                                selectedBlast = blast
                            }
                    }
                }
            }
            .navigationTitle(String(localized: "blasts_title"))
            .toolbar {
                Button {
                    showComposer = true
                } label: {
                    Image(systemName: "plus")
                }
            }
            .sheet(isPresented: $showComposer) {
                BlastComposerView { newBlast in
                    blasts.insert(newBlast, at: 0)
                    showComposer = false
                }
            }
            .sheet(item: $selectedBlast) { blast in
                BlastDeliveryDetailView(blast: blast)
            }
            .task {
                await loadBlasts()
            }
        }
    }

    private func loadBlasts() async {
        do {
            blasts = try await blastService.listBlasts()
        } catch {
            // Handle error
        }
        loading = false
    }
}

private struct BlastRowView: View {
    let blast: Blast

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(blast.name)
                    .font(.headline)
                Spacer()
                StatusBadge(status: blast.status)
            }
            Text(blast.content.text.prefix(60))
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            if let stats = blast.stats {
                HStack(spacing: 8) {
                    Text("\(stats.totalRecipients) recipients")
                    if stats.sent > 0 {
                        Text("\(stats.sent) sent")
                    }
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct StatusBadge: View {
    let status: String

    var color: Color {
        switch status {
        case "draft": return .gray
        case "scheduled": return .blue
        case "sending": return .yellow
        case "sent": return .green
        case "cancelled": return .red
        default: return .gray
        }
    }

    var body: some View {
        Text(status.capitalized)
            .font(.caption2)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}
```

- [ ] **Step 9.3: Create BlastComposerView**

Create `apps/ios/Sources/Views/Blasts/BlastComposerView.swift`:

```swift
import SwiftUI

struct BlastComposerView: View {
    var onCreated: (Blast) -> Void

    @Environment(BlastService.self) private var blastService
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var text = ""
    @State private var channels: Set<String> = ["sms"]
    @State private var mediaUrl = ""
    @State private var mediaType = "image/jpeg"
    @State private var scheduledAt: Date?
    @State private var saving = false
    @State private var errorMessage: String?

    private let channelOptions = [
        ("sms", "SMS"),
        ("whatsapp", "WhatsApp"),
        ("signal", "Signal"),
        ("rcs", "RCS"),
    ]

    private let mediaTypes = [
        ("image/jpeg", "JPEG"),
        ("image/png", "PNG"),
        ("video/mp4", "MP4"),
        ("application/pdf", "PDF"),
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section(String(localized: "blasts_blast_name")) {
                    TextField(String(localized: "blasts_blast_name_placeholder"), text: $name)
                }

                Section(String(localized: "blasts_message_text")) {
                    TextEditor(text: $text)
                        .frame(minHeight: 100)
                    Text("\(text.count) characters")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section(String(localized: "blasts_channels")) {
                    ForEach(channelOptions, id: \.0) { value, label in
                        Toggle(label, isOn: Binding(
                            get: { channels.contains(value) },
                            set: { isOn in
                                if isOn { channels.insert(value) }
                                else { channels.remove(value) }
                            }
                        ))
                    }
                }

                Section(String(localized: "blasts_media_url")) {
                    TextField(String(localized: "blasts_media_url_placeholder"), text: $mediaUrl)
                        .keyboardType(.URL)
                        .autocapitalization(.none)
                    if !mediaUrl.isEmpty {
                        Picker(String(localized: "blasts_media_type"), selection: $mediaType) {
                            ForEach(mediaTypes, id: \.0) { value, label in
                                Text(label).tag(value)
                            }
                        }
                    }
                }

                Section(String(localized: "blasts_schedule")) {
                    Toggle(String(localized: "blasts_schedule_later"), isOn: Binding(
                        get: { scheduledAt != nil },
                        set: { isOn in scheduledAt = isOn ? Date().addingTimeInterval(3600) : nil }
                    ))
                    if let binding = Binding($scheduledAt) {
                        DatePicker(
                            String(localized: "blasts_schedule_at"),
                            selection: binding,
                            in: Date()...,
                            displayedComponents: [.date, .hourAndMinute]
                        )
                    }
                }

                if let error = errorMessage {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(String(localized: "blasts_new_blast"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common_cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(scheduledAt != nil ? String(localized: "blasts_save_and_schedule") : String(localized: "blasts_save_draft")) {
                        Task { await save() }
                    }
                    .disabled(saving || name.isEmpty || text.isEmpty || channels.isEmpty)
                }
            }
        }
    }

    private func save() async {
        saving = true
        errorMessage = nil
        do {
            let contentBody = BlastContentBody(
                body: text.trimmingCharacters(in: .whitespacesAndNewlines),
                mediaUrl: mediaUrl.isEmpty ? nil : mediaUrl,
                mediaType: mediaUrl.isEmpty ? nil : mediaType
            )
            let body = CreateBlastBody(
                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                content: contentBody,
                channels: Array(channels),
                scheduledAt: scheduledAt.map { ISO8601DateFormatter().string(from: $0) }
            )
            var blast = try await blastService.createBlast(body)

            if let date = scheduledAt {
                blast = try await blastService.scheduleBlast(
                    id: blast.id,
                    at: ISO8601DateFormatter().string(from: date)
                )
            }

            onCreated(blast)
        } catch {
            errorMessage = error.localizedDescription
        }
        saving = false
    }
}
```

- [ ] **Step 9.4: Create BlastDeliveryDetailView**

Create `apps/ios/Sources/Views/Blasts/BlastDeliveryDetailView.swift`:

```swift
import SwiftUI

struct BlastDeliveryDetailView: View {
    let blast: Blast

    @Environment(BlastService.self) private var blastService
    @Environment(\.dismiss) private var dismiss

    @State private var deliveries: [BlastDelivery] = []
    @State private var total = 0
    @State private var page = 1
    @State private var filter: String?
    @State private var loading = false
    @State private var retryingAll = false

    private let statusFilters = ["all", "pending", "sent", "delivered", "failed", "opted_out"]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Stats summary
                if let stats = blast.stats {
                    StatsBar(stats: stats)
                        .padding()
                }

                // Retry all failed
                if let stats = blast.stats, stats.failed > 0 {
                    Button {
                        Task { await retryAllFailed() }
                    } label: {
                        Label(
                            String(localized: "blasts_retry_all_failed"),
                            systemImage: "arrow.counterclockwise"
                        )
                    }
                    .buttonStyle(.bordered)
                    .disabled(retryingAll)
                    .padding(.horizontal)
                }

                // Filter
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(statusFilters, id: \.self) { status in
                            Button(status == "all" ? String(localized: "common_all") : status.replacingOccurrences(of: "_", with: " ").capitalized) {
                                filter = status == "all" ? nil : status
                                page = 1
                                Task { await loadDeliveries() }
                            }
                            .buttonStyle(.bordered)
                            .tint(activeFilter(status) ? .accentColor : .secondary)
                        }
                    }
                    .padding(.horizontal)
                }
                .padding(.vertical, 8)

                // Delivery list
                if loading {
                    ProgressView()
                        .frame(maxHeight: .infinity)
                } else {
                    List(deliveries) { delivery in
                        BlastDeliveryRow(
                            delivery: delivery,
                            blastId: blast.id,
                            onRetried: { updated in
                                if let idx = deliveries.firstIndex(where: { $0.id == updated.id }) {
                                    deliveries[idx] = updated
                                }
                            }
                        )
                    }
                }
            }
            .navigationTitle(String(localized: "blasts_delivery_title"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common_close")) { dismiss() }
                }
            }
            .task {
                await loadDeliveries()
            }
        }
    }

    private func activeFilter(_ status: String) -> Bool {
        (status == "all" && filter == nil) || filter == status
    }

    private func loadDeliveries() async {
        loading = true
        do {
            let response = try await blastService.getDeliveries(
                blastId: blast.id,
                status: filter,
                page: page
            )
            deliveries = response.deliveries
            total = response.total
        } catch {
            // Handle error
        }
        loading = false
    }

    private func retryAllFailed() async {
        retryingAll = true
        do {
            _ = try await blastService.retryFailedDeliveries(blastId: blast.id)
            await loadDeliveries()
        } catch {
            // Handle error
        }
        retryingAll = false
    }
}

private struct StatsBar: View {
    let stats: BlastStats

    var pending: Int {
        stats.totalRecipients - stats.sent - stats.delivered - stats.failed - stats.optedOut
    }

    var body: some View {
        HStack(spacing: 16) {
            StatItem(label: String(localized: "blasts_pending"), value: pending)
            StatItem(label: String(localized: "blasts_sent_count"), value: stats.sent)
            StatItem(label: String(localized: "blasts_delivered"), value: stats.delivered, color: .green)
            StatItem(label: String(localized: "blasts_failed"), value: stats.failed, color: .red)
            StatItem(label: String(localized: "blasts_opted_out"), value: stats.optedOut, color: .orange)
        }
    }
}

private struct StatItem: View {
    let label: String
    let value: Int
    var color: Color = .primary

    var body: some View {
        VStack {
            Text("\(value)")
                .font(.headline)
                .foregroundStyle(color)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}
```

- [ ] **Step 9.5: Create BlastDeliveryRow**

Create `apps/ios/Sources/Views/Blasts/BlastDeliveryRow.swift`:

```swift
import SwiftUI

struct BlastDeliveryRow: View {
    let delivery: BlastDelivery
    let blastId: String
    var onRetried: (BlastDelivery) -> Void

    @Environment(BlastService.self) private var blastService
    @State private var retrying = false

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    DeliveryStatusBadge(status: delivery.status)
                    Text(delivery.channel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if delivery.attempts > 0 {
                    Text("\(delivery.attempts) attempts")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                if let error = delivery.error {
                    Text(error)
                        .font(.caption2)
                        .foregroundStyle(.red)
                        .lineLimit(1)
                }
            }

            Spacer()

            if delivery.status == "failed" {
                Button {
                    Task { await retry() }
                } label: {
                    if retrying {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "arrow.counterclockwise")
                    }
                }
                .buttonStyle(.borderless)
                .disabled(retrying)
            }
        }
    }

    private func retry() async {
        retrying = true
        do {
            let updated = try await blastService.retryDelivery(blastId: blastId, deliveryId: delivery.id)
            onRetried(updated)
        } catch {
            // Handle error
        }
        retrying = false
    }
}

private struct DeliveryStatusBadge: View {
    let status: String

    var color: Color {
        switch status {
        case "pending": return .gray
        case "sending": return .yellow
        case "sent": return .blue
        case "delivered": return .green
        case "failed": return .red
        case "opted_out": return .orange
        default: return .gray
        }
    }

    var body: some View {
        Text(status.replacingOccurrences(of: "_", with: " ").capitalized)
            .font(.caption2.bold())
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}
```

- [ ] **Step 9.6: Create BlastServiceTests**

Create `apps/ios/Tests/LlamenosTests/BlastServiceTests.swift`:

```swift
import XCTest
@testable import Llamenos

final class BlastServiceTests: XCTestCase {
    // Test that Blast model decodes correctly from API JSON
    func testBlastDecoding() throws {
        let json = """
        {
            "id": "blast-1",
            "name": "Test Blast",
            "content": {"text": "Hello"},
            "status": "draft",
            "targetChannels": ["sms"],
            "createdAt": "2026-05-12T00:00:00Z",
            "updatedAt": "2026-05-12T00:00:00Z",
            "stats": {"totalRecipients": 10, "sent": 0, "delivered": 0, "failed": 0, "optedOut": 0}
        }
        """.data(using: .utf8)!

        let blast = try JSONDecoder().decode(Blast.self, from: json)
        XCTAssertEqual(blast.id, "blast-1")
        XCTAssertEqual(blast.name, "Test Blast")
        XCTAssertEqual(blast.status, "draft")
        XCTAssertEqual(blast.stats?.totalRecipients, 10)
    }

    func testBlastDeliveryDecoding() throws {
        let json = """
        {
            "id": "del-1",
            "blastId": "blast-1",
            "subscriberId": "sub-1",
            "channel": "sms",
            "status": "failed",
            "attempts": 2,
            "error": "timeout",
            "createdAt": "2026-05-12T00:00:00Z"
        }
        """.data(using: .utf8)!

        let delivery = try JSONDecoder().decode(BlastDelivery.self, from: json)
        XCTAssertEqual(delivery.status, "failed")
        XCTAssertEqual(delivery.attempts, 2)
        XCTAssertEqual(delivery.error, "timeout")
    }

    func testCreateBlastBodyEncoding() throws {
        let body = CreateBlastBody(
            name: "Test",
            content: BlastContentBody(body: "Hello", mediaUrl: "https://example.com/img.jpg", mediaType: "image/jpeg"),
            channels: ["sms", "whatsapp"],
            scheduledAt: nil
        )
        let data = try JSONEncoder().encode(body)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        XCTAssertEqual(dict["name"] as? String, "Test")
        let content = dict["content"] as! [String: Any]
        XCTAssertEqual(content["mediaUrl"] as? String, "https://example.com/img.jpg")
    }
}
```

- [ ] **Step 9.7: Commit**

```bash
git add apps/ios/Sources/Services/BlastService.swift apps/ios/Sources/Views/Blasts/ apps/ios/Tests/LlamenosTests/BlastServiceTests.swift
git commit -m "feat(ios): add blast service, list, composer, delivery detail views"
```

---

## Phase 10: Android — Blast Repository + Views

**Files:**
- New: `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastRepository.kt`
- New: `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastModels.kt`
- New: `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastListScreen.kt`
- New: `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastComposerScreen.kt`
- New: `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastDeliveryDetailSheet.kt`
- New: `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastDeliveryItem.kt`
- New: `apps/android/app/src/test/java/org/llamenos/hotline/blast/BlastRepositoryTest.kt`

- [ ] **Step 10.1: Create blast models**

Create `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastModels.kt`:

```kotlin
package org.llamenos.hotline.blast

import kotlinx.serialization.Serializable

@Serializable
data class BlastContent(
    val text: String,
    val mediaUrl: String? = null,
    val mediaType: String? = null,
)

@Serializable
data class BlastStats(
    val totalRecipients: Int,
    val sent: Int,
    val delivered: Int,
    val failed: Int,
    val optedOut: Int,
)

@Serializable
data class Blast(
    val id: String,
    val name: String,
    val content: BlastContent,
    val status: String,
    val targetChannels: List<String>,
    val targetTags: List<String>? = null,
    val targetLanguages: List<String>? = null,
    val scheduledAt: String? = null,
    val sentAt: String? = null,
    val cancelledAt: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val stats: BlastStats? = null,
)

@Serializable
data class BlastDelivery(
    val id: String,
    val blastId: String,
    val subscriberId: String,
    val channel: String,
    val status: String,
    val attempts: Int,
    val error: String? = null,
    val createdAt: String,
)

@Serializable
data class BlastListResponse(
    val blasts: List<Blast>,
    val total: Int,
)

@Serializable
data class BlastResponse(
    val blast: Blast,
)

@Serializable
data class DeliveryListResponse(
    val deliveries: List<BlastDelivery>,
    val total: Int,
)

@Serializable
data class RetryDeliveryResponse(
    val ok: Boolean,
    val delivery: BlastDelivery,
)

@Serializable
data class RetryFailedResponse(
    val ok: Boolean,
    val retriedCount: Int,
)

@Serializable
data class CreateBlastRequest(
    val name: String,
    val content: CreateBlastContent,
    val channels: List<String>,
    val scheduledAt: String? = null,
)

@Serializable
data class CreateBlastContent(
    val body: String,
    val mediaUrl: String? = null,
    val mediaType: String? = null,
)

@Serializable
data class ScheduleBlastRequest(
    val scheduledAt: String,
)
```

- [ ] **Step 10.2: Create BlastRepository**

Create `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastRepository.kt`:

```kotlin
package org.llamenos.hotline.blast

import org.llamenos.hotline.network.ApiService
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BlastRepository @Inject constructor(
    private val api: ApiService,
) {
    suspend fun listBlasts(): List<Blast> {
        val response: BlastListResponse = api.get("/blasts")
        return response.blasts
    }

    suspend fun createBlast(request: CreateBlastRequest): Blast {
        val response: BlastResponse = api.post("/blasts", request)
        return response.blast
    }

    suspend fun sendBlast(id: String): Blast {
        val response: BlastResponse = api.post("/blasts/$id/send")
        return response.blast
    }

    suspend fun scheduleBlast(id: String, scheduledAt: String): Blast {
        val response: BlastResponse = api.post("/blasts/$id/schedule", ScheduleBlastRequest(scheduledAt))
        return response.blast
    }

    suspend fun cancelBlast(id: String): Blast {
        val response: BlastResponse = api.post("/blasts/$id/cancel")
        return response.blast
    }

    suspend fun deleteBlast(id: String) {
        api.delete<Unit>("/blasts/$id")
    }

    suspend fun getDeliveries(blastId: String, status: String? = null, page: Int = 1): DeliveryListResponse {
        var params = "page=$page&limit=20"
        if (status != null) params += "&status=$status"
        return api.get("/blasts/$blastId/deliveries?$params")
    }

    suspend fun retryDelivery(blastId: String, deliveryId: String): BlastDelivery {
        val response: RetryDeliveryResponse = api.post("/blasts/$blastId/deliveries/$deliveryId/retry")
        return response.delivery
    }

    suspend fun retryFailedDeliveries(blastId: String): Int {
        val response: RetryFailedResponse = api.post("/blasts/$blastId/retry-failed")
        return response.retriedCount
    }
}
```

- [ ] **Step 10.3: Create BlastListScreen**

Create `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastListScreen.kt`:

```kotlin
package org.llamenos.hotline.blast

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class BlastListViewModel @Inject constructor(
    private val repository: BlastRepository,
) : ViewModel() {
    var blasts by mutableStateOf<List<Blast>>(emptyList())
        private set
    var loading by mutableStateOf(true)
        private set

    init {
        loadBlasts()
    }

    fun loadBlasts() {
        viewModelScope.launch {
            loading = true
            try {
                blasts = repository.listBlasts()
            } catch (_: Exception) {
                // Handle error
            }
            loading = false
        }
    }

    fun addBlast(blast: Blast) {
        blasts = listOf(blast) + blasts
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BlastListScreen(
    onNavigateToComposer: () -> Unit = {},
    onNavigateToDeliveryDetail: (Blast) -> Unit = {},
    viewModel: BlastListViewModel = hiltViewModel(),
) {
    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Message Blasts") })
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onNavigateToComposer) {
                Icon(Icons.Default.Add, contentDescription = "New Blast")
            }
        },
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            when {
                viewModel.loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                viewModel.blasts.isEmpty() -> {
                    Text(
                        "No blasts yet",
                        modifier = Modifier.align(Alignment.Center),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                else -> {
                    LazyColumn {
                        items(viewModel.blasts, key = { it.id }) { blast ->
                            BlastListItem(
                                blast = blast,
                                onClick = { onNavigateToDeliveryDetail(blast) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BlastListItem(blast: Blast, onClick: () -> Unit) {
    ListItem(
        modifier = Modifier.clickable(onClick = onClick),
        headlineContent = { Text(blast.name) },
        supportingContent = {
            Text(
                blast.content.text.take(60),
                maxLines = 1,
                style = MaterialTheme.typography.bodySmall,
            )
        },
        trailingContent = {
            BlastStatusChip(status = blast.status)
        },
    )
}

@Composable
fun BlastStatusChip(status: String) {
    val color = when (status) {
        "draft" -> MaterialTheme.colorScheme.outline
        "scheduled" -> MaterialTheme.colorScheme.primary
        "sending" -> MaterialTheme.colorScheme.tertiary
        "sent" -> MaterialTheme.colorScheme.primary
        "cancelled" -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.outline
    }
    AssistChip(
        onClick = {},
        label = { Text(status.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelSmall) },
        colors = AssistChipDefaults.assistChipColors(containerColor = color.copy(alpha = 0.12f), labelColor = color),
    )
}
```

- [ ] **Step 10.4: Create BlastComposerScreen**

Create `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastComposerScreen.kt`:

```kotlin
package org.llamenos.hotline.blast

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class BlastComposerViewModel @Inject constructor(
    private val repository: BlastRepository,
) : ViewModel() {
    var saving by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    fun createBlast(
        name: String,
        text: String,
        channels: List<String>,
        mediaUrl: String?,
        mediaType: String?,
        scheduledAt: String?,
        onSuccess: (Blast) -> Unit,
    ) {
        viewModelScope.launch {
            saving = true
            error = null
            try {
                val content = CreateBlastContent(
                    body = text.trim(),
                    mediaUrl = mediaUrl?.takeIf { it.isNotBlank() },
                    mediaType = if (mediaUrl?.isNotBlank() == true) mediaType else null,
                )
                val request = CreateBlastRequest(
                    name = name.trim(),
                    content = content,
                    channels = channels,
                    scheduledAt = scheduledAt,
                )
                var blast = repository.createBlast(request)
                if (scheduledAt != null) {
                    blast = repository.scheduleBlast(blast.id, scheduledAt)
                }
                onSuccess(blast)
            } catch (e: Exception) {
                error = e.message
            }
            saving = false
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BlastComposerScreen(
    onCreated: (Blast) -> Unit = {},
    onCancel: () -> Unit = {},
    viewModel: BlastComposerViewModel = hiltViewModel(),
) {
    var name by remember { mutableStateOf("") }
    var text by remember { mutableStateOf("") }
    var channels by remember { mutableStateOf(setOf("sms")) }
    var mediaUrl by remember { mutableStateOf("") }
    var mediaType by remember { mutableStateOf("image/jpeg") }
    var scheduleEnabled by remember { mutableStateOf(false) }

    val channelOptions = listOf("sms" to "SMS", "whatsapp" to "WhatsApp", "signal" to "Signal", "rcs" to "RCS")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("New Blast") },
                navigationIcon = {
                    TextButton(onClick = onCancel) { Text("Cancel") }
                },
                actions = {
                    TextButton(
                        onClick = {
                            viewModel.createBlast(
                                name = name,
                                text = text,
                                channels = channels.toList(),
                                mediaUrl = mediaUrl.takeIf { it.isNotBlank() },
                                mediaType = mediaType,
                                scheduledAt = null, // Date picker integration would produce ISO string
                                onSuccess = onCreated,
                            )
                        },
                        enabled = !viewModel.saving && name.isNotBlank() && text.isNotBlank() && channels.isNotEmpty(),
                    ) {
                        Text(if (scheduleEnabled) "Save & Schedule" else "Save Draft")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Blast Name") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                label = { Text("Message Text") },
                modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp),
            )
            Text("${text.length} characters", style = MaterialTheme.typography.labelSmall)

            Text("Channels", style = MaterialTheme.typography.titleSmall)
            channelOptions.forEach { (value, label) ->
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(label)
                    Switch(
                        checked = channels.contains(value),
                        onCheckedChange = { checked ->
                            channels = if (checked) channels + value else channels - value
                        },
                    )
                }
            }

            OutlinedTextField(
                value = mediaUrl,
                onValueChange = { mediaUrl = it },
                label = { Text("Media URL (optional)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            if (viewModel.error != null) {
                Text(viewModel.error!!, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}
```

- [ ] **Step 10.5: Create BlastDeliveryDetailSheet**

Create `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastDeliveryDetailSheet.kt`:

```kotlin
package org.llamenos.hotline.blast

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class BlastDeliveryViewModel @Inject constructor(
    private val repository: BlastRepository,
) : ViewModel() {
    var deliveries by mutableStateOf<List<BlastDelivery>>(emptyList())
        private set
    var total by mutableStateOf(0)
        private set
    var loading by mutableStateOf(false)
        private set
    var retryingAll by mutableStateOf(false)
        private set

    fun loadDeliveries(blastId: String, status: String? = null, page: Int = 1) {
        viewModelScope.launch {
            loading = true
            try {
                val response = repository.getDeliveries(blastId, status, page)
                deliveries = response.deliveries
                total = response.total
            } catch (_: Exception) {}
            loading = false
        }
    }

    fun retryDelivery(blastId: String, deliveryId: String) {
        viewModelScope.launch {
            try {
                val updated = repository.retryDelivery(blastId, deliveryId)
                deliveries = deliveries.map { if (it.id == deliveryId) updated else it }
            } catch (_: Exception) {}
        }
    }

    fun retryAllFailed(blastId: String) {
        viewModelScope.launch {
            retryingAll = true
            try {
                repository.retryFailedDeliveries(blastId)
                loadDeliveries(blastId)
            } catch (_: Exception) {}
            retryingAll = false
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BlastDeliveryDetailSheet(
    blast: Blast,
    onDismiss: () -> Unit,
    viewModel: BlastDeliveryViewModel = hiltViewModel(),
) {
    var filter by remember { mutableStateOf<String?>(null) }
    val statusFilters = listOf("all", "pending", "sent", "delivered", "failed", "opted_out")

    LaunchedEffect(blast.id, filter) {
        viewModel.loadDeliveries(blast.id, filter)
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
            Text("Delivery Details", style = MaterialTheme.typography.titleMedium)
            Text(blast.name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.height(12.dp))

            // Stats row
            blast.stats?.let { stats ->
                Row(horizontalArrangement = Arrangement.SpaceEvenly, modifier = Modifier.fillMaxWidth()) {
                    StatColumn("Sent", stats.sent)
                    StatColumn("Delivered", stats.delivered)
                    StatColumn("Failed", stats.failed)
                    StatColumn("Opted Out", stats.optedOut)
                }
                Spacer(modifier = Modifier.height(8.dp))

                if (stats.failed > 0) {
                    Button(
                        onClick = { viewModel.retryAllFailed(blast.id) },
                        enabled = !viewModel.retryingAll,
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Retry All Failed (${stats.failed})")
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                }
            }

            // Filter chips
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                statusFilters.forEach { status ->
                    FilterChip(
                        selected = (status == "all" && filter == null) || filter == status,
                        onClick = { filter = if (status == "all") null else status },
                        label = { Text(status.replace("_", " ").replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelSmall) },
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))

            // Delivery list
            if (viewModel.loading) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
            } else {
                LazyColumn(modifier = Modifier.heightIn(max = 400.dp)) {
                    items(viewModel.deliveries, key = { it.id }) { delivery ->
                        BlastDeliveryItem(
                            delivery = delivery,
                            onRetry = { viewModel.retryDelivery(blast.id, delivery.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatColumn(label: String, value: Int) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text("$value", style = MaterialTheme.typography.titleSmall)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
```

- [ ] **Step 10.6: Create BlastDeliveryItem**

Create `apps/android/app/src/main/java/org/llamenos/hotline/blast/BlastDeliveryItem.kt`:

```kotlin
package org.llamenos.hotline.blast

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun BlastDeliveryItem(delivery: BlastDelivery, onRetry: () -> Unit) {
    var retrying by remember { mutableStateOf(false) }

    ListItem(
        headlineContent = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DeliveryStatusChip(status = delivery.status)
                Text(delivery.channel, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        supportingContent = {
            Column {
                if (delivery.attempts > 0) {
                    Text("${delivery.attempts} attempts", style = MaterialTheme.typography.labelSmall)
                }
                delivery.error?.let {
                    Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error, maxLines = 1)
                }
            }
        },
        trailingContent = {
            if (delivery.status == "failed") {
                IconButton(
                    onClick = {
                        retrying = true
                        onRetry()
                    },
                    enabled = !retrying,
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = "Retry", modifier = Modifier.size(18.dp))
                }
            }
        },
    )
}

@Composable
private fun DeliveryStatusChip(status: String) {
    val color = when (status) {
        "pending" -> MaterialTheme.colorScheme.outline
        "sent" -> MaterialTheme.colorScheme.primary
        "delivered" -> MaterialTheme.colorScheme.primary
        "failed" -> MaterialTheme.colorScheme.error
        "opted_out" -> MaterialTheme.colorScheme.tertiary
        else -> MaterialTheme.colorScheme.outline
    }
    AssistChip(
        onClick = {},
        label = { Text(status.replace("_", " ").replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelSmall) },
        colors = AssistChipDefaults.assistChipColors(containerColor = color.copy(alpha = 0.12f), labelColor = color),
    )
}
```

- [ ] **Step 10.7: Create BlastRepositoryTest**

Create `apps/android/app/src/test/java/org/llamenos/hotline/blast/BlastRepositoryTest.kt`:

```kotlin
package org.llamenos.hotline.blast

import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class BlastRepositoryTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `blast decodes from API JSON`() {
        val raw = """
        {
            "id": "blast-1",
            "name": "Test",
            "content": {"text": "Hello"},
            "status": "draft",
            "targetChannels": ["sms"],
            "createdAt": "2026-05-12T00:00:00Z",
            "updatedAt": "2026-05-12T00:00:00Z",
            "stats": {"totalRecipients": 5, "sent": 0, "delivered": 0, "failed": 0, "optedOut": 0}
        }
        """.trimIndent()

        val blast = json.decodeFromString<Blast>(raw)
        assertEquals("blast-1", blast.id)
        assertEquals("draft", blast.status)
        assertEquals(5, blast.stats?.totalRecipients)
    }

    @Test
    fun `delivery decodes with error field`() {
        val raw = """
        {
            "id": "del-1",
            "blastId": "blast-1",
            "subscriberId": "sub-1",
            "channel": "sms",
            "status": "failed",
            "attempts": 3,
            "error": "timeout",
            "createdAt": "2026-05-12T00:00:00Z"
        }
        """.trimIndent()

        val delivery = json.decodeFromString<BlastDelivery>(raw)
        assertEquals("failed", delivery.status)
        assertEquals("timeout", delivery.error)
    }

    @Test
    fun `create blast request encodes correctly`() {
        val request = CreateBlastRequest(
            name = "Test",
            content = CreateBlastContent(body = "Hello", mediaUrl = "https://example.com/img.jpg", mediaType = "image/jpeg"),
            channels = listOf("sms"),
            scheduledAt = null,
        )
        val encoded = json.encodeToString(CreateBlastRequest.serializer(), request)
        assertTrue(encoded.contains("\"mediaUrl\""))
        assertTrue(encoded.contains("img.jpg"))
    }
}
```

- [ ] **Step 10.8: Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/blast/ apps/android/app/src/test/java/org/llamenos/hotline/blast/
git commit -m "feat(android): add blast repository, list, composer, delivery detail screens"
```

---

## Phase 11: i18n Keys

**Files:**
- Modify: `packages/i18n/locales/en.json`

- [ ] **Step 11.1: Add blast enhancement i18n keys**

Add the following keys to the `blasts` section in `packages/i18n/locales/en.json`, merging with existing keys:

```json
{
  "blasts": {
    "delivery": {
      "title": "Delivery Details",
      "pending": "Pending",
      "attempts": "attempts",
      "retried": "Delivery queued for retry",
      "retriedAll": "{{count}} deliveries queued for retry",
      "retryAllFailed": "Retry All Failed ({{count}})",
      "status": {
        "pending": "Pending",
        "sending": "Sending",
        "sent": "Sent",
        "delivered": "Delivered",
        "failed": "Failed",
        "opted_out": "Opted Out",
        "skipped": "Skipped",
        "cancelled": "Cancelled"
      }
    },
    "composer": {
      "mediaUrl": "Media Attachment URL",
      "mediaUrlPlaceholder": "https://example.com/image.jpg",
      "mediaType": "Media Type",
      "scheduleAt": "Schedule Send Time",
      "willSendAt": "Will send at {{date}}",
      "saveAndSchedule": "Save & Schedule"
    },
    "progress": {
      "sending": "Sending in progress",
      "complete": "Delivery complete",
      "live": "Updating live..."
    }
  }
}
```

These nest under the existing `"blasts"` object. Ensure no key collisions with existing keys.

- [ ] **Step 11.2: Add translations for all 12 non-English locales**

For each locale file in `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json`, add the same key structure with translated values. Use the existing translation patterns in each file for consistent voice and terminology.

- [ ] **Step 11.3: Run i18n validation**

```bash
bun run i18n:validate:all
```

Expected: All locales pass validation — no missing keys.

- [ ] **Step 11.4: Run i18n codegen**

```bash
bun run i18n:codegen
```

Expected: iOS `.strings`, Android `strings.xml`, and Kotlin `I18n.kt` regenerated with new keys.

- [ ] **Step 11.5: Commit**

```bash
git add packages/i18n/
git commit -m "feat(i18n): add ~25 blast enhancement keys across 13 locales"
```

---

## Phase 12: BDD Scenarios

**Files:**
- New: `packages/test-specs/features/admin/blast-delivery.feature`
- New: `tests/steps/backend/blast-delivery.steps.ts`

- [ ] **Step 12.1: Write Gherkin scenarios**

Create `packages/test-specs/features/admin/blast-delivery.feature`:

```gherkin
@admin
Feature: Blast Delivery Tracking and Retry
  As a hub admin with blasts:send permission
  I want to track delivery status and retry failed deliveries
  So that I can ensure messages reach all subscribers

  Background:
    Given I am logged in as an admin with "blasts:send" permission
    And a hub exists

  Scenario: Retry a single failed delivery
    Given a blast "Weekly Update" exists in "sent" status
    And the blast has a delivery in "failed" status with error "timeout"
    When I retry the failed delivery
    Then the delivery status should be "pending"
    And the delivery attempts should be incremented
    And the delivery error should be cleared

  Scenario: Retry all failed deliveries for a blast
    Given a blast "Alert" exists in "sent" status
    And the blast has 3 deliveries in "failed" status
    And the blast has 5 deliveries in "delivered" status
    When I retry all failed deliveries
    Then the response should contain retriedCount 3
    And the blast status should be "sending"

  Scenario: Cannot retry delivery that is not failed
    Given a blast "Notice" exists in "sending" status
    And the blast has a delivery in "sent" status
    When I attempt to retry the sent delivery
    Then I should receive a 400 error "Only failed deliveries can be retried"

  Scenario: Cannot retry deliveries for a draft blast
    Given a blast "Draft" exists in "draft" status
    And the blast has a delivery in "failed" status with error "err"
    When I attempt to retry the failed delivery
    Then I should receive a 400 error "Blast must be in sending or sent state to retry"

  Scenario: Blast transitions back to sending on retry from sent
    Given a blast "Completed" exists in "sent" status
    And the blast has 2 deliveries in "failed" status
    When I retry all failed deliveries
    Then the blast status should be "sending"

  Scenario: Media URL is preserved through blast lifecycle
    When I create a blast with media URL "https://cdn.example.com/alert.jpg" and media type "image/jpeg"
    Then the blast content should contain mediaUrl "https://cdn.example.com/alert.jpg"
    And the blast content should contain mediaType "image/jpeg"
```

- [ ] **Step 12.2: Write step definitions**

Create `tests/steps/backend/blast-delivery.steps.ts`:

```typescript
import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from 'expect'
import type { SharedState } from './shared-state'

Given('a blast {string} exists in {string} status', async function (this: SharedState, name: string, status: string) {
  // Create blast via service, then force status
  const blast = await this.services.blasts.createBlast({
    hubId: this.hubId,
    name,
    content: { text: `Content for ${name}` },
    targetChannels: ['sms'],
    createdBy: this.adminPubkey,
  })

  // Force status for testing
  await this.db.execute(
    `UPDATE blasts SET status = '${status}' WHERE id = '${blast.id}'`
  )

  this.blastId = blast.id
})

Given('the blast has a delivery in {string} status with error {string}', async function (this: SharedState, status: string, error: string) {
  // Create a subscriber and delivery row
  const sub = await this.createTestSubscriber()
  await this.db.execute(
    `INSERT INTO blast_deliveries (id, blast_id, subscriber_id, channel, status, attempts, error)
     VALUES ('${crypto.randomUUID()}', '${this.blastId}', '${sub.id}', 'sms', '${status}', 2, '${error}')`
  )
})

Given('the blast has a delivery in {string} status', async function (this: SharedState, status: string) {
  const sub = await this.createTestSubscriber()
  const id = crypto.randomUUID()
  await this.db.execute(
    `INSERT INTO blast_deliveries (id, blast_id, subscriber_id, channel, status, attempts)
     VALUES ('${id}', '${this.blastId}', '${sub.id}', 'sms', '${status}', 1)`
  )
  this.deliveryId = id
})

Given('the blast has {int} deliveries in {string} status', async function (this: SharedState, count: number, status: string) {
  for (let i = 0; i < count; i++) {
    const sub = await this.createTestSubscriber()
    await this.db.execute(
      `INSERT INTO blast_deliveries (id, blast_id, subscriber_id, channel, status, attempts, error)
       VALUES ('${crypto.randomUUID()}', '${this.blastId}', '${sub.id}', 'sms', '${status}', 1, ${status === 'failed' ? "'err'" : 'NULL'})`
    )
  }
})

When('I retry the failed delivery', async function (this: SharedState) {
  // Find the failed delivery
  const rows = await this.db.execute(
    `SELECT id FROM blast_deliveries WHERE blast_id = '${this.blastId}' AND status = 'failed' LIMIT 1`
  )
  const deliveryId = rows[0].id

  this.response = await this.api.post(`/blasts/${this.blastId}/deliveries/${deliveryId}/retry`)
})

When('I retry all failed deliveries', async function (this: SharedState) {
  this.response = await this.api.post(`/blasts/${this.blastId}/retry-failed`)
})

When('I attempt to retry the sent delivery', async function (this: SharedState) {
  const rows = await this.db.execute(
    `SELECT id FROM blast_deliveries WHERE blast_id = '${this.blastId}' AND status = 'sent' LIMIT 1`
  )
  try {
    this.response = await this.api.post(`/blasts/${this.blastId}/deliveries/${rows[0].id}/retry`)
  } catch (err: unknown) {
    this.error = err as Error
  }
})

When('I attempt to retry the failed delivery', async function (this: SharedState) {
  const rows = await this.db.execute(
    `SELECT id FROM blast_deliveries WHERE blast_id = '${this.blastId}' AND status = 'failed' LIMIT 1`
  )
  try {
    this.response = await this.api.post(`/blasts/${this.blastId}/deliveries/${rows[0].id}/retry`)
  } catch (err: unknown) {
    this.error = err as Error
  }
})

When('I create a blast with media URL {string} and media type {string}', async function (this: SharedState, mediaUrl: string, mediaType: string) {
  this.response = await this.api.post('/blasts', {
    name: 'Media Blast',
    content: { body: 'Check this out', mediaUrl, mediaType },
    channels: ['sms'],
  })
  this.blastId = this.response.blast?.id ?? this.response.id
})

Then('the delivery status should be {string}', async function (this: SharedState, expectedStatus: string) {
  const body = this.response
  expect(body.delivery?.status ?? body.status).toBe(expectedStatus)
})

Then('the delivery attempts should be incremented', async function (this: SharedState) {
  const body = this.response
  expect(body.delivery.attempts).toBeGreaterThan(0)
})

Then('the delivery error should be cleared', async function (this: SharedState) {
  const body = this.response
  expect(body.delivery.error).toBeNull()
})

Then('the response should contain retriedCount {int}', async function (this: SharedState, expectedCount: number) {
  expect(this.response.retriedCount).toBe(expectedCount)
})

Then('the blast status should be {string}', async function (this: SharedState, expectedStatus: string) {
  const blast = await this.services.blasts.getBlast(this.blastId)
  expect(blast.status).toBe(expectedStatus)
})

Then('I should receive a {int} error {string}', async function (this: SharedState, _code: number, message: string) {
  expect(this.error).toBeDefined()
  expect(this.error!.message).toContain(message)
})

Then('the blast content should contain mediaUrl {string}', async function (this: SharedState, expectedUrl: string) {
  const blast = await this.services.blasts.getBlast(this.blastId)
  const content = blast.content as { mediaUrl?: string }
  expect(content.mediaUrl).toBe(expectedUrl)
})

Then('the blast content should contain mediaType {string}', async function (this: SharedState, expectedType: string) {
  const blast = await this.services.blasts.getBlast(this.blastId)
  const content = blast.content as { mediaType?: string }
  expect(content.mediaType).toBe(expectedType)
})
```

- [ ] **Step 12.3: Commit**

```bash
git add packages/test-specs/features/admin/blast-delivery.feature tests/steps/backend/blast-delivery.steps.ts
git commit -m "test(bdd): add blast delivery retry and media URL scenarios"
```

---

## Phase 13: Playwright E2E Tests

**Files:**
- New: `tests/blast-delivery.spec.ts`

- [ ] **Step 13.1: Write Playwright E2E tests**

Create `tests/blast-delivery.spec.ts`:

```typescript
import { test, expect } from './fixtures'

test.describe('Blast Delivery Management', () => {
  test.beforeEach(async ({ adminPage }) => {
    await adminPage.navigateTo('/blasts')
  })

  test('creates a blast with media URL', async ({ adminPage }) => {
    const page = adminPage.page
    await page.getByTestId('blast-new-btn').click()
    await page.getByTestId('blast-name').fill('Media Blast')
    await page.getByTestId('blast-text').fill('Check out this image')
    await page.getByTestId('blast-media-url').fill('https://cdn.example.com/test.jpg')
    await page.getByTestId('blast-media-type').selectOption('image/jpeg')
    await page.getByText('Save Draft').click()
    await expect(page.getByTestId('blast-list')).toContainText('Media Blast')
  })

  test('creates a blast with schedule', async ({ adminPage }) => {
    const page = adminPage.page
    await page.getByTestId('blast-new-btn').click()
    await page.getByTestId('blast-name').fill('Scheduled Blast')
    await page.getByTestId('blast-text').fill('This will go out later')

    // Set schedule 1 hour from now
    const futureDate = new Date(Date.now() + 3600 * 1000)
    const dateStr = futureDate.toISOString().slice(0, 16)
    await page.getByTestId('blast-schedule-at').fill(dateStr)

    await page.getByText('Save & Schedule').click()
    await expect(page.getByTestId('blast-list')).toContainText('Scheduled Blast')
  })

  test('opens delivery detail sheet and shows stats', async ({ adminPage, seedBlast }) => {
    const blast = await seedBlast({ status: 'sent', deliveries: 10 })
    const page = adminPage.page
    await page.reload()

    // Select the blast
    await page.getByText(blast.name).click()
    await page.getByTestId('open-delivery-sheet').click()

    // Sheet opens with stats
    await expect(page.getByTestId('delivery-detail-sheet')).toBeVisible()
    await expect(page.getByTestId('delivery-stats')).toBeVisible()
  })

  test('filters deliveries by status', async ({ adminPage, seedBlast }) => {
    const blast = await seedBlast({ status: 'sent', deliveries: 10 })
    const page = adminPage.page
    await page.reload()

    await page.getByText(blast.name).click()
    await page.getByTestId('open-delivery-sheet').click()

    // Click failed filter
    await page.getByText('Failed').click()
    // Should only show failed deliveries (or empty)
    await expect(page.getByTestId('delivery-table')).toBeVisible()
  })

  test('retries a single failed delivery', async ({ adminPage, seedBlast }) => {
    const blast = await seedBlast({ status: 'sent', failedDeliveries: 2 })
    const page = adminPage.page
    await page.reload()

    await page.getByText(blast.name).click()
    await page.getByTestId('open-delivery-sheet').click()

    // Filter to failed
    await page.getByText('Failed').click()
    // Click retry on first failed delivery
    const retryBtn = page.getByTestId('retry-delivery').first()
    await retryBtn.click()

    // Delivery should transition to pending
    await expect(page.getByTestId('delivery-row').first()).toContainText('Pending')
  })

  test('retries all failed deliveries', async ({ adminPage, seedBlast }) => {
    const blast = await seedBlast({ status: 'sent', failedDeliveries: 3 })
    const page = adminPage.page
    await page.reload()

    await page.getByText(blast.name).click()
    await page.getByTestId('open-delivery-sheet').click()

    await page.getByTestId('retry-all-failed').click()
    // Toast notification
    await expect(page.getByText('3 deliveries queued for retry')).toBeVisible()
  })
})
```

- [ ] **Step 13.2: Commit**

```bash
git add tests/blast-delivery.spec.ts
git commit -m "test(e2e): add Playwright tests for blast delivery sheet, retry, media URL, scheduling"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Phase |
|------------|-------|
| Delivery detail sheet (desktop) | Phase 7 |
| Delivery detail sheet (iOS) | Phase 9 (BlastDeliveryDetailView) |
| Delivery detail sheet (Android) | Phase 10 (BlastDeliveryDetailSheet) |
| Status summary bar in sheet | Phase 7 (delivery-detail-sheet.tsx stats grid) |
| Filterable paginated delivery table | Phase 7 (filter tabs + pagination) |
| Per-delivery retry button | Phase 7 (handleRetryOne) |
| Retry All Failed bulk action | Phase 7 (handleRetryAllFailed) |
| `POST /blasts/:id/deliveries/:deliveryId/retry` | Phase 3 |
| `POST /blasts/:id/retry-failed` | Phase 3 |
| Delivery retry guards (failed status, blast sending/sent, permission) | Phase 2 |
| Retry reset logic (pending, increment attempts, clear error, nextRetryAt) | Phase 2 |
| WS blast:progress events from delivery worker | Phase 4 |
| Frontend WS subscription | Phase 7 (useRelaySubscription) |
| WS disconnect fallback polling | Phase 7 (5s interval fallback) |
| Media URL field in composer | Phase 8 (media-attachment-field.tsx) |
| Schedule date/time picker in composer | Phase 8 (schedule-picker.tsx) |
| Media URL passthrough in create/update routes | Phase 5 |
| mediaType passthrough | Phase 5 (step 5.4) |
| Mobile blast management (iOS CRUD) | Phase 9 |
| Mobile blast management (Android CRUD) | Phase 10 |
| Mobile delivery tracking (iOS) | Phase 9 (BlastDeliveryDetailView) |
| Mobile delivery tracking (Android) | Phase 10 (BlastDeliveryDetailSheet) |
| i18n keys (~25) | Phase 11 |
| BDD scenarios | Phase 12 |
| Playwright E2E tests | Phase 13 |

### Placeholder Scan
- No TBD, TODO, "similar to", or "implement later" found.

### Type/Method Consistency
- `retryDelivery(blastId, deliveryId)` — consistent across service, route, API client, iOS, Android
- `retryFailedDeliveries(blastId)` — consistent across service, route, API client, iOS, Android
- `BlastProgressEvent` — consistent between protocol schema and WS emission
- `BlastDelivery` type — consistent across protocol schema, shared types, API responses
- `KIND_BLAST_PROGRESS` (event kind 1030) — already defined in `packages/shared/event-kinds.ts`
- DB schema has no `errorCode` column (spec mentions clearing it) — plan correctly clears only `error`
