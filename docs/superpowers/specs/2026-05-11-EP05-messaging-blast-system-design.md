---
epic: EP05
title: Messaging Channels & Blast System
status: stub
depends-on: [EP01]
phase: 3
---

# EP05: Messaging Channels & Blast System

**Date:** 2026-05-11
**Source:** v1 (llamenos-hotline) -> v2 (llamenos-platform)

## Overview

Complete the SMS channel configuration UI and harden the blast/broadcast system. v2 already has a mature backend (MessagingAdapter interface with 5 channel adapters, BlastsService with delivery expansion, TaskScheduler with delivery worker and scheduled poller, full blast routes with delivery tracking). The frontend has a working blasts page with composer, subscriber manager, and settings panel, but is missing the SMS channel configuration section and several blast workflow refinements from v1 (localized content editing, double opt-in workflow UI, CSV export, delivery stats visualization).

## v1 Implementation Summary

### SMS Channel Configuration (Desktop)

1. **`messaging-sms-section.tsx`**: Admin settings panel for SMS channel:
   - Provider selection (Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth)
   - Credentials input (account SID, auth token, phone number)
   - Security level display (encryption status, webhook validation)
   - Connection test button with status indicator
   - Webhook URL display (copy-to-clipboard)
   - Auto-response and after-hours response message fields
   - Enable/disable toggle for the channel

### Blast System (Desktop)

1. **Blast CRUD**: Draft -> schedule -> send workflow with status badges
2. **Subscriber management**: List, add, remove, bulk import (CSV), filter by tag/channel/status
3. **Blast settings**: Opt-in/out keywords, double opt-in toggle, max blasts per day, rate limits
4. **Delivery tracking**: Per-recipient status (pending, sent, delivered, failed, opted out), aggregate stats
5. **Double opt-in workflow**: Subscriber receives confirmation message, must reply with keyword to confirm
6. **Encrypted blast names and content**: Hub-key-wrapped blast data

## v2 Current State

### Backend (Largely Complete)

v2's backend is significantly ahead of v1 in blast infrastructure:

| Component | File | Status |
|-----------|------|--------|
| `MessagingAdapter` interface | `apps/worker/messaging/adapter.ts` | Complete: `sendMessage`, `sendMediaMessage`, `parseIncomingMessage`, `validateWebhook`, `getChannelStatus`, `parseStatusWebhook` |
| SMS adapters (Twilio, SignalWire, Vonage, Plivo, Asterisk) | `apps/worker/messaging/sms/` | Complete: 5 adapter implementations with factory |
| Signal adapter | `apps/worker/messaging/signal/` | Complete: registration, receipts, reactions, typing, identity trust, retry, rate limiting |
| RCS adapter | `apps/worker/messaging/rcs/` | Complete |
| WhatsApp adapter | `apps/worker/messaging/whatsapp/` | Complete |
| Telegram adapter | `apps/worker/messaging/telegram/` | Complete |
| `BlastsService` | `apps/worker/services/blasts.ts` | Complete: subscriber CRUD, blast CRUD, `expandBlast()`, delivery batch processing, stats computation, keyword handling, import bulk |
| Blast DB schema | `apps/worker/db/schema/blasts.ts` | Complete: `subscribers`, `blasts`, `blastDeliveries`, `blastSettings` tables |
| Blast routes | `apps/worker/routes/blasts.ts` | Complete: full CRUD, send, schedule, cancel, stats, deliveries, subscriber management, import |
| Blast delivery worker | `apps/worker/lib/blast-delivery-worker.ts` | Complete: background poller with rate limiting, retry, mid-flight opt-out check |
| Scheduled blast poller | `apps/worker/lib/blast-scheduled-poller.ts` | Complete: checks scheduled blasts every 60s |
| `TaskScheduler` | `apps/worker/services/scheduler.ts` | Complete: starts/stops blast worker and scheduled poller |
| Messaging delivery router | `apps/worker/messaging/delivery-router.ts` | Complete: webhook routing, blast keyword interception |
| Blast Zod schemas | `packages/protocol/schemas/blasts.ts` | Complete: all request/response schemas |
| Permission catalog | Backend middleware | Complete: `blasts:read`, `blasts:send`, `blasts:manage`, `blasts:schedule` |
| Settings route | `apps/worker/routes/settings.ts` | Complete: `PATCH /settings/messaging` with `settings:manage-messaging` permission |

**Missing from backend:** localized content editing support in blast routes (the `localizedContent` JSONB field exists in schema per blast spec but may not be wired to routes), per-channel rate limit configuration API, CSV export endpoint for subscribers.

### Frontend (Partial)

