# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.19.1] - 2026-02-27

### Bug Fixes

- fix strfry config for CI instead of disabling it

### Miscellaneous

- v0.19.1 [skip ci]

## [0.19.0] - 2026-02-27

### Bug Fixes

- handle WebSocket upgrades directly for Node.js platform
- fix presence endpoint — use correct ShiftManagerDO response key
- promote Nostr relay (strfry) from optional profile to core service
- add SERVER_NOSTR_SECRET to e2e-docker CI env
- include .github/ in CI change detection patterns
- CI change detection + strfry dependency for Docker E2E
- disable strfry in Docker E2E tests, replace --wait with targeted health check

### CI/CD

- increase e2e-cf timeout to 20 minutes

### Documentation

- comprehensive security audit and zero-knowledge architecture redesign
- sync protocol spec with code and add domain label table
- add key revocation runbook with response procedures
- close threat model gaps (APNs/FCM, CF trust, supply chain)
- enrich all 9 epic files with execution context appendices
- update backlogs with Zero-Knowledge Architecture completion status
- update backlogs — Epic 78 client-side transcription complete
- update security documentation for ZK architecture
- update architecture and protocol docs for ZK architecture
- update deployment guides for relay, Caddy ingress, reproducible builds
- update project docs (CLAUDE.md, backlogs)
- update marketing site docs for ZK architecture

### Features

- create authoritative crypto domain separation labels
- add SAS verification to device provisioning protocol
- generic backup file format without identifying strings
- generic ECIES, multi-admin envelopes, admin key separation, hub key manager
- NostrPublisher interface, server keypair, relay infrastructure
- migrate real-time events from WebSocket to Nostr relay
- complete WS removal — clean DO, Nostr-only broadcasts
- E2EE messaging with envelope encryption pattern
- metadata encryption — per-record DO storage, encrypted call history, hash-chained audit log
- reproducible builds — deterministic output, checksums, verification tooling
- migrate transcription to envelope encryption, remove dead ECIES code
- client-side transcription with Whisper WASM via transformers.js
- add DEMO_MODE env flag with CF Cron Trigger for scheduled reset

### Miscellaneous

- v0.19.0 [skip ci]

## [0.18.0] - 2026-02-25

### Bug Fixes

- use dark theme for Mermaid diagrams
- deploy site for docs-only changes
- filter WebSocket errors in Docker test environment

### CI/CD

- skip versioning and deploy for docs-only changes

### Features

- implement volunteer assignment and two-way conversation UI

### Miscellaneous

- trigger site deploy for Mermaid dark theme fix
- v0.18.0 [skip ci]

### Testing

- add comprehensive tests for messaging epics 68-73

## [0.17.0] - 2026-02-24

### CI/CD

- skip E2E tests for docs-only changes

### Features

- enhance visual design with animations and polish

### Miscellaneous

- v0.17.0 [skip ci]

## [0.16.1] - 2026-02-24

### Bug Fixes

- restore waitForTimeout for reliable test timing

### Documentation

- add screenshots and Mermaid diagrams to documentation

### Miscellaneous

- v0.16.1 [skip ci]

### Refactoring

- add test ID infrastructure for maintainable selectors

## [0.16.0] - 2026-02-24

### Bug Fixes

- fix panic wipe overlay rendering and playwright port config
- match bun versions

### Documentation

- update backlog to reflect all completed epics

### Features

- add panic wipe, SRI hashes, and PIN challenge
- add RCS Business Messaging channel (Epic 63)
- add message blasts with subscriber management (Epic 62)
- add call recording playback and dev tunnel script
- add Ansible playbooks, OpenTofu modules, and ops docs (Epic 66)

### Miscellaneous

- update logo SVG and clean up footer
- v0.16.0 [skip ci]

## [0.15.0] - 2026-02-24

### Bug Fixes

