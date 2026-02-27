# Epic 119: Records Domain Consolidation — Unified Data Model

## Status: APPROVED

## Problem Statement

The codebase has three overlapping domain models for content records:

1. **Call Notes** (`RecordsDO`) — Per-call encrypted notes with custom fields, authored by volunteers
2. **Reports** (`ConversationDO`) — Two-way threads between reporters and volunteers/admins, web-only
3. **Conversations** (`ConversationDO`) — Two-way threads from external channels (SMS, WhatsApp, Signal, RCS)

These share significant code but diverge unnecessarily. Key problems:

- **350+ lines of duplicated code** across frontend (message decryption, bubble rendering, timestamps, encrypt+send) and backend (publish event helpers, access guards)
- **Reports are conversations with a type discriminator** (`metadata.type = 'report'`), but the `ConversationDO` doesn't actually filter on this type — **`listReports` currently returns ALL conversations, not just reports** (latent bug in `reports.ts:36` → `conversation-do.ts:132`)
- **ConversationDO is overloaded** with 6 concerns: conversations, reports, messages, files, subscribers, blasts, load counters
- **Custom fields declared for reports but never implemented** — `CustomFieldDefinition.context = 'reports'` exists but ReportForm doesn't render custom fields
- **Different envelope types for the same ECIES construction** — Notes use `authorEnvelope` + `adminEnvelopes[]`, messages use `readerEnvelopes[]` — the underlying crypto is identical but the type shapes diverge
- **Conversation storage won't scale** — Single `conversations` array will hit CF DO's 128KB per-key limit
- **Notes are single-author documents** — no way for admin/volunteer to discuss outcomes. Notes should be threaded like reports.

## Design Decisions (from review)

1. **Relabel "notes" as "call notes"** — all references to "notes" in UI, routes, and types become "call notes" to distinguish from the broader concept
2. **Threaded notes** — Call notes and conversation notes become threaded discussions (like reports). Initial entry has custom fields + text; admin/volunteer can reply with comments. Same E2EE envelope pattern.
3. **Custom fields per record type** — Each record type (call notes, conversation notes, reports) has its own configurable set of custom fields. Context enum expands: `'call-notes' | 'conversation-notes' | 'reports' | 'all'`
4. **Contact-level unified view** — All incoming communications (calls, SMS, WhatsApp, Signal, reports) for a specific contact (phone number) visible in one aggregated timeline
5. **Conversation notes reuse envelope shape from call notes** — same `RecipientEnvelope` pattern, same E2EE, different domain separation label context

## Goals

1. Fix the report-type filtering bug
2. Extract `ReportDetail` inline thread into reusable `ConversationThread` component
3. DRY shared utilities (formatTimestamp, formatRelativeTime, message decryption, publish event)
4. Split ConversationDO to extract blast/subscriber concerns into BlastDO
5. Migrate conversation storage to per-record keys
6. Prepare the foundation for threaded notes, expanded custom fields, and contact view (Epics 121-123)

## Non-Goals (This Epic)

