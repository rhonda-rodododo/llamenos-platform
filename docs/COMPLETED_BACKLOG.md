# Completed Backlog

## 2026-02-24: Two-Way Messaging with Volunteer Assignment

### Epics 68-73: Volunteer Messaging Assignment & Two-Way Conversation UI

#### Epic 68: Messaging Channel Permissions

- [x] Added `supportedMessagingChannels` and `messagingEnabled` fields to Volunteer type
- [x] Added channel-specific claim permissions (`conversations:claim-sms`, `conversations:claim-whatsapp`, etc.)
- [x] Updated default volunteer role with all channel claim permissions
- [x] Added `canClaimChannel()` and `getClaimableChannels()` helper functions
- [x] Updated conversations route to validate channel permissions on claim
- [x] Updated conversation listing to filter by volunteer's supported channels
- [x] Added MessagingChannelsCard UI component on volunteer profile page

#### Epic 69: Messaging Auto-Assignment

- [x] Added volunteer load tracking to ConversationDO (`getVolunteerLoad()`, `getAllVolunteerLoads()`)
- [x] Implemented `incrementLoad()` / `decrementLoad()` for conversation assignment tracking
- [x] Added `autoAssignConversation()` endpoint in ConversationDO
- [x] Updated `claimConversation()` to increment load counter
- [x] Updated `updateConversation()` to handle load changes on reassign/close
- [x] Updated alarm handler to decrement load on auto-close
- [x] Implemented `tryAutoAssign()` function in messaging router
- [x] Auto-assignment algorithm: filters by shift, channel capability, messaging enabled, not on-break, load capacity

#### Epic 70: Conversation Reassignment UI

- [x] Added `ReassignDialog` component with volunteer picker
- [x] Shows volunteer name, current load, channel capability, on-break status
- [x] Sorted volunteers by capability (capable first) then load (ascending)
- [x] Added "Reassign" button to conversation header (admin only)
- [x] Added "Return to queue" button to unassign and return to waiting status
- [x] Added `getVolunteerLoads()` API function
- [x] Added `/conversations/load` API route (admin only)

#### Epic 71: Message Delivery Status Tracking

- [x] Added `MessageDeliveryStatus` type (`pending`, `sent`, `delivered`, `read`, `failed`)
- [x] Added status fields to EncryptedMessage type (`status`, `deliveredAt`, `readAt`, `failureReason`, `retryCount`)
- [x] Added `MessageStatusUpdate` interface for webhook status callbacks
- [x] Added `parseStatusWebhook()` method to MessagingAdapter interface
- [x] Implemented status parsing in TwilioSmsAdapter (Twilio status callbacks)
- [x] Implemented status parsing in WhatsAppAdapter (Meta + Twilio modes)
- [x] Added `/messages/status` endpoint to ConversationDO
- [x] External ID mapping storage for status lookup
- [x] Status progression logic (only advance status, except failed can override)
- [x] Updated messaging router to check for status webhooks before parsing as message
- [x] WebSocket broadcast of `message:status` events

#### Epic 72: Volunteer Load Balancing

- [x] Implemented as part of Epic 69 (load tracking + auto-assignment)
- [x] `maxConcurrentPerVolunteer` setting enforced during auto-assignment

#### Epic 73: Enhanced Two-Way Conversation UI

- [x] Added delivery status icons to outbound messages in ConversationThread
- [x] Status indicators: Clock (pending), Check (sent), CheckCheck (delivered), CheckCheck+blue (read), AlertCircle (failed)
- [x] Failed message reason displayed as tooltip
- [x] WebSocket listener for `message:status` events

### Files Changed (20+ files)

- New: `src/client/components/ReassignDialog.tsx`, `docs/epics/epic-68-*` through `epic-73-*`
- Modified: `src/worker/types.ts`, `src/shared/permissions.ts`, `src/worker/routes/conversations.ts`, `src/worker/durable-objects/conversation-do.ts`, `src/worker/messaging/router.ts`, `src/worker/messaging/adapter.ts`, `src/worker/messaging/sms/twilio.ts`, `src/worker/messaging/whatsapp/adapter.ts`, `src/client/lib/api.ts`, `src/client/lib/hooks.ts`, `src/client/routes/conversations.tsx`, `src/client/routes/volunteers_.$pubkey.tsx`, `src/client/components/ConversationThread.tsx`
- Added shadcn components: checkbox, scroll-area

## 2026-02-24: Complete All Remaining Epics

### Phase 1: Security Completion
- [x] **L-9 Panic Wipe** — Triple-Escape detector, full storage wipe, red flash overlay (`panic-wipe.ts`, `panic-wipe-indicator.tsx`)
- [x] **L-10 SRI Hashes** — Vite closeBundle plugin computing SHA-384 for all precached assets, patching fetch in sw.js (`sri-workbox-plugin.ts`)
- [x] **PIN Challenge Re-auth** — PIN dialog before sensitive actions (phone unmask), max 3 attempts, auto-wipe on failure (`use-pin-challenge.ts`, `pin-challenge-dialog.tsx`)

### Phase 2: Epic 63 — RCS Channel
- [x] Google RBM REST adapter with JWT service account auth (`rcs/rbm-client.ts`, `rcs/adapter.ts`)
- [x] RBM API types for webhooks, rich cards, suggestions (`rcs/types.ts`)
- [x] Admin UI section: agent ID, service account key, webhook URL, fallback toggle, connection test (`rcs-channel-section.tsx`)
- [x] Shared types extension: `'rcs'` in MessagingChannelType, RCSConfig, channel maps
- [x] Router + factory integration for webhook handling

### Phase 3: Epic 62 — Message Blasts
- [x] Subscriber management in ConversationDO (CRUD, import, keyword opt-in/out, HMAC preference tokens)
- [x] Blast CRUD and delivery via DO alarms (rate-limited batch sending)
- [x] TCPA-compliant STOP keyword always recognized
- [x] Blast API routes proxying to ConversationDO
- [x] Public subscriber preferences endpoint (token-validated, no auth)
- [x] Client UI: BlastComposer, SubscriberManager, BlastSettingsPanel, blasts route, preferences route
- [x] Keyword interception in messaging webhook router

### Phase 4: Post-Launch Features
- [x] **Call Recording Playback** — On-demand fetch from telephony provider via `TelephonyAdapter.getRecordingAudio()`, permission-gated (admin or answering volunteer), lazy-loading `<RecordingPlayer>` component in calls and notes views
- [x] **CF Tunnel** — `scripts/dev-tunnel.sh` wrapping cloudflared for local dev webhook testing