| Component | File | Status |
|-----------|------|--------|
| Blasts page | `src/client/routes/blasts.tsx` | Working: list, create, send, cancel, delete, delivery stats expand |
| Blast composer | `src/client/components/BlastComposer.tsx` | Working: name, text content, channel selection |
| Subscriber manager | `src/client/components/SubscriberManager.tsx` | Working: list, remove, CSV import, stats display |
| Blast settings panel | `src/client/components/BlastSettingsPanel.tsx` | Working: opt-in/out keywords, double opt-in toggle, max blasts per day |
| Signal channel section | `src/client/components/admin-settings/signal-channel-section.tsx` | Complete: registration flow, trust mode, identity management, queue stats |
| RCS channel section | `src/client/components/admin-settings/rcs-channel-section.tsx` | Complete: credentials, webhook URL, connection test |
| SMS channel section | N/A | **Missing**: no component exists (the task prompt referenced a stub file but it does not exist in the codebase) |
| Blast delivery details | Inline in `blasts.tsx` | Basic: shows stats but no per-delivery list view |

### i18n Keys

Blast-related keys exist across 13 locales (keys like `blasts.sent`, `blasts.newBlast`, `blasts.blastName`, `blasts.fillRequired`). SMS-specific messaging keys need to be verified.

## Gap Analysis

### Must Build (No v2 Equivalent)

| Item | Priority | Description |
|------|----------|-------------|
| SMS channel config section | P0 | Provider selection (6 adapters), credentials, webhook URL, connection test, enable/disable — modeled on `signal-channel-section.tsx` and `rcs-channel-section.tsx` |
| WhatsApp channel config section | P1 | Same pattern as SMS but for WhatsApp Business API credentials |
| Telegram channel config section | P1 | Bot token, webhook configuration |

### Must Enhance (Exists But Incomplete)

| Item | Priority | Current State | Target |
|------|----------|---------------|--------|
| Blast composer — localized content | P1 | Single text field | Per-language content tabs matching v2 backend `localizedContent` JSONB field |
| Blast composer — media attachments | P2 | No media support | `mediaUrl` field (backend `BlastContent` already supports it) |
| Blast composer — scheduling UI | P1 | Separate schedule route call | Inline date/time picker in composer for scheduled sends |
| Delivery tracking dashboard | P1 | Basic stats in expandable row | Full delivery list with status breakdown, channel breakdown, retry/cancel actions |
| Subscriber manager — CSV export | P2 | Import only | Export subscriber list as CSV |
| Subscriber manager — tag management | P2 | No tag editing | Add/remove tags, filter by tag |
| Subscriber manager — language filter | P2 | No language filter | Filter and set subscriber language preference |
| Double opt-in workflow visibility | P2 | Toggle exists in settings | Show pending confirmations count, re-send confirmation option |
| Blast progress real-time updates | P2 | Poll on expand | WebSocket/Nostr ephemeral events for live delivery progress (backend `KIND_BLAST_PROGRESS` spec exists) |

### Already Complete in v2 (No Work Needed)

- Backend blast CRUD, expansion, delivery worker, scheduled poller
- Backend subscriber CRUD, import, keyword handling
- Backend messaging adapters for all 5 channels
- Blast settings panel (opt-in keywords, double opt-in, rate limits)
- Frontend blast list, create, send, cancel, delete
- Frontend subscriber list, remove, CSV import, stats
- Signal and RCS channel admin sections
- Permission guards on all blast routes

## Architecture Notes

### SMS Channel Section Design

Follow the established pattern from `signal-channel-section.tsx` and `rcs-channel-section.tsx`:

```
SMSChannelSection
├── Provider selector (dropdown: Twilio, SignalWire, Vonage, Plivo, Telnyx, Bandwidth)
├── Credentials form (provider-specific fields via factory pattern)
│   ├── Twilio: accountSid, authToken, phoneNumber
│   ├── SignalWire: projectId, apiToken, spaceUrl, phoneNumber
│   ├── Vonage: apiKey, apiSecret, phoneNumber
│   ├── Plivo: authId, authToken, phoneNumber
│   ├── Telnyx: apiKey, publicKey, phoneNumber
│   └── Bandwidth: accountId, apiToken, applicationId, phoneNumber
├── Connection test button + status badge (ProviderStatusBadge)
├── Webhook URL display (read-only, copy-to-clipboard)
├── Auto-response / after-hours response textareas
└── Save button
```

The section calls `updateMessagingConfig` (existing API client function) and `testMessagingChannel('sms')` (existing). Config shape extends `MessagingConfig.sms` which maps to the backend's SMS settings.

### Blast Composer — Localized Content

The backend `blasts` table has a `localizedContent` JSONB field (`Record<string, BlastContent>` keyed by language code). The composer should render a tab bar for each configured language (from `packages/i18n/languages.ts`), with the default/fallback in the `content` field and per-language overrides in `localizedContent`.

### Delivery Dashboard

