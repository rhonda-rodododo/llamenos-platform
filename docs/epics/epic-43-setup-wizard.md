# Epic 43: Admin Setup Wizard

## Problem

Deploying Llamenos currently requires following a multi-step technical guide: cloning the repo, generating Nostr keys via CLI, manually editing `.env`, configuring telephony provider webhooks, and knowing which provider to choose. This creates a high barrier to entry for non-technical organizers who want to run a crisis hotline. The current first-login experience drops the admin into a mostly-empty dashboard with no guidance.

Additionally, telephony is currently a hard requirement — the app assumes voice calls are the primary channel. With the addition of messaging channels (SMS, WhatsApp, Signal) in Epics 44-46, an admin should be able to deploy a text-only hotline, a voice-only hotline, or a multi-channel hotline. Telephony should be optional.

## Solution

Build a first-run setup wizard that activates automatically when an admin logs in and the system has no channels configured. The wizard walks through hotline identity, channel selection, provider configuration, and basic settings in a guided step-by-step flow. Each step validates before proceeding. The wizard is re-accessible from settings at any time.

## Design Principles

- **Progressive disclosure.** Don't show WhatsApp Business Account IDs on step 1. Start with "What channels do you want?" and only show provider-specific fields when relevant.
- **Opinionated defaults.** Pre-select sensible defaults (e.g., Twilio for voice+SMS, queue timeout 3 minutes, voicemail enabled). Admin can change later.
- **Non-blocking.** Every step should be skippable. An admin can set up voice now and add Signal later. The wizard tracks what's configured and what's pending.
- **Threat model transparency.** When selecting channels, show the honest security assessment for each (transport encryption level, metadata exposure, third-party trust).
- **Testable.** Each provider configuration includes a "Test Connection" button that validates credentials and connectivity before proceeding.

## Wizard Steps

### Step 1: Hotline Identity

Fields:
- **Hotline name** (pre-filled from `HOTLINE_NAME` env var or "Hotline")
- **Primary language** (dropdown from supported locales)
- **Additional IVR languages** (multi-select, only relevant if voice is enabled)
- **Organization name** (optional, for branding in WhatsApp Business profile / RCS agent)

Stored in: `SettingsDO`

### Step 2: Channel Selection

Visual card-based selection (multi-select). Each card shows:

**Voice Calls (Phone)**
- Icon: phone
- Description: "Callers dial your number. Volunteers answer in-browser or on their phones."
- Security: "Calls traverse your telephony provider. Notes are E2E encrypted."
- Requires: "A telephony provider account (Twilio, SignalWire, Vonage, Plivo, or self-hosted Asterisk)"

**SMS / Text Messages**
- Icon: message-square
- Description: "Callers text your number. Volunteers respond in the web app."
- Security: "SMS is not encrypted in transit. Carriers and your provider can read messages. Stored messages are E2E encrypted."
- Requires: "Same telephony provider as voice (uses the same number)"
- Note: "Can be enabled alongside or instead of voice calls"

**WhatsApp**
- Icon: whatsapp logo
- Description: "Callers message your WhatsApp Business number. Supports text, media, and voice calls."
- Security: "Meta decrypts messages at their servers. Meta retains metadata (phone numbers, timestamps, IP). Stored messages are E2E encrypted."
- Requires: "Meta Business Account + WhatsApp Business Account, or Twilio WhatsApp sender"
- Warning badge: "Meta can access message content"

**Signal**
- Icon: signal logo
- Description: "Callers message your Signal number. Strongest transport encryption available."
- Security: "E2E encrypted from caller to your self-hosted bridge. Bridge server sees plaintext briefly during processing. Stored messages are E2E encrypted."
- Requires: "A self-hosted signal-cli-rest-api bridge (Linux server + Docker)"
- Warning badge: "Requires technical maintenance — bridge can break when Signal updates"

**Reports** (always available, no provider needed)
- Icon: file-text
- Description: "Invite reporters to submit encrypted reports with file attachments via the web app."
- Security: "Fully E2E encrypted. Files encrypted client-side before upload."
- Requires: "Nothing — built into the platform"