### Phase 5: Epic 66 — Deployment Hardening
- [x] Ansible: 8 roles (common, ssh-hardening, firewall, kernel-hardening, fail2ban, docker, llamenos, backup)
- [x] Ansible: 4 playbooks (harden, deploy, update, backup) with Jinja2 templates
- [x] Ansible: justfile with generate-secrets, encrypt-vars, and all deployment commands
- [x] OpenTofu: Hetzner module with cloud-init hardening + generic module for Ansible inventory
- [x] `docs/QUICKSTART.md` — step-by-step deployment guide
- [x] `docs/RUNBOOK.md` — operational runbook (secret rotation, incident response, backup recovery)

## 2026-02-18: Epic 55 — Multi-Platform Deployment (Docker Compose + Helm)

### Platform Abstraction Layer
- [x] `src/platform/types.ts` — shared interfaces: StorageApi, DOContext, BlobStorage, TranscriptionService
- [x] `src/platform/index.ts` — Node.js build entry (esbuild alias for `cloudflare:workers`)
- [x] `src/platform/cloudflare.ts` — CF re-export (thin wrapper)
- [x] `src/platform/node/durable-object.ts` — SQLite-backed DO shim (better-sqlite3, WAL mode, setTimeout alarms)
- [x] `src/platform/node/websocket-pair.ts` — WebSocketPair polyfill (EventEmitter-based connected shim sockets)
- [x] `src/platform/node/blob-storage.ts` — S3/MinIO client (@aws-sdk/client-s3)
- [x] `src/platform/node/transcription.ts` — HTTP client for faster-whisper container
- [x] `src/platform/node/env.ts` — Node.js env shim (Docker secrets + env vars, DO singletons)
- [x] `src/platform/node/server.ts` — @hono/node-server entry point with static files + WS upgrade
- [x] `src/platform/node/cf-types.d.ts` — Type declarations replacing @cloudflare/workers-types

### Worker Refactoring (CF deployment unchanged)
- [x] `src/worker/types.ts` — Platform-aware Env with DOStub, DONamespace, BlobStorage, TranscriptionService
- [x] `src/worker/lib/do-access.ts` — Changed DurableObjectStub → DOStub
- [x] `src/worker/services/audit.ts` — Changed DurableObjectStub → DOStub
- [x] `src/worker/lib/helpers.ts` — Structural typing for stub parameter
- [x] `src/worker/lib/auth.ts` — Structural typing for identityDO parameter
- [x] `src/worker/app.ts` — Added `/api/health` endpoint

### Build System
- [x] `esbuild.node.mjs` — Node.js build config with `cloudflare:workers` alias + path aliases
- [x] `package.json` — Added build:node, build:docker, start:node scripts + new dependencies

### Docker Infrastructure
- [x] `deploy/docker/Dockerfile` — Multi-stage build (frontend + backend + production)
- [x] `deploy/docker/docker-compose.yml` — app, caddy, minio (core) + whisper, asterisk, signal (profiles)
- [x] `deploy/docker/Caddyfile` — Reverse proxy with security headers
- [x] `deploy/docker/.env.example` — All configuration variables documented
- [x] `.dockerignore` — Build exclusions

### Helm Chart (`deploy/helm/llamenos/`)
- [x] `Chart.yaml` — apiVersion v2, appVersion 0.9.1
- [x] `values.yaml` — Configurable app, MinIO, Whisper, Asterisk, Signal, ingress, secrets
- [x] `templates/` — deployment-app, service-app, ingress, secret, pvc-app, deployment-minio, deployment-whisper, serviceaccount, NOTES.txt, _helpers.tpl

### CI/CD
- [x] `.github/workflows/docker.yml` — Build + push to GHCR on tag push (app + asterisk-bridge images)

### New Dependencies
- @hono/node-server, @hono/node-ws, better-sqlite3, @aws-sdk/client-s3, ws, esbuild
- @types/better-sqlite3, @types/ws (devDeps)

### Architecture Notes
- DO source files unchanged — esbuild aliases `cloudflare:workers` to Node.js shim at build time
- SQLite single-writer means Node.js deployment is single-replica (appropriate for crisis hotline scale)
- WebSocket hibernation (CF-only feature) not needed — Node.js server stays running, connections stay open
- Self-hosted deployments start fresh; no data migration from CF needed

## 2026-02-17: Epic 54 — Device-Centric Auth & Forward-Secret Encryption

### Phase 1: PIN-First Local Key Store
- [x] `key-manager.ts` singleton — holds nsec in closure variable only, zeroed on lock
- [x] `unlock(pin)` decrypts nsec from localStorage via PBKDF2 (600K iterations) + XChaCha20-Poly1305
- [x] `importKey(nsec, pin)` for onboarding/recovery
- [x] Auto-lock on idle timeout + `document.hidden`
- [x] Login page redesigned: PIN entry as primary (stored key) or recovery options (no stored key)
- [x] Removed nsec from sessionStorage entirely — `storeSession()`/`getStoredSession()` deleted
- [x] `getAuthHeaders()` uses key-manager token if unlocked, session token if locked
- [x] Components show "Enter PIN to decrypt" overlay when key is locked

### Phase 2: Device Linking (Signal-Style QR Provisioning)
- [x] Provisioning room relay via IdentityDO with `provision:` prefix, 5-min TTL
- [x] Ephemeral ECDH key exchange protocol (new device generates temp keypair)
- [x] QR code display and manual code entry fallback
- [x] `/link-device` standalone page for new devices
- [x] Settings > Linked Devices section with code input
- [x] Provisioning rooms auto-cleaned via DO alarm

### Phase 3: Per-Note Ephemeral Keys (Forward Secrecy)
- [x] Each note encrypted with unique random 32-byte key (XChaCha20-Poly1305)
- [x] Per-note key wrapped via ECIES for each reader (author + admin envelopes)
- [x] `encryptNote()` / `decryptNote()` with `decryptNoteLegacy()` for backward compat
- [x] Note model updated with `authorEnvelope` and `adminEnvelope` fields
- [x] Compromising identity key no longer reveals past notes

### Phase 4: Simplified Onboarding & Recovery
- [x] nsec never displayed to users — replaced with Base32 recovery key (128-bit entropy)
- [x] Recovery key verification during onboarding (character check)
- [x] Mandatory encrypted backup download before proceeding
- [x] nsec flows directly from `generateKeyPair()` into `keyManager.importKey()`

### E2E Tests
- [x] `tests/device-linking.spec.ts` — 11 tests for /link-device page, settings section, login integration
- [x] `/link-device` added to public paths in `__root.tsx`

