---
title: Features
subtitle: Everything a crisis response platform needs, in one open-source package. Voice, SMS, WhatsApp, Signal, and encrypted reports — built on Cloudflare Workers with zero servers to manage.
---

## Multi-Provider Telephony

**5 voice providers** — Choose from Twilio, SignalWire, Vonage, Plivo, or self-hosted Asterisk. Configure your provider in the admin settings UI or during the setup wizard. Switch providers at any time without code changes.

**WebRTC browser calling** — Volunteers can answer calls directly in the browser without a phone. Provider-specific WebRTC token generation for Twilio, SignalWire, Vonage, and Plivo. Configurable per-volunteer call preference (phone, browser, or both).

## Call Routing

**Parallel ringing** — When a caller dials in, every on-shift, non-busy volunteer rings simultaneously. The first volunteer to pick up gets the call; other ringing stops immediately.

**Shift-based scheduling** — Create recurring shifts with specific days and time ranges. Assign volunteers to shifts. The system automatically routes calls to whoever is on duty.

**Queue with hold music** — If all volunteers are busy, callers enter a queue with configurable hold music. Queue timeout is adjustable (30-300 seconds). When no one answers, calls fall through to voicemail.

**Voicemail fallback** — Callers can leave a voicemail (up to 5 minutes) if no volunteer answers. Voicemails are transcribed via Whisper AI and encrypted for admin review.

## Encrypted Notes

**End-to-end encrypted note-taking** — Volunteers write notes during and after calls. Notes are encrypted client-side using ECIES (secp256k1 + XChaCha20-Poly1305) before leaving the browser. The server stores only ciphertext.

**Dual encryption** — Every note is encrypted twice: once for the volunteer who wrote it, and once for the admin. Both can decrypt independently. No one else can read the content.

**Custom fields** — Admins define custom fields for notes: text, number, select, checkbox, textarea. Fields are encrypted alongside note content.

**Draft auto-save** — Notes are auto-saved as encrypted drafts in the browser. If the page reloads or the volunteer navigates away, their work is preserved. Drafts are cleaned on logout.

## AI Transcription

**Whisper-powered transcription** — Call recordings are transcribed using Cloudflare Workers AI with the Whisper model. Transcription happens server-side, then the transcript is encrypted before storage.

**Toggle controls** — Admin can enable/disable transcription globally. Volunteers can opt out individually. Both toggles are independent.

**Encrypted transcripts** — Transcripts use the same ECIES encryption as notes. The stored transcript is ciphertext only.

## Spam Mitigation

**Voice CAPTCHA** — Optional voice bot detection: callers hear a randomized 4-digit number and must enter it on the keypad. Blocks automated dialing while remaining accessible to real callers.

**Rate limiting** — Sliding-window rate limiting per phone number, persisted in Durable Object storage. Survives Worker restarts. Configurable thresholds.

**Real-time ban lists** — Admins manage phone number ban lists with single-entry or bulk import. Bans take effect immediately. Banned callers hear a rejection message.

**Custom IVR prompts** — Record custom voice prompts for each supported language. The system uses your recordings for IVR flows, falling back to text-to-speech when no recording exists.

## Multi-Channel Messaging

**SMS** — Inbound and outbound SMS messaging via Twilio, SignalWire, Vonage, or Plivo. Auto-response with configurable welcome messages. Messages flow into the threaded conversation view.

**WhatsApp Business** — Connect via the Meta Cloud API (Graph API v21.0). Template message support for initiating conversations within the 24-hour messaging window. Media message support for images, documents, and audio.

**Signal** — Privacy-focused messaging via a self-hosted signal-cli-rest-api bridge. Health monitoring with graceful degradation. Voice message transcription via Workers AI Whisper.

**Threaded conversations** — All messaging channels flow into a unified conversation view. Message bubbles with timestamps and direction indicators. Real-time updates via WebSocket.

## Encrypted Reports

**Reporter role** — A dedicated role for people who submit tips or reports. Reporters see a simplified interface with only reports and help. Invited through the same flow as volunteers, with a role selector.

**Encrypted submissions** — Report body content is encrypted using ECIES before leaving the browser. Plaintext titles for triage, encrypted content for privacy. File attachments are encrypted separately.

