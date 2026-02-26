# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Llámenos is a secure crisis response hotline webapp. Callers dial a phone number; calls are routed to on-shift volunteers via parallel ringing. Volunteers log notes in a webapp. Admins manage shifts, volunteers, and ban lists. The app must protect volunteer and caller identity against well-funded adversaries (nation states, right-wing groups, private hacking firms).

**Status: Pre-production.** No legacy fallbacks or data migrations needed. No production SDLC yet.

## Tech Stack

- **Runtime/Package Manager**: Bun
- **Frontend**: Vite + TanStack Router (SPA, no SSR) + shadcn/ui (component installer)
- **Backend**: Cloudflare Workers + Durable Objects (cloud) / Node.js + PostgreSQL (self-hosted)
- **Telephony**: Twilio via a `TelephonyAdapter` interface (designed for future provider swaps, e.g. SIP trunks)
- **Auth**: Nostr keypairs (BIP-340 Schnorr signatures) + WebAuthn session tokens for multi-device support
- **i18n**: Built-in from day one — all user-facing strings must be translatable
- **Deployment**: Cloudflare (Workers, DOs, Tunnels), billed to EU/GDPR-compatible account
- **Testing**: E2E only via Playwright — no unit tests
- **PWA**: Service worker via vite-plugin-pwa + Workbox; manifest uses generic name "Hotline" for security

## Architecture Roles

| Role | Can See | Can Do |
|------|---------|--------|
| **Caller** | Nothing (GSM phone) | Call the hotline number |
| **Volunteer** | Own notes only | Answer calls, write notes during shift |
| **Admin** | All notes, audit logs, active calls, billing data | Manage volunteers, shifts, ban lists, spam mitigation settings |

## Security Requirements

These are non-negotiable architectural constraints, not guidelines:

- **E2EE / zero-knowledge**: The server should not be able to read call notes, transcripts, or PII. Encrypt at rest minimum; E2EE where feasible.
- **Volunteer identity protection**: Personal info (name, phone) visible only to admins, never to other volunteers or callers.
- **Call spam mitigation**: Real-time ban lists, optional CAPTCHA-like voice bot detection (randomized digit input), network-level rate limiting. Admins toggle these in real-time.
- **Audit logging**: Every call answered, every note created — visible to admins only.
- **GDPR compliance**: EU parent org, data handling must comply.

## Directory Structure

```
src/
  client/           # Frontend SPA (Vite + React)
    routes/         # TanStack file-based routes
    components/     # App components + ui/ (shadcn primitives)
    lib/            # Client utilities (auth, crypto, ws, i18n, hooks)
    locales/        # 13 locale JSON files (en, es, zh, tl, vi, ar, fr, ht, ko, ru, hi, pt, de)
  worker/           # Cloudflare Worker backend
    api/            # REST API handlers
    durable-objects/ # 6 DOs: IdentityDO, SettingsDO, RecordsDO, ShiftManagerDO, CallRouterDO, ConversationDO
    telephony/      # TelephonyAdapter interface + 5 adapters (Twilio, SignalWire, Vonage, Plivo, Asterisk)
    messaging/      # MessagingAdapter interface + SMS, WhatsApp, Signal adapters
    lib/            # Server utilities (auth, crypto, webauthn, do-router)
  shared/           # Cross-boundary types and config (@shared alias)
    types.ts        # Shared types (CustomFieldDefinition, NotePayload, etc.)
    languages.ts    # Centralized language config (codes, labels, Twilio voice IDs)
    crypto-labels.ts # 25 domain separation constants for all cryptographic operations
```

**Path aliases** (tsconfig.json + vite.config.ts):
- `@/*` → `./src/client/*`
- `@worker/*` → `./src/worker/*`
- `@shared/*` → `./src/shared/*`

## Key Technical Patterns

