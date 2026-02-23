# Epic 63: RCS Channel

## Summary

Add RCS (Rich Communication Services) as a new messaging channel via Google's RCS Business Messaging API. RCS is the successor to SMS — supported on Android natively and adopted by Apple in iOS 18. It provides rich media, read receipts, typing indicators, and suggested actions, with automatic SMS fallback for unsupported devices. Integrates as both a 1-to-1 conversation channel and a blast channel.

## Current State

- 3 messaging channels: SMS, WhatsApp, Signal
- `MessagingAdapter` interface supports adding new channel types
- `MessagingChannelType = 'sms' | 'whatsapp' | 'signal'` — needs extending
- SMS adapter handles plain text; no rich message support
- No RCS awareness anywhere in the codebase

## Design

### Why RCS?

- **Universal reach**: Android native (90%+ of Android phones), iOS 18+ native, carrier fallback to SMS
- **Rich UX**: Carousels, suggested replies, images, action buttons — no MMS costs
- **Read receipts & typing**: Volunteers see when messages are read
- **Carrier-handled SMS fallback**: If recipient's device doesn't support RCS, carrier delivers as SMS automatically
- **Cost effective**: No per-message fees for RCS (carrier-billed), only API costs
- **Future-proof**: Industry standard replacing SMS globally

### RCS Business Messaging API

Google's RCS Business Messaging (RBM) API provides:
- Agent registration and verification
- Rich card messages (standalone + carousel)
- Suggested replies and actions (dial, open URL, share location)
- Media messages (images, video, audio, files)
- Read receipts and delivery status
- SMS/MMS fallback (automatic, carrier-handled)
- Webhook notifications for inbound messages and events

### MessagingAdapter Implementation

```typescript
// Extend channel type
type MessagingChannelType = 'sms' | 'rcs' | 'whatsapp' | 'signal'

// New adapter
class RCSAdapter implements MessagingAdapter {
  readonly channelType = 'rcs' as MessagingChannelType

  async parseIncomingMessage(request: Request): Promise<IncomingMessage>
  async validateWebhook(request: Request): Promise<boolean>
  async sendMessage(params: SendMessageParams): Promise<SendResult>
  async sendMediaMessage(params: SendMediaParams): Promise<SendResult>
  async getChannelStatus(): Promise<ChannelStatus>

  // RCS-specific methods
  async sendRichCard(params: RichCardParams): Promise<SendResult>
  async sendCarousel(params: CarouselParams): Promise<SendResult>
  async sendSuggestedReplies(params: SuggestedReplyParams): Promise<SendResult>
}
```

### Configuration

```typescript
interface RCSConfig {
  enabled: boolean
  agentId: string                         // RBM agent identifier
  serviceAccountKey: string               // Google Cloud service account JSON
  webhookSecret: string                   // For webhook signature validation
  fallbackToSms: boolean                  // Enable SMS fallback (default: true)
  autoResponse?: string                   // Auto-reply for new conversations
  afterHoursResponse?: string             // After-hours auto-reply
}
```

Added to `MessagingConfig.rcs` in SettingsDO alongside existing SMS/WhatsApp/Signal configs.

### Admin Setup

In hub messaging settings:
1. Enable RCS channel
2. Enter Google Cloud service account credentials (JSON key)
3. Enter RBM agent ID (created in Google RBM console)
4. Configure webhook URL (auto-generated, copied to RBM console)
5. Test connection
6. Toggle SMS fallback

### Rich Message Types

```typescript
interface RichCardParams {
  title: string
  description: string
  imageUrl?: string
  suggestions?: Suggestion[]
}

interface CarouselParams {
  cards: RichCardParams[]
  cardWidth: 'small' | 'medium'
}

interface Suggestion {
  type: 'reply' | 'action'
  text: string
  postbackData?: string                   // For reply buttons
  action?: {
    type: 'dial' | 'openUrl' | 'shareLocation' | 'createCalendarEvent'
    data: string
  }
}
```

### Webhook Handling

Google RBM webhooks deliver:
- `MESSAGE` — inbound text/media from user
- `READ` — read receipt
- `DELIVERED` — delivery confirmation
- `IS_TYPING` — typing indicator
- `SUGGESTION_RESPONSE` — user tapped a suggested reply

Webhook endpoint: `/api/messaging/rcs/webhook?hub={hubId}`

Validation: Google Cloud Pub/Sub push subscription with JWT token verification, or direct webhook with API key header.

### Inbound Flow

```
Google RBM webhook → /api/messaging/rcs/webhook
  → RCSAdapter.validateWebhook()
  → RCSAdapter.parseIncomingMessage()
  → ConversationDO.handleIncoming()
  → Encrypt + store + broadcast via WebSocket
```

### Outbound Flow

Volunteers can send:
- Plain text (rendered as RCS if supported, SMS fallback)
- Media (images, PDFs — rendered as rich cards on RCS)
- Suggested replies (RCS-only, ignored on SMS fallback)

Blast messages (Epic 62) can use rich cards and carousels.

### Frontend Changes

- **Channel badge**: New "RCS" badge/icon alongside SMS, WhatsApp, Signal in conversation list
- **Rich compose**: When replying in an RCS conversation, option to add suggested replies
- **Delivery indicators**: Show read receipts and delivery status (RCS provides these)
- **Hub settings**: RCS channel configuration panel
- **Blast composer**: RCS rich card builder (title, description, image, action buttons)

### Relationship with SMS

RCS and SMS can coexist:
- If both SMS and RCS are enabled for a hub, the system treats them as separate channels
- A subscriber could be on both SMS and RCS lists
- RCS messages that fall back to SMS are tracked as RCS (the API handles fallback transparently)
- For blasts: admin chooses which channels to target; RCS + SMS can be selected together (Google handles dedup/fallback)

### API Changes

**New endpoints:**
- Standard messaging endpoints work via channel routing (no new conversation endpoints)
- Settings: `PATCH /api/hubs/:hubId/settings/messaging` — includes RCS config

**Modified:**
- `MessagingChannelType` extended with `'rcs'`
- Messaging router adds `/api/messaging/rcs/webhook` handler
- Adapter factory gains `createRCSAdapter()`

## Acceptance Criteria

- [ ] `RCSAdapter` implementing `MessagingAdapter` interface
- [ ] Google RBM API integration (auth via service account)
- [ ] Inbound message parsing (text, media, suggestion responses)
- [ ] Outbound text and media messages
- [ ] Rich card and carousel support
- [ ] Suggested replies/actions
- [ ] Read receipts and delivery status tracking
- [ ] Webhook validation (JWT or API key)
- [ ] SMS fallback toggle (carrier-handled)
- [ ] Admin setup UI in hub messaging settings
- [ ] Connection test endpoint
- [ ] `MessagingChannelType` extended to include `'rcs'`
- [ ] RCS channel badge in conversation list
- [ ] Blast composer: rich card builder for RCS
- [ ] E2E tests for RCS configuration (webhook validation mocked)

## Dependencies

- **Independent of** Epic 60/61 technically, but practically deployed after hub architecture
- **Enhances** Epic 62 (Message Blasts) — adds RCS as a blast channel with rich cards

## Estimated Scope

~15 new files, ~10 modified. Mostly a new adapter + admin config UI. Follows established messaging adapter patterns.

## Open Questions

- **RBM agent verification**: Google requires business verification for RBM agents. May need org-level setup guide.
- **Pricing**: RBM API itself is free; carrier charges vary by country. Document in setup guide.
- **Availability**: RCS support varies by carrier. Some carriers don't support RBM yet. SMS fallback is critical.