### Files Changed (16+ files)
- New: `src/client/lib/key-manager.ts`, `src/client/lib/provisioning.ts`, `src/client/components/qr-provisioning.tsx`, `src/client/routes/link-device.tsx`, `src/worker/routes/provisioning.ts`, `tests/device-linking.spec.ts`
- Modified: `src/client/lib/auth.tsx`, `api.ts`, `ws.ts`, `crypto.ts`, `backup.ts`, `src/client/routes/login.tsx`, `onboarding.tsx`, `settings.tsx`, `__root.tsx`, `src/worker/durable-objects/identity-do.ts`, `src/worker/app.ts`, `src/shared/types.ts`

## 2026-02-17: Epic 53 — Deep Security Audit & Hardening (Round 5)

### Critical Fixes
- [x] Login endpoint now verifies Schnorr signature before returning user info (was unauthenticated role enumeration)
- [x] CAPTCHA digits generated server-side with CSPRNG, stored in SettingsDO with one-time-use verification
- [x] Removed `Math.random()` from all CAPTCHA paths — replaced with `crypto.getRandomValues()`

### High Fixes
- [x] Invite redemption requires Schnorr signature proof of private key ownership + rate limiting
- [x] Upload chunk/status endpoints verify `uploadedBy === pubkey` ownership
- [x] Sessions revoked (`revokeAllSessions`) on volunteer deactivation/deletion
- [x] Onboarding backup encrypted with PBKDF2 + XChaCha20-Poly1305 (was plaintext nsec JSON)
- [x] HKDF salt added: `llamenos:hkdf-salt:v1` for note encryption key derivation
- [x] Recovery key PBKDF2 uses per-backup random salt (was static `'llamenos:recovery'`)
- [x] TwiML XML injection prevented — `escapeXml()` for all `<Say>`/`<Play>` content

### Medium Fixes
- [x] WebAuthn login rate limited (10/min per IP) on options + verify
- [x] CORS `Vary: Origin` header added to prevent cache poisoning
- [x] Notes endpoints guarded with `volunteerOrAdminGuard` (reporters blocked)
- [x] WebAuthn `userVerification` changed from `'preferred'` to `'required'`
- [x] IP hash increased from 64-bit to 96-bit truncation
- [x] Asterisk webhook: constant-time HMAC comparison + 5-minute timestamp replay protection
- [x] Asterisk bridge bound to localhost only

### Architecture Notes (documented, not fixed)
- Schnorr token 5-min replay window — mitigated by HTTPS; full nonce system deferred
- nsec in sessionStorage — mitigated by CSP; WebAuthn recommended as primary auth
- Ban list bypassable via caller-ID spoofing — PSTN limitation
- WebSocket rate limit resets on DO hibernation — acceptable for current usage

### Files Changed (21 files)
- `src/worker/routes/auth.ts`, `telephony.ts`, `invites.ts`, `uploads.ts`, `volunteers.ts`, `notes.ts`, `webauthn.ts`
- `src/worker/lib/crypto.ts`, `webauthn.ts`
- `src/worker/middleware/cors.ts`
- `src/worker/durable-objects/settings-do.ts`, `identity-do.ts`
- `src/worker/telephony/adapter.ts`, `twilio.ts`, `vonage.ts`, `plivo.ts`, `asterisk.ts`
- `src/client/lib/crypto.ts`, `backup.ts`, `api.ts`
- `src/client/routes/onboarding.tsx`
- `asterisk-bridge/src/index.ts`

## 2026-02-17: Epics 48–52 — UI/UX Design Overhaul with Teal Brand Identity

### Visual Identity
- [x] Brand tokens: deep teal primary (oklch 195°), warm amber accent (oklch 70°), warm off-white/blue-charcoal backgrounds in light/dark modes
- [x] New logo: shield + phone handset "L" mark with signal waves (SVG at all sizes)
- [x] Typography: DM Sans for body/headings via Google Fonts
- [x] Login page: radial gradient background, logo mark with fade-in animation, trust badge
- [x] Onboarding: amber warning cards, logo mark throughout, gradient backgrounds
- [x] Sidebar: logo mark, teal active nav border (3px), teal admin section headers
- [x] Dashboard: tinted stat cards (green active calls, teal on-shift, amber on-break)
- [x] All pages: consistent teal page title icons, warm card shadows

### Marketing Site
- [x] Teal accent palette applied throughout
- [x] Inline SVG logo replacing text-only branding
- [x] Enhanced hero glow effect
- [x] Teal hover borders on feature cards
- [x] Teal docs sidebar active states

### Files Changed (32 files)
- New: `src/client/components/logo-mark.tsx`
- Modified: `index.html`, all SVG icons (`favicon.svg`, `apple-touch-icon.svg`, `pwa-*.svg`), `src/client/app.css`, all route pages, marketing site components and layouts
- All 214 E2E tests passing, both app and site (182 pages) build cleanly

## 2026-02-17: Epics 37–41 — Codebase Refactoring & Test Coverage

### Epic 37: Split Admin Settings
- [x] Split `admin/settings.tsx` (1,135 → 231 lines) into 8 focused section components under `components/admin-settings/`
- [x] Components: call-settings, custom-fields, ivr-languages, passkey-policy, spam, telephony-provider, transcription, voice-prompts

### Epic 38: Shared Voice Prompts
- [x] Extracted ~800 lines of duplicated voice prompts from 4 telephony adapters into `shared/voice-prompts.ts`
- [x] Single source of truth for all IVR prompt text across Twilio, Vonage, Plivo, and Asterisk

### Epic 39: Split Notes Page
- [x] Split `notes.tsx` (644 → 395 lines), extracting `NewNoteForm`, `NoteEditForm`, and shared `CustomFieldInputs` components

### Epic 40: E2E Test Coverage Expansion
- [x] 30 new E2E tests across 3 files: `audit-log.spec.ts`, `shift-management.spec.ts`, `ban-management.spec.ts`
- [x] Total: 160 tests passing

### Epic 41: Type Safety
- [x] Fixed all `as any`/`unknown` casts in 6 files (volunteers route, volunteer-multi-select, audit page, volunteer profile, webauthn, webrtc)

### SessionManagerDO Split (pre-requisite refactor)
- [x] Split the 1,031-line `SessionManagerDO` "god object" (237-line `fetch()` with 40+ if-branches) into 3 focused DOs:
  - **IdentityDO**: volunteers, invites, WebAuthn credentials, sessions
  - **SettingsDO**: all config, IVR audio, rate limiting, fallback group
  - **RecordsDO**: bans, notes, audit log
- [x] Introduced `DORouter` — lightweight method+path router with `:param` extraction, replacing if-chain routing across all DOs
- [x] All 131 E2E tests pass with zero behavior changes

### Files Changed (34+ files)
- New: `src/worker/durable-objects/identity-do.ts`, `settings-do.ts`, `records-do.ts`, `src/worker/lib/do-router.ts`, `src/shared/voice-prompts.ts`, `src/client/components/admin-settings/*.tsx`, `src/client/components/notes/*.tsx`, 3 new test files
- Deleted: `src/worker/durable-objects/session-manager.ts`
- Net: -1,553 / +2,299 lines (significant deduplication)

