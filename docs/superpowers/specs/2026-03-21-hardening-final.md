# Spec: hardening-final
**Date**: 2026-03-21
**Status**: Draft

---

## CRITICAL ARCHITECTURAL CONSTRAINT — Multi-Hub Notification Routing

> **This constraint is non-negotiable and must be preserved in every change in this spec.**
>
> Multi-hub membership is a core value proposition. Any authenticated user — regardless of role — can be a member of multiple hubs simultaneously. The app MUST receive calls, push notifications, and real-time events from ALL hubs they are a member of — independent of which hub is currently active in the UI. The active hub controls browsing context only.
>
> **Never gate incoming call or notification handling on active hub state.** A notification arriving for Hub B must be processed and shown even if the UI is browsing Hub A.

This axiom must also be added to `CLAUDE.md` and `docs/protocol/PROTOCOL.md` as documented in the verification gates below.

---

## Goal

Fix four targeted hardening gaps that do not fit any larger feature spec. These are independent, low-risk changes that close real security and operational holes.

---

## Gap 1 — Hub Key Routing in Wake Payload (HIGH — H1/H2)

### Current State

**iOS** (`apps/ios/Sources/App/LlamenosApp.swift` line ~263 and `apps/ios/Sources/Services/WakeKeyService.swift` line ~234):

`WakeKeyService.decryptWakePayload(encryptedHex:)` takes a single concatenated hex blob (66-char compressed ephemeral pubkey prefix + packed nonce+ciphertext). It retrieves the device's wake private key from Keychain and decrypts. The caller (`AppDelegate.application(_:didReceiveRemoteNotification:...)`) then reads `payload["hubId"]` from the decrypted JSON and calls `appState.hubContext.setActiveHub(hubId)` — which switches the browsing context.

**Android** (`apps/android/app/src/main/java/org/llamenos/hotline/crypto/WakeKeyService.kt` line ~106 and `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt` line ~116):

`WakeKeyService.decryptWakePayload(packedHex, ephemeralPubkeyHex)` retrieves the single device wake secret from `KeystoreService(KEY_WAKE_SECRET)` and decrypts. `PushService.onMessageReceived` then calls `activeHubState.setActiveHub(wakeHubId)` which changes the browsing context.

### The Bug

Both platforms: the wake key is device-scoped, not hub-scoped. The bug is **not** in the decryption key choice — the server encrypts wake payloads to the device wake key (correct). The bug is in the **post-decryption routing**: both platforms call `setActiveHub(hubId)` unconditionally on every push, even for non-call notifications (shift reminders, announcements). This silently switches the UI context the moment any background notification arrives.

More critically: the `WakePayload` data class (Android, line ~19) and the equivalent iOS JSON structure already carry `hubId`. After decryption succeeds, the notification **must be dispatched to the handler for that specific hub** — not necessarily the currently active hub — so hub-specific ringing, SIP routing, and context accumulation are all triggered correctly for any hub the user belongs to.

The current code treats `setActiveHub` as the only routing action. If a user is in two hubs and receives a call notification for Hub B while browsing Hub A, the UI silently switches to Hub B instead of showing the call notification in the context of Hub B without disrupting the current browse session.

### Required Fix

**Principle**: Distinguish between "context switch the UI" (only on user action or on the hub the call belongs to) and "route notification to hub handler" (always, regardless of active hub).

**iOS changes:**
- In `AppDelegate.application(_:didReceiveRemoteNotification:...)`: after decrypting the wake payload, do NOT unconditionally call `appState.hubContext.setActiveHub(hubId)`. Only do so when the `type` field is `"incoming_call"` and the user has explicitly answered (or from the notification tap path). For the display path, store `hubId` in `content.userInfo` and ensure `LinphoneService` / ring logic is notified with the hub ID — without switching the active hub.
- Add a `routeIncomingCallNotification(hubId: String, callId: String?)` method to `HubActivityService` (or a new `PushRoutingService`) that rings regardless of active hub.
- The hub-switch-on-tap path (`UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:)`) is correct and should be preserved — the user tapping a notification is an explicit context switch intent.

**Android changes (`PushService.kt`):**
- In the wake-payload coroutine block (lines ~119–131): do NOT call `activeHubState.setActiveHub(wakeHubId)` unconditionally. This is the routing-on-push bug.
- In `handleIncomingCall(data:)` (lines ~217–252): preserve the existing `serviceScope.launch { activeHubState.setActiveHub(hubId) }` call — this is the app-unlocked path where context-switch is acceptable because the user is about to answer. But add a call to `linphoneService.storePendingCallHub(callId, hubId)` if not already present for the wake-payload path.
- For non-call types (shift reminder, announcement): never switch active hub. Simply show the notification with `hubId` stored in extras for navigation on tap.

**Key invariant to preserve**: `linphoneService.storePendingCallHub(callId, hubId)` must be called for ALL incoming call notifications regardless of which hub is active. This already happens in `handleIncomingCall` — ensure the wake-payload coroutine path also reaches it when `type == "incoming_call"`.

