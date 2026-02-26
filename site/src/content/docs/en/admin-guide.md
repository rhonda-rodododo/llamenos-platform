---
title: Admin Guide
description: Manage everything — volunteers, shifts, channels, conversations, reports, ban lists, and custom fields.
---

As an admin, you manage everything: volunteers, shifts, communication channels, conversations, reports, ban lists, and custom fields. This guide covers the key admin workflows.

## Logging in

Log in with the `nsec` (Nostr secret key) generated during [setup](/docs/getting-started). The login page accepts the nsec format (`nsec1...`). Your browser signs a challenge with the key — the secret never leaves the device.

Optionally, register a WebAuthn passkey in Settings for passwordless login on additional devices.

## Setup wizard

On your first login, the app redirects to the **setup wizard** — a guided multi-step flow:

1. **Name your hotline** — set the display name shown to users
2. **Choose channels** — toggle Voice, SMS, WhatsApp, Signal, and Reports on/off
3. **Configure providers** — enter credentials for each enabled channel
4. **Review** — confirm your settings and complete setup

After completing the wizard, the `setupCompleted` flag is set and the wizard won't appear again. You can always change these settings later from the Settings page.

## Managing volunteers

Navigate to **Volunteers** in the sidebar to:

- **Add a volunteer** — generates a new Nostr keypair. Share the nsec securely with the volunteer (it's shown once).
- **Create an invite link** — generates a one-time link. The invite flow includes a role selector (volunteer, admin, or reporter).
- **Edit** — update name, phone number, and role.
- **Remove** — deactivate a volunteer's access.

Volunteer phone numbers are only visible to admins. They're used for parallel ringing when the volunteer is on shift.

## Managing reporters

Reporters are a special role for people who submit tips or reports through the platform. They have restricted access — they can only view their own reports and the help page.

To add a reporter:
1. Create an invite link and select the **Reporter** role
2. Share the link with the reporter — they'll create their own credentials
3. Reporters log in and see a simplified interface with Reports and Help only

## Configuring shifts

Navigate to **Shifts** to create recurring schedules:

1. Click **Add Shift**
2. Set a name, select days of the week, and set start/end times
3. Assign volunteers using the searchable multi-select
4. Save — the system will automatically route calls to volunteers on the active shift

Configure a **Fallback Group** at the bottom of the shifts page. These volunteers will ring when no scheduled shift is active.

## Ban lists

Navigate to **Bans** to manage blocked phone numbers:

- **Single entry** — type a phone number in E.164 format (e.g., +15551234567)
- **Bulk import** — paste multiple numbers, one per line
- **Remove** — unban a number instantly

Bans take effect immediately. Banned callers hear a rejection message and are disconnected.

## Conversations

When messaging channels (SMS, WhatsApp, Signal) are enabled, a **Conversations** link appears in the sidebar. This shows all threaded conversations across all messaging channels.

Each conversation shows:
- Message bubbles with timestamps and direction (inbound/outbound)
- The channel the message arrived on (SMS, WhatsApp, Signal)
- Real-time updates via Nostr relay — new messages appear instantly

Conversations are created automatically when an inbound message arrives. Volunteers can respond directly from the conversation view.

## Reports

When the Reports channel is enabled, admins can view all submitted reports:

- **Report list** — shows all reports with title, category, status, and submission date
- **Status tracking** — reports progress through open → claimed → resolved
- **Claim a report** — assign yourself to handle a report
- **Threaded replies** — respond to reporters with encrypted messages
- **File attachments** — reporters can upload encrypted files with their reports

Report body content and file attachments are encrypted using ECIES — the server never sees plaintext report content.

## Call settings

In **Settings**, you'll find several sections:

### Spam mitigation

- **Voice CAPTCHA** — toggle on/off. When enabled, callers must enter a random 4-digit code.
- **Rate limiting** — toggle on/off. Limits calls per phone number within a sliding time window.

### Transcription

- **Global toggle** — enable/disable Whisper transcription for all calls.
- Individual volunteers can also opt out via their own settings.

### Call settings

- **Queue timeout** — how long callers wait before going to voicemail (30-300 seconds).
- **Voicemail max duration** — maximum recording length (30-300 seconds).

### Custom note fields

Define structured fields that appear in the note-taking form:

- Supported types: text, number, select (dropdown), checkbox, textarea
- Configure validation: required, min/max length, min/max value
- Control visibility: choose which fields volunteers can see and edit
- Reorder fields using up/down arrows
- Maximum 20 fields, maximum 50 options per select field

Custom field values are encrypted alongside note content. The server never sees them.

### Voice prompts

Record custom IVR audio prompts for each supported language. The system uses your recordings for greeting, CAPTCHA, queue, and voicemail flows. Where no recording exists, it falls back to text-to-speech.

### Messaging channels

Configure SMS, WhatsApp, and Signal channels:

- **SMS** — enable/disable, configure welcome message for auto-responses. Uses the same provider as your voice telephony (Twilio, SignalWire, Vonage, or Plivo).
- **WhatsApp** — enable/disable, enter Meta Cloud API credentials (access token, verify token, phone number ID). Supports template messages for initiating conversations within the 24-hour messaging window.
- **Signal** — enable/disable, configure the signal-cli-rest-api bridge URL and phone number. Includes health monitoring with graceful degradation.

Each channel has its own webhook endpoint — see [Getting Started](/docs/getting-started) for the URLs to configure.

### WebAuthn policy

Optionally require passkeys for admins, volunteers, or both. When required, users must register a passkey before they can use the app.

## In-app help

The **Help** page provides:
- FAQ sections: Getting Started, Calls & Shifts, Notes & Encryption, Administration
- Role-specific guides for admins, volunteers, and reporters
- Quick reference cards for keyboard shortcuts and security
- Collapsible FAQ items with expand/collapse

The admin dashboard also shows a **Getting Started checklist** that tracks setup progress (configure channels, add volunteers, create shifts, etc.).

## Audit log

The **Audit Log** page shows a chronological list of system events: logins, call answers, note creation, setting changes, and admin actions. Entries include hashed IP addresses and country metadata. Use pagination to browse history.

## Call history

The **Calls** page shows all calls with status, duration, and volunteer assignment. Filter by date range or search by phone number. Export data in GDPR-compliant JSON format.