## 2026-02-17: Epics 42–47 — Multi-Channel Messaging, Reporter Role & In-App Guidance

### Epic 42: Messaging Architecture Foundation
- [x] `MessagingAdapter` interface with `sendMessage()`, `sendMediaMessage()`, `parseInboundWebhook()`, `validateWebhook()`
- [x] Threaded conversations with `ConversationDO` Durable Object
- [x] `GET/POST /conversations`, `GET/POST /conversations/:id/messages` API routes
- [x] Real-time conversation updates via WebSocket (`conversation:new`, `message:new`)
- [x] Conversation list + detail UI with message bubbles, timestamps, direction indicators
- [x] Inbound webhook routing to correct channel adapter
- [x] Conversations nav link (visible when messaging channels enabled)
- [x] i18n: `conversations.*` keys in all 13 locales
- [x] 6 E2E tests for conversation UI

### Epic 43: Admin Setup Wizard
- [x] `/setup` route with multi-step guided wizard (name, channels, providers)
- [x] Channel selection cards (Voice, SMS, WhatsApp, Signal, Reports) with toggle
- [x] Provider configuration per channel with credential forms
- [x] `setupCompleted` flag in config context
- [x] Auto-redirect to setup on first admin login when not completed
- [x] i18n: `setupWizard.*` keys in all 13 locales
- [x] 10 E2E tests for setup wizard flow

### Epic 44: SMS Channel
- [x] SMS adapters for Twilio, SignalWire, Vonage, Plivo (implements MessagingAdapter)
- [x] Inbound SMS webhook parsing and signature validation per provider
- [x] Auto-response with configurable welcome message
- [x] SMS settings in admin panel (enable/disable, welcome message)
- [x] Provider-specific message format handling

### Epic 45: WhatsApp Business Channel
- [x] WhatsApp Cloud API adapter (Meta Graph API v21.0)
- [x] Template message support for initiating conversations
- [x] 24-hour messaging window handling
- [x] Webhook verification (hub.verify_token challenge)
- [x] Media message support (images, documents, audio)
- [x] WhatsApp settings in admin panel

### Epic 46: Signal Channel
- [x] Signal adapter via signal-cli-rest-api bridge
- [x] Health monitoring with graceful degradation
- [x] Voice message transcription via Workers AI Whisper
- [x] Signal settings in admin panel (bridge URL, phone number)

### Epic 47: Reporter Role & Encrypted File Uploads
- [x] `reporter` role with restricted permissions (reports only)
- [x] Reporter invite flow with role selector (volunteer/admin/reporter)
- [x] Encrypted report submission (ECIES for body, plaintext title)
- [x] Report categories and status tracking (open/claimed/resolved)
- [x] Report claiming and threaded replies
- [x] Reporter-specific navigation (reports + help only)
- [x] `UserRole` type consolidated in shared/types.ts
- [x] 46 E2E tests across reports, setup wizard, and conversations

### In-App Guidance & Help
- [x] `/help` route with FAQ sections (Getting Started, Calls & Shifts, Notes & Encryption, Administration)
- [x] Role-specific guides (Admin Guide, Volunteer Guide, Reporter Guide)
- [x] Quick reference cards (Keyboard Shortcuts, Security)
- [x] Collapsible FAQ items with expand/collapse
- [x] Quick Navigation links grid
- [x] Getting Started checklist on admin dashboard (tracks setup progress)
- [x] Help link in sidebar navigation for all user roles
- [x] Help command in command palette
- [x] 10 E2E tests for help features
- [x] 214 total E2E tests passing (0 regressions)

## 2026-02-11: Epic 32 — Multi-Provider Telephony Configuration

### Epic 32: Provider Configuration System
- [x] Shared types: `TelephonyProviderConfig`, `TelephonyProviderType`, `PROVIDER_REQUIRED_FIELDS`, `TELEPHONY_PROVIDER_LABELS`
- [x] Refactored `getTelephony()` from sync to async — reads provider config from SessionManagerDO, falls back to Twilio env vars
- [x] TwilioAdapter: made fields/methods `protected`, added `getApiBaseUrl()` / `getRecordingBaseUrl()` for SignalWire inheritance
- [x] Updated all `getTelephony()` call sites (telephony routes, ringing service, transcription service)
- [x] SessionManagerDO: `settings:telephony-provider` storage with validation (provider type, required fields, E.164 phone)
- [x] API routes: `GET/PATCH /settings/telephony-provider`, `POST /settings/telephony-provider/test` (connection test)
- [x] Admin settings UI: provider dropdown, per-provider credential forms, test connection button, save button
- [x] Not-implemented warnings for vonage/plivo/asterisk (awaiting Epic 33)
- [x] Deep link support: `?section=telephony-provider` auto-expands section
- [x] i18n: `telephonyProvider.*` (30+ keys) + `telephonyProviderChanged` audit event in all 13 locales
- [x] 11 new E2E tests: section visibility, env fallback, provider dropdown, field switching, save/reload persistence, connection test, deep link
- [x] 119 total E2E tests passing (0 regressions)
- [x] Epic docs created: `docs/epics/epic-32` through `epic-36` for full multi-provider plan

## 2026-02-12: Epics 33–36 — Multi-Provider Telephony (Cloud Adapters, WebRTC, Asterisk, Docs)

### Epic 33: Cloud Provider Adapters
- [x] SignalWire adapter — extends TwilioAdapter with Space URL override and custom auth
- [x] Vonage adapter — NCCO JSON format, JWT auth, Nexmo API endpoints
- [x] Plivo adapter — Plivo XML format, Auth ID/Token, Plivo API endpoints
- [x] All adapters implement full TelephonyAdapter interface (IVR, CAPTCHA, recording, voicemail, queue, parallel ringing)
- [x] Factory switch in `getTelephony()` instantiates correct adapter based on provider config
- [x] Provider-specific webhook parsing and validation

### Epic 34: WebRTC Volunteer Calling
- [x] WebRTC token generation API (`POST /api/telephony/webrtc-token`) with provider-specific tokens
- [x] Twilio, SignalWire, Vonage, Plivo token generation implementations
- [x] Volunteer call preference model: `callPreference: 'phone' | 'webrtc' | 'both'`
- [x] Call preference UI in volunteer settings with radio buttons + descriptions
- [x] WebRTC configuration section in admin telephony provider settings (API Key SID, Secret, TwiML App SID)
- [x] WebRTC toggle enables/disables browser calling per provider
- [x] Disabled browser/both options when admin hasn't configured WebRTC
- [x] `webrtc.ts` client library with provider abstraction (init, accept, hangup, mute, status)
- [x] `webrtc-call.tsx` component with answer/hangup/mute buttons and call timer
- [x] i18n: `callPreference`, `webrtcConfig`, `enableWebrtc`, API key labels in all 13 locales
- [x] 10 new E2E tests: preference section, default selection, disabled options, deep link, WebRTC config toggle, per-provider fields, persistence
- [x] 131 total E2E tests passing