### Files

| File | Change |
|------|--------|
| `apps/ios/Sources/App/LlamenosApp.swift` | Remove unconditional `setActiveHub` on push; route by type |
| `apps/ios/Sources/Services/WakeKeyService.swift` | No structural change — decryption is correct |
| `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt` | Remove unconditional `setActiveHub` from wake-payload coroutine |
| `apps/android/app/src/main/java/org/llamenos/hotline/crypto/WakeKeyService.kt` | No structural change — decryption is correct |

---

## Gap 2 — CI codegen:check Gate Missing

### Current State

`package.json` defines:

```json
"codegen:check": "bun run packages/protocol/tools/codegen.ts --check"
```

`.github/workflows/ci.yml` `build` job runs `bun run codegen` (line ~85) to regenerate Swift/Kotlin types, but **never runs `bun run codegen:check`** afterward. This means schema drift — a developer who edits a Zod schema in `packages/protocol/schemas/` without regenerating — is invisible to CI until a mobile build breaks.

### Required Fix

In `.github/workflows/ci.yml`, in the `build` job, add a step immediately after `bun run codegen`:

```yaml
- name: Verify codegen output is up to date
  run: bun run codegen:check
```

This step must run before typecheck and build so that schema drift is caught at the cheapest point in the pipeline. The `--check` flag causes the codegen script to diff its output against the generated files and exit non-zero if anything changed, failing the PR.

### Files

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | Add `bun run codegen:check` step after `bun run codegen` in `build` job |

---

## Gap 3 — Stale generated/typescript/ Directory

### Current State

`packages/protocol/generated/typescript/` exists and contains:

- `crypto-labels.ts`
- `types.ts`

These are stale artifacts from when TypeScript codegen was removed. The project now uses `z.infer<>` directly from Zod schemas — generated TypeScript types are unused and create confusion about the canonical source. The directory is listed in the `.gitignore` for `packages/protocol/generated/` (gitignored), but stale files may be present locally.

### Required Fix

- Delete `packages/protocol/generated/typescript/` and all files within it.
- Verify `packages/protocol/tools/codegen.ts` does not write to `generated/typescript/` — if it does, remove that output target.
- Verify `packages/protocol/tools/schema-registry.ts` does not reference the typescript output path.
- Ensure `.gitignore` for `packages/protocol/generated/` remains correct (the whole `generated/` tree is gitignored; the directory itself should not be committed).
- Add a check in `codegen:check` or a CI lint step to assert no `generated/typescript/` exists, preventing re-introduction.

### Files

| File | Change |
|------|--------|
| `packages/protocol/generated/typescript/` | Delete directory and contents |
| `packages/protocol/tools/codegen.ts` | Remove typescript output target if present |
| `packages/protocol/.gitignore` or root `.gitignore` | Verify coverage; add explicit exclusion if needed |

---

## Gap 4 — Env Var Startup Validation

### Current State

The worker uses `process.env.VAR || 'localhost...'` fallback patterns in several files:

- `apps/worker/db/index.ts` line ~20: `parseInt(process.env.PG_POOL_SIZE || '10', 10)` — benign (has a safe default)
- `apps/worker/lib/blob-storage.ts` line ~20: `process.env.MINIO_ENDPOINT || 'http://localhost:9000'` — silently falls back to localhost in production
- `apps/worker/lib/blob-storage.ts` line ~26: `process.env.MINIO_BUCKET || 'llamenos-files'` — bucket name fallback (less dangerous)
- `apps/worker/lib/transcription-client.ts` line ~37: `process.env.WHISPER_URL || 'http://localhost:8080/...'` — silently falls back

Critical env vars (`DATABASE_URL`, `HMAC_SECRET`, `SERVER_NOSTR_SECRET`, `NOSTR_RELAY_URL`) are passed through the Hono `AppEnv.Bindings.Env` interface and used in routes, but there is **no startup assertion** that these are non-empty before the server begins serving traffic. A misconfigured deployment silently connects to wrong services.

The server entry point for Bun self-hosted is `apps/worker/app.ts` (which sets up routes) with `apps/worker/index.ts` exporting the fetch handler. There is no dedicated `config.ts` or startup validation file.

### Required Fix

Create `apps/worker/lib/config.ts` with an `assertRequiredEnv(env: Env): void` function that:

1. Asserts each required var is present and non-empty.
2. Asserts `HMAC_SECRET` is exactly 64 hex characters (matches `SERVER_NOSTR_SECRET` validation already done in auth route).
3. Asserts `SERVER_NOSTR_SECRET` is exactly 64 hex characters if set.
4. Asserts `DATABASE_URL` starts with `postgres://` or `postgresql://`.
5. Logs a clear startup message listing which optional vars are absent (push keys, Nostr relay, etc.) for observability without failing.
6. Throws a descriptive error for any missing required var — **never** a generic "undefined" stack trace.

