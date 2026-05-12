---
epic: EP05
title: Messaging Channels & Blast System
status: specced
depends-on: [EP01]
phase: 3
---

# Spec: EP05 — Messaging Channels & Blast System

**Date:** 2026-05-11 (specced 2026-05-12)
**Status:** Specced

---

## Goal

Complete the messaging channel configuration UI across all platforms (desktop + iOS + Android), harden the blast/broadcast system with delivery tracking, retry, media attachments, real-time progress, and scheduling UX. Build a dynamic channel config registry on the frontend that mirrors the backend's adapter architecture, making it straightforward to add new channels in the future.

EP05 depends on EP01 (permission system) for permission guards on all routes and UI.

---

## Architecture Decisions

### 1. Channel Config Registry Pattern

The backend has a `MessagingAdapter` interface with per-channel adapter implementations and a factory. The frontend mirrors this with a **channel config registry** — a mapping from `MessagingChannelType` to component metadata:

```typescript
interface ChannelConfigEntry {
  component: React.ComponentType<ChannelConfigProps>
  label: string                    // from CHANNEL_LABELS
  icon: LucideIcon
  security: TransportSecurity      // from CHANNEL_SECURITY
  hasA2pApproval: boolean          // true for SMS (Twilio)
  requiresTelephonyProvider: boolean  // true for SMS
}

const channelConfigRegistry: Record<MessagingChannelType, ChannelConfigEntry>
```

The admin settings page iterates the registry and renders each channel's component dynamically. Adding a future channel = one new component file + one registry entry. No changes to the settings page itself.

Each channel keeps its own focused component because channels have meaningfully different workflows (Signal has registration/linking, SMS has A2P approval, WhatsApp has integration mode toggle). Shared primitives are extracted for the common patterns.

iOS and Android implement the same registry concept natively — a channel list screen that dispatches to per-channel config views.

### 2. Shared Channel Config Primitives

Extracted from existing Signal/RCS sections into reusable components:

- **`ChannelStatusBanner`** — enabled/disabled state, A2P approval status badge, transport security level badge
- **`ConnectionTestButton`** — async test via `testMessagingChannel(channel)` with success/failure badge display
- **`AutoResponseFields`** — autoResponse + afterHoursResponse textareas (every channel has these fields)
- **`A2pRegistrationPanel`** — brand + campaign submission forms, status polling, re-submit on failure. Shared between hub onboarding wizard and channel config settings page.

### 3. SMS Reuses Telephony Provider Credentials

The SMS adapter factory (`apps/worker/messaging/sms/factory.ts`) reuses the telephony provider's credentials — there are no separate SMS API keys. The SMS channel section shows the current telephony provider as read-only context and configures SMS-specific settings:

- `enabled` toggle
- `smsContentMode` ('full' | 'notification-only')
- Auto-response / after-hours response messages
- A2P registration status and management (brand + campaign)
- Connection test

### 4. A2P Registration in Settings (Not Just Onboarding)

The A2P 10DLC registration workflow (brand submission → approval → campaign submission → approval) already exists in the hub onboarding flow via `A2pRegistrationService`. EP05 surfaces this in the SMS channel config section so admins can:

- View current A2P status (not_submitted / pending / approved / failed / skipped)
- Submit or re-submit brand and campaign registrations
- Poll for status updates
- Handle failures (re-submit with corrected information)

The `A2pRegistrationPanel` component is shared between the onboarding wizard and the settings page. The existing hub-scoped A2P routes (`POST /api/hubs/:hubId/onboard/a2p/brand`, `POST /api/hubs/:hubId/onboard/a2p/campaign`, `GET /api/hubs/:hubId/onboard/a2p/status`) are already callable from any authenticated hub admin context — no new backend endpoints needed. The frontend panel calls these same routes regardless of whether it's mounted in the onboarding wizard or the settings page.

New Twilio voice approval requirements follow the same pattern — brand/campaign approval is a prerequisite for both SMS and voice. The A2P panel covers both use cases.

### 5. Real-Time Blast Progress via WebSocket

The blast delivery worker processes deliveries in batches of 50. After each batch, it emits a WebSocket event to hub subscribers:

