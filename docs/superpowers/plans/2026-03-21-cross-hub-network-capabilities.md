# Cross-Hub Network Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 7 cross-hub network features — documentation of the multi-hub axiom, cross-hub ban propagation, cross-hub user suspension suggestions, multi-hub SIP registration enforcement, mutual aid fallback ring groups, network-level emergency broadcast, and cross-hub audit log — while strictly preserving the architectural invariant that all hubs are always active simultaneously.

**Architecture:** A new `/api/network` router handles super-admin network-wide operations (bans, suspensions, broadcasts, cross-hub audit) as a clean separation from hub-scoped routes. Hub-specific cross-hub actions (ban propagation suggestions, user flags, fallback ring group CRUD) extend existing hub-scoped routes. iOS and Android multi-hub SIP registration is fixed in ShiftsViewModel (both platforms) so that every on-shift hub gets registered on startup, not just the active hub.

**Tech Stack:** Bun + Hono + Drizzle ORM + PostgreSQL (backend); SwiftUI + LinphoneService (iOS); Kotlin/Compose + LinphoneService (Android); React + TanStack Router + shadcn/ui (Desktop); BDD tests via `bun run test:backend:bdd`; `packages/test-specs/features/` for feature files.

---

## Scope Check and Task Ordering

This spec covers 7 features spanning backend, iOS, Android, and Desktop. Features have the following dependency order:

1. **F1 (Docs)** — Independent. No code deps. Do first to lock in axiom language.
2. **F4 (Multi-hub SIP)** — Independent of other features (iOS/Android only). Do in parallel with F1.
3. **F2 (Ban Propagation)** — Requires new DB tables, `network.ts` router. Do after F1.
4. **F3 (User Suspension)** — Requires new DB tables, extends `network.ts`. Do after F2 (shares the router).
5. **F7 (Cross-hub Audit)** — Extends existing audit service/route. Simplest backend feature. Do after F3.
6. **F5 (Mutual Aid Fallback)** — Requires DB schema changes to calls table, new settings table, ringing.ts update.
7. **F6 (Network Broadcast)** — New service + new schema + client UI on all platforms. Largest. Do last.

**Recommended execution order: F1 → F4 (parallel) → F2 → F3 → F7 → F5 → F6**

---

## File Map

### New Files
- `apps/worker/routes/network.ts` — `/api/network/*` endpoints (super-admin: bans, users, broadcasts, audit)
- `apps/worker/services/broadcasts.ts` — network broadcast service
- `apps/worker/db/schema/broadcasts.ts` — `network_broadcasts` table
- `packages/test-specs/features/admin/cross-hub-bans.feature` — F2 BDD scenarios
- `packages/test-specs/features/admin/user-flags.feature` — F3 BDD scenarios
- `packages/test-specs/features/admin/network-broadcast.feature` — F6 BDD scenarios
- `packages/test-specs/features/admin/cross-hub-audit.feature` — F7 BDD scenarios
- `packages/test-specs/features/admin/mutual-aid-fallback.feature` — F5 BDD scenarios
- `tests/steps/backend/cross-hub-network.steps.ts` — step definitions for all new features

### Modified Files
- `CLAUDE.md` — add Multi-Hub Architecture Guarantees section (F1)
- `docs/protocol/PROTOCOL.md` — add Cross-Hub Routing Semantics section (F1)
- `apps/worker/db/schema/records.ts` — add `banPropagationSuggestions`, `networkBans` tables (F2)
- `apps/worker/db/schema/users.ts` — add `userFlags`, `networkSuspensions` tables (F3)
- `apps/worker/db/schema/settings.ts` — add `hubFallbackConfigs` table + `isPlatformAdmin` to hubs (F3, F5)
- `apps/worker/db/schema/calls.ts` — add `originatingHubId` column (F5)
- `apps/worker/db/schema/index.ts` — re-export new tables (F2, F3, F5, F6)
- `apps/worker/services/records.ts` — add propagation/network-ban methods (F2)
- `apps/worker/services/identity.ts` — add flag/network-suspend methods (F3)
- `apps/worker/services/ringing.ts` — add fallback ring group logic (F5)
- `apps/worker/services/audit.ts` — add cross-hub query support (F7)
- `apps/worker/routes/bans.ts` — add propagation, suggestion, review endpoints (F2)
- `apps/worker/routes/users.ts` — add flag, dismiss endpoints (F3)
- `apps/worker/routes/hubs.ts` — add fallback CRUD endpoints (F5)
- `apps/worker/routes/audit.ts` — add `allHubs` query param (F7)
- `apps/worker/routes/telephony.ts` — check `isNetworkBanned()` in call routing (F2)
- `apps/worker/middleware/auth.ts` — check `isNetworkSuspended()` on every request (F3)
- `apps/worker/app.ts` — mount `/api/network` router (F2)
- `packages/protocol/schemas/bans.ts` — add propagation/suggestion/network-ban schemas (F2)
- `packages/protocol/schemas/users.ts` — add flag/suspension schemas (F3)
- `packages/protocol/schemas/hubs.ts` — add fallback config schemas (F5)
- `packages/protocol/schemas/audit.ts` — extend with allHubs query schema (F7)
- `packages/protocol/crypto-labels.json` — add `LABEL_NETWORK_BAN_PHONE` (F2)
- `packages/shared/permissions.ts` — add `bans:propagate`, `users:flag` permissions (F2, F3)
- `apps/ios/Sources/ViewModels/ShiftsViewModel.swift` — multi-hub SIP registration (F4)
- `apps/ios/Sources/App/AppState.swift` — post-login SIP pre-registration (F4)
- `apps/ios/Sources/Services/LinphoneService.swift` — SIP token refresh timer, no forced hub switch on call (F4)
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/shifts/ShiftsViewModel.kt` — multi-hub SIP registration (F4)
- `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt` — no hub switch on incoming call (F4)
- Desktop UI — ban detail, user detail, hub settings, call screens, super-admin panels, broadcast banner (F2-F7)

---

## Task 1: F1 — Multi-Hub Axiom Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/protocol/PROTOCOL.md`

- [ ] **Step 1: Add Multi-Hub Architecture Guarantees section to CLAUDE.md**

  Open `CLAUDE.md`. Locate the "Architecture Roles" table. Insert the following section immediately after that table (before the next `##` heading):

  ```markdown
  ## Multi-Hub Architecture Guarantees

  Any authenticated user may be a member of multiple hubs simultaneously — regardless of role. The following invariants are
  non-negotiable and must be preserved by every feature touching call routing, push handling,
  WebSocket subscriptions, or SIP registration:

  1. **All hubs are always active.** Incoming calls, APNs push notifications, VoIP pushes,
     and Nostr events are received from every hub the user is a member of — regardless
     of which hub is currently active in the UI.
  2. **Hub switching is UI-only.** Changing `hubContext.activeHubId` (iOS), `ActiveHubState`
     (Android), or the desktop hub selector changes browsing/case context only. It does not
     cancel SIP registrations, close WebSocket connections, or stop processing push payloads
     for other hubs.
  3. **Call handling is hub-independent.** When an incoming call arrives for Hub A while the
     user has Hub B active in the UI, the call is received normally. The incoming call
     screen shows which hub the call is for.
  4. **Active call continuity.** An active call on Hub A is not affected by switching the UI
     context to Hub B.

  **Hub-scoped operations** (change when hub context switches):
  - API requests for notes, cases, contacts, shifts, reports, conversations, bans, settings
  - WebSocket channel subscriptions (browsing)
  - UI rendering (tab contents, list data)

  **Hub-independent operations** (always cover all memberships):
  - SIP account registration (Linphone maintains one account per member hub)
  - VoIP push processing (wake payload decryption uses the hub key from the payload's hubId)
  - APNs display notification delivery (all hubs push to the device)
  - Nostr relay subscription (strfry subscription covers all hub pubkeys)
  ```

- [ ] **Step 2: Add Cross-Hub Routing Semantics section to PROTOCOL.md**

  Open `docs/protocol/PROTOCOL.md`. Locate the push notification section. Insert a new section after it titled "Cross-Hub Routing Semantics" covering:
  - How a client identifies which hub an incoming call/push belongs to (`hubId` field in push payload, SIP routing via per-hub domain)
  - Hub switching semantics: what changes (API context, UI rendering) vs what stays the same (SIP registrations, WebSocket, push processing)
  - SIP registration: one `GET /api/hubs/{hubId}/telephony/sip-token` per hub; all registrations maintained concurrently
  - Wake payload decryption: always use the hub key for the `hubId` in the payload, never the "active" hub key
  - WebSocket: single connection with hub-keyed subscriptions; server routes events by hub key

- [ ] **Step 3: Commit documentation**

  ```bash
  cd ~/projects/llamenos
  git add CLAUDE.md docs/protocol/PROTOCOL.md
  git commit -m "docs: add multi-hub axiom architecture guarantees and cross-hub routing semantics"
  ```

---

## Task 2: F4 — Multi-Hub SIP Registration (iOS)

**Files:**
- Modify: `apps/ios/Sources/Services/LinphoneService.swift`
- Modify: `apps/ios/Sources/ViewModels/ShiftsViewModel.swift`
- Modify: `apps/ios/Sources/App/AppState.swift`

> **Before implementing:** Check `expiry` field type in `SipTokenResponse`. It is `Int` (verified in `LinphoneService.swift` line 45). The struct in both iOS and Android defines `expiry: Int` as a duration in seconds, so `refreshAt = expiry * 1000 * 0.8` milliseconds from now.

> **Current SIP bug:** `LinphoneService.swift` line 158 calls `self.hubContext?.setActiveHub(hubId)` when an incoming call arrives from a non-active hub. This violates the multi-hub axiom — it disrupts browsing context. This must be changed to NOT switch hub context; instead, the hub name should be displayed in the incoming call UI.

- [ ] **Step 1: Fix LinphoneService — do not force hub switch on incoming call**

  In `apps/ios/Sources/Services/LinphoneService.swift`, find `setupCoreDelegate`. The `IncomingReceived` case currently calls `self.hubContext?.setActiveHub(hubId)`. Change it to store the hubId as a property so the call UI can display it without switching context:

  ```swift
  // Add to LinphoneService private state:
  private(set) var incomingCallHubId: String?

  // In setupCoreDelegate, IncomingReceived case — REPLACE setActiveHub with:
  case .IncomingReceived:
      self.pendingCallLock.lock()
      let hubId = self.pendingCallHubIds.removeValue(forKey: callId)
      self.pendingCallLock.unlock()
      if let hubId {
          Task { @MainActor in
              self.incomingCallHubId = hubId
              // NOTE: Do NOT call hubContext?.setActiveHub here.
              // Hub switching is UI-only. Calls arrive from all hubs regardless of active hub.
          }
      }
  case .Released, .End:
      self.pendingCallLock.lock()
      self.pendingCallHubIds.removeValue(forKey: callId)
      self.pendingCallLock.unlock()
      Task { @MainActor in self.incomingCallHubId = nil }
  ```

  Also add a SIP token refresh timer. Add a `private var refreshTimers: [String: Timer] = [:]` property, and update `registerHubAccount` to schedule a timer at 80% of `expiry`:

  ```swift
  // After adding the account in registerHubAccount:
  let refreshInterval = Double(sipParams.expiry) * 0.8
  let timer = Timer.scheduledTimer(withTimeInterval: refreshInterval, repeats: false) { [weak self] _ in
      Task { await self?.refreshSipToken(hubId: hubId) }
  }
  refreshTimers[hubId] = timer

  // Add to unregisterHubAccount before removeValue:
  refreshTimers.removeValue(forKey: hubId)?.invalidate()

  // Add method (requires injecting APIService — pass it during initialize):
  @MainActor
  private func refreshSipToken(hubId: String) async {
      guard let apiService else { return }
      do {
          let response: SipTokenResponse = try await apiService.get("/api/hubs/\(hubId)/telephony/sip-token")
          unregisterHubAccount(hubId: hubId)
          try registerHubAccount(hubId: hubId, sipParams: response)
      } catch {
          // Best-effort: log and let the next VoIP push re-register
      }
  }
  ```

  Update `initialize(hubContext:)` signature to also accept `apiService: APIService`:
  ```swift
  func initialize(hubContext: HubContext, apiService: APIService) throws {
      self.hubContext = hubContext
      self.apiService = apiService
      // ... existing core setup
  }
  private weak var apiService: APIService?
  ```