### Epic 35: Asterisk ARI Adapter
- [x] Asterisk adapter (`src/worker/telephony/asterisk.ts`) — JSON command format for ARI bridge
- [x] Maps IVR/CAPTCHA/recording/voicemail flows to ARI commands (speak, play, gather, queue, bridge, record, hangup)
- [x] HMAC-SHA256 webhook validation between bridge and Worker
- [x] Channel state mapping (ARI states → agnostic statuses)
- [x] ARI bridge service (`asterisk-bridge/`) — 2,200+ lines, zero runtime dependencies
  - [x] ARI WebSocket client with reconnection and exponential backoff
  - [x] ARI REST client for channel/bridge/recording/playback operations
  - [x] Webhook sender with HMAC-SHA256 signing (Twilio-compatible form-urlencoded format)
  - [x] Command handler: translates Worker responses to ARI calls (playback, gather, bridge, queue, ring, record)
  - [x] HTTP server with signed endpoints (/command, /ring, /cancel-ringing, /hangup, /recordings)
  - [x] Comprehensive type definitions for ARI events, resources, webhook payloads, and bridge commands
  - [x] Dockerfile for deployment alongside Asterisk
  - [x] Sample Asterisk configs (ari.conf, http.conf, extensions.conf, pjsip.conf)
- [x] Removed "not implemented" warning from admin UI for Asterisk provider

### Epic 36: Telephony Documentation
- [x] Provider comparison page (`telephony-providers.md`) with pricing, features, and setup difficulty tables
- [x] Twilio setup guide (`setup-twilio.md`) — account, webhooks, admin config, WebRTC (API Key + TwiML App)
- [x] SignalWire setup guide (`setup-signalwire.md`) — Space name, LaML compatibility, differences from Twilio
- [x] Vonage setup guide (`setup-vonage.md`) — Application model, NCCO, private key auth
- [x] Plivo setup guide (`setup-plivo.md`) — Auth ID/Token, XML Application, endpoints
- [x] Asterisk setup guide (`setup-asterisk.md`) — server install, SIP trunk, ARI, dialplan, bridge deployment, security
- [x] WebRTC calling guide (`webrtc-calling.md`) — per-provider setup, volunteer preferences, browser compatibility, troubleshooting
- [x] All 7 guides translated to Spanish (es)
- [x] Astro route pages for all docs (7 default + 7 localized = 14 route files)
- [x] Docs index pages updated with guide links (en + es)
- [x] DEVELOPMENT.md — comprehensive development guide (setup, structure, architecture, testing)
- [x] README.md updated with multi-provider support and provider comparison table
- [x] Marketing site grows from 91 to 182 pages
- [x] 131 E2E tests passing (0 regressions)

## 2026-02-11: Marketing Site + Docs (Cloudflare Pages)

### Marketing Site at llamenos-hotline.com
- [x] Scaffolded Astro static site in `site/` with Tailwind v4 (via `@tailwindcss/vite`)
- [x] Dark theme design derived from app's oklch palette — bg, card, accent, green/amber/red semantic colors
- [x] **Home page**: Hero with tagline, 6 feature highlight cards, security callout, CTA section
- [x] **Features page**: 7 category sections with accent-bordered headings and left-bordered feature items
- [x] **Security page**: Honest security model with styled collapsible `<details>` elements (chevron indicators, borders, hover states)
- [x] **Docs hub**: Overview with architecture table, roles table, guide cards grid
- [x] **Getting Started guide**: Prerequisites, clone, bootstrap admin, configure secrets, Twilio webhooks, local dev, deploy
- [x] **Admin Guide**: Login, volunteer management, shifts, bans, call settings, custom fields, voice prompts, WebAuthn, audit log, call history
- [x] **Volunteer Guide**: Credentials, login, dashboard, receiving calls, notes, transcription, break toggle, keyboard shortcuts
- [x] Responsive layouts — BaseLayout (marketing pages) + DocsLayout (sidebar + content)
- [x] Mobile hamburger menu, responsive grids, sticky doc sidebar
- [x] Reusable components: Header, Footer, Hero, FeatureCard, LanguageSwitcher
- [x] Cloudflare Pages deployment config (`site/wrangler.jsonc`)
- [x] Root `package.json` scripts: `site:dev`, `site:build`, `site:deploy`
- [x] `.gitignore` updated for `site/dist/`, `site/node_modules/`, `site/.astro/`

### i18n (13 locales, full English + Spanish content)
- [x] Astro Content Collections for all page content (markdown per locale with English fallback)
- [x] `docs` collection: 4 docs pages (index, getting-started, admin-guide, volunteer-guide) in en + es
- [x] `pages` collection: 2 pages (features, security) in en + es
- [x] TypeScript translations for short UI strings (nav, footer, home page components)
- [x] Language switcher on all pages (desktop + mobile) — navigates to locale-prefixed URLs
- [x] 13-locale routing: English at root, other languages prefixed (`/es/`, `/zh/`, etc.)
- [x] Non-translated locales fall back to English content automatically
- [x] Fixed language switcher duplicate ID bug (class + querySelectorAll instead of id + getElementById)
- [x] Fixed Spanish docs double-prefix links (`/es/es/...` -> `/es/...`)
- [x] Translatable `guidesHeading` frontmatter field for docs index
- [x] 91 static HTML pages built across all locales

## 2026-02-09: Sidebar & Shifts UX Improvements

### Volunteer Autocomplete Multi-Select
- [x] Created `VolunteerMultiSelect` component using Popover + Command + Badge chips
- [x] Searchable by name, phone, or pubkey fragment (cmdk fuzzy matching)
- [x] Tag-style display with X to remove, accessible keyboard interaction
- [x] Installed shadcn/ui Popover component (Radix)
- [x] Replaced checkbox-based volunteer selection in ShiftForm and Fallback Group
- [x] i18n: `searchVolunteers`, `noVolunteersFound`, `selectedCount`, `removeVolunteer` in all 13 locales

### Hotline Number in Sidebar
- [x] Exposed `TWILIO_PHONE_NUMBER` via `/config` API endpoint as `hotlineNumber`
- [x] Added `hotlineNumber` to ConfigProvider context
- [x] Displayed hotline number below shift status indicator in sidebar (visible to all authenticated users)

