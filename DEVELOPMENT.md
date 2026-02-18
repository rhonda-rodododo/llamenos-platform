# Development Guide

## Prerequisites

- [Bun](https://bun.sh/) (v1.0+) — runtime and package manager
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) — Cloudflare Workers CLI (installed via `bun install`)
- [Playwright](https://playwright.dev/) — E2E testing (installed via `bun install`)

## Setup

```bash
bun install
bun run bootstrap-admin    # Generate admin keypair
cp .dev.vars.example .dev.vars   # Configure env vars
```

## Commands

```bash
bun run dev          # Vite dev server (frontend only, hot reload)
bun run dev:worker   # Wrangler dev server (full app with Workers + DOs)
bun run build        # Vite build → dist/client/
bun run deploy       # Build + wrangler deploy
bun run typecheck    # TypeScript type checking (tsc --noEmit)
bunx playwright test # Run all E2E tests
bunx playwright test tests/smoke.spec.ts  # Run a single test file
bun run test:ui      # Playwright UI mode
```

## Project Structure

```
src/
  client/              # Frontend SPA
    routes/            # TanStack Router file-based routes
      setup.tsx        # Admin setup wizard (first-login flow)
      conversations.tsx # Threaded messaging conversations
      reports.tsx      # Reporter submission + admin review
      help.tsx         # In-app FAQ and role-specific guides
      link-device.tsx  # Device linking page (standalone, no auth required)
    components/        # App components + ui/ (shadcn primitives)
    lib/               # Client utilities
      api.ts           # REST API client
      auth.tsx         # Auth context (Nostr + WebAuthn)
      key-manager.ts   # PIN-encrypted local key store (closure-based)
      provisioning.ts  # Device linking (QR/code provisioning protocol)
      crypto.ts        # E2EE encryption/decryption (notes, reports, export)
      webrtc.ts        # WebRTC call handling
      ws.ts            # WebSocket connection
      backup.ts        # Encrypted backup/recovery key generation
    locales/           # 13 locale JSON files
  worker/              # Cloudflare Worker backend
    routes/            # Hono API route handlers
    durable-objects/   # 6 singleton DOs
      identity-do.ts       # Auth, WebSocket, presence, device provisioning
      settings-do.ts       # Settings, custom fields, IVR audio, messaging config
      records-do.ts        # Audit log, call history, recordings
      shift-manager.ts     # Shifts, volunteers, invites
      call-router.ts       # Calls, notes, active call state
      conversation-do.ts   # Threaded messaging conversations
    telephony/         # Voice provider adapters
      adapter.ts       # TelephonyAdapter interface
      twilio.ts        # Twilio implementation
      signalwire.ts    # SignalWire (extends Twilio)
      vonage.ts        # Vonage (NCCO format)
      plivo.ts         # Plivo (Plivo XML format)
      asterisk.ts      # Asterisk ARI (JSON commands)
      webrtc-tokens.ts # WebRTC token generation
    messaging/         # Messaging channel adapters
      adapter.ts       # MessagingAdapter interface
      sms/             # SMS adapters (Twilio, SignalWire, Vonage, Plivo)
      whatsapp.ts      # WhatsApp Business Cloud API (Meta Graph API v21.0)
      signal.ts        # Signal via signal-cli-rest-api bridge
    lib/               # Server utilities
  shared/              # Cross-boundary code
    types.ts           # Shared types (UserRole, ConversationMessage, ReportPayload, etc.)
    languages.ts       # Language config (codes, labels, voice IDs)
tests/                 # Playwright E2E tests (214+ tests)
site/                  # Marketing site (Astro + Tailwind)
asterisk-bridge/       # ARI bridge service (standalone Bun service)
```

## Path Aliases

Configured in both `tsconfig.json` and `vite.config.ts`:

- `@/*` → `./src/client/*`
- `@worker/*` → `./src/worker/*`
- `@shared/*` → `./src/shared/*`

## Key Config Files

- `wrangler.jsonc` — Worker config, DO bindings, env vars
- `playwright.config.ts` — E2E test config
- `.dev.vars` — Local secrets (gitignored): Twilio creds, ADMIN_PUBKEY
- `vite.config.ts` — Frontend build config
- `tsconfig.json` — TypeScript config

## Architecture

### Durable Objects

Six singleton DOs accessed via `idFromName()`:

| DO | ID | Purpose |
|----|-----|---------|
| IdentityDO | `global-identity` | Auth, WebSocket, presence, device provisioning |
| SettingsDO | `global-settings` | Settings, custom fields, IVR audio, messaging config |
| RecordsDO | `global-records` | Audit log, call history, recordings |
| ShiftManagerDO | `global-shifts` | Shifts, volunteers, invites |
| CallRouterDO | `global-calls` | Calls, notes, active call state |
| ConversationDO | `global-conversations` | Threaded messaging conversations (SMS, WhatsApp, Signal) |

> **Note:** The original `SessionManagerDO` was split into IdentityDO, SettingsDO, and RecordsDO (Epics 37-41) for separation of concerns.

### Authentication

Dual auth modes:
1. **Schnorr signatures** — `Authorization: Bearer {timestamp}:{hex-signature}` (BIP-340)
2. **WebAuthn sessions** — `Authorization: Session {token}` (256-bit random, 8hr expiry)

### Key Management

Client-side key protection via `src/client/lib/key-manager.ts`:

- **PIN-encrypted local store** — nsec encrypted with PBKDF2 (600K iterations) + XChaCha20-Poly1305, stored in localStorage
- **In-memory closure** — decrypted nsec held in a closure variable only, never in sessionStorage or any browser API
- **Auto-lock** — key zeroed on idle timeout or `document.hidden`; components show "Enter PIN" overlay when locked
- **Two-tier access** — "authenticated but locked" (session token) vs "authenticated and unlocked" (PIN entered, full crypto)
- **Device linking** — Signal-style QR provisioning via ephemeral ECDH key exchange through IdentityDO relay rooms (5-min TTL)
- **Recovery keys** — 128-bit Base32 recovery keys with mandatory encrypted backup download during onboarding

### Telephony (Voice)

The `TelephonyAdapter` interface abstracts provider-specific voice APIs. All adapters implement the same interface for call flow (IVR, CAPTCHA, queueing, ringing, recording, voicemail).

Provider responses vary:
- **Twilio/SignalWire**: TwiML (XML)
- **Vonage**: NCCO (JSON)
- **Plivo**: Plivo XML
- **Asterisk**: JSON commands (via ARI bridge)

### Messaging (SMS, WhatsApp, Signal)

The `MessagingAdapter` interface abstracts text messaging across channels. Each adapter implements `sendMessage()`, `sendMediaMessage()`, `parseInboundWebhook()`, and `validateWebhook()`.

| Channel | Adapter | Webhook Endpoint |
|---------|---------|-----------------|
| SMS | Per-provider (Twilio, SignalWire, Vonage, Plivo) | `POST /api/messaging/sms/webhook` |
| WhatsApp | Meta Graph API v21.0 | `POST /api/messaging/whatsapp/webhook` |
| Signal | signal-cli-rest-api bridge | `POST /api/messaging/signal/webhook` |

All inbound messages are routed to the ConversationDO and broadcast via WebSocket (`conversation:new`, `message:new`).

### Roles

Four user roles defined in `src/shared/types.ts` (`UserRole`):

| Role | Permissions |
|------|------------|
| `admin` | Full access: settings, volunteers, shifts, notes, calls, conversations, reports, audit |
| `volunteer` | Answer calls, write notes, respond to conversations, view own data |
| `reporter` | Submit encrypted reports with file attachments, view own reports |

The `reporter` role has restricted navigation (reports + help only). Reporters are invited via the same invite flow as volunteers, with a role selector.

### Encryption

- **Notes**: Per-note forward secrecy — each note encrypted with unique random 32-byte key (XChaCha20-Poly1305), key wrapped via ECIES for each reader (author + admin envelopes). Compromising identity key does not reveal past notes.
- **Transcriptions**: ECIES — ephemeral ECDH (secp256k1) + XChaCha20-Poly1305, dual-encrypted for volunteer + admin
- **Reports**: ECIES encrypted body + encrypted file attachments, dual-encrypted for reporter + admin
- **Data export**: Notes export encrypted with user's key (XChaCha20-Poly1305, .enc format)
- **Key derivation**: HKDF-SHA256 with application salt (`llamenos:hkdf-salt:v1`)

## Testing

E2E tests only (no unit tests). Tests run against the Wrangler dev server.

```bash
# Full suite
bunx playwright test

# Single file
bunx playwright test tests/smoke.spec.ts

# UI mode (interactive)
bun run test:ui

# Debug mode
bunx playwright test --debug
```

Test helpers in `tests/helpers.ts` provide `loginAsAdmin()`, `loginAsVolunteer()`, `loginAsReporter()`, `resetTestState()`.

### Writing Tests

- Always reset state in `beforeAll` or `beforeEach`
- Use `{ exact: true }` for heading/text matchers to avoid ambiguity
- For Settings navigation: `page.getByRole('link', { name: 'Settings' }).last()` (`.first()` matches "Admin Settings")
- `PhoneInput` onBlur can swallow clicks — `await input.blur()` before clicking Save
- Playwright runs with `workers: 1` for serial execution

## Common Gotchas

- `@noble/ciphers` and `@noble/hashes` require `.js` extension in imports
- `schnorr` is a separate named export: `import { schnorr } from '@noble/curves/secp256k1.js'`
- Nostr pubkeys are x-only (32 bytes) — prepend `"02"` for ECDH
- `secp256k1.getSharedSecret()` returns 33 bytes — extract x-coord with `.slice(1, 33)`
- Workbox `navigateFallbackDenylist` excludes `/api/` and `/telephony/` routes

## Marketing Site

The marketing site lives in `site/` (Astro + Tailwind):

```bash
cd site
bun install
bun run dev         # Local dev server
bun run build       # Build static site
bunx wrangler pages deploy dist --project-name llamenos-site  # Deploy
```

Content collections in `site/src/content/docs/` for documentation pages (en + es).