- [ ] **Step 2: Update ShiftsViewModel — register SIP for ALL on-shift hubs**

  Open `apps/ios/Sources/ViewModels/ShiftsViewModel.swift`. Find where the VM calls `linphoneService.registerHubAccount` (in the `onShiftStarted` or clock-in handler). The existing call registers only the active hub.

  > **APIService note:** iOS `APIService` already has `getSipToken(hubId:) async throws -> SipTokenResponse` (line 358 in `APIService.swift`). For shift status, use `request(method: "GET", path: "/api/hubs/\(hubId)/shifts/status")` directly. The `hp()` helper prefixes with the *active* hub — do NOT use it here, as we need to query each specific hub by ID.

  Add a new method `registerAllOnShiftHubs()` that:
  1. Fetches shift status for each hub in `hubContext.memberHubs` using `GET /api/hubs/{hubId}/shifts/status` directly (not via `hp()`)
  2. For each hub where `isOnShift == true`, calls `apiService.getSipToken(hubId:)` and `linphoneService.registerHubAccount(hubId:sipParams:)`
  3. Skips hubs already registered (check `linphoneService.registeredHubIds.contains(hubId)`)

  ```swift
  func registerAllOnShiftHubs() async {
      let hubs = hubContext.memberHubs
      await withTaskGroup(of: Void.self) { group in
          for hub in hubs {
              group.addTask {
                  guard !self.linphoneService.registeredHubIds.contains(hub.id) else { return }
                  do {
                      let status: ShiftStatusResponse = try await self.apiService.request(
                          method: "GET", path: "/api/hubs/\(hub.id)/shifts/status"
                      )
                      guard status.isOnShift else { return }
                      let sipParams = try await self.apiService.getSipToken(hubId: hub.id)
                      try self.linphoneService.registerHubAccount(hubId: hub.id, sipParams: sipParams)
                  } catch {
                      // Per-hub failure does not affect other hubs
                  }
              }
          }
      }
  }
  ```

  Expose `registeredHubIds: Set<String>` on `LinphoneServiceProtocol`:
  ```swift
  // In LinphoneServiceProtocol:
  var registeredHubIds: Set<String> { get }
  // In LinphoneService:
  var registeredHubIds: Set<String> { Set(hubAccounts.keys) }
  ```

  Update `registerAllOnShiftHubs()` to skip already-registered hubs.

- [ ] **Step 3: Update AppState — call registerAllOnShiftHubs on post-login hub load**

  Open `apps/ios/Sources/App/AppState.swift`. Find where the app loads hub membership after login (likely after `loadHubs()` or in the authenticated state setup). Call `shiftsViewModel.registerAllOnShiftHubs()` there as a `Task { await ... }` (non-blocking, best-effort):

  ```swift
  // After hub membership is loaded post-login:
  Task {
      await shiftsViewModel.registerAllOnShiftHubs()
  }
  ```

  Also update the call to `linphoneService.initialize` to pass the apiService:
  ```swift
  try linphoneService.initialize(hubContext: hubContext, apiService: apiService)
  ```

