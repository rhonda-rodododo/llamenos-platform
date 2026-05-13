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
- [x] PR #224 (merged) — Active call card fixes:
  - `SharedFlow<Unit>` refresh trigger in `ActiveHubState` (avoids StateFlow conflation)
  - Hub creation retry (3 attempts with backoff), increased timeouts
  - Real device pubkey for `simulateAnswerCall`, diagnostic logging
  - Desktop E2E: +22 passed (582 vs 560), -23 failed (64 vs 87) — net improvement
  - Active call still failing (ComposeTimeoutException) — continued in PR #228

### Open PR
- [ ] PR #228 (`feat/android-e2e-observability`) — Three root causes fixed:
  1. **CI logcat was always empty**: Emulator dies when `android-emulator-runner` script ends,
     before the separate "Collect logcat" step runs. Fixed: background `adb logcat` DURING tests.
  2. **Hub-scoped CMS data missing**: `test-setup-cms` created records with `hubId: ""` but
     the app queries via `/api/hubs/{id}/records` which filters by hubId. Records were invisible.
     Fixed: accepts `hubId` parameter, passes through to record creation.
  3. **Collapsible settings section**: Hub management/switching tests tried to click
     `settings-hub-card` inside a collapsed `AnimatedVisibility` section. Fixed: expand first.
  - Also: ScenarioHooks fail-fast (throws on hub creation failure), diagnostic logging
  - **Status**: CI running — expect Hub Management (+4), CMS data tests, Triage improvements

### Remaining E2E Failures (expected after PR #228)
- [ ] Active Call (5 scenarios) — card never appears despite correct hub, auth, and call simulation.
  Root cause still unknown. Logcat from PR #228 will reveal whether `fetchActiveCall()` returns
  data or fails silently. Possible: auth interceptor not sending headers, or DashboardViewModel
  refresh not triggering properly.
- [ ] CMS detail interaction (status picker, comments) — may be fixed by hub-scoped data fix
- [ ] Event Management detail (2 scenarios) — depends on event records being hub-scoped (fixed)
- [ ] Triage detail (3 scenarios) — depends on CMS setup being hub-scoped (fixed)

### Key Architecture Notes
- Worktree: `~/projects/llamenos-android-e2e-observability`
- Backend test endpoints: `apps/worker/routes/dev.ts` (gated by `ENVIRONMENT=development` + `X-Test-Secret`)
- Hub isolation: `ScenarioHooks.kt` creates hub per scenario, sets `ActiveHubState`
- All API calls hub-scoped via `ApiService.hp()` → `/api/hubs/{hubId}/...`
- Auth: Ed25519 Schnorr signatures via `AuthInterceptor`
- Permission: `resolveHubPermissions()` includes global role perms (no hub membership needed)
- CI: Docker Compose test overlay, 2-shard parallel, emulator API 34 x86_64
- Local testing: `emulator -avd test-emu-0`, `adb reverse tcp:3000 tcp:3000`, `bun run dev:server`

### Root Causes Found (2026-05-07)
- **CRITICAL — Empty roles table**: `ensureInit()` never called at server startup. Docker Compose
  CI starts with empty database → roles table empty → `resolvePermissions(['role-super-admin'], [])`
  returns `[]` → hub middleware rejects ALL hub-scoped requests with "Access denied". Fix: seed
  roles from test-create-hub and test-setup-cms endpoints (idempotent).
- **Empty logcat**: `reactivecircus/android-emulator-runner` kills emulator when its script block
  exits. Post-step `adb logcat -d` finds no device. Fix: background capture inside script.
- **Invisible CMS records**: `test-setup-cms` created all records with `hubId: ""`. App queries
  `GET /api/hubs/{testHubId}/records` which filters `WHERE hubId = ?`. Empty hubId never matches.
- **Hub navigation wrong target**: Tests clicked `settings-hub-card` (display-only) instead of
  `hubs-card` (Dashboard quick action that actually navigates to HubListScreen).
- **Silent ScenarioHooks failure**: `createTestHub()` caught all exceptions and logged at WARN
  level but didn't throw. `currentHubId` stayed empty, `@Before(order=2)` returned early,
  `ActiveHubState` never set, all `hp()` calls returned bare paths.

### Debugging Tips
- CI logcat: After PR #228, logcat should be populated (background capture during tests)
- Filter logcat: `grep -iE "ScenarioHooks|SimulationClient|DashboardViewModel|CaseListSteps|ActiveCallSteps"`
- Curl test endpoints directly to verify backend flow works
- `DashboardViewModel.fetchActiveCall()` has logging (after PR #224)

## Pending (Future Sessions)

- [ ] Localized blast content (multi-language tabs in blast composer) — `localizedContent` JSONB field needs adding to blasts table, per-language content editing UI. Deferred from EP05; neither v1 nor v2 implements it yet.
- [ ] RustCrypto major upgrade (k256 0.14, sha2 0.11) — blocked on k256 stable release
- [ ] WebRTC gateway mode for SIP bridge (browser-to-SIP)
- [ ] Post-quantum hybrid KEM (ML-KEM-1024 + X25519) — waiting for ML-KEM finalization
- [ ] MLS epoch-keyed SFrame for voice E2EE (Phase 3 of crypto spec)
- [ ] Public security whitepaper + commissioned audit
- [ ] Legacy secp256k1 code removal (Phase 6 cleanup after mobile verified)
- [ ] Load testing with full sidecar stack