```typescript
{
  type: 'blast:progress',
  blastId: string,
  stats: { pending: number, sent: number, delivered: number, failed: number, total: number },
  updatedDeliveries: Array<{ deliveryId: string, status: string, error?: string }>
}
```

The delivery detail view (desktop and mobile) subscribes to these events and updates the UI live. On WS disconnect, falls back to polling `GET /blasts/:id/stats` at 5-second intervals.

### 6. Delivery Tracking as Sheet Overlay

The delivery detail view opens as a sheet/dialog from the blast list, keeping the list visible behind it. Contains:

- Status summary bar with counts (pending/sent/delivered/failed/opted_out)
- Filterable, paginated delivery table (filter by status + channel)
- Per-delivery retry button for failed items
- "Retry All Failed" bulk action
- Real-time updates via WS

On mobile: bottom sheet with the same content adapted to native list/filter patterns.

### 7. Mobile Gets Full Hub Admin Capability

Hub admins must be able to set up everything from only their phones. Mobile (iOS + Android) gets:

- **Full channel configuration** — all 5 messaging channels with the same functionality as desktop
- **A2P registration management** — submit, check status, re-submit from mobile
- **Full blast CRUD** — create, edit, send, schedule, cancel, delete
- **Delivery tracking** — status summary, delivery list, retry actions
- **Real-time WS progress** — same as desktop

Only platform-level / super-admin settings (provider templates, cross-hub quotas) are desktop-only.

### 8. Media Attachments in Blasts

The backend `BlastContent` type already has `mediaUrl` and `mediaType` fields. The delivery worker already calls `adapter.sendMediaMessage()` when `mediaUrl` is present. EP05 adds a media URL input field to the blast composer UI. No backend changes needed beyond ensuring the create/update routes pass `mediaUrl` through.

### 9. No Data Export

CSV/PDF/file export of subscriber data is permanently out of scope — exporting decrypted data to files creates data leakage vectors. Subscriber data stays within the app's controlled rendering context. This is a security constraint, not a deferral.

---

## Current State

### Backend (Largely Complete)

| Component | File | Status |
|-----------|------|--------|
| `MessagingAdapter` interface | `apps/worker/messaging/adapter.ts` | Complete |
| SMS adapters (Twilio, SignalWire, Vonage, Plivo, Asterisk) | `apps/worker/messaging/sms/` | Complete (5 adapters + factory) |
| Signal adapter | `apps/worker/messaging/signal/` | Complete |
| WhatsApp adapter | `apps/worker/messaging/whatsapp/` | Complete |
| Telegram adapter | `apps/worker/messaging/telegram/` | Complete |
| RCS adapter | `apps/worker/messaging/rcs/` | Complete |
| `BlastsService` | `apps/worker/services/blasts.ts` | Complete |
| Blast DB schema | `apps/worker/db/schema/blasts.ts` | Complete |
| Blast routes | `apps/worker/routes/blasts.ts` | Complete (CRUD, send, schedule, cancel, stats, deliveries) |
| Blast delivery worker | `apps/worker/lib/blast-delivery-worker.ts` | Complete |
| Scheduled blast poller | `apps/worker/lib/blast-scheduled-poller.ts` | Complete |
| Messaging config routes | `apps/worker/routes/settings.ts` | Complete (GET/PATCH /settings/messaging) |
| `A2pRegistrationService` | `apps/worker/services/provider-setup/a2p-registration.ts` | Complete |
| Hub onboarding routes | `apps/worker/routes/hub-onboard.ts` | Complete |
| Blast Zod schemas | `packages/protocol/schemas/blasts.ts` | Complete |
| Messaging config schema | `packages/protocol/schemas/settings.ts` | Complete |
| Permission catalog | Backend middleware | Complete (`blasts:read/send/manage/schedule`, `settings:manage-messaging`) |

### Frontend (Partial)