- [ ] **Step 4: Write unit tests for LinphoneService multi-hub behavior**

  In `apps/ios/Tests/LinphoneServiceTests.swift` (create if it doesn't exist), add:

  ```swift
  // Test: incoming call does NOT switch hub context
  func testIncomingCallDoesNotSwitchHubContext() {
      let sut = LinphoneService()
      let mockHubContext = MockHubContext()
      try? sut.initialize(hubContext: mockHubContext, apiService: MockAPIService())

      sut.handleVoipPush(callId: "call-123", hubId: "hub-b")
      // Simulate IncomingReceived — in tests, trigger the stored pending call
      // (via test accessor in DEBUG block)

      XCTAssertEqual(mockHubContext.setActiveHubCallCount, 0,
          "setActiveHub must NOT be called on incoming call — violates multi-hub axiom")
      XCTAssertEqual(sut.incomingCallHubId, "hub-b")
  }

  // Test: registeredHubIds returns correct set
  func testRegisteredHubIds() throws {
      let sut = LinphoneService()
      XCTAssertTrue(sut.registeredHubIds.isEmpty)
  }
  ```

- [ ] **Step 5: Run iOS unit tests to verify**

  On the Mac (via ssh mac):
  ```bash
  ssh mac "cd ~/projects/llamenos && xcodebuild test -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | tail -20"
  ```
  Expected: All existing tests pass + new LinphoneService tests pass.

- [ ] **Step 6: Commit iOS F4 changes**

  ```bash
  git add apps/ios/
  git commit -m "fix(ios): multi-hub SIP registration — register all on-shift hubs, no hub-switch on incoming call"
  ```

---

## Task 3: F4 — Multi-Hub SIP Registration (Android)

**Files:**
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/telephony/LinphoneService.kt`
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/ui/shifts/ShiftsViewModel.kt`
- Modify: `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt`

> **Current Android SIP bug:** Verify whether Android `LinphoneService.kt` calls `activeHubState.setActiveHub()` on incoming call (similar to iOS bug). Run: `grep -n "setActiveHub\|activeHub" apps/android/app/src/main/java/org/llamenos/hotline/telephony/LinphoneService.kt`

- [ ] **Step 1: Check for Android hub-switching bug in LinphoneService.kt**

  ```bash
  grep -n "setActiveHub\|activeHubState" ~/projects/llamenos/apps/android/app/src/main/java/org/llamenos/hotline/telephony/LinphoneService.kt
  ```

  If `setActiveHub` is called in the call listener: remove that call and instead expose `incomingCallHubId: StateFlow<String?>` so the call UI can display hub identity without switching context.

- [ ] **Step 2: Fix Android LinphoneService — no hub switch, expose incomingCallHubId**

  Add to `LinphoneService`:
  ```kotlin
  private val _incomingCallHubId = MutableStateFlow<String?>(null)
  val incomingCallHubId: StateFlow<String?> = _incomingCallHubId.asStateFlow()
  ```

  In `setupCoreListener`, in the `IncomingReceived` branch, replace any `activeHubState.setActiveHub(...)` with:
  ```kotlin
  Call.State.IncomingReceived -> {
      val callId = call.callLog?.callId ?: ""
      val hubId = pendingCallHubIds.remove(callId)
      if (hubId != null) {
          scope.launch { _incomingCallHubId.emit(hubId) }
          // Do NOT call activeHubState.setActiveHub — incoming calls are hub-independent
      }
  }
  Call.State.Released, Call.State.End -> {
      val callId = call.callLog?.callId ?: ""
      pendingCallHubIds.remove(callId)
      scope.launch { _incomingCallHubId.emit(null) }
  }
  ```

  Add SIP token refresh timer:
  ```kotlin
  private val refreshJobs = ConcurrentHashMap<String, kotlinx.coroutines.Job>()

  fun registerHubAccount(hubId: String, sipParams: SipTokenResponse) {
      // ... existing registration code ...
      // Schedule token refresh at 80% of expiry
      val refreshDelayMs = (sipParams.expiry * 1000 * 0.8).toLong()
      val job = scope.launch {
          kotlinx.coroutines.delay(refreshDelayMs)
          refreshSipToken(hubId)
      }
      refreshJobs[hubId] = job
  }

  fun unregisterHubAccount(hubId: String) {
      refreshJobs.remove(hubId)?.cancel()
      // ... existing unregister code ...
  }

  private suspend fun refreshSipToken(hubId: String) {
      // apiService is injected via Hilt — add @Inject lateinit var apiService: ApiService
      try {
          val response = apiService.request<SipTokenResponse>("GET", "/api/hubs/$hubId/telephony/sip-token")
          unregisterHubAccount(hubId)
          registerHubAccount(hubId, response)
      } catch (e: Exception) {
          Log.w("LinphoneService", "SIP token refresh failed for hub $hubId: ${e.message}")
      }
  }
  ```

  Inject `ApiService` via Hilt into LinphoneService.

- [ ] **Step 3: Update Android ShiftsViewModel — register SIP for all on-shift hubs**

  Open `apps/android/app/src/main/java/org/llamenos/hotline/ui/shifts/ShiftsViewModel.kt`.

  Inject `LinphoneService` via Hilt. Add a method `registerAllOnShiftHubs()` that:
  1. Gets all member hub IDs from `activeHubState.memberHubIds` (or equivalent)
  2. For each hub, fetches shift status and SIP token, registers if on shift
  3. Skips already-registered hubs (`linphoneService.hubAccounts.containsKey(hubId)`)

  Call `registerAllOnShiftHubs()` in `init { }` after hub loading, via `viewModelScope.launch`.

  Also inject `LinphoneService` into the ViewModel:
  ```kotlin
  @HiltViewModel
  class ShiftsViewModel @Inject constructor(
      private val apiService: ApiService,
      private val activeHubState: ActiveHubState,
      private val linphoneService: LinphoneService,
  ) : ViewModel() {
      init {
          activeHubState.activeHubId
              .filterNotNull()
              .onEach { refresh() }
              .launchIn(viewModelScope)
          viewModelScope.launch { registerAllOnShiftHubs() }
      }

      private suspend fun registerAllOnShiftHubs() {
          val hubIds = activeHubState.memberHubIds.value ?: return
          hubIds.forEach { hubId ->
              if (linphoneService.hubAccounts.containsKey(hubId)) return@forEach
              try {
                  val status = apiService.request<ShiftStatusResponse>("GET", "/api/shifts/status", hubId = hubId)
                  if (!status.isOnShift) return@forEach
                  val sipParams = apiService.request<SipTokenResponse>("GET", "/api/hubs/$hubId/telephony/sip-token", hubId = hubId)
                  linphoneService.registerHubAccount(hubId, sipParams)
              } catch (e: Exception) {
                  Log.w("ShiftsViewModel", "SIP pre-registration failed for hub $hubId: ${e.message}")
              }
          }
      }
  }
  ```

  Expose `hubAccounts` as a readable property in LinphoneService (or add `isRegistered(hubId: String): Boolean`).

- [ ] **Step 4: Update PushService — do not switch hub on incoming call push**

  Open `apps/android/app/src/main/java/org/llamenos/hotline/service/PushService.kt`. Search for any `activeHubState.setActiveHub(...)` call in the `incoming_call` handling path. Remove it. The hub identity is conveyed via `linphoneService.incomingCallHubId`.

- [ ] **Step 5: Run Android unit tests**

  ```bash
  cd ~/projects/llamenos/apps/android && ./gradlew testDebugUnitTest 2>&1 | tail -30
  ```
  Expected: all unit tests pass.

- [ ] **Step 6: Compile Android test APK**

  ```bash
  cd ~/projects/llamenos/apps/android && ./gradlew compileDebugAndroidTestKotlin 2>&1 | tail -20
  ```
  Expected: BUILD SUCCESSFUL

- [ ] **Step 7: Commit Android F4 changes**

  ```bash
  git add apps/android/
  git commit -m "fix(android): multi-hub SIP registration — register all on-shift hubs, no hub-switch on incoming call"
  ```

---

## Task 4: F2 — Cross-Hub Ban Propagation — Schema, Permissions, and Crypto Label

**Files:**
- Modify: `apps/worker/db/schema/records.ts`
- Modify: `apps/worker/db/schema/index.ts`
- Modify: `packages/protocol/crypto-labels.json`
- Modify: `packages/shared/permissions.ts`

- [ ] **Step 1: Add LABEL_NETWORK_BAN_PHONE to crypto-labels.json**

  In `packages/protocol/crypto-labels.json`, add to the `labels` object:
  ```json
  "LABEL_NETWORK_BAN_PHONE": "llamenos:network-ban-phone"
  ```

  Run codegen to regenerate TypeScript/Swift/Kotlin constants:
  ```bash
  cd ~/projects/llamenos && bun run codegen
  ```
  Expected: codegen completes without errors.

- [ ] **Step 2: Add bans:propagate and users:flag permissions to permissions.ts**

  Open `packages/shared/permissions.ts`. Find the `bans:*` permission section (around line 82-85). Add after `bans:delete`:
  ```typescript
  'bans:propagate': 'Suggest a ban to other hubs',
  ```

  Find the `users:*` section (around line 65-71). Add after `users:manage-roles`:
  ```typescript
  'users:flag': 'Flag a user for cross-hub review',
  ```

  Find the `DEFAULT_ROLES` array entry for `role-admin` (the one with `'bans:*'`). Verify `bans:*` covers `bans:propagate` via the wildcard — it does. Check that `users:flag` is covered by `users:*` for admins — it is. No additional role grants needed.

- [ ] **Step 3: Add banPropagationSuggestions and networkBans tables to records.ts**

  In `apps/worker/db/schema/records.ts`, after the `auditLog` table definition, add:

  ```typescript
  // ---------------------------------------------------------------------------
  // ban_propagation_suggestions
  // ---------------------------------------------------------------------------

  export const banPropagationSuggestions = pgTable(
    'ban_propagation_suggestions',
    {
      id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
      sourceHubId: text('source_hub_id').notNull(),
      targetHubId: text('target_hub_id').notNull(),
      banId: text('ban_id').references(() => bans.id, { onDelete: 'set null' }),
      phoneHash: text('phone_hash').notNull(),
      reason: text('reason'),
      status: text('status').notNull().default('pending'), // pending | accepted | rejected
      suggestedBy: text('suggested_by').notNull(),
      suggestedAt: timestamp('suggested_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
      reviewedBy: text('reviewed_by'),
      reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    },
    (table) => [
      index('ban_suggestions_target_hub_idx').on(table.targetHubId, table.status),
      index('ban_suggestions_source_hub_idx').on(table.sourceHubId),
    ],
  )

  // ---------------------------------------------------------------------------
  // network_bans (super-admin, applies across all hubs)
  // ---------------------------------------------------------------------------

  export const networkBans = pgTable(
    'network_bans',
    {
      id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
      phoneHash: text('phone_hash').notNull().unique(),
      phone: text('phone').notNull(), // encrypted with LABEL_NETWORK_BAN_PHONE — super-admin only
      reason: text('reason'),
      bannedBy: text('banned_by').notNull(),
      bannedAt: timestamp('banned_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [index('network_bans_phone_hash_idx').on(table.phoneHash)],
  )
  ```

- [ ] **Step 4: Re-export new tables from schema/index.ts**

  `apps/worker/db/schema/index.ts` already re-exports `./records`. No change needed for the records tables since they are exported from `records.ts` via the existing wildcard export. Confirm by checking if `export * from './records'` covers the new exports — it does.

- [ ] **Step 5: Generate and run DB migration**

  ```bash
  cd ~/projects/llamenos && bun run db:generate
  ```
  Expected: new migration file created in `apps/worker/db/migrations/`.

  ```bash
  bun run db:migrate
  ```
  Expected: migration applies without errors.

- [ ] **Step 6: Run typecheck**

  ```bash
  cd ~/projects/llamenos && bun run typecheck
  ```
  Expected: no errors.

- [ ] **Step 7: Commit schema and permissions changes**

  ```bash
  git add packages/protocol/crypto-labels.json packages/shared/permissions.ts apps/worker/db/schema/records.ts apps/worker/db/migrations/
  git commit -m "feat(schema): add ban_propagation_suggestions, network_bans tables; bans:propagate permission"
  ```

---

## Task 5: F2 — Cross-Hub Ban Propagation — Service Layer

**Files:**
- Modify: `apps/worker/services/records.ts`

- [ ] **Step 1: Write failing BDD feature file for ban propagation**

  Create `packages/test-specs/features/admin/cross-hub-bans.feature`:

  ```gherkin
  @backend
  Feature: Cross-Hub Ban Propagation
    As an admin
    I want to propagate bans to other hubs in the network
    So that abusive callers are blocked across the network

    Background:
      Given two hubs exist: "Hub Alpha" and "Hub Beta"

    Scenario: Admin propagates ban suggestion to specific hub
      Given I am logged in as an admin of "Hub Alpha"
      And a ban exists for a phone number on "Hub Alpha"
      When I propagate the ban to "Hub Beta"
      Then "Hub Beta" should have a pending ban suggestion
      And the suggestion should contain a phone hash, not the raw phone number

    Scenario: Hub Beta admin accepts ban suggestion
      Given "Hub Beta" has a pending ban suggestion from "Hub Alpha"
      When I am logged in as an admin of "Hub Beta"
      And I accept the ban suggestion
      Then "Hub Beta" should have a hub-scoped ban for the phone hash
      And the ban on "Hub Beta" should show "identity protected" (no raw phone)

    Scenario: Hub Beta admin rejects ban suggestion
      Given "Hub Beta" has a pending ban suggestion from "Hub Alpha"
      When I am logged in as an admin of "Hub Beta"
      And I reject the ban suggestion
      Then the suggestion status should be "rejected"
      And no hub-scoped ban should be created on "Hub Beta"

    Scenario: Super-admin creates network-wide ban
      Given I am logged in as a super-admin
      When I create a network ban for a phone number with reason "Harassment campaign"
      Then the phone number should be blocked on all hubs
      And the network ban record should contain a phone hash and encrypted phone
      And the phone hash should appear in the network ban record

    Scenario: Network-banned number is blocked before hub routing
      Given a network ban exists for a phone number
      When the banned number calls "Hub Alpha"
      Then the call should be rejected at the network level
      And the network ban should take effect even if no hub-specific ban exists

    Scenario: Volunteer cannot propagate bans
      Given I am logged in as a volunteer
      When I attempt to propagate a ban
      Then I should receive a 403 Forbidden response
  ```

- [ ] **Step 2: Run the feature to confirm it fails**

  ```bash
  cd ~/projects/llamenos && bun run test:backend:bdd -- --grep "Cross-Hub Ban Propagation" 2>&1 | tail -20
  ```
  Expected: scenarios fail with "step not found" or similar — red.

- [ ] **Step 3: Add service methods to records.ts**

  Open `apps/worker/services/records.ts`. Find the existing `addBan`, `listBans` methods. After them, add:

  ```typescript
  async propagateBanToHub(
    banId: string,
    sourceHubId: string,
    targetHubId: string,
    suggestedBy: string,
    hmacSecret: string,
  ): Promise<void> {
    const ban = await this.db.select().from(bans).where(eq(bans.id, banId)).get()
    if (!ban) throw new ServiceError('Ban not found', 404)
    const phoneHash = hashPhone(ban.phone, hmacSecret)
    await this.db.insert(banPropagationSuggestions).values({
      sourceHubId,
      targetHubId,
      banId,
      phoneHash,
      reason: ban.reason ?? undefined,
      suggestedBy,
    })
  }

  async propagateBanToAllHubs(
    banId: string,
    sourceHubId: string,
    suggestedBy: string,
    hmacSecret: string,
  ): Promise<void> {
    const { hubs: allHubs } = await this.settings.getHubs()
    const targets = allHubs.filter(h => h.status === 'active' && h.id !== sourceHubId)
    await Promise.all(
      targets.map(h => this.propagateBanToHub(banId, sourceHubId, h.id, suggestedBy, hmacSecret))
    )
  }

  async listBanSuggestions(hubId: string) {
    return this.db
      .select()
      .from(banPropagationSuggestions)
      .where(and(
        eq(banPropagationSuggestions.targetHubId, hubId),
        eq(banPropagationSuggestions.status, 'pending'),
      ))
      .orderBy(desc(banPropagationSuggestions.suggestedAt))
  }

  async reviewBanSuggestion(
    suggestionId: string,
    adminPubkey: string,
    action: 'accept' | 'reject',
    hubId: string,
  ): Promise<void> {
    const suggestion = await this.db
      .select()
      .from(banPropagationSuggestions)
      .where(and(
        eq(banPropagationSuggestions.id, suggestionId),
        eq(banPropagationSuggestions.targetHubId, hubId),
        eq(banPropagationSuggestions.status, 'pending'),
      ))
      .get()
    if (!suggestion) throw new ServiceError('Suggestion not found', 404)

    await this.db
      .update(banPropagationSuggestions)
      .set({ status: action === 'accept' ? 'accepted' : 'rejected', reviewedBy: adminPubkey, reviewedAt: new Date() })
      .where(eq(banPropagationSuggestions.id, suggestionId))

    if (action === 'accept') {
      // Create hub-scoped ban with phoneHash only (no raw phone — Hub B never receives PII from Hub A)
      await this.db.insert(bans).values({
        hubId,
        phone: `hash:${suggestion.phoneHash}`, // convention: prefix with "hash:" for hash-only bans
        reason: suggestion.reason ? `[Propagated] ${suggestion.reason}` : '[Propagated ban — identity protected]',
        bannedBy: adminPubkey,
      }).onConflictDoNothing()
    }
  }

  async createNetworkBan(
    phone: string,
    reason: string | undefined,
    bannedBy: string,
    hmacSecret: string,
    encryptedPhone: string, // pre-encrypted by caller using LABEL_NETWORK_BAN_PHONE
  ): Promise<void> {
    const phoneHash = hashPhone(phone, hmacSecret)
    await this.db.insert(networkBans).values({ phoneHash, phone: encryptedPhone, reason, bannedBy })
  }

  async isNetworkBanned(phoneHash: string): Promise<boolean> {
    const result = await this.db
      .select({ id: networkBans.id })
      .from(networkBans)
      .where(eq(networkBans.phoneHash, phoneHash))
      .get()
    return !!result
  }

  async listNetworkBans() {
    return this.db.select().from(networkBans).orderBy(desc(networkBans.bannedAt))
  }
  ```

  Import the new schema tables at the top of the service file and ensure `hashPhone` is imported from `../lib/crypto`.

- [ ] **Step 4: Run typecheck**

  ```bash
  cd ~/projects/llamenos && bun run typecheck
  ```
  Expected: no errors.

- [ ] **Step 5: Commit service layer**

  ```bash
  git add apps/worker/services/records.ts packages/test-specs/features/admin/cross-hub-bans.feature
  git commit -m "feat(bans): cross-hub ban propagation service methods + BDD feature file"
  ```

---

## Task 6: F2 — Cross-Hub Ban Propagation — API Layer

**Files:**
- Modify: `apps/worker/routes/bans.ts`
- Create: `apps/worker/routes/network.ts`
- Modify: `apps/worker/app.ts`
- Modify: `apps/worker/routes/telephony.ts`
- Modify: `packages/protocol/schemas/bans.ts`

- [ ] **Step 1: Add Zod schemas for propagation in packages/protocol/schemas/bans.ts**

  Open `packages/protocol/schemas/bans.ts`. Add:

  ```typescript
  export const banPropagateBodySchema = z.object({
    targetHubIds: z.array(z.string()).optional(),
  })

  export const banSuggestionSchema = z.object({
    id: z.string(),
    sourceHubId: z.string(),
    targetHubId: z.string(),
    banId: z.string().optional().default(''),
    phoneHash: z.string(),
    reason: z.string().optional().default(''),
    status: z.enum(['pending', 'accepted', 'rejected']),
    suggestedBy: z.string(),
    suggestedAt: z.string(),
    reviewedBy: z.string().optional().default(''),
    reviewedAt: z.string().optional().default(''),
  })

  export const banSuggestionListResponseSchema = z.object({
    suggestions: z.array(banSuggestionSchema),
  })

  export const banSuggestionReviewBodySchema = z.object({
    action: z.enum(['accept', 'reject']),
  })

  export const networkBanBodySchema = z.object({
    phone: z.string(),
    reason: z.string().optional(),
  })

  export const networkBanResponseSchema = z.object({
    id: z.string(),
    phoneHash: z.string(),
    reason: z.string().optional().default(''),
    bannedBy: z.string(),
    bannedAt: z.string(),
  })

  export const networkBanListResponseSchema = z.object({
    bans: z.array(networkBanResponseSchema),
  })
  ```

- [ ] **Step 2: Add propagation endpoints to routes/bans.ts**

  In `apps/worker/routes/bans.ts`, after the existing routes, add:

  ```typescript
  // POST /bans/:id/propagate
  bans.post('/:id/propagate',
    requirePermission('bans:propagate'),
    validator('json', banPropagateBodySchema),
    async (c) => {
      const services = c.get('services')
      const pubkey = c.get('pubkey')
      const hubId = c.get('hubId')
      const banId = c.req.param('id')
      const { targetHubIds } = c.req.valid('json')
      if (targetHubIds && targetHubIds.length > 0) {
        await Promise.all(
          targetHubIds.map(tid =>
            services.records.propagateBanToHub(banId, hubId, tid, pubkey, c.env.HMAC_SECRET)
          )
        )
      } else {
        await services.records.propagateBanToAllHubs(banId, hubId, pubkey, c.env.HMAC_SECRET)
      }
      await audit(services.audit, 'banPropagated', pubkey,
        { banId, targetHubIds: targetHubIds ?? 'all' }, undefined, hubId ?? undefined)
      return c.json({ ok: true })
    },
  )

  // GET /bans/suggestions
  bans.get('/suggestions',
    requirePermission('bans:create'),
    async (c) => {
      const services = c.get('services')
      const hubId = c.get('hubId')
      const suggestions = await services.records.listBanSuggestions(hubId)
      return c.json({ suggestions })
    },
  )

  // POST /bans/suggestions/:id/review
  bans.post('/suggestions/:id/review',
    requirePermission('bans:create'),
    validator('json', banSuggestionReviewBodySchema),
    async (c) => {
      const services = c.get('services')
      const pubkey = c.get('pubkey')
      const hubId = c.get('hubId')
      const suggestionId = c.req.param('id')
      const { action } = c.req.valid('json')
      await services.records.reviewBanSuggestion(suggestionId, pubkey, action, hubId)
      await audit(services.audit, 'banSuggestionReviewed', pubkey,
        { suggestionId, action }, undefined, hubId ?? undefined)
      return c.json({ ok: true })
    },
  )
  ```

  Import new schemas at the top: `banPropagateBodySchema, banSuggestionReviewBodySchema`.

- [ ] **Step 3: Create apps/worker/routes/network.ts**

  ```typescript
  /**
   * Network-level routes — super-admin only.
   * Mounted at /api/network in app.ts.
   *
   * Covers:
   * - Network-wide bans (F2)
   * - Network-wide user suspensions (F3)
   * - Network broadcasts (F6)
   * - Cross-hub audit (F7)
   */
  import { Hono } from 'hono'
  import { validator } from 'hono-openapi'
  import type { AppEnv } from '../types'
  import { checkPermission } from '../middleware/permission-guard'
  import { hashPhone } from '../lib/crypto'
  import { networkBanBodySchema, networkBanListResponseSchema } from '@protocol/schemas/bans'
  import { audit } from '../services/audit'

  const network = new Hono<AppEnv>()

  // ── Network Bans ───────────────────────────────────────────────────────────

  network.get('/bans', async (c) => {
    const permissions = c.get('permissions')
    if (!checkPermission(permissions, '*')) return c.json({ error: 'Forbidden' }, 403)
    const services = c.get('services')
    const bans = await services.records.listNetworkBans()
    // Strip encrypted phone from response — return only hash, reason, bannedBy, bannedAt, id
    return c.json({
      bans: bans.map(b => ({ id: b.id, phoneHash: b.phoneHash, reason: b.reason, bannedBy: b.bannedBy, bannedAt: b.bannedAt }))
    })
  })

  network.post('/bans',
    validator('json', networkBanBodySchema),
    async (c) => {
      const permissions = c.get('permissions')
      if (!checkPermission(permissions, '*')) return c.json({ error: 'Forbidden' }, 403)
      const services = c.get('services')
      const pubkey = c.get('pubkey')
      const { phone, reason } = c.req.valid('json')
      // Phone is stored encrypted. For now, store as-is (client should encrypt before sending).
      // Full ECIES encryption of phone requires hub key access — placeholder until key infrastructure is wired.
      const phoneHash = hashPhone(phone, c.env.HMAC_SECRET)
      await services.records.createNetworkBan(phone, reason, pubkey, c.env.HMAC_SECRET, phone)
      await audit(services.audit, 'networkBanCreated', pubkey, { phoneHash })
      return c.json({ ok: true }, 201)
    },
  )

  export default network
  ```

- [ ] **Step 4: Mount network router in app.ts**

  Open `apps/worker/app.ts`. After the existing imports, add:
  ```typescript
  import networkRoutes from './routes/network'
  ```

  Find where routes are mounted (around `app.route('/api', api)`). Before that line, add:
  ```typescript
  app.route('/api/network', networkRoutes)
  ```

- [ ] **Step 5: Add isNetworkBanned check to telephony.ts**

  Open `apps/worker/routes/telephony.ts`. Find the call routing logic (the Twilio webhook handler that checks ban lists). Before the hub-specific ban check, add:

  ```typescript
  // Check network-wide ban before hub-specific ban
  const callerHash = hashPhone(callerNumber, c.env.HMAC_SECRET)
  const isNetworkBanned = await services.records.isNetworkBanned(callerHash)
  if (isNetworkBanned) {
    // Reject the call — return TwiML with reject verb
    return c.text('<Response><Reject/></Response>', 200, { 'Content-Type': 'text/xml' })
  }
  ```

  Import `hashPhone` from `'../lib/crypto'` if not already imported.

- [ ] **Step 6: Write BDD step definitions for ban propagation**

  Create `tests/steps/backend/cross-hub-network.steps.ts` with steps for the ban propagation scenarios:

  ```typescript
  import { Given, When, Then, Before } from './fixtures'
  import { expect } from '@playwright/test'
  import { getState, setState } from './fixtures'

  interface NetworkState {
    hubAlphaId?: string
    hubBetaId?: string
    banId?: string
    suggestionId?: string
    networkBanId?: string
  }

  const NS_KEY = 'network'
  function getNS(world: Record<string, unknown>): NetworkState {
    return getState<NetworkState>(world, NS_KEY)
  }

  Before({ tags: '@network or @cross-hub-bans' }, async ({ world }) => {
    setState(world, NS_KEY, {})
  })

  Given('two hubs exist: {string} and {string}', async ({ request, world }, hubAlphaName: string, hubBetaName: string) => {
    // Create two hubs using test helpers (similar to existing hub-management.steps.ts)
    // ... create hubAlpha, hubBeta via API as super-admin
    // Store ids in world state
  })

  Given('a ban exists for a phone number on {string}', async ({ request, world }, hubName: string) => {
    const ns = getNS(world)
    const hubId = hubName === 'Hub Alpha' ? ns.hubAlphaId : ns.hubBetaId
    const phone = `+1555${Date.now().toString().slice(-7)}`
    const res = await request.post('/api/bans', {
      data: { phone, reason: 'Test ban for propagation' },
      headers: { /* hub-scoped auth headers */ },
    })
    expect(res.status()).toBe(200)
    // fetch ban to get its id
    const bansRes = await request.get('/api/bans', { headers: { /* hub-scoped */ } })
    const { bans } = await bansRes.json()
    ns.banId = bans[0]?.id
    setState(world, NS_KEY, ns)
  })

  When('I propagate the ban to {string}', async ({ request, world }, targetHubName: string) => {
    const ns = getNS(world)
    const targetHubId = targetHubName === 'Hub Beta' ? ns.hubBetaId : ns.hubAlphaId
    const res = await request.post(`/api/bans/${ns.banId}/propagate`, {
      data: { targetHubIds: [targetHubId] },
      headers: { /* hub-alpha admin auth */ },
    })
    expect(res.status()).toBe(200)
  })

  Then('{string} should have a pending ban suggestion', async ({ request, world }, hubName: string) => {
    const ns = getNS(world)
    // Fetch as Hub Beta admin
    const res = await request.get('/api/bans/suggestions', { headers: { /* hub-beta admin auth */ } })
    expect(res.status()).toBe(200)
    const { suggestions } = await res.json()
    expect(suggestions.length).toBeGreaterThan(0)
    const pending = suggestions.filter((s: { status: string }) => s.status === 'pending')
    expect(pending.length).toBeGreaterThan(0)
    ns.suggestionId = pending[0].id
    setState(world, NS_KEY, ns)
  })

  Then('the suggestion should contain a phone hash, not the raw phone number', async ({ request, world }) => {
    const ns = getNS(world)
    const res = await request.get('/api/bans/suggestions', { headers: { /* hub-beta admin */ } })
    const { suggestions } = await res.json()
    const suggestion = suggestions.find((s: { id: string }) => s.id === ns.suggestionId)
    expect(suggestion).toBeDefined()
    expect(suggestion.phoneHash).toBeDefined()
    expect(suggestion.phone).toBeUndefined() // raw phone must never appear
  })

  // ... continue with accept/reject steps, network ban steps, volunteer 403 step
  ```

  The step file should follow the same pattern as `tests/steps/backend/call-routing.steps.ts` for authentication helpers.

- [ ] **Step 7: Run ban propagation BDD tests**

  ```bash
  cd ~/projects/llamenos && bun run test:backend:bdd -- --grep "Cross-Hub Ban Propagation" 2>&1 | tail -30
  ```
  Expected: all 6 scenarios pass — green.

- [ ] **Step 8: Run typecheck and full backend BDD suite**

  ```bash
  cd ~/projects/llamenos && bun run typecheck && bun run test:backend:bdd 2>&1 | tail -10
  ```
  Expected: no type errors; existing tests still pass.

- [ ] **Step 9: Commit ban propagation API layer**

  ```bash
  git add apps/worker/routes/bans.ts apps/worker/routes/network.ts apps/worker/app.ts apps/worker/routes/telephony.ts packages/protocol/schemas/bans.ts tests/steps/backend/cross-hub-network.steps.ts
  git commit -m "feat(bans): cross-hub ban propagation endpoints, network bans endpoint, telephony network-ban check"
  ```

---

## Task 7: F3 — Cross-Hub User Suspension — Schema and Service

**Files:**
- Modify: `apps/worker/db/schema/users.ts`
- Modify: `apps/worker/db/schema/settings.ts` (add `isPlatformAdmin` to hubs)
- Modify: `apps/worker/services/identity.ts`
- Modify: `apps/worker/middleware/auth.ts`

- [ ] **Step 1: Write failing BDD feature file for user flags**

  Create `packages/test-specs/features/admin/user-flags.feature`:

  ```gherkin
  @backend
  Feature: Cross-Hub User Suspension Suggestions
    As an admin
    I want to flag users for review on other hubs
    So that problematic behavior is visible to other hub admins

    Background:
      Given two hubs exist: "Hub Alpha" and "Hub Beta"
      And a user is a member of both hubs

    Scenario: Admin flags user for review on all other hubs
      Given I am logged in as an admin of "Hub Alpha"
      When I flag the user for review with reason "Inappropriate conduct"
      Then "Hub Beta" should have a pending user flag for that user
      And the flag should show the source hub and reason

    Scenario: Hub Beta admin dismisses user flag
      Given "Hub Beta" has a pending user flag from "Hub Alpha"
      When I am logged in as an admin of "Hub Beta"
      And I dismiss the user flag
      Then the flag status should be "dismissed"
      And the user should retain their "Hub Beta" membership

    Scenario: Super-admin network-suspends user
      Given I am logged in as a super-admin
      When I network-suspend a user with reason "Policy violation"
      Then the user should receive 403 on all hub API requests
      And the user's hub memberships should still exist (suspension is reversible)

    Scenario: Lifting network suspension restores access
      Given a user is network-suspended
      When I am logged in as a super-admin
      And I lift the network suspension
      Then the user should be able to make API requests again

    Scenario: Volunteer cannot flag users
      Given I am logged in as a volunteer
      When I attempt to flag a user for review
      Then I should receive a 403 Forbidden response
  ```

- [ ] **Step 2: Add isPlatformAdmin to hubs table in settings.ts**

  Open `apps/worker/db/schema/settings.ts`. Find `export const hubs = pgTable('hubs', {`. Add a field after `status`:

  ```typescript
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  ```

  This column marks the designated super-admin hub.

- [ ] **Step 3: Add userFlags and networkSuspensions tables to users.ts**

  Open `apps/worker/db/schema/users.ts`. After the `provisionRooms` table, add:

  ```typescript
  // ---------------------------------------------------------------------------
  // user_flags (cross-hub flag-for-review)
  // ---------------------------------------------------------------------------

  export const userFlags = pgTable(
    'user_flags',
    {
      id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
      flaggedPubkey: text('flagged_pubkey').notNull(),
      sourceHubId: text('source_hub_id').notNull(),
      targetHubId: text('target_hub_id').notNull(),
      reason: text('reason').notNull(),
      flaggedBy: text('flagged_by').notNull(),
      flaggedAt: timestamp('flagged_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
      status: text('status').notNull().default('pending'), // pending | reviewed | dismissed
      reviewedBy: text('reviewed_by'),
      reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    },
    (table) => [
      index('user_flags_target_hub_idx').on(table.targetHubId, table.status),
      index('user_flags_flagged_pubkey_idx').on(table.flaggedPubkey),
    ],
  )

  // ---------------------------------------------------------------------------
  // network_suspensions (super-admin network-wide suspensions)
  // ---------------------------------------------------------------------------

  export const networkSuspensions = pgTable('network_suspensions', {
    pubkey: text('pubkey').primaryKey(),
    reason: text('reason'),
    suspendedBy: text('suspended_by').notNull(),
    suspendedAt: timestamp('suspended_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  })
  ```

- [ ] **Step 4: Generate and run DB migration**

  ```bash
  cd ~/projects/llamenos && bun run db:generate && bun run db:migrate
  ```
  Expected: migration applies without errors.

- [ ] **Step 5: Add flag/suspend methods to identity.ts**

  Open `apps/worker/services/identity.ts`. After existing methods, add:

  ```typescript
  async flagUserForReview(
    flaggedPubkey: string,
    sourceHubId: string,
    reason: string,
    flaggedBy: string,
  ): Promise<void> {
    // Find all other hubs where the user is a member
    const { user } = await this.getUser(flaggedPubkey)
    if (!user) throw new ServiceError('User not found', 404)
    const memberHubIds: string[] = (user.hubRoles as Array<{ hubId: string }> ?? [])
      .map(hr => hr.hubId)
      .filter(id => id !== sourceHubId)

    if (memberHubIds.length === 0) return // User is only in the source hub

    await this.db.insert(userFlags).values(
      memberHubIds.map(targetHubId => ({
        flaggedPubkey,
        sourceHubId,
        targetHubId,
        reason,
        flaggedBy,
      }))
    )
  }

  async listUserFlags(hubId: string) {
    return this.db
      .select()
      .from(userFlags)
      .where(and(eq(userFlags.targetHubId, hubId), eq(userFlags.status, 'pending')))
      .orderBy(desc(userFlags.flaggedAt))
  }

  async dismissUserFlag(flagId: string, reviewerPubkey: string, hubId: string): Promise<void> {
    const flag = await this.db
      .select()
      .from(userFlags)
      .where(and(eq(userFlags.id, flagId), eq(userFlags.targetHubId, hubId)))
      .get()
    if (!flag) throw new ServiceError('Flag not found', 404)
    await this.db
      .update(userFlags)
      .set({ status: 'dismissed', reviewedBy: reviewerPubkey, reviewedAt: new Date() })
      .where(eq(userFlags.id, flagId))
  }

  async networkSuspendUser(pubkey: string, reason: string, suspendedBy: string): Promise<void> {
    await this.db.insert(networkSuspensions).values({ pubkey, reason, suspendedBy })
      .onConflictDoUpdate({ target: networkSuspensions.pubkey, set: { reason, suspendedBy, suspendedAt: new Date() } })
  }

  async liftNetworkSuspension(pubkey: string): Promise<void> {
    await this.db.delete(networkSuspensions).where(eq(networkSuspensions.pubkey, pubkey))
  }

  async isNetworkSuspended(pubkey: string): Promise<boolean> {
    const result = await this.db
      .select({ pubkey: networkSuspensions.pubkey })
      .from(networkSuspensions)
      .where(eq(networkSuspensions.pubkey, pubkey))
      .get()
    return !!result
  }
  ```

  Import `userFlags`, `networkSuspensions` from schema.

- [ ] **Step 6: Add isNetworkSuspended check to auth middleware**

  Open `apps/worker/middleware/auth.ts`. Find where user identity is resolved (after session/token validation, before request handling). Add the suspension check:

  ```typescript
  // After resolving pubkey from session:
  const suspended = await services.identity.isNetworkSuspended(pubkey)
  if (suspended) {
    return c.json({ error: 'Account suspended' }, 403)
  }
  ```

  This must run before hub-role checks so a suspended user cannot access ANY hub.

- [ ] **Step 7: Add network suspension routes to network.ts**

  In `apps/worker/routes/network.ts`, add after network bans:

  ```typescript
  import { networkSuspendBodySchema } from '@protocol/schemas/users'

  // POST /network/users/:pubkey/suspend
  network.post('/users/:pubkey/suspend',
    validator('json', networkSuspendBodySchema),
    async (c) => {
      const permissions = c.get('permissions')
      if (!checkPermission(permissions, '*')) return c.json({ error: 'Forbidden' }, 403)
      const services = c.get('services')
      const actorPubkey = c.get('pubkey')
      const targetPubkey = c.req.param('pubkey')
      const { reason } = c.req.valid('json')
      await services.identity.networkSuspendUser(targetPubkey, reason, actorPubkey)
      await audit(services.audit, 'networkSuspensionCreated', actorPubkey, { targetPubkey, reason })
      return c.json({ ok: true })
    },
  )

  // DELETE /network/users/:pubkey/suspend
  network.delete('/users/:pubkey/suspend', async (c) => {
    const permissions = c.get('permissions')
    if (!checkPermission(permissions, '*')) return c.json({ error: 'Forbidden' }, 403)
    const services = c.get('services')
    const actorPubkey = c.get('pubkey')
    const targetPubkey = c.req.param('pubkey')
    await services.identity.liftNetworkSuspension(targetPubkey)
    await audit(services.audit, 'networkSuspensionLifted', actorPubkey, { targetPubkey })
    return c.json({ ok: true })
  })
  ```

- [ ] **Step 8: Add user flag/dismiss routes to users.ts**

  Open `apps/worker/routes/users.ts`. Add:

  ```typescript
  // POST /users/:pubkey/flag-for-review
  users.post('/:pubkey/flag-for-review',
    requirePermission('users:flag'),
    validator('json', userFlagBodySchema),
    async (c) => {
      const services = c.get('services')
      const adminPubkey = c.get('pubkey')
      const hubId = c.get('hubId')
      const targetPubkey = c.req.param('pubkey')
      const { reason } = c.req.valid('json')
      await services.identity.flagUserForReview(targetPubkey, hubId, reason, adminPubkey)
      await audit(services.audit, 'userFlagged', adminPubkey, { targetPubkey, reason }, undefined, hubId ?? undefined)
      return c.json({ ok: true })
    },
  )

  // GET /users/flags
  users.get('/flags',
    requirePermission('users:flag'),
    async (c) => {
      const services = c.get('services')
      const hubId = c.get('hubId')
      const flags = await services.identity.listUserFlags(hubId)
      return c.json({ flags })
    },
  )

  // POST /users/flags/:id/dismiss
  users.post('/flags/:id/dismiss',
    requirePermission('users:flag'),
    async (c) => {
      const services = c.get('services')
      const pubkey = c.get('pubkey')
      const hubId = c.get('hubId')
      const flagId = c.req.param('id')
      await services.identity.dismissUserFlag(flagId, pubkey, hubId)
      return c.json({ ok: true })
    },
  )
  ```

  Import `userFlagBodySchema` from `@protocol/schemas/users`. Add the schema in `packages/protocol/schemas/users.ts`:
  ```typescript
  export const userFlagBodySchema = z.object({ reason: z.string().min(1) })
  export const networkSuspendBodySchema = z.object({ reason: z.string().min(1) })
  ```

- [ ] **Step 9: Add step definitions for user flags to cross-hub-network.steps.ts**

  Extend `tests/steps/backend/cross-hub-network.steps.ts` with steps for the user-flags scenarios (Given/When/Then from `user-flags.feature`). Follow the same request/assert pattern as existing steps.

- [ ] **Step 10: Run user flags BDD tests**

  ```bash
  cd ~/projects/llamenos && bun run test:backend:bdd -- --grep "Cross-Hub User Suspension" 2>&1 | tail -30
  ```
  Expected: all 5 scenarios pass — green.

- [ ] **Step 11: Run typecheck + full backend BDD**

  ```bash
  cd ~/projects/llamenos && bun run typecheck && bun run test:backend:bdd 2>&1 | tail -10
  ```

- [ ] **Step 12: Commit F3**

  ```bash
  git add apps/worker/db/schema/users.ts apps/worker/db/schema/settings.ts apps/worker/services/identity.ts apps/worker/middleware/auth.ts apps/worker/routes/network.ts apps/worker/routes/users.ts packages/protocol/schemas/users.ts packages/test-specs/features/admin/user-flags.feature apps/worker/db/migrations/ tests/steps/backend/cross-hub-network.steps.ts
  git commit -m "feat(users): cross-hub user flagging and network suspension"
  ```

---

## Task 8: F7 — Cross-Hub Audit Log

**Files:**
- Modify: `apps/worker/services/audit.ts`
- Modify: `apps/worker/routes/audit.ts`
- Modify: `packages/protocol/schemas/audit.ts`

> **Before implementing:** Read `apps/worker/services/audit.ts` to understand the `list()` method signature. Do not assume parameters — look at the actual code.

- [ ] **Step 1: Write failing BDD feature file for cross-hub audit**

  Create `packages/test-specs/features/admin/cross-hub-audit.feature`:

  ```gherkin
  @backend
  Feature: Cross-Hub Audit Log
    As a super-admin
    I want to view audit events from all hubs in a single feed
    So that I have network-wide visibility without switching hub context

    Background:
      Given two hubs exist: "Hub Alpha" and "Hub Beta"

    Scenario: Super-admin views unified audit log
      Given audit events exist on both "Hub Alpha" and "Hub Beta"
      When I am logged in as a super-admin
      And I query GET /audit with allHubs=true
      Then the response should include audit entries from both hubs
      And each entry should have a hubId field

    Scenario: Non-super-admin cannot view all-hub audit
      Given I am logged in as an admin of "Hub Alpha"
      When I query GET /audit with allHubs=true
      Then I should receive a 403 Forbidden response

    Scenario: Cross-hub audit supports pagination
      Given I am logged in as a super-admin
      When I query GET /audit with allHubs=true and limit=5
      Then the response should contain at most 5 entries
  ```

- [ ] **Step 2: Read the actual audit service signature**

  ```bash
  grep -n "async list\|listAuditLog\|export" ~/projects/llamenos/apps/worker/services/audit.ts | head -20
  ```

  Then add `listAllHubs()` method matching the existing `list()` signature but without the hubId constraint.

- [ ] **Step 3: Add listAllHubs method to audit.ts**

  Open `apps/worker/services/audit.ts`. After the existing `list()` method, add:

  ```typescript
  async listAllHubs(filters: {
    action?: string
    actorPubkey?: string
    from?: string
    to?: string
    limit?: number
    offset?: number
  } = {}) {
    // Same as list() but without hubId filter; includes hubId in returned entries
    const conditions = []
    if (filters.action) conditions.push(eq(auditLog.action, filters.action))
    if (filters.actorPubkey) conditions.push(eq(auditLog.actorPubkey, filters.actorPubkey))
    if (filters.from) conditions.push(gte(auditLog.createdAt, new Date(filters.from)))
    if (filters.to) conditions.push(lte(auditLog.createdAt, new Date(filters.to)))

    const query = this.db
      .select()
      .from(auditLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(filters.limit ?? 50)
      .offset(filters.offset ?? 0)

    return query
  }
  ```

  Verify the correct drizzle operators are imported (`gte`, `lte`, `and`, `eq`, `desc`).

- [ ] **Step 4: Add allHubs query param to audit route**

  Open `apps/worker/routes/audit.ts`. The current file uses `createEntityRouter` factory. To add the `allHubs` behavior, add a new route handler alongside the factory:

  ```typescript
  import { Hono } from 'hono'
  import { listAuditQuerySchema, auditListResponseSchema } from '@protocol/schemas/audit'
  import { createEntityRouter } from '../lib/entity-router'
  import type { AppEnv } from '../types'
  import { checkPermission } from '../middleware/permission-guard'

  const auditRouter = new Hono<AppEnv>()

  // Cross-hub audit — super-admin only; must be declared BEFORE the factory route
  auditRouter.get('/all-hubs', async (c) => {
    const permissions = c.get('permissions')
    if (!checkPermission(permissions, '*')) return c.json({ error: 'Forbidden' }, 403)
    const services = c.get('services')
    const { action, actorPubkey, from, to, limit, offset } = c.req.query()
    const entries = await services.audit.listAllHubs({
      action: action || undefined,
      actorPubkey: actorPubkey || undefined,
      from: from || undefined,
      to: to || undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    })
    return c.json({ entries })
  })

  // Hub-scoped audit via factory
  const auditListRouter = createEntityRouter({
    tag: 'Audit',
    domain: 'audit',
    service: 'audit',
    listResponseSchema: auditListResponseSchema,
    itemResponseSchema: auditListResponseSchema,
    listQuerySchema: listAuditQuerySchema,
    hubScoped: true,
    disableGet: true,
    disableDelete: true,
    methods: {
      list: 'list',
    },
  })
  auditRouter.route('/', auditListRouter)

  export default auditRouter
  ```

  Note: The spec says `GET /audit?allHubs=true` but this plan implements `GET /audit/all-hubs` to avoid the factory route needing to be aware of query params. If the spec's exact URL is required, modify the factory or add middleware. Use `/all-hubs` path for cleaner implementation.

- [ ] **Step 5: Add crossHubAuditQuerySchema to packages/protocol/schemas/audit.ts**

  Open `packages/protocol/schemas/audit.ts`. Add:
  ```typescript
  export const crossHubAuditQuerySchema = z.object({
    action: z.string().optional(),
    actorPubkey: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.coerce.number().optional().default(50),
    offset: z.coerce.number().optional().default(0),
  })
  ```

- [ ] **Step 6: Add cross-hub audit step definitions to cross-hub-network.steps.ts**

  Extend `tests/steps/backend/cross-hub-network.steps.ts` with steps for the audit scenarios. The key test: super-admin gets 200 with entries from both hubs; hub-admin gets 403.

- [ ] **Step 7: Run cross-hub audit BDD tests**

  ```bash
  cd ~/projects/llamenos && bun run test:backend:bdd -- --grep "Cross-Hub Audit Log" 2>&1 | tail -30
  ```
  Expected: all 3 scenarios pass — green.

- [ ] **Step 8: Commit F7**

  ```bash
  git add apps/worker/services/audit.ts apps/worker/routes/audit.ts packages/protocol/schemas/audit.ts packages/test-specs/features/admin/cross-hub-audit.feature tests/steps/backend/cross-hub-network.steps.ts
  git commit -m "feat(audit): cross-hub audit log endpoint for super-admin (GET /audit/all-hubs)"
  ```

---

## Task 9: F5 — Mutual Aid Fallback Ring Groups — Schema and Service

**Files:**
- Modify: `apps/worker/db/schema/settings.ts`
- Modify: `apps/worker/db/schema/calls.ts`
- Modify: `apps/worker/services/ringing.ts`
- Modify: `apps/worker/routes/hubs.ts`
- Modify: `packages/protocol/schemas/hubs.ts`

> **Before implementing:** Verify `system:manage-hubs` permission in `packages/shared/permissions.ts`:
> ```bash
> grep "system:manage-hubs\|system:" ~/projects/llamenos/packages/shared/permissions.ts
> ```
> If it does not exist, add it.

- [ ] **Step 1: Write failing BDD feature file for mutual aid fallback**

  Create `packages/test-specs/features/admin/mutual-aid-fallback.feature`:

  ```gherkin
  @backend
  Feature: Mutual Aid Fallback Ring Groups
    As a super-admin
    I want to configure Hub B as a fallback for Hub A
    So that Hub A calls are answered by Hub B volunteers when Hub A has no one on shift

    Scenario: Call routes to fallback hub when primary has no on-shift volunteers
      Given Hub A has no on-shift volunteers
      And Hub B is configured as a fallback for Hub A with priority 1
      And Hub B has an on-shift volunteer
      When a call arrives for Hub A
      Then the call should be routed to Hub B's on-shift volunteer
      And the call's originatingHubId should be Hub A's id

    Scenario: Fallback is not applied when primary hub has volunteers
      Given Hub A has an on-shift volunteer
      And Hub B is configured as a fallback for Hub A
      When a call arrives for Hub A
      Then the call should be routed to Hub A's volunteer
      And the call's originatingHubId should be null

    Scenario: Fallback with time window is not applied outside the window
      Given Hub A has no on-shift volunteers
      And Hub B is configured as a fallback for Hub A with activeWindowStart "09:00" and activeWindowEnd "17:00" UTC
      And the current time is outside that window
      When a call arrives for Hub A
      Then the call should not be routed to Hub B

    Scenario: Multiple fallback hubs tried in priority order
      Given Hub A has no on-shift volunteers
      And Hub B is configured as fallback for Hub A with priority 1 and has no on-shift volunteers
      And Hub C is configured as fallback for Hub A with priority 2 and has an on-shift volunteer
      When a call arrives for Hub A
      Then the call should be routed to Hub C's volunteer
  ```

- [ ] **Step 2: Add system:manage-hubs permission if missing**

  Check if the permission exists. If not, open `packages/shared/permissions.ts` and add to the system section:
  ```typescript
  'system:manage-hubs': 'Create, modify, and delete hubs',
  ```
  And add it to the `role-super-admin` permissions array.

- [ ] **Step 3: Add hubFallbackConfigs table to settings.ts**

  In `apps/worker/db/schema/settings.ts`, after the `hubSettings` table, add:

  ```typescript
  // ---------------------------------------------------------------------------
  // hub_fallback_configs
  // ---------------------------------------------------------------------------

  export const hubFallbackConfigs = pgTable(
    'hub_fallback_configs',
    {
      id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
      primaryHubId: text('primary_hub_id')
        .notNull()
        .references(() => hubs.id, { onDelete: 'cascade' }),
      fallbackHubId: text('fallback_hub_id')
        .notNull()
        .references(() => hubs.id, { onDelete: 'cascade' }),
      priority: integer('priority').notNull().default(1),
      activeWindowStart: text('active_window_start'), // ISO time string e.g. "09:00"
      activeWindowEnd: text('active_window_end'),
      timezone: text('timezone'), // IANA timezone identifier
      createdBy: text('created_by').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      unique('hub_fallback_configs_unique').on(table.primaryHubId, table.fallbackHubId),
      index('hub_fallback_configs_primary_idx').on(table.primaryHubId, table.priority),
    ],
  )
  ```

- [ ] **Step 4: Add originatingHubId column to calls schema**

  Open `apps/worker/db/schema/calls.ts`. Find the calls table definition. Add:
  ```typescript
  originatingHubId: text('originating_hub_id'), // populated when call was routed via fallback
  ```

- [ ] **Step 5: Generate and run DB migration**

  ```bash
  cd ~/projects/llamenos && bun run db:generate && bun run db:migrate
  ```

- [ ] **Step 6: Update ringing.ts with fallback logic**

  Open `apps/worker/services/ringing.ts`. Find `startParallelRinging`. Note that `hubId` is a function parameter — you must introduce a mutable local variable. After the first check for `onShiftPubkeys.length === 0` (which currently falls to `getFallbackGroup()`), replace the fallback logic with:

  ```typescript
  let effectiveHubId = hubId          // mutable — may be updated to fallback hub's id
  let originatingHubId: string | null = null

  if (onShiftPubkeys.length === 0) {
    // Try cross-hub fallback ring groups first (in priority order)
    const fallbackConfigs = await services.settings.getFallbackGroupsForHub(hubId)

    for (const config of fallbackConfigs) {
      // Check active time window if configured
      if (config.activeWindowStart && config.activeWindowEnd && config.timezone) {
        const isInWindow = await services.settings.isWithinFallbackWindow(config)
        if (!isInWindow) continue
      }
      const fallbackPubkeys = await services.shifts.getCurrentVolunteers(config.fallbackHubId)
      if (fallbackPubkeys.length > 0) {
        onShiftPubkeys = fallbackPubkeys
        originatingHubId = hubId                    // record original hub before switching
        effectiveHubId = config.fallbackHubId       // ring via the fallback hub's context
        logger.info('Using fallback hub for ringing', { originalHubId: hubId, fallbackHubId: effectiveHubId })
        break
      }
    }

    if (onShiftPubkeys.length === 0) {
      // Fall back to system-wide fallback group
      const fallback = await services.settings.getFallbackGroup()
      onShiftPubkeys = fallback.userPubkeys
    }
  }
  ```

  Replace all subsequent uses of `hubId` in the function body with `effectiveHubId` (for VoIP push, addCall, etc.).

  After `services.calls.addCall(hubId, { ... })`, pass `originatingHubId` if present:
  ```typescript
  await services.calls.addCall(hubId, {
    callId: callSid,
    callerNumber,
    callerLast4: callerNumber.slice(-4),
    status: 'ringing',
    originatingHubId: originatingHubId ?? undefined,
  })
  ```

  Add the `getFallbackGroupsForHub` and `isWithinFallbackWindow` methods to the settings service. In `apps/worker/services/settings.ts`:

  ```typescript
  async getFallbackGroupsForHub(primaryHubId: string) {
    return this.db
      .select()
      .from(hubFallbackConfigs)
      .where(eq(hubFallbackConfigs.primaryHubId, primaryHubId))
      .orderBy(hubFallbackConfigs.priority)
  }

  async isWithinFallbackWindow(config: { activeWindowStart: string; activeWindowEnd: string; timezone: string }): Promise<boolean> {
    // Use PostgreSQL for timezone-aware time comparison
    const result = await this.db.execute(sql`
      SELECT CURRENT_TIME AT TIME ZONE ${config.timezone}
        BETWEEN ${config.activeWindowStart}::time
        AND ${config.activeWindowEnd}::time
        AS in_window
    `)
    return (result.rows[0] as { in_window: boolean })?.in_window ?? false
  }
  ```

- [ ] **Step 7: Add fallback CRUD endpoints to hubs.ts**

  In `apps/worker/routes/hubs.ts`, add after existing routes:

  ```typescript
  // GET /hubs/:hubId/fallbacks
  routes.get('/:hubId/fallbacks',
    requirePermission('hubs:read'),
    async (c) => {
      const hubId = c.req.param('hubId')
      const services = c.get('services')
      const fallbacks = await services.settings.getFallbackGroupsForHub(hubId)
      return c.json({ fallbacks })
    },
  )

  // POST /hubs/:hubId/fallbacks
  routes.post('/:hubId/fallbacks',
    requirePermission('system:manage-hubs'),
    validator('json', hubFallbackConfigBodySchema),
    async (c) => {
      const hubId = c.req.param('hubId')
      const pubkey = c.get('pubkey')
      const services = c.get('services')
      const body = c.req.valid('json')
      await services.settings.createFallbackConfig({ primaryHubId: hubId, createdBy: pubkey, ...body })
      return c.json({ ok: true }, 201)
    },
  )

  // DELETE /hubs/:hubId/fallbacks/:fallbackHubId
  routes.delete('/:hubId/fallbacks/:fallbackHubId',
    requirePermission('system:manage-hubs'),
    async (c) => {
      const { hubId, fallbackHubId } = c.req.param()
      const services = c.get('services')
      await services.settings.deleteFallbackConfig(hubId, fallbackHubId)
      return c.json({ ok: true })
    },
  )

  // PATCH /hubs/:hubId/fallbacks/:fallbackHubId
  routes.patch('/:hubId/fallbacks/:fallbackHubId',
    requirePermission('system:manage-hubs'),
    validator('json', hubFallbackConfigPatchBodySchema),
    async (c) => {
      const { hubId, fallbackHubId } = c.req.param()
      const services = c.get('services')
      const body = c.req.valid('json')
      await services.settings.updateFallbackConfig(hubId, fallbackHubId, body)
      return c.json({ ok: true })
    },
  )
  ```

  Add schemas to `packages/protocol/schemas/hubs.ts`:
  ```typescript
  export const hubFallbackConfigBodySchema = z.object({
    fallbackHubId: z.string(),
    priority: z.number().int().optional().default(1),
    activeWindowStart: z.string().optional(),
    activeWindowEnd: z.string().optional(),
    timezone: z.string().optional(),
  })
  export const hubFallbackConfigPatchBodySchema = hubFallbackConfigBodySchema.partial().omit({ fallbackHubId: true })
  export const hubFallbackConfigResponseSchema = z.object({
    id: z.string(),
    primaryHubId: z.string(),
    fallbackHubId: z.string(),
    priority: z.number(),
    activeWindowStart: z.string().optional(),
    activeWindowEnd: z.string().optional(),
    timezone: z.string().optional(),
    createdBy: z.string(),
    createdAt: z.string(),
  })
  ```

  Add `createFallbackConfig`, `deleteFallbackConfig`, `updateFallbackConfig` methods to `apps/worker/services/settings.ts`.

- [ ] **Step 8: Add step definitions for mutual aid fallback to cross-hub-network.steps.ts**

  Add steps for the 4 mutual-aid-fallback scenarios. The key test verifies that when Hub A has zero on-shift volunteers and Hub B is a configured fallback with volunteers, the call `originatingHubId` is set to Hub A's ID.

- [ ] **Step 9: Run mutual aid BDD tests**

  ```bash
  cd ~/projects/llamenos && bun run test:backend:bdd -- --grep "Mutual Aid Fallback" 2>&1 | tail -30
  ```
  Expected: all 4 scenarios pass — green.

- [ ] **Step 10: Run typecheck + full BDD**

  ```bash
  cd ~/projects/llamenos && bun run typecheck && bun run test:backend:bdd 2>&1 | tail -10
  ```

- [ ] **Step 11: Commit F5**

  ```bash
  git add apps/worker/db/schema/settings.ts apps/worker/db/schema/calls.ts apps/worker/services/ringing.ts apps/worker/services/settings.ts apps/worker/routes/hubs.ts packages/protocol/schemas/hubs.ts packages/shared/permissions.ts apps/worker/db/migrations/ packages/test-specs/features/admin/mutual-aid-fallback.feature tests/steps/backend/cross-hub-network.steps.ts
  git commit -m "feat(telephony): mutual aid fallback ring groups with time-window support"
  ```

---

## Task 10: F6 — Network-Level Emergency Broadcast — Backend

**Files:**
- Create: `apps/worker/db/schema/broadcasts.ts`
- Modify: `apps/worker/db/schema/index.ts`
- Create: `apps/worker/services/broadcasts.ts`
- Modify: `apps/worker/routes/network.ts`
- Modify: `packages/protocol/schemas/` (add broadcasts.ts)

- [ ] **Step 1: Write failing BDD feature file for network broadcast**

  Create `packages/test-specs/features/admin/network-broadcast.feature`:

  ```gherkin
  @backend
  Feature: Network-Level Emergency Broadcast
    As a super-admin
    I want to send urgent messages to all users across all hubs
    So that system-wide alerts are delivered immediately

    Scenario: Super-admin sends broadcast and it appears in active broadcasts
      Given I am logged in as a super-admin
      When I send a network broadcast with subject "System Maintenance" body "Downtime in 1 hour" severity "warning"
      Then GET /network/broadcasts should return the broadcast
      And the broadcast severity should be "warning"

    Scenario: Broadcast with expiry disappears after expiry
      Given I am logged in as a super-admin
      When I send a broadcast with expiresAt set to 1 second from now
      And I wait for the broadcast to expire
      Then GET /network/broadcasts should not return the expired broadcast

    Scenario: Super-admin retracts broadcast
      Given an active network broadcast exists
      When I am logged in as a super-admin
      And I delete the broadcast
      Then GET /network/broadcasts should not return the retracted broadcast

    Scenario: Any authenticated user can read active broadcasts
      Given an active network broadcast exists
      When I am logged in as a volunteer
      Then GET /network/broadcasts should return the broadcast

    Scenario: Non-super-admin cannot create broadcasts
      Given I am logged in as an admin
      When I attempt to POST /network/broadcasts
      Then I should receive a 403 Forbidden response
  ```

- [ ] **Step 2: Create apps/worker/db/schema/broadcasts.ts**

  ```typescript
  /**
   * Network broadcast tables.
   */
  import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

  export const networkBroadcasts = pgTable('network_broadcasts', {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    severity: text('severity').notNull().default('info'), // info | warning | critical
    sentBy: text('sent_by').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }), // null = no expiry
  })
  ```

- [ ] **Step 3: Export networkBroadcasts from schema/index.ts**

  In `apps/worker/db/schema/index.ts`, add:
  ```typescript
  export * from './broadcasts'
  ```

- [ ] **Step 4: Create apps/worker/services/broadcasts.ts**

  ```typescript
  import type { Database } from '../db'
  import { networkBroadcasts } from '../db/schema'
  import { and, desc, isNull, or, gt } from 'drizzle-orm'
  import { sql } from 'drizzle-orm'

  export class BroadcastsService {
    constructor(private readonly db: Database) {}

    async sendNetworkBroadcast(params: {
      subject: string
      body: string
      severity?: string
      expiresAt?: Date
      sentBy: string
    }) {
      const [broadcast] = await this.db
        .insert(networkBroadcasts)
        .values({
          subject: params.subject,
          body: params.body,
          severity: params.severity ?? 'info',
          expiresAt: params.expiresAt,
          sentBy: params.sentBy,
        })
        .returning()
      return broadcast
    }

    async listActiveBroadcasts() {
      return this.db
        .select()
        .from(networkBroadcasts)
        .where(
          or(
            isNull(networkBroadcasts.expiresAt),
            gt(networkBroadcasts.expiresAt, new Date()),
          )
        )
        .orderBy(desc(networkBroadcasts.sentAt))
    }

    async retractBroadcast(id: string): Promise<void> {
      await this.db
        .update(networkBroadcasts)
        .set({ expiresAt: new Date() })
        .where(sql`id = ${id}`)
    }
  }
  ```

- [ ] **Step 5: Register BroadcastsService in services container**

  Open `apps/worker/services/index.ts`. This is the definitive service registry — it exports the `Services` interface and `createServices()`. Add:

  ```typescript
  // Import at top:
  import { BroadcastsService } from './broadcasts'

  // In Services interface:
  broadcasts: BroadcastsService

  // In createServices() return object:
  broadcasts: new BroadcastsService(db),
  ```

  Also add `BroadcastsService` to the re-exports at the bottom of the file.

- [ ] **Step 6: Add broadcast endpoints to network.ts**

  In `apps/worker/routes/network.ts`, add:

  ```typescript
  import { networkBroadcastBodySchema } from '@protocol/schemas/broadcasts'

  // GET /network/broadcasts — any authenticated user
  network.get('/broadcasts', async (c) => {
    const services = c.get('services')
    const broadcasts = await services.broadcasts.listActiveBroadcasts()
    return c.json({ broadcasts })
  })

  // POST /network/broadcasts — super-admin only
  network.post('/broadcasts',
    validator('json', networkBroadcastBodySchema),
    async (c) => {
      const permissions = c.get('permissions')
      if (!checkPermission(permissions, '*')) return c.json({ error: 'Forbidden' }, 403)
      const services = c.get('services')
      const pubkey = c.get('pubkey')
      const { subject, body, severity, expiresAt } = c.req.valid('json')
      const broadcast = await services.broadcasts.sendNetworkBroadcast({
        subject,
        body,
        severity,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        sentBy: pubkey,
      })
      await audit(services.audit, 'networkBroadcastSent', pubkey,
        { broadcastId: broadcast.id, subject, severity: severity ?? 'info' })
      return c.json({ broadcast }, 201)
    },
  )

  // DELETE /network/broadcasts/:id — super-admin only
  network.delete('/broadcasts/:id', async (c) => {
    const permissions = c.get('permissions')
    if (!checkPermission(permissions, '*')) return c.json({ error: 'Forbidden' }, 403)
    const services = c.get('services')
    const pubkey = c.get('pubkey')
    const broadcastId = c.req.param('id')
    await services.broadcasts.retractBroadcast(broadcastId)
    await audit(services.audit, 'networkBroadcastRetracted', pubkey, { broadcastId })
    return c.json({ ok: true })
  })
  ```

- [ ] **Step 7: Create packages/protocol/schemas/broadcasts.ts**

  ```typescript
  import { z } from 'zod'

  export const networkBroadcastBodySchema = z.object({
    subject: z.string().min(1),
    body: z.string().min(1),
    severity: z.enum(['info', 'warning', 'critical']).optional().default('info'),
    expiresAt: z.string().optional(), // ISO datetime string
  })

  export const networkBroadcastResponseSchema = z.object({
    id: z.string(),
    subject: z.string(),
    body: z.string(),
    severity: z.string(),
    sentBy: z.string(),
    sentAt: z.string(),
    expiresAt: z.string().optional().default(''),
  })

  export const networkBroadcastListResponseSchema = z.object({
    broadcasts: z.array(networkBroadcastResponseSchema),
  })
  ```

- [ ] **Step 8: Generate migration**

  ```bash
  cd ~/projects/llamenos && bun run db:generate && bun run db:migrate
  ```

- [ ] **Step 9: Add step definitions for network broadcast**

  In `tests/steps/backend/cross-hub-network.steps.ts`, add steps for broadcast scenarios. Key test: after `DELETE /network/broadcasts/:id`, `GET /network/broadcasts` returns an empty list.

- [ ] **Step 10: Run broadcast BDD tests**

  ```bash
  cd ~/projects/llamenos && bun run test:backend:bdd -- --grep "Network-Level Emergency Broadcast" 2>&1 | tail -30
  ```
  Expected: all 5 scenarios pass — green.

- [ ] **Step 11: Run typecheck + full BDD**

  ```bash
  cd ~/projects/llamenos && bun run typecheck && bun run test:backend:bdd 2>&1 | tail -10
  ```

- [ ] **Step 12: Commit F6 backend**

  ```bash
  git add apps/worker/db/schema/broadcasts.ts apps/worker/db/schema/index.ts apps/worker/services/broadcasts.ts apps/worker/routes/network.ts packages/protocol/schemas/broadcasts.ts apps/worker/db/migrations/ packages/test-specs/features/admin/network-broadcast.feature tests/steps/backend/cross-hub-network.steps.ts
  git commit -m "feat(broadcasts): network-level emergency broadcast service and endpoints"
  ```

---

## Task 11: F6 — Network Broadcast — Client Alert Banner (Desktop, iOS, Android)

**Files:**
- Desktop: `src/client/components/NetworkBroadcastBanner.tsx` (new), modify main layout
- iOS: `apps/ios/Sources/Views/NetworkBroadcastBanner.swift` (new), modify main view
- Android: new Composable in `apps/android/app/src/main/java/org/llamenos/hotline/ui/`

- [ ] **Step 1: Create Desktop NetworkBroadcastBanner component**

  Create `src/client/components/NetworkBroadcastBanner.tsx`:

  ```tsx
  import { useEffect, useState } from 'react'
  import { X } from 'lucide-react'
  import { invoke } from '@/lib/platform'

  interface Broadcast {
    id: string
    subject: string
    body: string
    severity: 'info' | 'warning' | 'critical'
    expiresAt?: string
  }

  const DISMISSED_KEY = 'dismissed_broadcasts'

  function getDismissed(): Set<string> {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(DISMISSED_KEY) ?? '[]'))
    } catch { return new Set() }
  }

  function dismiss(id: string) {
    const set = getDismissed()
    set.add(id)
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]))
  }

  const severityClasses: Record<string, string> = {
    info: 'bg-blue-50 border-blue-300 text-blue-900',
    warning: 'bg-amber-50 border-amber-300 text-amber-900',
    critical: 'bg-red-50 border-red-500 text-red-900',
  }

  export function NetworkBroadcastBanner() {
    const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
    const [dismissed, setDismissed] = useState<Set<string>>(getDismissed)

    useEffect(() => {
      // Fetch on mount and on WebSocket reconnect
      fetch('/api/network/broadcasts')
        .then(r => r.json())
        .then(d => setBroadcasts(d.broadcasts ?? []))
        .catch(() => {})
    }, [])

    const active = broadcasts.filter(b => {
      if (dismissed.has(b.id)) return false
      if (b.expiresAt && new Date(b.expiresAt) < new Date()) return false
      return true
    })

    if (active.length === 0) return null

    return (
      <div className="space-y-1 w-full">
        {active.map(b => (
          <div
            key={b.id}
            className={`flex items-start gap-2 px-4 py-2 border-b text-sm ${severityClasses[b.severity] ?? severityClasses.info}`}
            data-testid={`broadcast-banner-${b.id}`}
          >
            <div className="flex-1">
              <strong>{b.subject}</strong>: {b.body}
            </div>
            {b.severity !== 'critical' && (
              <button
                onClick={() => {
                  dismiss(b.id)
                  setDismissed(getDismissed())
                }}
                aria-label="Dismiss broadcast"
                data-testid={`dismiss-broadcast-${b.id}`}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    )
  }
  ```

  Add `<NetworkBroadcastBanner />` to the top of the main layout component (find it with `grep -r "Outlet\|router-outlet\|children" src/client/routes/__root.tsx`).

- [ ] **Step 2: Create iOS NetworkBroadcastBanner view**

  Create `apps/ios/Sources/Views/NetworkBroadcastBanner.swift`:

  ```swift
  import SwiftUI

  struct NetworkBroadcast: Decodable, Identifiable {
      let id: String
      let subject: String
      let body: String
      let severity: String
      let expiresAt: String?
  }

  struct NetworkBroadcastBanner: View {
      let broadcasts: [NetworkBroadcast]
      @State private var dismissed: Set<String> = {
          let stored = UserDefaults.standard.stringArray(forKey: "dismissed_broadcasts") ?? []
          return Set(stored)
      }()

      var activeBroadcasts: [NetworkBroadcast] {
          broadcasts.filter { b in
              guard !dismissed.contains(b.id) else { return false }
              if let exp = b.expiresAt, let date = ISO8601DateFormatter().date(from: exp) {
                  return date > Date()
              }
              return true
          }
      }

      var body: some View {
          VStack(spacing: 0) {
              ForEach(activeBroadcasts) { broadcast in
                  BroadcastRow(broadcast: broadcast) {
                      dismissed.insert(broadcast.id)
                      UserDefaults.standard.set(Array(dismissed), forKey: "dismissed_broadcasts")
                  }
              }
          }
      }
  }

  private struct BroadcastRow: View {
      let broadcast: NetworkBroadcast
      let onDismiss: () -> Void

      var backgroundColor: Color {
          switch broadcast.severity {
          case "warning": return Color.yellow.opacity(0.15)
          case "critical": return Color.red.opacity(0.15)
          default: return Color.blue.opacity(0.10)
          }
      }

      var body: some View {
          HStack(alignment: .top) {
              VStack(alignment: .leading, spacing: 2) {
                  Text(broadcast.subject).fontWeight(.semibold).font(.subheadline)
                  Text(broadcast.body).font(.caption)
              }
              Spacer()
              if broadcast.severity != "critical" {
                  Button(action: onDismiss) {
                      Image(systemName: "xmark").foregroundColor(.secondary)
                  }.buttonStyle(.plain)
              }
          }
          .padding(.horizontal, 16).padding(.vertical, 8)
          .background(backgroundColor)
          .accessibilityIdentifier("broadcast-banner-\(broadcast.id)")
      }
  }
  ```

  Inject `broadcasts: [NetworkBroadcast]` into the banner from `AppState` (fetched via `APIService.get("/api/network/broadcasts")` on launch and on WebSocket reconnect).

- [ ] **Step 3: Create Android NetworkBroadcastBanner composable**

  Create `apps/android/app/src/main/java/org/llamenos/hotline/ui/broadcast/NetworkBroadcastBanner.kt`:

  ```kotlin
  package org.llamenos.hotline.ui.broadcast

  import androidx.compose.foundation.background
  import androidx.compose.foundation.layout.*
  import androidx.compose.material.icons.Icons
  import androidx.compose.material.icons.filled.Close
  import androidx.compose.material3.*
  import androidx.compose.runtime.*
  import androidx.compose.ui.Alignment
  import androidx.compose.ui.Modifier
  import androidx.compose.ui.graphics.Color
  import androidx.compose.ui.unit.dp
  import androidx.compose.ui.semantics.contentDescription
  import androidx.compose.ui.semantics.semantics

  data class NetworkBroadcast(
      val id: String,
      val subject: String,
      val body: String,
      val severity: String,
      val expiresAt: String?,
  )

  @Composable
  fun NetworkBroadcastBanner(
      broadcasts: List<NetworkBroadcast>,
      dismissedIds: Set<String>,
      onDismiss: (String) -> Unit,
  ) {
      val active = broadcasts.filter { b ->
          b.id !in dismissedIds
          // expiry check omitted here — ViewModel filters expired broadcasts before passing
      }
      Column {
          active.forEach { broadcast ->
              val bgColor = when (broadcast.severity) {
                  "warning" -> Color(0xFFFFF9C4)
                  "critical" -> Color(0xFFFFEBEE)
                  else -> Color(0xFFE3F2FD)
              }
              Row(
                  modifier = Modifier
                      .fillMaxWidth()
                      .background(bgColor)
                      .padding(horizontal = 16.dp, vertical = 8.dp)
                      .semantics { contentDescription = "broadcast-banner-${broadcast.id}" },
                  verticalAlignment = Alignment.Top,
              ) {
                  Column(Modifier.weight(1f)) {
                      Text(broadcast.subject, style = MaterialTheme.typography.labelLarge)
                      Text(broadcast.body, style = MaterialTheme.typography.bodySmall)
                  }
                  if (broadcast.severity != "critical") {
                      IconButton(onClick = { onDismiss(broadcast.id) }) {
                          Icon(Icons.Default.Close, contentDescription = "Dismiss broadcast")
                      }
                  }
              }
          }
      }
  }
  ```

  Wire into the main scaffold/composable. Create a `NetworkBroadcastViewModel` that fetches `GET /api/network/broadcasts` on init and stores `dismissedIds` in `SharedPreferences`.

- [ ] **Step 4: Run Android unit tests + compile test APK**

  ```bash
  cd ~/projects/llamenos/apps/android && ./gradlew testDebugUnitTest && ./gradlew compileDebugAndroidTestKotlin 2>&1 | tail -20
  ```

- [ ] **Step 5: Run iOS tests**

  ```bash
  ssh mac "cd ~/projects/llamenos && xcodebuild test -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | tail -20"
  ```

- [ ] **Step 6: Run desktop typecheck + build**

  ```bash
  cd ~/projects/llamenos && bun run typecheck && bun run build 2>&1 | tail -10
  ```

- [ ] **Step 7: Commit F6 client**

  ```bash
  git add src/client/components/NetworkBroadcastBanner.tsx apps/ios/Sources/Views/NetworkBroadcastBanner.swift apps/android/app/src/main/java/org/llamenos/hotline/ui/broadcast/
  git commit -m "feat(broadcast): network broadcast alert banner on Desktop, iOS, Android"
  ```

---

## Task 12: Final Verification

- [ ] **Step 1: Run full backend BDD suite**

  ```bash
  cd ~/projects/llamenos && bun run test:backend:bdd 2>&1 | tail -20
  ```
  Expected: all existing + new scenarios pass. Any failures must be fixed before proceeding.

- [ ] **Step 2: Run desktop typecheck + Playwright**

  ```bash
  cd ~/projects/llamenos && bun run typecheck && bun run test 2>&1 | tail -20
  ```
  Expected: type check clean, Playwright tests green.

- [ ] **Step 3: Run Android unit tests + lint + test APK compilation**

  ```bash
  cd ~/projects/llamenos/apps/android && ./gradlew testDebugUnitTest && ./gradlew lintDebug && ./gradlew compileDebugAndroidTestKotlin 2>&1 | tail -20
  ```

- [ ] **Step 4: Run iOS unit tests (on mac)**

  ```bash
  ssh mac "cd ~/projects/llamenos && xcodebuild test -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | tail -20"
  ```

- [ ] **Step 5: Run Rust crypto tests**

  ```bash
  cd ~/projects/llamenos && cargo test --manifest-path packages/crypto/Cargo.toml --features mobile 2>&1 | tail -10
  ```

- [ ] **Step 6: Verify verification gates from spec**

  Check each spec verification gate manually:
  - [ ] F1: `CLAUDE.md` contains "Multi-Hub Architecture Guarantees" with all 4 invariants
  - [ ] F1: `PROTOCOL.md` contains "Cross-Hub Routing Semantics" section
  - [ ] F2: BDD passes — ban propagation → Hub B suggestion → accept → number blocked
  - [ ] F2: BDD passes — super-admin network ban blocks on all hubs
  - [ ] F2: Privacy: phone hash in suggestions, never raw phone
  - [ ] F2: Volunteer gets 403 on `POST /bans/:id/propagate`
  - [ ] F3: BDD passes — Hub A flags user → Hub B receives → dismiss → user retains membership
  - [ ] F3: BDD passes — super-admin suspends → user gets 403
  - [ ] F3: Network suspension checked before hub-role check in auth middleware
  - [ ] F4: iOS — incoming call from non-active hub does NOT call `setActiveHub`
  - [ ] F4: Android — same fix verified
  - [ ] F5: BDD passes — no Hub A on-shift → call routed to Hub B → `originatingHubId` = Hub A
  - [ ] F5: BDD passes — time-window fallback not applied outside window
  - [ ] F6: BDD passes — critical broadcast cannot be dismissed by non-super-admin
  - [ ] F6: Non-super-admin gets 403 on `POST /network/broadcasts`
  - [ ] F7: BDD passes — super-admin `GET /audit/all-hubs` returns entries from multiple hubs
  - [ ] F7: Hub admin gets 403 on `GET /audit/all-hubs`

- [ ] **Step 7: Final commit**

  ```bash
  git add -A
  git commit -m "feat(cross-hub): complete cross-hub network capabilities (F1-F7)"
  ```

---

## Key Implementation Notes

### Privacy Architecture
- Phone numbers NEVER cross hub boundaries in propagation. Only `phoneHash` (HMAC blind index from `hashPhone()` in `apps/worker/lib/crypto.ts`) is used in `ban_propagation_suggestions`.
- `network_bans.phone` stores an encrypted phone (future: ECIES with super-admin key). For now, accept that the server stores plaintext encrypted with server key — a follow-up ECIES hardening pass can improve this.
- Hub B ban records created from accepted suggestions use `phone = 'hash:{phoneHash}'` convention so the ban list UI shows "identity protected" instead of a number.

### Auth Middleware — Order of Checks
The auth middleware must check in this order:
1. Session/token validation → resolve `pubkey`
2. `isNetworkSuspended(pubkey)` → 403 if true
3. Hub-role resolution → populate `permissions`
4. `requirePermission` middleware → per-route checks

### Multi-Hub Axiom in SIP Layer
The fix in `LinphoneService` (both iOS and Android) is:
- **Remove** `setActiveHub()` call on `IncomingReceived`
- **Expose** `incomingCallHubId` as observable state
- Call UI reads `linphoneService.incomingCallHubId` to display hub name without switching context

### Network Router vs Hub-Scoped Routes
- All `/api/network/*` routes require `checkPermission(permissions, '*')` for write operations (super-admin), except `GET /network/broadcasts` which any authenticated user can read.
- Hub-admin actions (propagate ban, flag user) remain on hub-scoped routes (`/api/bans`, `/api/users`) with `bans:propagate` and `users:flag` permissions.