### Sidebar Bottom Section Alignment
- [x] Unified icon sizes to `h-4 w-4` across theme row, command palette, and logout
- [x] Aligned theme switcher row with consistent `px-3 py-2 gap-2` padding matching other rows
- [x] Made LanguageSelect full-width in sidebar via `fullWidth` prop
- [x] Tightened vertical spacing from `space-y-2` to `space-y-1` for compact layout
- [x] All 103 E2E tests passing (0 regressions)

## 2026-02-09: Epic 31 — Custom Note Fields

### Epic 31: Admin-Configurable Custom Fields for Call Notes
- [x] Created `src/shared/types.ts` — shared `CustomFieldDefinition`, `NotePayload`, constants
- [x] Backend: `getCustomFields(role)` / `updateCustomFields(data)` in SessionManager DO
- [x] API routes: `GET/PUT /settings/custom-fields` with role-based visibility filtering
- [x] Client API: `getCustomFields()` / `updateCustomFields(fields)` functions
- [x] Crypto: `encryptNote` now takes `NotePayload` (text + fields), JSON-serialized before encryption
- [x] Crypto: `decryptNote` returns `NotePayload`, with legacy plain-text fallback
- [x] Draft system: extended with `fields` state and `setFieldValue()` callback
- [x] NoteSheet: renders custom fields (text, number, select, checkbox, textarea), validates, encrypts
- [x] Notes page: displays custom field values as badges, preserves fields on edit, includes in export
- [x] Settings page: full CRUD for custom fields — add, edit, delete, reorder (up/down), validation config
- [x] Role-based: `visibleToVolunteers` / `editableByVolunteers` toggles per field
- [x] Validation: required, min/max length, min/max value, max 20 fields, max 50 select options
- [x] E2EE preserved: field values encrypted inside note payload, server only sees opaque ciphertext
- [x] All i18n keys translated in 13 locales (en, es, zh, tl, vi, ar, fr, ht, ko, ru, hi, pt, de)
- [x] 5 new E2E tests: section visibility, add text field, add select field, delete field, deep link
- [x] 101 total E2E tests passing (0 regressions)

## 2026-02-09: Epic 30 — Collapsible Settings Sections

### Epic 30: Collapsible Settings with Deep Links
- [x] Installed shadcn/ui Collapsible component (Radix)
- [x] Created reusable `<SettingsSection>` wrapper with collapsible Card, copy-link button, chevron animation
- [x] Refactored all 10 settings sections to use `<SettingsSection>`
- [x] Profile section expanded by default, all others collapsed
- [x] Multiple sections can be open simultaneously (not single-accordion)
- [x] URL search param `?section=id` deep-links to any section (auto-expand + scroll)
- [x] TanStack Router `validateSearch` for type-safe section param
- [x] Copy link button on each section header (copies shareable URL, auto-clears clipboard after 30s)
- [x] Smooth height animation via Radix Collapsible + tw-animate-css
- [x] All strings translated in 13 locales
- [x] 4 new E2E tests: deep linking, collapse/expand, multi-open, copy-link button
- [x] Updated existing E2E tests to expand sections before interacting with content
- [x] 96 total E2E tests passing

## 2026-02-07: Initial MVP Build

### Epic 1: Project Foundation
- [x] Vite + TanStack Router SPA with file-based routing
- [x] Tailwind CSS v4 with dark theme
- [x] i18n with English + Spanish translations
- [x] Nostr keypair authentication
- [x] XChaCha20-Poly1305 note encryption
- [x] WebSocket real-time updates
- [x] Cloudflare Workers + Durable Objects backend
- [x] CLI admin bootstrap script

### Epic 2: Admin System
- [x] Volunteer management (CRUD, role assignment)
- [x] Client-side keypair generation for new volunteers
- [x] Shift scheduling with recurring days and time ranges
- [x] Fallback ring group configuration
- [x] Ban list management (single + bulk import)
- [x] Audit log viewer with pagination
- [x] Settings page (spam mitigation, transcription)

### Epic 3: Telephony
- [x] TelephonyAdapter interface (provider-agnostic)
- [x] Twilio implementation (incoming calls, parallel ringing, CAPTCHA)
- [x] Voice CAPTCHA with randomized 4-digit input
- [x] Sliding-window rate limiting per phone number
- [x] Ban check on incoming calls
- [x] Shift-based routing with fallback group
- [x] Call queue with hold music

### Epic 4: Volunteer Experience
- [x] Real-time dashboard with call status cards
- [x] Incoming call UI with answer button
- [x] Active call panel with timer and note-taking
- [x] Spam reporting from active call
- [x] Notes page with call grouping
- [x] Client-side note encryption/decryption

### Epic 5: Transcription
- [x] Cloudflare Workers AI (Whisper) integration
- [x] Admin toggle for global transcription enable/disable
- [x] Volunteer toggle for per-user transcription preference
- [x] Post-call transcript viewing in notes
- [x] Post-call transcript editing by volunteers

### Epic 6: UI Polish & Quality
- [x] shadcn/ui component system (button, card, badge, dialog, input, label, select, switch, separator)
- [x] Toast notification system (success, error, info)
- [x] Loading skeletons on all data pages
- [x] Call history page for admins with pagination
- [x] Profile setup flow (language selection on first login)
- [x] Volunteer on-break availability toggle (pause calls without leaving shift)
- [x] Server-side E.164 phone number validation
- [x] Session expiry with 5-minute token window (replay attack prevention)

### Epic 7: E2EE for Transcriptions
- [x] ECIES encryption using ephemeral ECDH with secp256k1
- [x] Server-side: encrypt transcription for volunteer's pubkey + admin's pubkey
- [x] Client-side: decrypt transcription via ECDH shared secret
- [x] XChaCha20-Poly1305 symmetric encryption with domain-separated key derivation
- [x] Ephemeral private key discarded immediately (forward secrecy)
- [x] Dual encryption: volunteer copy + admin copy for independent decryption
- [x] Backward compatibility with legacy plaintext transcriptions

### Epic 8: Call History Search/Filter
- [x] TanStack Router validateSearch for URL-persisted search params
- [x] Search by phone number or volunteer pubkey
- [x] Date range filtering (from/to)
- [x] Backend filtering in CallRouter DO

### Epic 9: Security Audit & Hardening
- [x] Twilio webhook signature validation (HMAC-SHA1)
- [x] Auth rate limiting (10 attempts/min per IP)
- [x] CORS restricted to same-origin (dev: localhost:5173)
- [x] Content-Security-Policy header added
- [x] Caller phone number redacted for non-admin users
- [x] Path traversal protection via extractPathParam helper
- [x] Confirmation dialogs replaced browser confirm() (ConfirmDialog component)

