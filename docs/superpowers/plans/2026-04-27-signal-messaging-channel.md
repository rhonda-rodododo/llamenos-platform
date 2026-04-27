# Signal Messaging Channel — Implementation Plan

**Date**: 2026-04-27
**Spec**: `docs/superpowers/specs/2026-04-27-signal-messaging-channel.md`
**Estimated Effort**: 3-4 days

## Phase 1: Receipt & Reaction Handling (Foundation)

These build on existing type definitions that are already in the webhook payload types but not handled.

### Step 1.1: Implement `parseStatusWebhook` on SignalAdapter

**Files**:
- `apps/worker/messaging/signal/adapter.ts` — add `parseStatusWebhook` method
- `apps/worker/messaging/signal/types.ts` — no changes needed (types already present)

**Work**:
- Add `parseStatusWebhook(request: Request): Promise<MessageStatusUpdate | null>` to `SignalAdapter`
- Clone the request body (can't consume twice — use a pre-parsed approach or clone)
- Detect `envelope.receiptMessage` presence
- Map `DELIVERY` -> `delivered`, `READ` -> `read`
- Return `null` if not a receipt (let router fall through to message parsing)
- Handle multi-timestamp receipts (return update for first; consider batch in future)

### Step 1.2: Implement reaction parsing in inbound messages

**Files**:
- `apps/worker/messaging/signal/adapter.ts` — extend `parseIncomingMessage`
- `apps/worker/messaging/adapter.ts` — add optional `reaction` field to `IncomingMessage`

**Work**:
- When `dataMessage.reaction` is present, set metadata fields: `{ reaction_emoji, reaction_target_timestamp, reaction_target_author }`
- Set `body` to undefined (reactions have no text body)
- `ConversationsService.handleIncoming` already stores metadata — reactions are stored as messages with reaction metadata

### Step 1.3: Add outbound reaction support

**Files**:
- `apps/worker/messaging/signal/adapter.ts` — add `sendReaction` method
- `apps/worker/messaging/signal/types.ts` — add `SignalReactionRequest` type

**Work**:
- `sendReaction(params: { recipientIdentifier: string, emoji: string, targetAuthor: string, targetTimestamp: number }): Promise<SendResult>`
- POST to `/v2/send` with `reaction` field instead of `message`
- This is a Signal-specific extension, not on the base interface

### Step 1.4: Typing indicator handling

**Files**:
- `apps/worker/messaging/signal/adapter.ts` — add `parseTypingWebhook` method
- `apps/worker/messaging/router.ts` — add typing indicator detection before message parsing
- `apps/worker/messaging/signal/types.ts` — types already present

**Work**:
- Detect `envelope.typingMessage` in webhook payload
- Publish ephemeral Nostr event (kind 20001) with `{ type: 'typing', conversationId, action: 'started'|'stopped' }`
- Need to look up conversationId by sender identifier (query conversations service)
- Return early from router (200 OK, no message storage)

## Phase 2: Registration & Provisioning

### Step 2.1: Registration service

**Files**:
- `apps/worker/messaging/signal/registration.ts` (new file)
- `apps/worker/messaging/signal/types.ts` — add registration-related types

**Work**:
- `registerNumber(bridgeUrl: string, apiKey: string, number: string, voice?: boolean): Promise<{ success: boolean, error?: string }>`
  - POST to `/v1/register/{number}` (with `?use_voice=true` if voice)
- `verifyNumber(bridgeUrl: string, apiKey: string, number: string, code: string): Promise<{ success: boolean, error?: string }>`
  - POST to `/v1/register/{number}/verify/{code}`
- `linkDevice(bridgeUrl: string, apiKey: string, deviceName: string): Promise<{ qrCodeUri: string } | { error: string }>`
  - GET `/v1/qrcodelink?device_name={name}`
- `unregisterNumber(bridgeUrl: string, apiKey: string, number: string): Promise<{ success: boolean }>`
  - POST `/v1/unregister/{number}`

### Step 2.2: Admin routes for Signal management

**Files**:
- `apps/worker/routes/settings.ts` — add Signal-specific endpoints (or new `apps/worker/routes/signal-admin.ts`)

**Work**:
- `POST /api/settings/signal/register` — initiate registration (admin-only)
- `POST /api/settings/signal/verify` — complete verification with code (admin-only)
- `POST /api/settings/signal/link-device` — get QR code URI for device linking (admin-only)
- `POST /api/settings/signal/unregister` — remove registration (admin-only)
- `GET /api/settings/signal/status` — bridge health + registration status (admin-only)
- All routes gated by admin permission check

### Step 2.3: Extend SignalConfig for multi-hub

**Files**:
- `packages/shared/types.ts` — extend `SignalConfig` with `trustMode`, `rateLimits`, `fallbackNumbers`

**Work**:
- Add optional fields to `SignalConfig`:
  ```typescript
  trustMode?: 'auto' | 'tofu' | 'manual'
  rateLimits?: { messagesPerMinute: number; messagesPerHour: number; burstLimit: number }
  fallbackNumbers?: string[]
  ```
- Keep backward-compatible (all new fields optional with sensible defaults)

## Phase 3: Retry Logic & Rate Limiting

### Step 3.1: Outbound message retry queue

**Files**:
- `apps/worker/messaging/signal/retry.ts` (new file)
- `apps/worker/db/schema/` — add `signal_retry_queue` table (or extend existing message status tracking)

**Work**:
- Schema: `id, hub_id, conversation_id, message_id, recipient, payload_encrypted, attempt_count, next_retry_at, status (pending|retrying|dead_letter), last_error, created_at`
- `enqueueRetry(message, attempt)` — calculate next retry time (5s, 30s, 2m, 10m, 30m)
- `processRetryQueue()` — poll for due retries, attempt send, update status
- `classifyError(error: string): 'transient' | 'permanent'` — determine retry eligibility
- Integrate into `SignalAdapter.sendMessage` failure path

### Step 3.2: Rate limiter

**Files**:
- `apps/worker/messaging/signal/rate-limiter.ts` (new file)

**Work**:
- Token bucket implementation per registered number
- `canSend(number: string): boolean` — check if within rate limits
- `recordSend(number: string): void` — consume a token
- `handleRateLimit(number: string, retryAfter?: number): void` — pause sends for duration
- In-memory state with periodic persistence to DB (survive restarts)
- Integrate as a guard before `fetch` calls in adapter

### Step 3.3: Dead letter management

**Files**:
- `apps/worker/routes/signal-admin.ts` — add dead letter endpoints
- `apps/worker/messaging/signal/retry.ts` — add dead letter queries

**Work**:
- `GET /api/settings/signal/dead-letters` — list dead letter messages (admin-only)
- `POST /api/settings/signal/dead-letters/:id/retry` — manually retry a dead letter
- `DELETE /api/settings/signal/dead-letters/:id` — dismiss a dead letter

## Phase 4: Identity Trust Management

### Step 4.1: Trust decision storage and service

**Files**:
- `apps/worker/db/schema/` — add `signal_trust_decisions` table
- `apps/worker/messaging/signal/trust.ts` (new file)

**Work**:
- Schema: `id, hub_id, contact_identifier, old_identity_key, new_identity_key, status (pending|trusted|blocked), decided_by, decided_at, created_at`
- `handleIdentityChange(hubId, contact, newKey)` — based on trust mode:
  - `auto`: immediately call trust API on bridge
  - `tofu`: check if first contact; if yes auto-trust, if change queue for admin
  - `manual`: always queue for admin
- `resolveTrustDecision(id, decision, adminPubkey)` — admin approves or blocks

### Step 4.2: Trust webhook parsing

**Files**:
- `apps/worker/messaging/signal/adapter.ts` — detect identity key change events

**Work**:
- signal-cli-rest-api may not emit a specific webhook for identity changes; it may refuse to send/receive until trusted
- Alternative: detect "identity key changed" errors on send failures, trigger trust flow
- Periodically poll `GET /v1/identities/{number}` to detect new/changed identities

### Step 4.3: Trust admin routes

**Files**:
- `apps/worker/routes/signal-admin.ts` — add trust endpoints

**Work**:
- `GET /api/settings/signal/trust-decisions` — list pending trust decisions
- `POST /api/settings/signal/trust-decisions/:id` — approve or deny trust
- `GET /api/settings/signal/identities` — list known identities from bridge

## Phase 5: Number Failover

### Step 5.1: Failover logic in adapter

**Files**:
- `apps/worker/messaging/signal/adapter.ts` — wrap sends with failover
- `apps/worker/messaging/signal/failover.ts` (new file)

**Work**:
- Track consecutive failures per number
- When threshold exceeded (5 consecutive or extended 429), switch to first available fallback
- `getActiveNumber(config: SignalConfig): string` — returns primary or current failover
- Generate admin alert on failover (audit log + push notification)
- Store failover state in DB so it survives restarts

### Step 5.2: Failover admin routes

**Files**:
- `apps/worker/routes/signal-admin.ts` — add failover management

**Work**:
- `GET /api/settings/signal/numbers` — list all numbers with status (primary, fallback, active, banned)
- `POST /api/settings/signal/numbers/switch` — manually switch active number
- `POST /api/settings/signal/numbers/add` — register additional fallback number (triggers registration flow)

## Phase 6: Admin UI (Desktop)

### Step 6.1: Signal settings panel

**Files**:
- `src/client/routes/settings/` — add Signal configuration section
- `src/client/components/settings/` — Signal-specific components

**Work**:
- Registration flow UI (phone input, verify code, QR code display for linking)
- Connection status indicator (uses existing health check)
- Trust mode selector
- Rate limit configuration fields
- Fallback number list management

### Step 6.2: Trust decisions UI

**Files**:
- `src/client/components/settings/` — trust decision components

**Work**:
- Table of pending trust decisions with safety number display
- Approve/deny buttons
- History of past decisions

### Step 6.3: Dead letter queue UI

**Files**:
- `src/client/components/settings/` — dead letter components

**Work**:
- Table of dead letter messages (recipient, error, timestamp, attempt count)
- Retry and dismiss actions
- Bulk operations (retry all, dismiss all)

## Phase 7: Integration Testing

### Step 7.1: BDD feature files

**Files**:
- `packages/test-specs/features/messaging/signal-registration.feature`
- `packages/test-specs/features/messaging/signal-receipts.feature`
- `packages/test-specs/features/messaging/signal-retry.feature`

**Work**:
- Registration/verification happy path and failure scenarios
- Receipt status updates flow through to conversation state
- Retry queue behavior (transient vs permanent failures, dead letter)
- Rate limiting behavior
- Failover triggering

### Step 7.2: Unit tests for new modules

**Files**:
- `apps/worker/messaging/signal/retry.test.ts`
- `apps/worker/messaging/signal/rate-limiter.test.ts`
- `apps/worker/messaging/signal/trust.test.ts`

**Work**:
- Token bucket correctness
- Exponential backoff timing
- Error classification (transient vs permanent)
- Trust mode decision logic

## Ordering & Dependencies

```
Phase 1 (Receipts/Reactions/Typing) — no dependencies, builds on existing code
  |
Phase 2 (Registration) — independent of Phase 1 but shares types
  |
Phase 3 (Retry/Rate Limiting) — depends on Phase 2 for multi-number awareness
  |
Phase 4 (Trust Management) — depends on Phase 2 for registration context
  |
Phase 5 (Failover) — depends on Phase 3 (rate limiter) + Phase 2 (multi-number)
  |
Phase 6 (Admin UI) — depends on all backend phases for routes to consume
  |
Phase 7 (Testing) — can start with Phase 1, grow with each phase
```

Phases 1 and 2 can run in parallel. Phases 3 and 4 can run in parallel after Phase 2. Phase 5 depends on both 3 and 4. Phase 6 can start after Phase 2 for registration UI, expanding as backend phases complete.

## Verification Criteria

- [ ] `parseStatusWebhook` correctly maps Signal delivery/read receipts to message status updates
- [ ] Reactions appear as annotated messages in conversations
- [ ] Typing indicators reach connected clients via Nostr ephemeral events
- [ ] Registration flow works end-to-end (register -> verify -> send/receive)
- [ ] Device linking flow produces working QR code and completes linking
- [ ] Failed sends are retried with exponential backoff
- [ ] Dead letters are visible to admins and retryable
- [ ] Rate limiter prevents exceeding configured thresholds
- [ ] Trust mode correctly handles identity key changes per setting
- [ ] Failover triggers on persistent errors and routes to fallback number
- [ ] Admin UI surfaces all configuration, status, and decision points
- [ ] All new code has type-safe interfaces (no `any`)
- [ ] BDD scenarios pass for all critical paths