The backend already provides:
- `GET /api/blasts/:id/stats` — aggregate delivery stats
- `GET /api/blasts/:id/deliveries?status=&page=&limit=` — paginated delivery list

The frontend needs a dedicated delivery view (could be a dialog or inline expansion) that shows:
- Pie/donut chart of delivery status breakdown
- Filterable table of individual deliveries with channel, status, timestamps, error details
- Retry action for failed deliveries (new route needed: `POST /api/blasts/:id/deliveries/:deliveryId/retry`)

## Security Considerations

- SMS provider credentials are stored server-side in hub settings (encrypted at rest via PostgreSQL column-level encryption). Never expose auth tokens to the frontend — only display masked values.
- Subscriber identifiers are HMAC-hashed for storage; encrypted identifiers are decrypted server-side at send time using the hub key. The frontend never sees plaintext phone numbers in the subscriber list.
- Blast content is plaintext server-side (server must read it to send via provider APIs). This is accepted per the blast delivery spec — the threat model protects subscriber PII, not broadcast content from the server.
- CSV import must validate and hash identifiers server-side before storage. CSV export must NOT include plaintext identifiers — only hashed values and metadata.

## Implementation Phases

### Phase 1: SMS Channel Config Section (P0)
1. Create `src/client/components/admin-settings/sms-channel-section.tsx`
2. Add provider-specific credential forms (dynamic based on selected provider)
3. Wire to existing `updateMessagingConfig` and `testMessagingChannel` API functions
4. Add i18n keys for SMS channel configuration across 13 locales
5. Mount in admin settings page alongside Signal and RCS sections

### Phase 2: Blast Workflow Enhancements (P1)
1. Add localized content editing to `BlastComposer.tsx` (language tabs)
2. Add inline scheduling UI to composer (date/time picker + schedule action)
3. Build delivery tracking detail view with status breakdown and per-delivery list
4. Wire `localizedContent` through blast create/update API calls
5. Add i18n keys for new blast UI elements

### Phase 3: Subscriber & Channel Enhancements (P2)
1. Add WhatsApp and Telegram channel configuration sections
2. CSV export for subscriber manager
3. Tag management UI in subscriber manager
4. Language preference editing in subscriber manager
5. Double opt-in pending confirmations visibility
6. Real-time blast progress via Nostr ephemeral events (if `KIND_BLAST_PROGRESS` is implemented)

## Decisions to Review

### 1. SMS Provider Selection UX: Dropdown vs Tabbed

**Leaning toward**: Dropdown selector (matches v1 pattern)
**Alternative**: Tabbed interface per provider (more visual but wastes space for a single-selection field)
**Rationale**: Only one SMS provider is active at a time. A dropdown with conditional credential fields is simpler and consistent with how the backend stores config.

### 2. Localized Content Editing: Tabs vs Side-by-Side

**Leaning toward**: Tab bar with language codes
**Alternative**: Side-by-side editor showing default + one translation (more convenient for translators)
**Rationale**: Tabs scale to 13 locales without layout issues. The default (fallback) content lives in `content`, each tab writes to `localizedContent[langCode]`.

### 3. Delivery Dashboard: Inline Expansion vs Dedicated Route

**Leaning toward**: Dialog/sheet overlay from blast list
**Alternative**: Dedicated `/blasts/:id` route with full page view
**Rationale**: The blast list is already compact. A sheet overlay keeps context (list visible behind it) and avoids adding router complexity. If usage grows, can promote to a dedicated route later.

### 4. CSV Export: Server-Side vs Client-Side

**Leaning toward**: Server-side endpoint (`GET /api/blasts/subscribers/export`)
**Alternative**: Client-side CSV generation from loaded subscriber data
**Rationale**: Server-side ensures consistent formatting, handles pagination (large subscriber lists), and enforces the security constraint of excluding plaintext identifiers. Client-side would require loading all subscribers first.

### 5. Channel Config Sections: One Component Per Channel vs Generic

**Leaning toward**: One component per channel (matching existing `signal-channel-section.tsx`, `rcs-channel-section.tsx`)
**Alternative**: Generic `ChannelConfigSection` with provider-specific field definitions passed as props
**Rationale**: Each channel has meaningfully different configuration (Signal has registration/linking flows, RCS has agent IDs, SMS has multi-provider selection). A generic component would require so many escape hatches that it would be harder to maintain than separate focused components.

## Open Questions

1. Should the SMS section support configuring multiple SMS providers simultaneously (primary + fallback), mirroring the Signal number rotation spec?
2. Should blast delivery retry be exposed per-delivery in the UI, or only as a bulk "retry all failed" action?
3. Does the backend `localizedContent` field on the blasts table need migration, or was it added as part of the blast delivery spec implementation?
4. Should blast progress events use the Nostr relay (already running) or a simpler SSE/WebSocket channel?
