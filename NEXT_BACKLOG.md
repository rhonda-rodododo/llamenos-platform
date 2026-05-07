# Next Backlog

Single source of truth for pending work. Updated 2026-05-07.

## Completed This Session (2026-04-27)

### Features (all merged to main or PRs open)
- [x] Crypto Protocol Alignment (HPKE, MLS, device keys, PUK, sigchain, CLKR, SFrame)
- [x] Signal Messaging Channel (receipts, reactions, typing, registration, retry, identity, failover)
- [x] Blast/Broadcast Service (PostgreSQL delivery queue, rate limiting, scheduled sends)
- [x] Firehose Inference Agent (LLM extraction, buffer encryption, circuit breaker)
- [x] Signal Notification Service (zero-knowledge sidecar, HMAC contacts, security alerts)
- [x] SIP Bridge Rewrite (ARI + ESL + Kamailio, replaces asterisk-bridge/)
- [x] Telegram Messaging Adapter
- [x] RCS (Google RBM) Messaging Adapter
- [x] Telephony Adapters (Telnyx, Bandwidth, FreeSwitch — 8 providers total)
- [x] Analytics/Metrics Admin Routes
- [x] Asterisk Bridge Hardening (6 memory leak fixes)

### Crypto & Mobile
- [x] Desktop Tauri IPC Rewrite (Ed25519/X25519/HPKE)
- [x] Backend Device/Sigchain/PUK/MLS API Endpoints
- [x] Crypto Security Review Fixes (labels, zeroization, MLS context)
- [x] Crypto LOW Findings (test labels, SFrame zeroize, Nostr constant)
- [x] UniFFI Upgrade (0.28 → 0.31)
- [x] Mobile Crypto Sync (iOS + Android — device keys + HPKE)

### Infrastructure
- [x] Dependency Updates (TS 6.0, Vite 8, Twilio 6, Rust semver)
- [x] knope Release PR Flow + SLSA/SBOM/cosign
- [x] K8s Health Probes + Prometheus Observability
- [x] Production Deployment Hardening (Caddyfile, compose overlay, auto-deploy)
- [x] Full Integration Compose (Kamailio, CoTURN, CI overlay, Ollama)
- [x] CI Sidecar Profiles + Integration BDD Scenarios
- [x] Ansible Guardrails (preflight, smoke-check, Kamailio role)
- [x] Docker Compose Services (signal-notifier, Ollama, vLLM)
- [x] Structured Logging (namespaces, auto-redaction, correlation IDs)
- [x] CLAUDE.md Refresh

## In Progress (2026-05-07): Android E2E Test Suite

### Context
Getting Android Cucumber BDD E2E tests passing in CI. Tests run on emulator with Docker Compose backend.

### Done
- [x] PR #198 (merged) — Fixed 3 foundational issues:
  - `ApiService.hp()` URL routing (`/hubs/{id}/api/...` → `/api/hubs/{id}/...`)
  - `ActiveCall` deserialization (`@SerialName("callId")` mapping)
  - Hub refresh via `triggerHubRefresh()` (replaced unreliable swipe gesture)
- [x] CI speedup: removed `android-build-test` gate from `android-e2e` job (saves ~3 min)

### Open PR
- [ ] PR #224 (`feat/android-e2e-active-call-fix`) — Fixes active call card never rendering:
  - Root cause: `SimulationClient.createTestHub()` timeouts → `currentHubId` stays empty → everything silently no-ops
  - Added `SharedFlow<Unit>` refresh trigger in `ActiveHubState` (avoids StateFlow conflation)
  - Hub creation retry (3 attempts with backoff)
  - Increased SimulationClient timeouts (10s→30s connect, 15s→30s read)
  - Added logging to `DashboardViewModel.fetchActiveCall()` (CI logcat was empty before)
  - Uses real device pubkey for `simulateAnswerCall` instead of hardcoded "admin"
  - **Status**: CI running — merge if net improvement, iterate if not

### Remaining E2E Failures (after active-call is fixed)
- [ ] Hub Management (4 scenarios) — navigation to hub settings, collapsible section expansion
- [ ] Hub Switching (2 scenarios) — two-hub setup, switching active hub
- [ ] CMS/Cases (6 scenarios) — `theAppIsLaunchedAndAuthenticatedAsAdmin()` flow, admin promotion
- [ ] Triage Queue (3 scenarios) — depends on CMS setup working
- [ ] Event Management (2 detail scenarios) — needs event data created via test endpoint

### Key Architecture Notes
- Worktree: `/media/rikki/recover2/projects/llamenos-android-e2e-iterate-192`
- Backend test endpoints: `apps/worker/routes/dev.ts` (gated by `ENVIRONMENT=development` + `X-Test-Secret`)
- Hub isolation: `ScenarioHooks.kt` creates hub per scenario, sets `ActiveHubState`
- All API calls hub-scoped via `ApiService.hp()` → `/api/hubs/{hubId}/...`
- Auth: Ed25519 Schnorr signatures via `AuthInterceptor`
- Permission: `resolveHubPermissions()` includes global role perms (no hub membership needed)
- CI: Docker Compose test overlay, 2-shard parallel, emulator API 34 x86_64
- Local testing: `emulator -avd test-emu-0`, `adb reverse tcp:3000 tcp:3000`, `bun run dev:server`

### Debugging Tips
- CI logcat artifacts are usually empty (emulator killed before collection)
- Test locally with `adb logcat | grep -iE "ActiveCallSteps|SimulationClient|DashboardViewModel|ApiService|401|403"`
- Curl test endpoints directly to verify backend flow works
- `DashboardViewModel.fetchActiveCall()` now has logging (after PR #224)

## Pending (Future Sessions)

- [ ] RustCrypto major upgrade (k256 0.14, sha2 0.11) — blocked on k256 stable release
- [ ] WebRTC gateway mode for SIP bridge (browser-to-SIP)
- [ ] Post-quantum hybrid KEM (ML-KEM-1024 + X25519) — waiting for ML-KEM finalization
- [ ] MLS epoch-keyed SFrame for voice E2EE (Phase 3 of crypto spec)
- [ ] Public security whitepaper + commissioned audit
- [ ] Legacy secp256k1 code removal (Phase 6 cleanup after mobile verified)
- [ ] Load testing with full sidecar stack
