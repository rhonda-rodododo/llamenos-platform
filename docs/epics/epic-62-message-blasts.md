# Epic 62: Message Blasts

## Summary

Add broadcast messaging capability where hub admins can send message blasts to subscribers across multiple channels (SMS, RCS, WhatsApp, Signal). Users subscribe by texting a keyword to the hub's hotline number. Each blast includes opt-out (STOP) and preference management (CHANGE) options. Supports both immediate and scheduled sends.

## Current State

- 1-to-1 messaging only (volunteer/admin ↔ single contact)
- No subscriber management or opt-in/opt-out
- No broadcast/bulk send capability
- Auto-response fields exist in SMS/WhatsApp/Signal config but are not yet functional
- No RCS channel support

## Design

### Subscriber Model

```typescript
interface Subscriber {
  id: string                              // UUID
  hubId: string                           // Which hub
  channels: SubscriberChannel[]           // Subscribed channels
  subscribedAt: string
  updatedAt: string
  status: 'active' | 'paused' | 'unsubscribed'
  source: 'sms' | 'rcs' | 'whatsapp' | 'signal' | 'web' | 'import'
  metadata?: {
    language?: string                     // Preferred language for blasts
    tags?: string[]                       // Segmentation tags
  }
}

interface SubscriberChannel {
  type: 'sms' | 'rcs' | 'whatsapp' | 'signal'
  identifier: string                      // Phone number or Signal UUID
  identifierHash: string                  // For storage (no plaintext PII at rest)
  status: 'active' | 'unsubscribed'
  subscribedAt: string
  unsubscribedAt?: string
}
```

### Subscribe Flow

1. User texts keyword to hotline number (e.g., "JOIN", "SUBSCRIBE", configurable per hub)
2. Inbound webhook routes to hub's messaging handler
3. System detects subscribe keyword → creates/updates subscriber
4. Confirmation message sent back:
   ```
   You're subscribed to [Hub Name] alerts.
   Reply STOP to unsubscribe.
   Reply CHANGE to manage preferences.
   ```
5. If double opt-in is enabled (configurable): confirmation requires reply "YES"

**Multi-channel subscription**: A subscriber can be on multiple channels. If they text JOIN via SMS and also via WhatsApp, both channels are added to the same subscriber record (matched by phone number hash).

**Web subscription**: Hub settings page can include a public subscribe form (phone number + channel selection). Sends confirmation via chosen channel.

### Unsubscribe Flow

- **STOP** keyword on any channel → unsubscribes that channel
- **STOP ALL** → unsubscribes all channels
- TCPA/carrier compliance: STOP must always work, even if hub customizes keywords
- Unsubscribe is immediate and confirmed:
  ```
  You've been unsubscribed. Reply JOIN to re-subscribe.
  ```

### Preference Management (CHANGE)

- **CHANGE** keyword → sends link to web preference page (or inline options for Signal)
- Preferences: channel selection, language, pause/resume
- Web page is a minimal public form (no auth required, token-based access)

### Blast Model

```typescript
interface Blast {
  id: string                              // UUID
  hubId: string
  title: string                           // Internal label
  content: BlastContent
  channels: ('sms' | 'rcs' | 'whatsapp' | 'signal')[]
  targetSegment?: {
    tags?: string[]                       // Filter by subscriber tags
    channels?: string[]                   // Filter by subscribed channels
    languages?: string[]                  // Filter by language preference
  }
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'
  scheduledAt?: string                    // ISO timestamp for scheduled sends
  sentAt?: string
  createdBy: string                       // Pubkey of sender
  createdAt: string
  updatedAt: string
  stats: BlastStats
}

interface BlastContent {
  text: string                            // Plain text (SMS/Signal fallback)
  richText?: string                       // Markdown for WhatsApp/RCS
  mediaUrl?: string                       // Attached image/video URL
  mediaType?: string                      // MIME type
  // RCS-specific
  rcsCard?: {
    title: string
    description: string
    imageUrl?: string
    actions?: RCSAction[]
  }
}

interface BlastStats {
  totalRecipients: number
  sent: number
  delivered: number
  failed: number
  optedOut: number                        // Unsubscribed after receiving
}
```