| Component | File | Status |
|-----------|------|--------|
| Blasts page | `src/client/routes/blasts.tsx` | Working: list, create, send, cancel, delete, basic delivery stats |
| Blast composer | `src/client/components/BlastComposer.tsx` | Working: name, text, channel selection |
| Subscriber manager | `src/client/components/SubscriberManager.tsx` | Working: list, remove, CSV import, stats |
| Blast settings panel | `src/client/components/BlastSettingsPanel.tsx` | Working: opt-in keywords, double opt-in toggle, rate limits |
| Signal channel section | `src/client/components/admin-settings/signal-channel-section.tsx` | Complete |
| RCS channel section | `src/client/components/admin-settings/rcs-channel-section.tsx` | Complete |
| SMS channel section | — | **Missing** |
| WhatsApp channel section | — | **Missing** |
| Telegram channel section | — | **Missing** |
| Delivery detail view | — | **Missing** (basic stats inline in blasts page) |

### Mobile (Not Started)

No messaging channel config or blast UI exists on iOS or Android.

### Shared Types

`packages/shared/types.ts` already defines per-channel config interfaces:
- `SMSConfig` — enabled, autoResponse, afterHoursResponse
- `WhatsAppConfig` — integrationMode, phoneNumberId, businessAccountId, accessToken, verifyToken, appSecret, autoResponse, afterHoursResponse
- `SignalConfig` — bridgeUrl, bridgeApiKey, webhookSecret, registeredNumber, trustMode, autoResponse, afterHoursResponse
- `RCSConfig` — agentId, serviceAccountKey, webhookSecret, fallbackToSms, autoResponse, afterHoursResponse
- `TelegramConfig` — enabled, botToken, webhookSecret, botUsername, autoResponse, afterHoursResponse
- `MessagingConfig` — top-level container with `enabledChannels`, per-channel config objects, and general settings

---

## What EP05 Builds

### Must Build (No v2 Equivalent)

| Item | Description |
|------|-------------|
| Channel config registry | Dynamic frontend registry mapping channel types to config components |
| Shared channel primitives | `ChannelStatusBanner`, `ConnectionTestButton`, `AutoResponseFields`, `A2pRegistrationPanel` |
| SMS channel section | Desktop + iOS + Android — enable/disable, content mode, A2P management, connection test |
| WhatsApp channel section | Desktop + iOS + Android — integration mode toggle, credentials (direct mode), connection test |
| Telegram channel section | Desktop + iOS + Android — bot token, webhook, connection test |
| Delivery detail view | Desktop + iOS + Android — sheet with status summary, filterable delivery table, retry actions |
| Delivery retry | Backend endpoint + UI for per-delivery and bulk retry of failed deliveries |
| WS blast progress | Backend emits progress events, frontend subscribes for live updates |
| Mobile blast management | iOS + Android — full blast CRUD, composer, delivery tracking |
| Mobile channel config | iOS + Android — all 5 channel config sections |

### Must Enhance (Exists But Incomplete)

| Item | Current State | Target |
|------|---------------|--------|
| Blast composer | Name + text + channels | Add media URL field + inline schedule date/time picker |
| Blast delivery stats | Basic counts in expandable row | Full delivery detail sheet with per-delivery table |

### Already Complete (No Work Needed)

- All backend messaging adapters (5 SMS + Signal + WhatsApp + Telegram + RCS)
- BlastsService, delivery worker, scheduled poller
- Blast routes (CRUD, send, schedule, cancel, stats, deliveries)
- Subscriber management (CRUD, import, keyword handling)
- Blast settings panel
- Signal and RCS channel config sections (desktop)
- A2pRegistrationService and hub onboarding routes
- All protocol schemas
- Permission guards on all routes

---

## New Backend Work

### New Endpoints

| Method | Path | Permission | Purpose |
|--------|------|-----------|---------|
| `POST` | `/blasts/:id/deliveries/:deliveryId/retry` | `blasts:send` | Reset single failed delivery to pending |
| `POST` | `/blasts/:id/retry-failed` | `blasts:send` | Reset all failed deliveries for a blast |

### Delivery Retry Logic

Guards:
- Delivery must be in `failed` status
- Blast must be in `sending` or `sent` status
- Caller must have `blasts:send` permission

Action:
- Reset `status` to `pending`
- Increment `attempts`
- Clear `error` and `errorCode`
- Set `nextRetryAt` to current timestamp
- Delivery worker picks it up on next poll cycle

### WS Blast Progress Events