- update reporter onboarding test for simplified backup flow
- add missing PG_PASSWORD to docker E2E, increase CF timeout, exclude live tests
- use data-testid selectors, enable parallel E2E, reduce timeouts
- increase login timeouts and add serial mode for state-dependent tests
- resolve parallel execution conflicts in E2E tests
- increase e2e-docker timeout from 20 to 30 minutes
- fix field slug, remove double logins, increase timeouts
- scope custom field badge assertion to specific note card
- restore bun.lockb compatible with CI bun v1.2
- make custom field creation idempotent, scope edit assertions
- prevent section toggle race in custom fields tests
- audit round 6 — supply chain, crypto hygiene, permission guards
- audit R6 high — remove V1 encrypt, gate resets, tree-shake demo, lockfile, ARI creds
- audit R6 medium — SSRF guard, DO admin routes, HMAC-SHA256 hashing
- audit R6 medium — dep scanning, image pinning, PG egress
- improve test-reset error handling and robustness
- request-bound auth tokens, adminPubkey migration, CI test fixes
- complete keyPair→keyManager migration in remaining components
- complete L-3 keyPair removal from auth context
- add token verification fallback and fix test token creation
- strip query params from token path to match server pathname
- skip live telephony in CI, fix strict mode and flaky navigation
- handle deep link section expansion on search-only navigation

### CI/CD

- trigger fresh CI run for e2e-docker validation

### Features

- add in-browser admin bootstrap
- add permission-based access control, UI polish, and admin improvements
- add storage migration framework and PostgreSQL improvements
- add multi-hub architecture with per-hub isolation
- dynamic role assignment UI, notification/PWA banners, logo refresh, and setup wizard improvements
- add live telephony E2E tests, UX improvements, and phone input upgrade

### Miscellaneous

- add next staging environment for pre-release testing
- v0.15.0 [skip ci]

## [0.14.0] - 2026-02-22

### Bug Fixes

- add [skip ci] to release commits to prevent re-triggering

### Features

- add demo mode with sample data and one-click login

### Miscellaneous

- v0.14.0 [skip ci]

## [0.13.0] - 2026-02-21

### Bug Fixes

- remove invalid workflows permission from version job
- use correct CallSettings property names in status summary

### Documentation

- add pre-push typecheck/build requirement to CLAUDE.md

### Features

- UI polish and admin UX improvements (epics 56-57)

### Miscellaneous

- v0.13.0

## [0.12.0] - 2026-02-19

### Bug Fixes

- fix E2E job failures — Docker build + wrangler auth
- copy index.html into frontend build stage
- fix strict mode violation in ban management test
- rebase version commit onto latest before push
- add workflows permission to version job

### Features

- add E2E tests gating version bump and deployment

### Miscellaneous

- v0.12.0

## [0.11.1] - 2026-02-19

### Bug Fixes

- generate release notes directly in release job

### Miscellaneous

- v0.11.1

## [0.11.0] - 2026-02-19

### Bug Fixes

- install site dependencies before building

### Features

- add multi-platform deployment (Docker Compose + Helm)
- add CI/CD pipeline, security hardening, and self-hosting docs

### Miscellaneous

- update changelog for v0.9.1
- v0.11.0

## [0.9.1] - 2026-02-18

### Documentation

- update documentation for Epic 54 architecture changes

### Features

- reorganize docs sidebar into 4 audience-focused sections

### Miscellaneous

- bump version to 0.9.1

## [0.9.0] - 2026-02-18

### Bug Fixes

- WebSocket auth via query params, add Playwright config
- E2E test reliability + HOTLINE_NAME greeting for callers
- admin/volunteer profile save — name & phone now persisted via API
- Schnorr auth signatures + security audit fixes
- E2E test fixes + revert ban list hashing for admin usability
- auto-clean stale calls from dashboard (5min ringing, 8hr in-progress)
- replace sidebar flag buttons with LanguageSelect combobox
- un-nest volunteer profile route from parent volunteers layout
- show keyboard shortcuts in command palette and use note sheet for new note
- call lifecycle — hibernation-safe WS, polling fallback, audit enrichment, transcription flag
- call lifecycle, transcription pipeline, and UI cleanup
- show masked phone numbers in audit/history, deploy to custom domain
- add telephony and call history logging
- add call lifecycle logging, debug endpoint, and error visibility
- StatusCallbackEvent params and call-recording lifecycle
- clickable transcript badges, Whisper model upgrade, call status map
- notes page — rich call headers, custom fields in edit form
- style features/security pages, fix Spanish docs double-prefix links
- fixes, remove finished epics
- link color
- security hardening from comprehensive audit
- medium-severity security hardening
- remove PII from GitHub URLs across all site pages
- use correct GitHub URL for all repository links
- redesign logo with recognizable phone handset silhouette