### Delivery Engine

**Immediate send:**
1. Admin composes blast → selects channels → hits Send
2. System queries subscriber list (filtered by segment + active status)
3. For each channel, queues messages via the respective MessagingAdapter
4. Rate limiting per provider (Twilio: 1 msg/sec, WhatsApp: 80 msg/sec, etc.)
5. Progress tracked in blast stats
6. Footer appended to every message:
   ```
   ---
   Reply STOP to unsubscribe | CHANGE for preferences
   ```

**Scheduled send:**
1. Admin composes blast → sets future date/time → saves
2. Blast stored with `status: 'scheduled'`, `scheduledAt` timestamp
3. DO alarm fires at scheduled time → triggers delivery
4. Admin can cancel before scheduled time

**Delivery via DO alarm chain:**
- First alarm: start sending, process first batch (e.g., 50 messages)
- Set next alarm for rate-limit-safe interval
- Repeat until all messages sent
- Final alarm: update blast stats, set status to 'sent'

### Provider-Specific Considerations

**SMS:**
- TCPA compliance: must include opt-out
- 160-char limit (auto-split for longer)
- Rate: ~1 msg/sec (Twilio), varies by provider
- 10DLC registration may be required for blasts in the US

**RCS (Epic 63):**
- Rich cards with images and action buttons
- Fallback to SMS automatically (carrier-handled)
- Google RCS Business Messaging API
- Suggested replies for STOP/CHANGE

**WhatsApp:**
- Template messages required for non-session messages (blast = non-session)
- Templates must be pre-approved by Meta
- 24-hour window for free-form replies after user interaction
- Rate: 80 msg/sec (Business API tier-dependent)

**Signal:**
- No official broadcast API — signal-cli bridge sends individually
- Rate limiting needed to avoid bridge overload
- No template requirement

### API Endpoints

```
# Subscriber management
GET    /api/hubs/:hubId/subscribers              # List subscribers (paginated)
GET    /api/hubs/:hubId/subscribers/stats         # Subscriber counts by channel
POST   /api/hubs/:hubId/subscribers/import        # Bulk import (CSV)
DELETE /api/hubs/:hubId/subscribers/:id            # Remove subscriber

# Blast management
GET    /api/hubs/:hubId/blasts                    # List blasts (paginated)
POST   /api/hubs/:hubId/blasts                    # Create draft blast
GET    /api/hubs/:hubId/blasts/:id                # Get blast details + stats
PATCH  /api/hubs/:hubId/blasts/:id                # Update draft
POST   /api/hubs/:hubId/blasts/:id/send           # Send immediately
POST   /api/hubs/:hubId/blasts/:id/schedule       # Schedule for later
POST   /api/hubs/:hubId/blasts/:id/cancel         # Cancel scheduled blast
DELETE /api/hubs/:hubId/blasts/:id                # Delete draft

# Subscription settings
GET    /api/hubs/:hubId/settings/blasts           # Blast settings (keywords, double opt-in)
PATCH  /api/hubs/:hubId/settings/blasts           # Update blast settings
```

### Permissions

```
blasts:read               # View blast history and stats
blasts:send               # Compose and send blasts
blasts:schedule           # Schedule future blasts
blasts:manage             # Manage subscribers, import, settings
```

### Frontend

**Blast Composer** — new page at `/hubs/:hubId/blasts`:
- List view: past blasts with stats (sent, delivered, failed)
- Compose view: text editor, channel picker, segment filters, preview
- Schedule picker: date/time or immediate
- Preview: shows how message will look on each channel
- Stats view: delivery progress, opt-out tracking

**Subscriber Management** — accessible from blast settings:
- Subscriber list with channel badges
- Import CSV
- Manual add/remove
- Tag management for segmentation
- Subscriber count by channel