- Changing the wire format or encryption labels (that's Epic 120)
- Implementing threaded notes (that's Epic 123)
- Adding new custom field contexts (that's Epic 121)
- Data migration (pre-production, so clean rewrite is fine)

## Implementation

### Phase 1: Fix Report Filtering Bug (CRITICAL)

**File: `src/worker/durable-objects/conversation-do.ts`**

The `listConversations` method at line ~132 filters on `status`, `assignedTo`, and `channel` but ignores `type`. The reports route passes `?type=report` but the DO never reads it.

```typescript
// Current: filters only status, assignedTo, channel
// Fix: add type filter
const typeFilter = url.searchParams.get('type')
let filtered = conversations
if (typeFilter === 'report') {
  filtered = filtered.filter(c => c.metadata?.type === 'report')
} else if (!typeFilter) {
  // Default conversation list excludes reports
  filtered = filtered.filter(c => c.metadata?.type !== 'report')
}
```

This is a one-line-category fix but has security implications — conversations could leak into the reports API and vice versa.

### Phase 2: Extract Shared Components

**2a. Reuse `ConversationThread` in `ReportDetail`**

Currently `src/client/routes/reports.tsx` has its own inline message thread (~100 lines). Replace with:

```tsx
// reports.tsx — ReportDetail
<ConversationThread
  conversationId={report.id}
  messages={messages}
  onSend={handleSendReply}
  canSend={canSendMessage}
/>
```

This requires making `ConversationThread` accept props for:
- `conversationId: string`
- `messages: EncryptedMessage[]`
- `onSend: (text: string) => Promise<void>`
- `canSend: boolean`

**Files changed:**
- `src/client/components/ConversationThread.tsx` — Make generic (accept props instead of fetching internally)
- `src/client/routes/reports.tsx` — Remove inline thread, use `ConversationThread`
- `src/client/routes/conversations.tsx` — Update to pass new props

**2b. Extract shared utilities**

Create `src/client/lib/format.ts`:
```typescript
export function formatTimestamp(iso: string): string { ... }
export function formatRelativeTime(iso: string): string { ... }
```

Create `src/client/lib/message-crypto.ts`:
```typescript
export async function decryptMessages(
  messages: EncryptedMessage[],
): Promise<Map<string, string>> { ... }
```

**2c. Extract server-side publish helper**

Create `src/worker/lib/nostr-events.ts`:
```typescript
export function publishEvent(env: Env, kind: number, content: unknown): void {
  const publisher = getNostrPublisher(env)
  publisher.publish({
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', 'global'], ['t', 'llamenos:event']],
    content: JSON.stringify(content),
  }).catch(() => {})
}
```

Replace `publishReportEvent` in `reports.ts` and `publishConversationEvent` in `conversations.ts`.

**2d. Extract report access guard**

The access check pattern is repeated 4 times in `reports.ts`. Extract:

```typescript
// src/worker/lib/report-access.ts
export function verifyReportAccess(
  conversation: Conversation,
  pubkey: string,
  permissions: string[],
): { allowed: boolean; reason?: string } { ... }
```

### Phase 3: Split ConversationDO → BlastDO

ConversationDO currently holds 6 concerns. Split into:

| New DO | Responsibility | Storage Keys |
|--------|---------------|--------------|
| **ConversationDO** (slimmed) | Conversations, reports, messages, files, load counters | `conv:*`, `messages:*`, `contact:*`, `external-id:*`, `file:*`, `load:*`, `volunteer-*` |
| **BlastDO** (new) | Subscribers, blasts, blast settings | `subscribers:*`, `subscriber-index:*`, `blasts:*`, `blast-active:*`, `blast-queue:*`, `blast-settings` |

**Files to create:**
- `src/worker/durable-objects/blast-do.ts`

**Files to modify:**
- `src/worker/durable-objects/conversation-do.ts` — Remove blast/subscriber code
- `src/worker/routes/blasts.ts` — Route to `BlastDO` instead of `ConversationDO`
- `wrangler.jsonc` — Add `BLAST_DO` binding
- `src/worker/index.ts` — Register new DO class

### Phase 4: Per-Record Storage for Conversations

The `conversations` single-array pattern won't scale. Migrate to per-record keys:

```
conv:${id}        → Conversation
conv:_index       → string[]  (ordered list of IDs)
conv:_counts      → { total, active, waiting, closed }
```

Also migrate file records:
```
file:${id}        → FileRecord
file:_index       → string[]
```

This matches the `note:${id}` pattern already used by RecordsDO.

### Phase 5: Relabel "Notes" → "Call Notes"

Update all user-facing strings, i18n keys, route labels, and component names:
- UI: "Notes" → "Call Notes" in navigation, headings, buttons
- i18n: Update all 13 locale files
- Component names: Where clarity is needed (e.g., `NewNoteForm` stays as-is internally since it will handle both call and conversation notes after Epic 123)

## Files Changed (Summary)

| File | Change |
|------|--------|
| `src/worker/durable-objects/conversation-do.ts` | Fix type filter, extract blasts, per-record keys |
| `src/worker/durable-objects/blast-do.ts` | **NEW** — blast/subscriber DO |
| `src/worker/routes/reports.ts` | Use shared access guard, shared publish helper |
| `src/worker/routes/conversations.ts` | Use shared publish helper |
| `src/worker/routes/blasts.ts` | Route to BlastDO |
| `src/worker/lib/nostr-events.ts` | **NEW** — shared publish helper |
| `src/worker/lib/report-access.ts` | **NEW** — shared access guard |
| `src/client/components/ConversationThread.tsx` | Make generic, accept props |
| `src/client/routes/reports.tsx` | Use ConversationThread, add custom fields |
| `src/client/routes/conversations.tsx` | Pass props to ConversationThread |
| `src/client/lib/format.ts` | **NEW** — shared formatTimestamp, formatRelativeTime |
| `src/client/lib/message-crypto.ts` | **NEW** — shared message decryption |
| `wrangler.jsonc` | Add BLAST_DO binding |
| `src/worker/index.ts` | Register BlastDO |
| `src/client/locales/*.json` | Relabel "notes" → "call notes" |

## Verification

1. `bun run typecheck` passes
2. `bun run build` passes
3. All existing E2E tests pass (notes, reports, conversations)
4. Reports list only returns reports (not conversations) — verified via test
5. Conversations list excludes reports — verified via test
6. Blast routes work against new BlastDO
7. No duplicate utility functions remain
8. UI shows "Call Notes" instead of "Notes"

## Risks

- **ConversationThread refactor** may break conversation-specific behavior if not carefully parameterized
- **BlastDO split** changes the DO topology — need to verify alarm routing still works
- **Per-record storage migration** changes the storage layout — must verify pagination still works