### Documentation

- overhaul README for user-facing setup guide
- epic specs 24–27 for shift awareness, palette, IVR audio, polish
- update backlog with security audit findings
- update completed backlog with marketing site i18n details
- update backlogs for Epics 33-36, remove completed epic docs
- broaden Twilio-specific references to multi-provider language
- update backlog with security audit findings
- mark medium-severity security fixes as complete
- epics 42-46 — multi-channel messaging, reporter role, encrypted uploads
- add Epic 43 (setup wizard), renumber 43-46 → 44-47, make voice optional
- update backlog — mark Epics 42-47 and help features complete
- update all documentation for multi-channel messaging, reporter role, and setup wizard
- update all documentation for Epic 54 device-centric auth & forward secrecy

### Features

- complete project scaffold — frontend, backend, telephony, encryption
- complete volunteer call handling, notes, transcription, rate limiting
- security hardening — headers, auth redirects, route protection
- UI polish, on-break toggle, confirm dialogs, server-side validation
- E2EE transcriptions, security hardening, search/filter, deploy
- multilingual support — 12 languages for UI and call intake
- epics 15–18 — light mode, volunteer status, notifications, notes search
- more features and fixes
- admin-configurable IVR language menu
- Epic 24 — shift & call status awareness throughout the app
- Epic 25 — command palette enhancements
- Epic 26 — custom IVR audio recording for admin voice prompts
- Epic 27 — remaining polish & backlog items
- PWA support — installable app with offline caching
- security hardening + voicemail fallback
- WebAuthn passkeys, configurable call settings, session expiry UX, phone validation, test isolation
- security hardening — phone hashing, DO rate limits, encrypted exports, i18n
- collapsible settings sections with deep links (Epic 30)
- admin-configurable custom note fields with E2EE (Epic 31)
- show volunteer names in audit log with linked profile pages
- move key backup to user settings, add admin transcription opt-out control
- replace shift volunteer checkboxes with autocomplete multi-select
- show hotline number in sidebar and fix bottom section alignment
- marketing site with Astro Content Collections i18n
- Epic 32 — multi-provider telephony configuration system
- Epic 33 — cloud provider adapters (SignalWire, Vonage, Plivo)
- Epic 34 — WebRTC volunteer calling
- Epics 35+36 — Asterisk ARI adapter, bridge service, and telephony docs
- expand docs sidebar with all pages in two sections
- translate all documentation to 11 additional languages
- Epic 42 — messaging architecture foundation & threaded conversations
- Epics 43 & 47 — admin setup wizard and reporter role with encrypted file uploads
- Epics 44-46 — SMS, WhatsApp, and Signal channel adapters
- add help page, getting started checklist, and in-app guidance
- Epics 48-52 — UI/UX design overhaul with teal brand identity
- Epic 54 Phase 1 — PIN-first local key store & security hardening
- Epic 54 Phase 4 — simplified invite & recovery flow
- Epic 54 Phase 3 — per-note ephemeral keys for forward secrecy
- Epic 54 Phase 2 — Signal-style device linking via QR provisioning

### Miscellaneous

- consolidate deploy scripts in root package.json
- add versioning and changelog generation (v0.9.0)

### Refactoring

- split SessionManagerDO into 3 focused Durable Objects
- epics 37-41 — split large components, deduplicate, add tests
- simplify report titles to plaintext, add role selector to invite form, consolidate UserRole type, add E2E tests

### Testing

- E2E tests for epics 24-27 and backlog update
- E2E tests for custom fields in notes, update CLAUDE.md
- add E2E tests for device linking and fix /link-device public path