**Subscribe Keyword Config** — in hub settings:
- Configurable keywords (JOIN, SUBSCRIBE, etc.)
- Double opt-in toggle
- Confirmation message templates per channel
- STOP/CHANGE keyword customization (STOP always works regardless)

### Encryption

**Subscriber identifiers**: Phone numbers and Signal UUIDs are stored hashed. The blast delivery engine temporarily resolves hashes to actual identifiers at send time (same pattern as conversation outbound messages — server holds identifiers, never exposed to frontend).

**Blast content at rest**: Encrypted in DO storage but not per-recipient E2EE (broadcast to potentially thousands of recipients makes ECIES-per-recipient impractical). Encrypted with a hub-level key accessible to hub admins.

**Signal channel — inherent E2EE**: Signal messages are end-to-end encrypted by the Signal protocol itself. When blasts are sent via the signal-cli bridge, the bridge handles Signal protocol encryption to each recipient. This means:
- Signal blast content is E2EE in transit (Signal protocol handles this)
- The signal-cli bridge must have the sending account's keys (it's the Signal "device")
- The server sees plaintext only momentarily during the bridge handoff
- Recipients get full Signal encryption guarantees

**Signal inbound attachments — E2EE file pipeline**: Inbound Signal messages with file attachments (images, videos, documents) must be encrypted via the same ECIES pipeline used for report file uploads. This guarantees files captured in Signal remain encrypted end-to-end:
1. Signal bridge receives attachment (already decrypted from Signal protocol)
2. Worker re-encrypts file via ECIES with ephemeral key → dual envelopes (assigned volunteer + admin)
3. Encrypted file stored in R2/MinIO with `FileRecord`
4. Volunteer decrypts client-side using their nsec
5. **No plaintext file ever stored at rest** — continuity of encryption from Signal capture to hotline decryption

This is critical for sensitive evidence (photos, videos) sent via Signal by contacts in hostile environments.

### Storage

**New DO or extend ConversationDO?** → New keys in the hub's ConversationDO:
- `subscribers:{hash}` → `Subscriber`
- `subscriber-index:channel:{channel}` → `string[]` (subscriber IDs by channel)
- `blasts:{id}` → `Blast`
- `blast-queue:{blastId}` → delivery queue state

## Acceptance Criteria

- [ ] Subscriber model and storage in ConversationDO
- [ ] Subscribe flow: keyword detection → opt-in → confirmation
- [ ] Unsubscribe flow: STOP keyword → immediate unsubscribe → confirmation
- [ ] CHANGE keyword: preference management (web form or inline)
- [ ] Double opt-in option (configurable per hub)
- [ ] Blast composer UI: text, channel selection, segment filters
- [ ] Immediate blast send with rate limiting per provider
- [ ] Scheduled blast send via DO alarms
- [ ] Blast stats: sent, delivered, failed, opted-out
- [ ] Subscriber management UI: list, import CSV, tags
- [ ] TCPA compliance: STOP always works, opt-out footer on every message
- [ ] Keyword configuration in hub settings
- [ ] WhatsApp template message support for blasts
- [ ] Audit logging for blast sends
- [ ] Permissions: `blasts:read`, `blasts:send`, `blasts:schedule`, `blasts:manage`
- [ ] Signal inbound attachments encrypted via ECIES pipeline (no plaintext at rest)
- [ ] Signal blast delivery via signal-cli bridge with inherent Signal protocol E2EE
- [ ] E2E tests for subscribe, unsubscribe, blast send, scheduled blast

## Dependencies

- **Requires** Epic 60 (PBAC) — blast permissions
- **Requires** Epic 61 (Multi-Hub) — blasts are per-hub
- **Enhanced by** Epic 63 (RCS) — adds RCS as a blast channel

## Estimated Scope

~25 new files, ~10 modified. Mostly new code (subscriber engine, blast delivery, composer UI).