Required vars to assert:

| Var | Condition |
|-----|-----------|
| `DATABASE_URL` | Non-empty, starts with `postgres` |
| `HMAC_SECRET` | Exactly 64 hex chars |
| `ADMIN_PUBKEY` | Non-empty, 64 hex chars |
| `HOTLINE_NAME` | Non-empty |
| `ENVIRONMENT` | Non-empty |

Optional vars to warn when absent (not fail):

- `SERVER_NOSTR_SECRET` — warn: Nostr relay events unsigned
- `NOSTR_RELAY_URL` — warn: real-time relay disabled
- `FCM_SERVICE_ACCOUNT_KEY` — warn: Android push disabled
- `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID` — warn: iOS push disabled

Call `assertRequiredEnv(env)` early in the Bun startup path. Since `app.ts` is framework-agnostic (serves both Bun and CF), the call should be placed in a Bun-specific startup hook. The Bun entry path calls `app.fetch` — add a startup block to `apps/worker/app.ts` that runs `assertRequiredEnv(process.env as Env)` at module load time, wrapped in a `if (typeof Bun !== 'undefined')` guard so it does not break CF Workers deployment.

### Files

| File | Change |
|------|--------|
| `apps/worker/lib/config.ts` | New file — `assertRequiredEnv`, startup validation logic |
| `apps/worker/app.ts` | Call `assertRequiredEnv` at Bun startup (module-load guard) |

---

## Gap 5 — Documentation: Multi-Hub Routing Axiom

The multi-hub call/notification routing constraint stated at the top of this spec is architecturally fundamental and must appear prominently in the codebase documentation so future contributors do not accidentally introduce active-hub gating.

### Required Additions

**`CLAUDE.md`** (project root) — add to the Architecture Roles or Key Technical Patterns section:

> **Multi-hub routing axiom**: Any authenticated user — regardless of role — can be a member of multiple hubs. The app must receive calls, push notifications, and relay events from ALL member hubs regardless of active hub. The active hub controls UI browsing context only. Never gate incoming call/notification handling on active hub state.

**`docs/protocol/PROTOCOL.md`** — add to the push notification or mobile client section:

> **Hub routing for push notifications**: The `hubId` field in a wake payload identifies which hub the notification belongs to. Clients must dispatch the notification to the correct hub handler regardless of which hub is currently active in the UI. Switching the active hub UI context is a separate action and must only occur when the user explicitly taps a notification or switches hubs manually.

---

## Platform Scope

| Platform | Changes |
|----------|---------|
| iOS (Swift) | Gap 1: `LlamenosApp.swift` push routing fix |
| Android (Kotlin) | Gap 1: `PushService.kt` push routing fix |
| CI (GitHub Actions) | Gap 2: `ci.yml` codegen:check gate |
| Protocol / packages | Gap 3: delete stale generated/typescript/ |
| Worker (TypeScript) | Gap 4: `lib/config.ts` + `app.ts` startup validation |
| Docs | Gap 5: `CLAUDE.md` + `docs/protocol/PROTOCOL.md` |

---

## Verification Gates

### Gap 1
- [ ] iOS unit test: `WakeKeyServiceTests` — verify `decryptWakePayload` is unchanged
- [ ] iOS unit test: new test in `LlamenosAppTests` — push notification for Hub B does NOT switch `hubContext.activeHubId` away from Hub A
- [ ] iOS unit test: push notification with `type == "incoming_call"` — `hubActivityService` / ring logic receives the hub ID
- [ ] Android unit test: `PushServiceTest` — `onMessageReceived` with a shift reminder does NOT call `activeHubState.setActiveHub`
- [ ] Android unit test: `onMessageReceived` with `type == incoming_call` — `linphoneService.storePendingCallHub` is called with correct hubId

### Gap 2
- [ ] CI `build` job includes `bun run codegen:check` step after `bun run codegen`
- [ ] Manually verify: edit a Zod schema without running codegen → CI fails on `codegen:check` step

### Gap 3
- [ ] `packages/protocol/generated/typescript/` does not exist in the working tree
- [ ] `bun run codegen` does not recreate the typescript/ subdirectory
- [ ] `bun run codegen:check` passes after deletion

### Gap 4
- [ ] Starting the worker without `HMAC_SECRET` set exits immediately with a clear error message naming the missing var
- [ ] Starting with a 32-char `HMAC_SECRET` (wrong length) exits with a clear message
- [ ] Starting with valid required vars but no `NOSTR_RELAY_URL` logs a warning and starts normally
- [ ] BDD backend tests pass: startup validation does not reject the test environment config

### Gap 5
- [ ] Multi-hub routing axiom appears in `CLAUDE.md` (searchable as "multi-hub routing axiom")
- [ ] Hub routing description appears in `docs/protocol/PROTOCOL.md` in the push notification section