The blast delivery worker (`blast-delivery-worker.ts`) already processes in batches. After each batch:

1. Compute updated stats for the blast
2. Emit WS event `blast:progress` to all hub subscribers
3. Include batch delivery status updates for incremental UI updates

Event payload:
```typescript
{
  type: 'blast:progress',
  hubId: string,
  blastId: string,
  stats: { pending: number, sent: number, delivered: number, failed: number, optedOut: number, total: number },
  batch: Array<{ deliveryId: string, subscriberHash: string, channel: string, status: string, error?: string }>
}
```

### Media URL Passthrough

Verify that `content.mediaUrl` and `content.mediaType` are accepted in the blast create/update route handlers and stored in the `content` JSONB. The delivery worker already handles `mediaUrl` via `adapter.sendMediaMessage()`.

---

## Frontend File Structure

### Desktop — New Files

```
src/client/components/channel-config/
  registry.ts                    — Channel config registry (type → component mapping)
  types.ts                       — ChannelConfigProps, ChannelConfigEntry interfaces
  channel-status-banner.tsx      — Shared: enabled/disabled + security + A2P status
  connection-test-button.tsx     — Shared: async test with badge
  auto-response-fields.tsx       — Shared: autoResponse + afterHoursResponse
  a2p-registration-panel.tsx     — Shared: A2P brand/campaign forms + status
  sms-channel-section.tsx        — SMS config
  whatsapp-channel-section.tsx   — WhatsApp config
  telegram-channel-section.tsx   — Telegram config

src/client/components/blast/
  delivery-detail-sheet.tsx      — Delivery tracking sheet overlay
  delivery-table.tsx             — Filterable paginated delivery table
  media-attachment-field.tsx     — Media URL input for composer
  schedule-picker.tsx            — Inline date/time picker for scheduling
```

### Desktop — Modified Files

```
src/client/routes/admin/settings.tsx         — Replace hardcoded channel imports with registry iteration
src/client/components/BlastComposer.tsx      — Add media field + schedule picker
src/client/routes/blasts.tsx                 — Add delivery detail sheet trigger + WS subscription
src/client/components/admin-settings/signal-channel-section.tsx  — Refactor to use shared primitives
src/client/components/admin-settings/rcs-channel-section.tsx     — Refactor to use shared primitives
```

### iOS — New Files

```
apps/ios/Sources/Services/MessagingConfigService.swift  — API client for messaging config
apps/ios/Sources/Services/BlastService.swift            — API client for blasts

apps/ios/Sources/Views/Settings/Channels/
  ChannelConfigListView.swift          — Dynamic channel list from registry
  SMSChannelConfigView.swift           — SMS config + A2P panel
  WhatsAppChannelConfigView.swift      — WhatsApp config
  TelegramChannelConfigView.swift      — Telegram config
  A2pRegistrationView.swift            — Shared A2P panel
  ConnectionTestButton.swift           — Shared test button
  AutoResponseFields.swift             — Shared auto-response fields

apps/ios/Sources/Views/Blasts/
  BlastListView.swift                  — Blast list with status badges
  BlastComposerView.swift              — Create/edit blast
  BlastDeliveryDetailView.swift        — Delivery tracking sheet
  BlastDeliveryRow.swift               — Per-delivery row with retry

apps/ios/Tests/LlamenosTests/MessagingConfigServiceTests.swift
apps/ios/Tests/LlamenosTests/BlastServiceTests.swift
apps/ios/Tests/LlamenosUITests/ChannelConfigUITests.swift
apps/ios/Tests/LlamenosUITests/BlastUITests.swift
```

### Android — New Files