### Epic 10: E2E Tests
- [x] Smoke test: app loads, shows login, rejects invalid nsec
- [x] Admin flow: login, nav, volunteer CRUD, shifts, bans, audit log, settings, call history, notes, i18n, logout
- [x] Updated tests for ConfirmDialog (replaced window.confirm)

## 2026-02-08: Production Quality Polish

### Epic 11: Mobile Responsive
- [x] Collapsible sidebar with hamburger menu on mobile
- [x] Responsive grid forms (1-col mobile, 2-col desktop)
- [x] Adaptive data row layouts with flex-wrap
- [x] Responsive search form (stacked on mobile)
- [x] Mobile top bar with hotline name
- [x] Close sidebar on navigation

### Epic 12: Accessibility (A11y)
- [x] Skip-to-content link
- [x] aria-labels on all icon-only buttons
- [x] aria-pressed on toggle buttons
- [x] Fixed heading hierarchy (h1 per page)
- [x] HTML lang and dir (RTL) sync on language change
- [x] Toast role="alert" for errors, role="status" for success
- [x] a11y i18n namespace in all 13 locales

### Epic 13: Command Palette
- [x] Cmd/Ctrl+K global keyboard shortcut
- [x] Navigation, actions, theme, and language command groups
- [x] Admin-only navigation commands filtered
- [x] Sidebar trigger button with keyboard shortcut hint
- [x] commandPalette i18n namespace in all 13 locales

### Epic 14: E2E Test Expansion
- [x] Shared test helpers (login, create volunteer, profile setup)
- [x] 56 tests across 8 files (up from 14)
- [x] Volunteer flow: login, profile setup, limited nav, break toggle, admin page guards
- [x] Notes CRUD: create, view, edit, cancel, grouping
- [x] Auth guards: redirects, session persistence, API 403
- [x] Theme: dark/light/system switching, persistence
- [x] Form validation: phone format, E.164, bulk import
- [x] Responsive: mobile hamburger, no horizontal overflow
- [x] Mobile-chromium Playwright project for responsive tests

## 2026-02-08: UX / Design / Product Review

### Comprehensive Audit
- [x] Playwright screenshot audit of every page (login, dashboard, notes, shifts, volunteers, bans, calls, audit, settings)
- [x] Desktop (1280px) and mobile (375px) viewport testing
- [x] Light mode, dark mode, and system theme testing
- [x] Multilingual testing (English, Spanish, Arabic RTL)
- [x] Error state testing (invalid login)
- [x] All three persona flows reviewed (Caller, Volunteer, Admin)

### Findings Documented
- [x] 4 critical bugs identified (C1-C4): broken light mode, dead metric, duplicate identities, deployment gap
- [x] 6 high-priority UX issues (H1-H6): card wrapping, notes UX, missing translations, no notifications, no status dashboard, copy-paste bug
- [x] 8 medium-priority issues (M1-M8): tooltips, audit formatting, empty states, double-negative toggle
- [x] 8 low-priority issues (L1-L8): keyboard shortcuts, component consistency, pagination

### Epics Created
- [x] Epic 15: Light Mode & Design System Cleanup
- [x] Epic 16: Real-Time Volunteer Status & Admin Dashboard
- [x] Epic 17: Notification System
- [x] Epic 18: Notes & Search Improvements

### Backlog Updated
- [x] NEXT_BACKLOG.md reorganized with Critical/High/Medium/Low tiers and reference IDs

## 2026-02-08: Epics 15–18 & Full Bug Sweep

### Epic 15: Light Mode & Design System
- [x] Fixed hardcoded dark-mode colors across all pages (dashboard, notes, shifts, volunteers, bans, calls, audit, settings)
- [x] Dual light/dark theme support with proper CSS variable usage
- [x] Login button color fix for light mode (M3)

### Epic 16: Volunteer Status Dashboard & Presence
- [x] Backend presence tracking in SessionManager DO (online/offline/on-break per volunteer)
- [x] Real-time status updates via WebSocket broadcast
- [x] Admin dashboard card showing volunteer online/offline/on-break counts
- [x] Volunteer status indicators in admin volunteer list

### Epic 17: Notification System
- [x] Web Audio API ringtone for incoming calls (with play/pause toggle)
- [x] Browser push notifications (with permission request flow)
- [x] Tab title flashing on incoming call
- [x] Settings toggles for ringtone and browser notifications
- [x] Notification preferences persisted per-session

### Epic 18: Notes Search, Pagination & Call ID UX
- [x] URL-persisted search via TanStack Router validateSearch
- [x] Full-text search across note content
- [x] Pagination with configurable page size
- [x] Call ID selection from dropdown or manual entry
- [x] GDPR-compliant data export (JSON download)

### Bug Fixes
- [x] **C1** Fixed hardcoded dark-mode colors (Epic 15)
- [x] **C2** Fixed dead "Active Calls" metric — wired to real call data
- [x] **C3** Fixed duplicate volunteer identities — dedup by pubkey
- [x] **H1** Fixed card content wrapping/overflow on small viewports
- [x] **H3** Fixed notes UX — added search, pagination, call ID picker
- [x] **H6** Fixed missing translations — 20 new keys added to all 13 locales (238 keys parity)
- [x] **M1–M8** Medium priority items (tooltips, audit formatting, empty states, toggle labels, etc.)
- [x] **L4** Changed "Get Started" to "Complete Setup" in profile flow
- [x] **L5** Added keyboard shortcuts section to command palette

### Infrastructure & Test Fixes
- [x] CardTitle component changed from `<div>` to `<h3>` for proper heading semantics (a11y)
- [x] Playwright responsive tests fixed (`test.use()` moved to top-level)
- [x] Admin flow test fixed (strict mode violation on `getByText('Admin')`)
- [x] Test helper `completeProfileSetup` updated for new button text
- [x] Playwright config: explicit worker count (4 local, 1 CI)
- [x] i18n: 20 new keys translated across 12 locales (238 keys parity across all 13 files)
- [x] Deployed to Cloudflare Workers

## 2026-02-08: Epics 24–27 — UX & Polish Round

### Epic 24: Shift & Call Status Awareness
- [x] Shift status hook (`useShiftStatus`) — checks current/next shift for logged-in user
- [x] Sidebar shift indicator — shows current shift name + end time, or next shift day/time
- [x] In-call indicator in sidebar — shows animated pulse when volunteer is on a call
- [x] Dashboard "Calls Today" metric wired to real API data

### Epic 25: Command Palette Enhancements
- [x] Quick Note action — create encrypted note directly from command palette
- [x] Search shortcuts — type in palette to search notes or calls
- [x] Admin-only search filtering (call search only visible to admins)