**Report workflow** — Categories for organizing reports. Status tracking (open, claimed, resolved). Admins can claim reports and respond with threaded, encrypted replies.

## Admin Dashboard

**Setup wizard** — Guided multi-step setup on first admin login. Choose which channels to enable (Voice, SMS, WhatsApp, Signal, Reports), configure providers, and set your hotline name.

**Getting Started checklist** — Dashboard widget that tracks setup progress: channel configuration, volunteer onboarding, shift creation.

**Real-time monitoring** — See active calls, queued callers, conversations, and volunteer status in real time via WebSocket. Metrics update instantly.

**Volunteer management** — Add volunteers with generated keypairs, manage roles (volunteer, admin, reporter), view online status. Invite links for self-registration with role selection.

**Audit logging** — Every call answered, note created, message sent, report submitted, setting changed, and admin action is logged. Paginated viewer for admins.

**Call history** — Searchable, filterable call history with date ranges, phone number search, and volunteer assignment. GDPR-compliant data export.

**In-app help** — FAQ sections, role-specific guides, quick reference cards for keyboard shortcuts and security. Accessible from the sidebar and command palette.

## Volunteer Experience

**Command palette** — Press Ctrl+K (or Cmd+K on Mac) for instant access to navigation, search, quick note creation, and theme switching. Admin-only commands are filtered by role.

**Real-time notifications** — Incoming calls trigger a browser ringtone, push notification, and flashing tab title. Toggle each notification type independently in settings.

**Volunteer presence** — Admins see real-time online, offline, and on-break counts. Volunteers can toggle a break switch in the sidebar to pause incoming calls without leaving their shift.

**Keyboard shortcuts** — Press ? to see all available shortcuts. Navigate pages, open the command palette, and perform common actions without touching the mouse.

**Note draft auto-save** — Notes are auto-saved as encrypted drafts in the browser. If the page reloads or the volunteer navigates away, their work is preserved. Drafts are cleaned from localStorage on logout.

**Encrypted data export** — Export notes as a GDPR-compliant encrypted file (.enc) using the volunteer's own key. Only the original author can decrypt the export.

**Dark/light themes** — Toggle between dark mode, light mode, or follow the system theme. Preference persisted per session.

## Multi-Language & Mobile

**12+ languages** — Full UI translations: English, Spanish, Chinese, Tagalog, Vietnamese, Arabic, French, Haitian Creole, Korean, Russian, Hindi, Portuguese, and German. RTL support for Arabic.

**Progressive Web App** — Installable on any device via the browser. Service worker caches the app shell for offline launch. Push notifications for incoming calls.

**Mobile-first design** — Responsive layout built for phones and tablets. Collapsible sidebar, touch-friendly controls, and adaptive layouts.

## Authentication & Key Management

**PIN-protected local key store** — Your secret key is encrypted with a 6-digit PIN using PBKDF2 (600,000 iterations) + XChaCha20-Poly1305. The raw key never touches sessionStorage or any browser API — it lives only in an in-memory closure, zeroed on lock.

**Auto-lock** — The key manager locks automatically after idle timeout or when the browser tab is hidden. Re-enter your PIN to unlock. Configurable idle duration.

**Device linking** — Set up new devices without ever exposing your secret key. Scan a QR code or enter a short provisioning code. Uses ephemeral ECDH key exchange to transfer your encrypted key securely between devices. Provisioning rooms expire after 5 minutes.

**Recovery keys** — During onboarding, you receive a Base32-formatted recovery key (128-bit entropy). This replaces the old nsec-display flow. Mandatory encrypted backup download before you can proceed.

**Per-note forward secrecy** — Each note is encrypted with a unique random key, then that key is wrapped via ECIES for each authorized reader. Compromising the identity key does not reveal past notes.

**Nostr keypair auth** — Volunteers authenticate with Nostr-compatible keypairs (nsec/npub). BIP-340 Schnorr signature verification. No passwords, no email addresses.

**WebAuthn passkeys** — Optional passkey support for multi-device login. Register a hardware key or biometric, then sign in without typing your secret key.

**Session management** — Two-tier access model: "authenticated but locked" (session token only) vs "authenticated and unlocked" (PIN entered, full crypto access). 8-hour session tokens with idle timeout warnings.