```
apps/android/app/src/main/kotlin/org/llamenos/app/api/
  MessagingConfigRepository.kt         — API client for messaging config
  BlastRepository.kt                   — API client for blasts

apps/android/app/src/main/kotlin/org/llamenos/app/ui/settings/channels/
  ChannelConfigListScreen.kt           — Dynamic channel list
  SmsChannelConfigScreen.kt            — SMS config + A2P panel
  WhatsAppChannelConfigScreen.kt       — WhatsApp config
  TelegramChannelConfigScreen.kt       — Telegram config
  A2pRegistrationSection.kt            — Shared A2P panel
  ConnectionTestButton.kt              — Shared test button
  AutoResponseFields.kt                — Shared auto-response fields

apps/android/app/src/main/kotlin/org/llamenos/app/ui/blasts/
  BlastListScreen.kt                   — Blast list with status badges
  BlastComposerScreen.kt               — Create/edit blast
  BlastDeliveryDetailSheet.kt          — Delivery tracking bottom sheet
  BlastDeliveryItem.kt                 — Per-delivery row with retry

apps/android/app/src/test/kotlin/org/llamenos/app/api/
  MessagingConfigRepositoryTest.kt
  BlastRepositoryTest.kt

apps/android/app/src/androidTest/kotlin/org/llamenos/app/ui/
  ChannelConfigScreenTest.kt
  BlastScreenTest.kt
```

### i18n

~40-50 new keys in `packages/i18n/locales/en.json`:
- `channels.sms.*` — SMS section labels, A2P status, content mode
- `channels.whatsapp.*` — WhatsApp section labels, integration mode
- `channels.telegram.*` — Telegram section labels, bot setup
- `channels.shared.*` — Connection test, auto-response, security badges
- `channels.a2p.*` — A2P registration status, brand/campaign labels
- `blasts.delivery.*` — Delivery detail labels, retry actions, status filters
- `blasts.composer.*` — Media attachment, schedule picker labels
- `blasts.progress.*` — Real-time progress indicators

All 13 locales updated. Codegen produces iOS `.strings` + Android `strings.xml` + Kotlin `I18n.kt`.

### BDD

```
packages/test-specs/features/admin/channel-config.feature    — Channel enable/disable, connection test, A2P flow
packages/test-specs/features/admin/blast-delivery.feature    — Blast send, delivery tracking, retry, progress
tests/steps/backend/channel-config.steps.ts                  — Step definitions
tests/steps/backend/blast-delivery.steps.ts                  — Step definitions
```

### Playwright

```
tests/channel-config.spec.ts     — Desktop E2E: channel config CRUD, A2P management
tests/blast-delivery.spec.ts     — Desktop E2E: blast composer, delivery sheet, retry
```

---

## Security Considerations

- **SMS provider credentials are never separate** — SMS reuses telephony provider credentials. No new secrets to manage.
- **WhatsApp/Telegram credentials** stored in hub settings JSONB, encrypted at rest via PostgreSQL. Access tokens and bot tokens are never exposed in full to the frontend — only masked values shown in the UI.
- **A2P registration SIDs** encrypted before storage (HMAC), masked in API responses (last 4 chars only).
- **Subscriber identifiers** HMAC-hashed for storage; encrypted identifiers decrypted server-side at send time. Frontend never sees plaintext phone numbers.
- **Blast content** is plaintext server-side (server must read it to send via provider APIs). The threat model protects subscriber PII, not broadcast content from the server.
- **No CSV export** — subscriber data never leaves the app's controlled rendering context.
- **Media URLs** validated server-side (format, allowed schemes) before storage. Media is fetched by the messaging adapter at send time, not by the client.

---

## Out of Scope (Future Backlog)

| Item | Reason |
|------|--------|
| Localized blast content (multi-language tabs) | Neither v1 nor v2 implements it; `localizedContent` DB field doesn't exist. Separate epic if needed. |
| CSV export of subscribers | Security constraint — no data export. |
| Subscriber tag management UI | Useful but not part of v1 port. Tags exist in DB, can be set via CSV import. |
| Subscriber language preference editing | Same — preferences exist in DB, set via import. |
| Double opt-in pending confirmations view | Toggle exists in settings. Pending count visibility can be added incrementally. |

---

## Implementation Plan Structure

EP05 splits into two independently plannable tracks:

1. **EP05a: Channel Configuration** — registry, shared primitives, SMS/WhatsApp/Telegram sections, A2P panel, all platforms
2. **EP05b: Blast Enhancements** — composer upgrades, delivery tracking, retry, WS progress, media, all platforms

EP05a and EP05b share the i18n work and can be planned/executed in parallel after the shared primitives in EP05a are established (EP05b's mobile blast UI needs the channel picker pattern from EP05a).