### Epic 26: Custom IVR Audio Recording
- [x] Admin voice prompt recording via MediaRecorder API (max 60s per prompt)
- [x] IVR audio CRUD API (upload, list, delete, stream)
- [x] Backend storage in SessionManager DO (`ivr-audio:*` keys)
- [x] `sayOrPlay()` TwiML helper — uses `<Play>` for custom audio, falls back to `<Say>` TTS
- [x] `AudioUrlMap` type in TelephonyAdapter interface
- [x] Voice Prompts admin settings card with per-language recording grid
- [x] Audit events for IVR audio upload/delete

### Epic 27: Remaining Polish & Backlog Items
- [x] Replaced all raw `<select>` elements with shadcn Select (notes, volunteers, note-sheet)
- [x] Toast dismiss button for manual close
- [x] Keyboard shortcuts help dialog (`?` key + command palette action)
- [x] Confirmation dialogs for admin settings toggles (transcription, CAPTCHA, rate limiting)
- [x] Note draft auto-save with `useDraft` hook and draft indicator
- [x] `shortcuts`, `confirm`, `draftSaved` i18n keys across all 13 locales

## 2026-02-09: Security Hardening & Voicemail

### Security Hardening (from deep audit — round 1)
- [x] Constant-time comparison for auth tokens and Twilio webhook signatures
- [x] WebSocket auth moved from URL query params to `Sec-WebSocket-Protocol` header
- [x] CSP `wss:` restricted to same host only
- [x] HSTS header added (max-age=63072000, includeSubDomains, preload)
- [x] Caller phone numbers redacted in all WebSocket broadcasts
- [x] Browser notifications use generic text (no caller info on lock screens)
- [x] Service worker API caching removed (sensitive data protection)
- [x] PWA manifest uses generic name "Hotline" (not "Llámenos")
- [x] Audit logs include IP/country/UA metadata
- [x] Console.logs removed from production paths
- [x] Deployment URL removed from all documentation

### Epic 28: Voicemail Fallback
- [x] `handleVoicemail()` in TwilioAdapter with `<Record>` TwiML (max 120s)
- [x] Voicemail voice prompts in all 13 languages
- [x] Queue timeout: `<Leave/>` after 90 seconds via QueueTime check in wait music
- [x] `<Enqueue action=...>` routes to voicemail on queue exit (leave/queue-full/error)
- [x] CallRecord type expanded: `'unanswered'` status + `hasVoicemail` field
- [x] CallRouter DO: `handleVoicemailLeft()` — moves call to history, broadcasts `voicemail:new`
- [x] Voicemail transcription via Workers AI Whisper, encrypted for admin (ECIES)
- [x] Voicemail thank-you message in 13 languages after recording
- [x] Frontend: unanswered badge + voicemail indicator in call history
- [x] `voicemailReceived` audit event
- [x] i18n: `unanswered`, `hasVoicemail`, `voicemailReceived`, `voicemailPrompt` keys in all 13 locales

### Security Hardening (from deep audit — round 2)
- [x] **CRITICAL**: Auth tokens replaced with BIP-340 Schnorr signatures (was SHA-256 hash — auth bypass)
- [x] WebSocket subprotocol encoding fixed to base64url (no `=` / `/` chars that crash WS handshake)
- [x] WebSocket server echoes `Sec-WebSocket-Protocol: llamenos-auth` header (WS spec compliance)
- [x] Caller PII removed from notification function signature (defense in depth)
- [x] Encrypted draft notes cleaned from localStorage on logout
- [x] Profile settings backend accepts name + phone updates (admin can set phone to receive calls)

## 2026-02-09: Epic 29 — Configurable Settings, WebAuthn & Backlog Completion

### Feature 1: Configurable Call Settings
- [x] Queue timeout configurable (30-300s, default 90s) — admin settings UI + backend
- [x] Voicemail max duration configurable (30-300s, default 120s)
- [x] CallSettings type + DO storage + PATCH/GET API routes
- [x] TwilioAdapter uses configurable values for queue timeout & voicemail recording
- [x] i18n: `callSettings.*` keys in all 13 locales

### Feature 2: WebAuthn Passkeys
- [x] `@simplewebauthn/server` + `@simplewebauthn/browser` integration
- [x] Server-side WebAuthn lib (registration + authentication flows)
- [x] Dual auth: `Authorization: Bearer {schnorr}` and `Authorization: Session {token}`
- [x] WebAuthn credential CRUD in SessionManager DO
- [x] Server session management (256-bit random tokens, 8-hour expiry)
- [x] Single-use challenges with 5-minute TTL
- [x] Login page "Sign in with passkey" button
- [x] Settings page credential management (list, register, delete)
- [x] Admin "Passkey Policy" card (require for admins/volunteers)
- [x] WebSocket auth extended for session tokens
- [x] `/auth/me` returns `webauthnRequired` + `webauthnRegistered`
- [x] i18n: `webauthn.*` keys (18 keys) in all 13 locales

### Feature 3: Session Expiry UX
- [x] Idle tracking (30s interval checks for 4-minute idle)
- [x] Warning toast "Session expiring soon" with "Stay logged in" button
- [x] Non-dismissible expired dialog with reconnect option
- [x] Session token auto-renewal via `getMe()` call
- [x] i18n: `session.*` keys in all 13 locales

### Feature 4: Phone Input with Live E.164 Validation
- [x] `PhoneInput` component with auto-prepend `+`, live validation, color-coded borders
- [x] Replaced in settings, volunteers (add + invite), and bans pages
- [x] i18n: `phone.*` keys in all 13 locales

### Feature 5: E2E Test Isolation
- [x] `resetTestState()` helper in `tests/helpers.ts`
- [x] `test.beforeEach` reset in all mutating test files
- [x] `workers: 1` in playwright.config.ts for serial execution
- [x] Test reset endpoints in all 3 DOs (Session, Shift, CallRouter)

### Security Hardening (Audit Round 3)
- [x] Hash caller phone numbers before DO storage (SHA-256 with domain separator)
- [x] ~~Hash phone numbers in ban list~~ (reverted — admin needs original numbers for ban management)
- [x] Move rate limiting from in-memory Map to DO storage (persists across Worker restarts)
- [x] Guard Twilio webhook validation — only skip when BOTH dev mode AND localhost
- [x] Rate-limit invite validation endpoint (10 req/min per IP)
- [x] Hash IP addresses in audit log entries (truncated SHA-256)
- [x] Stop broadcasting volunteer pubkeys in presence updates (anonymous counts only)
- [x] Remove plaintext pubkey from encrypted key-store localStorage (hashed with domain separator)
- [x] Add notes export encryption (XChaCha20-Poly1305 with user's key, .enc format)
- [x] Auto-clear clipboard after 30s for nsec/invite link copy