At least one channel must be selected to proceed. If no voice/SMS provider is selected, telephony-related UI elements (call dashboard, shift scheduling for ring groups) are hidden throughout the app.

### Step 3: Provider Configuration (conditional)

Only shown for selected channels that require external providers. Rendered as sub-steps:

**3a: Voice/SMS Provider** (if voice or SMS selected)

Provider selection cards with comparison:

| | Twilio | SignalWire | Vonage | Plivo | Asterisk |
|---|---|---|---|---|---|
| Type | Cloud | Cloud | Cloud | Cloud | Self-hosted |
| Ease of setup | Easiest | Easy | Moderate | Moderate | Advanced |
| SMS support | Yes | Yes | Yes | Yes | Limited |
| WebRTC calling | Yes | Yes | Yes | Yes | Yes |
| Cost | $$ | $ | $$ | $ | Free (self-hosted) |

After selection, show provider-specific credential fields:
- **Twilio:** Account SID, Auth Token, Phone Number
- **SignalWire:** Project ID, API Token, Space URL, Phone Number
- **Vonage:** API Key, API Secret, Application ID, Private Key, Phone Number
- **Plivo:** Auth ID, Auth Token, Phone Number
- **Asterisk:** ARI URL, ARI Username, ARI Password, SIP Trunk details

Each provider shows:
- A "Test Connection" button that calls the provider's API to verify credentials
- A link to the provider's signup page
- A link to the provider-specific setup guide (from the docs site)

**Webhook URL display:** After credentials are validated, show the exact webhook URLs the admin needs to configure in their provider's dashboard, with copy-to-clipboard buttons:
- Voice: `https://{domain}/api/telephony/incoming`
- Voice status: `https://{domain}/api/telephony/status`
- SMS (if enabled): `https://{domain}/api/messaging/sms/webhook`

**3b: WhatsApp Configuration** (if WhatsApp selected)

Two paths:
- **Via Twilio** (recommended if already using Twilio for voice): Just enable WhatsApp sender in Twilio console. Show instructions + test.
- **Direct Meta API:** Guide through Meta Business Manager setup. Fields: Phone Number ID, Business Account ID, Access Token, Verify Token, App Secret. Test with a test message to the admin's WhatsApp.

**3c: Signal Bridge Configuration** (if Signal selected)

This is the most technical step. Show:
1. Prerequisites checklist (Linux server, Docker, phone number)
2. Docker run command (copy-to-clipboard)
3. Registration commands (step-by-step with curl examples)
4. Fields: Bridge URL, Bridge API Key, Webhook Secret, Registered Number
5. "Test Connection" button that pings the bridge health endpoint
6. Link to full Signal bridge setup guide

If the admin doesn't have infrastructure ready, allow them to skip and come back later. Mark Signal as "pending setup" in the channel list.

### Step 4: Quick Settings

Shown based on selected channels:

**If voice enabled:**
- Queue timeout (default: 3 minutes)
- Voicemail: on/off (default: on)
- Voicemail max duration (default: 120 seconds)
- CAPTCHA bot detection: on/off (default: off)

**If SMS/WhatsApp/Signal enabled:**
- Auto-response on first contact (editable template)
- After-hours auto-response (editable template)
- Conversation inactivity timeout (default: 60 minutes)
- Max concurrent conversations per volunteer (default: 3)

**If reports enabled:**
- Default report categories (editable list)

### Step 5: Invite Volunteers

- Generate one or more invite links/codes
- Option to set role: volunteer or reporter
- Copy-to-clipboard for sharing
- "Skip — I'll do this later" option

### Step 6: Summary & Launch

Show a summary card:
- Hotline name and language
- Enabled channels with status indicators (configured / pending)
- Provider(s) configured
- Number of invite codes generated
- "Go to Dashboard" button

Mark setup as complete in `SettingsDO` (`setupCompleted: true`).

## Making Telephony Optional

Currently, the app assumes telephony exists. Changes needed:

### Backend
- `getTelephony()` in `do-access.ts` should return `null` if no telephony provider is configured (instead of throwing)
- All telephony routes (`/api/telephony/*`) should return 404 or a helpful error if no provider is configured
- `CallRouterDO` should handle the case where no telephony provider exists (conversations-only mode)
- `ShiftManagerDO` shifts should work for messaging assignment even without voice

### Frontend
- Sidebar navigation should conditionally show/hide based on enabled channels:
  - "Calls" tab — only if voice is enabled
  - "Conversations" tab — only if any messaging channel is enabled
  - "Reports" tab — only if reports are enabled
  - "Shifts" tab — always (needed for both call routing and conversation assignment)
- Dashboard stats should adapt: show conversation metrics instead of/alongside call metrics
- Settings pages should only show relevant sections

### PWA manifest
- Already uses generic name "Hotline" — no changes needed

## Wizard State Machine

```
INCOMPLETE → step1 → step2 → step3a? → step3b? → step3c? → step4 → step5 → step6 → COMPLETE
                                                                                        ↓
                                                                              Dashboard (normal use)
```

State stored in `SettingsDO`:
```typescript
interface SetupState {
  setupCompleted: boolean
  completedSteps: string[]          // ['identity', 'channels', 'provider-voice', ...]
  pendingChannels: string[]         // channels selected but not yet configured
  selectedChannels: MessagingChannelType[] | 'voice'[]
}
```

The wizard is re-enterable: accessible from Settings > "Setup Wizard" to reconfigure or add channels. When re-entered, previously completed steps show their current values and can be modified.

## Files

- **Create:** `src/client/routes/setup.tsx` — setup wizard page (redirects here on first login if !setupCompleted)
- **Create:** `src/client/components/setup/SetupWizard.tsx` — wizard container with step navigation
- **Create:** `src/client/components/setup/StepIdentity.tsx` — hotline identity form
- **Create:** `src/client/components/setup/StepChannels.tsx` — channel selection cards
- **Create:** `src/client/components/setup/StepProviderVoice.tsx` — voice/SMS provider config
- **Create:** `src/client/components/setup/StepProviderWhatsApp.tsx` — WhatsApp config
- **Create:** `src/client/components/setup/StepProviderSignal.tsx` — Signal bridge config
- **Create:** `src/client/components/setup/StepSettings.tsx` — quick settings
- **Create:** `src/client/components/setup/StepInvite.tsx` — volunteer/reporter invite
- **Create:** `src/client/components/setup/StepSummary.tsx` — summary & launch
- **Create:** `src/client/components/setup/ChannelCard.tsx` — reusable channel selection card
- **Create:** `src/client/components/setup/ProviderCard.tsx` — reusable provider selection card
- **Create:** `src/client/components/setup/ConnectionTest.tsx` — test connection button + result display
- **Create:** `src/worker/routes/setup.ts` — setup API (get/update setup state, test connections)
- **Modify:** `src/worker/durable-objects/settings-do.ts` — SetupState, setupCompleted flag
- **Modify:** `src/worker/lib/do-access.ts` — getTelephony() returns null if unconfigured
- **Modify:** `src/client/routes/__root.tsx` — redirect to /setup if !setupCompleted, conditional nav
- **Modify:** `src/client/components/Sidebar.tsx` or equivalent — channel-aware nav items
- **Modify:** `src/worker/app.ts` — mount setup routes
- **Modify:** `src/shared/types.ts` — SetupState type

## Dependencies

- Epic 42 (Messaging Architecture — for MessagingConfig types and channel type definitions)

## Blocks

- Epic 44 (SMS), Epic 45 (WhatsApp), Epic 46 (Signal) — each channel hooks into the wizard's provider configuration step

## Testing

- E2E: First login → automatically redirected to setup wizard
- E2E: Complete voice-only setup → dashboard shows calls tab, no conversations tab
- E2E: Complete SMS-only setup → dashboard shows conversations tab, no calls tab
- E2E: Complete multi-channel setup → dashboard shows all relevant tabs
- E2E: Skip optional steps → wizard completes with pending items shown
- E2E: Re-enter wizard from settings → previous values preserved, can modify
- E2E: Provider connection test → success and failure states
- E2E: No provider configured → telephony routes return helpful errors, not crashes