- **TelephonyAdapter**: Abstract interface for 5 voice providers (Twilio, SignalWire, Vonage, Plivo, Asterisk). All telephony logic goes through this adapter — never call provider APIs directly from business logic.
- **MessagingAdapter**: Abstract interface for text messaging channels (SMS, WhatsApp, Signal). Inbound webhooks route to ConversationDO.
- **Parallel ringing**: All on-shift, non-busy volunteers ring simultaneously. First pickup terminates other calls.
- **Shift routing**: Automated, recurring schedule with ring groups. Fallback group if no schedule is defined.
- **Durable Objects**: Six singletons accessed via `idFromName()` — IdentityDO, SettingsDO, RecordsDO, ShiftManagerDO, CallRouterDO, ConversationDO. Routed via `DORouter` (lightweight method+path router).
- **E2EE notes**: Per-note forward secrecy — unique random key per note, wrapped via ECIES for each reader. Dual-encrypted: one copy for volunteer, one for each admin (multi-admin envelopes).
- **E2EE messaging**: Per-message envelope encryption — random symmetric key, ECIES-wrapped for assigned volunteer + each admin. Server encrypts inbound on webhook receipt, discards plaintext immediately.
- **Key management**: PIN-encrypted local key store (`key-manager.ts`). nsec held in closure only, zeroed on lock. Device linking via ephemeral ECDH provisioning rooms.
- **Nostr relay real-time**: Ephemeral kind 20001 events via strfry (self-hosted) or Nosflare (CF). All event content encrypted with hub key. Generic tags (`["t", "llamenos:event"]`) — relay cannot distinguish event types.
- **Hub key distribution**: Random 32 bytes (`crypto.getRandomValues`), ECIES-wrapped individually per member via `LABEL_HUB_KEY_WRAP`. Rotation on member departure excludes departed member.
- **Client-side transcription**: WASM Whisper via `@huggingface/transformers` ONNX runtime. AudioWorklet ring buffer → Web Worker isolation. Audio never leaves the browser.
- **Reproducible builds**: `Dockerfile.build` with `SOURCE_DATE_EPOCH`, content-hashed filenames. `CHECKSUMS.txt` in GitHub Releases. SLSA provenance. Verification via `scripts/verify-build.sh`.
- **Hash-chained audit log**: SHA-256 chain with `previousEntryHash` + `entryHash` for tamper detection (Epic 77).
- **Domain separation**: All 25 crypto context constants in `src/shared/crypto-labels.ts` — NEVER use raw string literals for crypto contexts.

## Gotchas

- `@noble/ciphers` and `@noble/hashes` require `.js` extension in imports (e.g., `@noble/ciphers/chacha.js`)
- `schnorr` is a separate named export: `import { schnorr } from '@noble/curves/secp256k1.js'`
- Nostr pubkeys are x-only (32 bytes) — prepend `"02"` for ECDH compressed format
- `secp256k1.getSharedSecret()` returns 33 bytes; extract x-coord with `.slice(1, 33)`
- Workbox `navigateFallbackDenylist` excludes `/api/` and `/telephony/` routes from SPA caching
- Nostr relay (strfry) is a core service, not optional — always runs with Docker Compose and Helm
- `SERVER_NOSTR_SECRET` must be exactly 64 hex chars; server derives its Nostr keypair via HKDF
- Hub key is random bytes, NOT derived from any identity key — see `hub-key-manager.ts`

## Development Commands

```bash
bun install                              # Install dependencies
bun run dev                              # Vite dev server (frontend only)
bun run dev:worker                       # Wrangler dev server (Worker + DOs)
bun run build                            # Vite build → dist/client/
bun run deploy                           # Deploy EVERYTHING (app + marketing site)
bun run deploy:demo                      # Deploy app Worker only
bun run deploy:site                      # Deploy marketing site only (cd site && ...)
bunx playwright test                     # Run all E2E tests
bunx playwright test tests/smoke.spec.ts # Run a single test file
bun run test:ui                          # Playwright UI mode
bun run typecheck                        # Type check (tsc --noEmit)
bun run bootstrap-admin                  # Generate admin keypair
```

**Deployment rules — NEVER run `wrangler pages deploy` or `wrangler deploy` directly.** Always use the root `package.json` scripts (`bun run deploy`, `bun run deploy:demo`, `bun run deploy:site`). Running `wrangler pages deploy dist` from the wrong directory will deploy the Vite app build to Pages instead of the Astro site, breaking the marketing site with 404s.

**Key config files**: `wrangler.jsonc` (Worker + DO bindings), `playwright.config.ts`, `.dev.vars` (Twilio creds + ADMIN_PUBKEY, gitignored)

## Claude Code Working Style

- **Always run `bun run typecheck` and `bun run build` before committing and pushing.** Never push code that doesn't build. If typecheck or build fails, fix it before committing.
- Implement features completely — no stubs, no shortcuts, no TODOs left behind.
- **Every feature or fix must include E2E tests.** If you add or change UI behavior, add Playwright tests covering the new functionality. If modifying existing features, update the relevant test files. A feature is not complete until its tests are written and passing. Check `tests/` for existing test files that may need updating.
- Edit files in place; never create copies. Git history is the backup. Commit regularly when work is complete, don't worry about accidentally committing unrelated changes.
- Keep the file tree lean. Use git commits frequently to checkpoint progress.
- No legacy fallbacks or migration code until this file notes the app is in production.
- Use `docs/epics/` for planning feature epics. Track backlog in `docs/NEXT_BACKLOG.md` and completed work in `docs/COMPLETED_BACKLOG.md` with every iteration
- Use context7 plugin to look up current docs for Twilio, Cloudflare Workers, TanStack, shadcn/ui, and other libraries before implementing.
- Use the feature-dev plugin for guided development of complex features.
- Use Playwright plugin for E2E test development and debugging.
- Clean up unused files/configs when pivoting. Keep code modular and DRY — refactor proactively.
- Update related documentation when requirements, architecture, or design changes occur.
- NEVER delete or regress functionality to fix type issues or get tests passing. Only remove features if explicitly asked or when replacing as part of new work.
- Use parallel agent execution where it makes sense to keep things moving.
