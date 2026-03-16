# Epic 351: In-Call Quick Action UI for iOS & Android

## Overview

The desktop `ActiveCallPanel` (in `src/client/routes/index.tsx` lines 309-487) provides a complete in-call experience: call timer, note textarea with E2EE save, ban+hangup, report spam, hangup, WebRTC mute, and transcription indicator. The backend API endpoints are fully implemented in `apps/worker/routes/calls.ts`:

- `POST /api/calls/:callId/answer` — answer a ringing call
- `POST /api/calls/:callId/hangup` — hang up an active call
- `POST /api/calls/:callId/spam` — report a call as spam
- `POST /api/calls/:callId/ban` — ban caller and hang up (with optional `reason` in JSON body)

BDD specs exist at `packages/test-specs/features/core/call-actions.feature` with 5 scenarios covering ban+hangup, ban with reason, cross-volunteer permission check, note creation during call, and banned caller rejection.

**The gap**: iOS and Android have no in-call UI. iOS shows only an "On Call" badge in the dashboard hero card. Android shows only an `activeCallCount` integer in the calls stats card. Neither platform lets the volunteer take action during an active call. Additionally, the desktop ban button doesn't prompt for an optional reason before banning.

## Dependencies

- **Epic 350** (iOS server event decryption): iOS must be able to decrypt `call:ring` / `call:update` events from the Nostr relay. If 350 is incomplete, the iOS active call panel can still work via API polling, but real-time updates require working event decryption.

## Current State

### iOS

**DashboardView.swift** (`apps/ios/Sources/Views/Dashboard/DashboardView.swift`):
- Hero shift card shows `ShiftStatus.onCall` badge (blue "On Call" capsule) but no actions
- `activityStatsRow` shows `activeCallCount` number but no call details
- No call ID, no timer, no hangup/ban/spam buttons

**DashboardViewModel.swift** (`apps/ios/Sources/ViewModels/DashboardViewModel.swift`):
- `activeCallCount: Int` tracked but no `currentCall` model
- `handleTypedEvent` receives `.callRing` and `.callUpdate` but only triggers `fetchShiftStatus()` — no call-specific state
- No API methods for call actions (hangup, spam, ban)

**HubEventType** (`apps/ios/Sources/Services/WebSocketService.swift`):
- Has `callRing` and `callUpdate` cases
- Does NOT have a `callEnded` case — call endings come as `callUpdate` with status `"completed"` (same pattern Android uses at `WebSocketService.kt` line 220)

**APIService.swift** (`apps/ios/Sources/Services/APIService.swift`):
- Generic `request<T>(method:path:body:)` works for all endpoints — no call-specific methods needed in the service itself

**NoteCreateView.swift** exists (`apps/ios/Sources/Views/Notes/NoteCreateView.swift`) — can be navigated to with a pre-linked `callId`.

### Android

**DashboardScreen.kt** (`apps/android/.../ui/dashboard/DashboardScreen.kt`):
- Calls stats card shows `activeCallCount` and "View call history" button — no in-call actions
- No active call card/panel at all

**DashboardViewModel.kt** (`apps/android/.../ui/dashboard/DashboardViewModel.kt`):
- `DashboardUiState.activeCallCount: Int` tracked
- `handleEvent` processes `CallRing` (increment count), `CallEnded` (decrement), `CallUpdate` (comment: "handled by call UI" — but no call UI exists)
- No call action API methods

**LlamenosEvent.kt** (`apps/android/.../model/LlamenosEvent.kt`):
- Has `CallRing(callId)`, `CallUpdate(callId, status)`, `CallEnded(callId)` — complete event model

**ApiService.kt** (`apps/android/.../api/ApiService.kt`):
- Generic `request<T>(method, path, body)` — no call action endpoints

### Desktop

**ActiveCallPanel** (`src/client/routes/index.tsx` lines 309-487):
- `onBanNumber` callback fires `banAndHangup(callId)` with no reason argument
- The `banAndHangup` function in `src/client/lib/api.ts` line 374 already accepts an optional `reason` parameter — it's just not used

**i18n strings** (`packages/i18n/locales/en.json` lines 707-715):
```json
"callActions": {
  "banAndHangUp": "Ban & Hang Up",
  "banAndHangUpConfirm": "Ban this caller and end the call?",
  "banFailed": "Failed to ban caller",
  "banReason": "Reason (optional)",
  "banSuccess": "Caller banned and call ended",
  "noteForCall": "Note for call {{callId}}",
  "openNotes": "Notes"
}
```
These strings already exist for desktop. Mobile needs the same keys mapped through i18n codegen.

## Implementation Plan

### Phase 1: iOS Active Call Panel

#### 1a. Active Call Model

Add to `apps/ios/Sources/ViewModels/DashboardViewModel.swift`:

```swift
/// Represents an active call the volunteer is handling.
struct ActiveCall: Equatable {
    let id: String
    let callerDisplay: String  // Masked or "Unknown" — server never exposes real number to volunteer
    let startedAt: Date
}
```

#### 1b. Extend DashboardViewModel with Call State

Add properties and methods to `DashboardViewModel`:

```swift
// New properties:
var activeCall: ActiveCall?      // Non-nil when volunteer has an active call
var callElapsedDisplay: String   // "03:45" timer for the active call
var isBanningCaller: Bool = false
var isHangingUp: Bool = false
var isReportingSpam: Bool = false
var showBanReasonSheet: Bool = false
var banReasonText: String = ""
```

New methods:
- `hangupCall()` — `POST /api/calls/{callId}/hangup`, sets `activeCall = nil` on success
- `reportSpam()` — `POST /api/calls/{callId}/spam`, shows success toast
- `banAndHangup(reason: String?)` — `POST /api/calls/{callId}/ban` with JSON `{ "reason": reason }`, sets `activeCall = nil` on success

Update `handleTypedEvent`:
- `.callRing`: Fetch active call details from `GET /api/calls/active` (response includes our call if we answered)
- `.callUpdate`: If status is `"completed"` or `"cancelled"` for our `activeCall.id`, set `activeCall = nil`

#### 1c. ActiveCallView

New file: `apps/ios/Sources/Views/Dashboard/ActiveCallView.swift`

A `BrandCard`-based view with:
1. **Header row**: Phone icon + "Active Call" title + elapsed timer (mono font, blue)
2. **Action buttons** (horizontal scroll for small screens):
   - **Hang Up** (red filled button, SF Symbol `phone.down.fill`) — calls `hangupCall()`
   - **Report Spam** (yellow outlined button, SF Symbol `exclamationmark.triangle.fill`) — calls `reportSpam()`
   - **Ban & Hang Up** (red outlined button, SF Symbol `shield.slash.fill`) — shows `showBanReasonSheet`
   - **Quick Note** (blue outlined button, SF Symbol `note.text.badge.plus`) — navigates to `NoteCreateView` with `callId` pre-linked
3. **Ban reason sheet** (`.sheet` presentation):
   - Text: "Ban this caller and end the call?"
   - `TextField` for optional reason
   - Cancel + Confirm buttons
   - Confirm calls `banAndHangup(reason:)`

Accessibility identifiers:
- `active-call-panel`
- `call-elapsed-timer`
- `hangup-button`
- `report-spam-button`
- `ban-hangup-button`
- `ban-reason-field`
- `ban-confirm-button`
- `quick-note-button`

#### 1d. Wire into DashboardView

In `DashboardView.swift`, insert `ActiveCallView` between the hero shift card and quick actions grid:

```swift
// Between heroShiftCard and quickActionsGrid:
if vm.activeCall != nil {
    ActiveCallView(viewModel: vm)
}
```

#### 1e. Call Timer

Reuse the existing `timerTask` pattern in `DashboardViewModel` — when `activeCall` is set, the 1-second timer already fires. Add a computed property:

```swift
var callElapsedDisplay: String {
    guard let call = activeCall else { return "--:--" }
    let elapsed = Date().timeIntervalSince(call.startedAt)
    let minutes = Int(elapsed) / 60
    let seconds = Int(elapsed) % 60
    return String(format: "%02d:%02d", minutes, seconds)
}
```

### Phase 2: Android Active Call Panel

#### 2a. Extend DashboardUiState

In `apps/android/.../ui/dashboard/DashboardViewModel.kt`, add to `DashboardUiState`:

```kotlin
data class DashboardUiState(
    // ... existing fields ...
    val activeCall: ActiveCallState? = null,
    val isBanningCaller: Boolean = false,
    val isHangingUp: Boolean = false,
    val isReportingSpam: Boolean = false,
    val showBanReasonDialog: Boolean = false,
)

data class ActiveCallState(
    val callId: String,
    val callerDisplay: String,
    val startedAtMillis: Long,
)
```

#### 2b. Add Call Action Methods to DashboardViewModel

```kotlin
fun hangupCall() {
    val callId = _uiState.value.activeCall?.callId ?: return
    viewModelScope.launch {
        _uiState.update { it.copy(isHangingUp = true) }
        try {
            apiService.request<Map<String, Any>>("POST", "/api/calls/$callId/hangup")
            _uiState.update { it.copy(activeCall = null, isHangingUp = false) }
        } catch (_: Exception) {
            _uiState.update { it.copy(isHangingUp = false, errorRes = R.string.call_action_hangup_failed) }
        }
    }
}

fun reportSpam() {
    val callId = _uiState.value.activeCall?.callId ?: return
    viewModelScope.launch {
        _uiState.update { it.copy(isReportingSpam = true) }
        try {
            apiService.request<Map<String, Any>>("POST", "/api/calls/$callId/spam")
            _uiState.update { it.copy(isReportingSpam = false) }
        } catch (_: Exception) {
            _uiState.update { it.copy(isReportingSpam = false, errorRes = R.string.call_action_spam_failed) }
        }
    }
}

fun banAndHangup(reason: String?) {
    val callId = _uiState.value.activeCall?.callId ?: return
    viewModelScope.launch {
        _uiState.update { it.copy(isBanningCaller = true) }
        try {
            apiService.request<Map<String, Any>>(
                "POST", "/api/calls/$callId/ban",
                mapOf("reason" to (reason ?: "Banned during active call"))
            )
            _uiState.update { it.copy(activeCall = null, isBanningCaller = false, showBanReasonDialog = false) }
        } catch (_: Exception) {
            _uiState.update { it.copy(isBanningCaller = false, errorRes = R.string.call_action_ban_failed) }
        }
    }
}

fun showBanDialog() { _uiState.update { it.copy(showBanReasonDialog = true) } }
fun dismissBanDialog() { _uiState.update { it.copy(showBanReasonDialog = false) } }
```

#### 2c. Update handleEvent for Call Tracking

Update the `handleEvent` method to track the volunteer's active call:

```kotlin
is LlamenosEvent.CallRing -> {
    _uiState.update { it.copy(activeCallCount = it.activeCallCount + 1) }
    // Fetch active calls to see if we have one assigned
    viewModelScope.launch { fetchActiveCall() }
}
is LlamenosEvent.CallEnded -> {
    _uiState.update {
        val newState = it.copy(activeCallCount = maxOf(0, it.activeCallCount - 1))
        if (it.activeCall?.callId == event.callId) newState.copy(activeCall = null)
        else newState
    }
}
is LlamenosEvent.CallUpdate -> {
    if (event.status == "completed" || event.status == "cancelled") {
        _uiState.update {
            if (it.activeCall?.callId == event.callId) it.copy(activeCall = null)
            else it
        }
    }
}
```

Add `fetchActiveCall()`:
```kotlin
private suspend fun fetchActiveCall() {
    try {
        val response = apiService.request<ActiveCallsResponse>("GET", "/api/calls/active")
        val myCall = response.calls.firstOrNull { it.answeredBy == cryptoService.npub }
        _uiState.update {
            it.copy(activeCall = myCall?.let { call ->
                ActiveCallState(
                    callId = call.id,
                    callerDisplay = call.callerDisplay ?: "Unknown",
                    startedAtMillis = call.startedAtMillis,
                )
            })
        }
    } catch (_: Exception) { /* Non-fatal */ }
}
```

#### 2d. ActiveCallCard Composable

New file: `apps/android/.../ui/dashboard/ActiveCallCard.kt`

Material 3 `Card` with `primaryContainer` color and elevated shadow, containing:

1. **Header**: Phone icon + "Active Call" + elapsed timer (using `remember { mutableStateOf(...) }` with `LaunchedEffect` ticking every second)
2. **Action row** (`FlowRow` for wrapping on narrow screens):
   - **Hang Up** (`ButtonDefaults.buttonColors(containerColor = error)`, icon `Icons.Filled.CallEnd`)
   - **Report Spam** (`OutlinedButton` with warning colors, icon `Icons.Filled.Warning`)
   - **Ban & Hang Up** (`OutlinedButton` with error colors, icon `Icons.Filled.Block`)
   - **Quick Note** (`OutlinedButton` with primary colors, icon `Icons.AutoMirrored.Filled.NoteAdd`)
3. **Ban reason AlertDialog** (shown when `showBanReasonDialog` is true):
   - Title: "Ban & Hang Up"
   - Text: "Ban this caller and end the call?"
   - `OutlinedTextField` for optional reason
   - Dismiss + Confirm buttons

Test tags:
- `active-call-card`
- `call-elapsed-timer`
- `hangup-button`
- `report-spam-button`
- `ban-hangup-button`
- `ban-reason-field`
- `ban-confirm-button`
- `quick-note-button`

#### 2e. Wire into DashboardScreen

In `DashboardScreen.kt`, insert `ActiveCallCard` between the shift status card and the calls stats card:

```kotlin
// After shift status card, before calls stats card:
val activeCall = uiState.activeCall
if (activeCall != null) {
    ActiveCallCard(
        callState = activeCall,
        isBanning = uiState.isBanningCaller,
        isHangingUp = uiState.isHangingUp,
        isReportingSpam = uiState.isReportingSpam,
        showBanDialog = uiState.showBanReasonDialog,
        onHangup = viewModel::hangupCall,
        onReportSpam = viewModel::reportSpam,
        onBanAndHangup = viewModel::banAndHangup,
        onShowBanDialog = viewModel::showBanDialog,
        onDismissBanDialog = viewModel::dismissBanDialog,
        onQuickNote = { /* Navigate to note create with callId */ },
    )
}
```

Add `onNavigateToCreateNote: (String?) -> Unit` parameter to `DashboardScreen` for the quick note action (call ID passed as argument).

### Phase 3: Desktop Ban Reason Prompt

#### 3a. Add AlertDialog to ActiveCallPanel

In `src/client/routes/index.tsx`, modify the `ActiveCallPanel` component:

1. Add state: `const [showBanDialog, setShowBanDialog] = useState(false)` and `const [banReason, setBanReason] = useState('')`
2. Change the ban button's `onClick` from `onBanNumber` to `() => setShowBanDialog(true)`
3. Add an `AlertDialog` (from shadcn/ui) that:
   - Shows the confirmation text using `t('callActions.banAndHangUpConfirm')`
   - Has an input field for optional reason, placeholder `t('callActions.banReason')`
   - Cancel button
   - Confirm button that calls `onBanNumber(banReason || undefined)` and closes the dialog
4. Update the `onBanNumber` callback type from `() => void` to `(reason?: string) => void`
5. Update the caller in the parent component to pass the reason to `banAndHangup(callId, reason)`

The i18n strings `callActions.banAndHangUpConfirm` and `callActions.banReason` already exist.

### Phase 4: i18n Strings

#### 4a. New Strings

The `callActions` namespace already has most needed strings. Add these new keys to `packages/i18n/locales/en.json`:

```json
"callActions": {
  // ... existing keys unchanged ...
  "hangUp": "Hang Up",
  "reportSpam": "Report Spam",
  "spamReported": "Call reported as spam",
  "spamFailed": "Failed to report spam",
  "hangUpFailed": "Failed to hang up",
  "activeCall": "Active Call",
  "callDuration": "Call Duration",
  "quickNote": "Quick Note"
}
```

Note: `calls.hangUp` already exists at `shortcuts.hangUp` — but `callActions.hangUp` is more specific to the in-call panel context. Evaluate whether to reuse `calls.hangUp` (which is `"Hang Up"` in the `calls` namespace) or keep them separate.

#### 4b. Translate and Codegen

1. Add translations to all 13 locale files in `packages/i18n/locales/`
2. Run `bun run i18n:codegen` to regenerate iOS `.strings` and Android `strings.xml`
3. Run `bun run i18n:validate:all` to verify

### Phase 5: BDD Step Definitions

#### 5a. iOS XCUITest Steps

File: `apps/ios/Tests/XCUITests/Steps/CallActionSteps.swift`

Implement step definitions for the 5 scenarios in `call-actions.feature`:
- "volunteer 0 bans and hangs up the call" → tap `ban-hangup-button`, tap `ban-confirm-button`
- "volunteer 0 bans and hangs up with reason" → tap `ban-hangup-button`, type in `ban-reason-field`, tap `ban-confirm-button`
- "volunteer 0 creates a note for the active call" → tap `quick-note-button`, enter text, save

**Note**: XCUITest steps require a test backend or mock API. The BDD scenarios are `@backend`-tagged and test API behavior. iOS UI tests verify the UI correctly calls the API — they may need a mock API server or the Docker Compose backend.

#### 5b. Android Cucumber Steps

File: `apps/android/app/src/androidTest/java/org/llamenos/hotline/steps/CallActionSteps.kt`

Same 5 scenarios. Use Compose test rules:
- `composeTestRule.onNodeWithTag("ban-hangup-button").performClick()`
- `composeTestRule.onNodeWithTag("ban-reason-field").performTextInput("Threatening language")`
- `composeTestRule.onNodeWithTag("ban-confirm-button").performClick()`

#### 5c. Desktop Verification

The existing desktop BDD steps should already cover scenarios 1-4 (ban, ban with reason, permission check, note creation). Verify that the new ban reason dialog doesn't break existing tests. The "ban with reason" scenario may need a new desktop step that:
1. Clicks the ban button
2. Types the reason in the dialog input
3. Clicks confirm

## Files to Create

| File | Purpose |
|------|---------|
| `apps/ios/Sources/Views/Dashboard/ActiveCallView.swift` | iOS active call panel UI |
| `apps/android/.../ui/dashboard/ActiveCallCard.kt` | Android active call card composable |
| `apps/ios/Tests/XCUITests/Steps/CallActionSteps.swift` | iOS BDD step definitions |
| `apps/android/.../steps/CallActionSteps.kt` | Android BDD step definitions |

## Files to Modify

| File | Change |
|------|--------|
| `apps/ios/Sources/ViewModels/DashboardViewModel.swift` | Add `ActiveCall` model, `activeCall` property, call action methods, event handling |
| `apps/ios/Sources/Views/Dashboard/DashboardView.swift` | Insert `ActiveCallView` when `activeCall != nil` |
| `apps/android/.../ui/dashboard/DashboardViewModel.kt` | Add `ActiveCallState`, call action methods, update event handling |
| `apps/android/.../ui/dashboard/DashboardScreen.kt` | Insert `ActiveCallCard`, add `onNavigateToCreateNote` param |
| `src/client/routes/index.tsx` | Add ban reason AlertDialog to `ActiveCallPanel` |
| `packages/i18n/locales/*.json` | Add `callActions.hangUp`, `.reportSpam`, `.spamReported`, `.spamFailed`, `.hangUpFailed`, `.activeCall`, `.callDuration`, `.quickNote` |

## Acceptance Criteria

All criteria map 1:1 to BDD scenarios in `packages/test-specs/features/core/call-actions.feature`:

1. **AC1 → Scenario "Ban and hang up during active call"**: On all 3 platforms, tapping Ban & Hang Up (with no reason) bans the caller and ends the call. Active call panel disappears.
2. **AC2 → Scenario "Ban and hang up with custom reason"**: On all 3 platforms, entering a reason before confirming ban stores the reason. Desktop shows a dialog; iOS shows a sheet; Android shows an AlertDialog.
3. **AC3 → Scenario "Cannot ban another volunteer's call"**: API returns 403 — UI should show error toast/snackbar if this somehow occurs (defensive, since UI only shows ban for own call).
4. **AC4 → Scenario "Create note during active call"**: Quick note button navigates to note creation with `callId` pre-linked. Created note is linked to the call.
5. **AC5 → Scenario "Banned caller cannot call back"**: Server-side — no UI change needed, but validates the full flow.
6. **AC6** (new): Active call panel shows elapsed timer updating every second on iOS and Android.
7. **AC7** (new): Report Spam button calls `POST /api/calls/:callId/spam` and shows success feedback.
8. **AC8** (new): Hang Up button calls `POST /api/calls/:callId/hangup` and clears the active call panel.

## Security Considerations

- **Caller number never exposed**: The `callerDisplay` field shown in the UI is server-controlled. The `callerNumber` field in the call record is redacted by the `GET /api/calls/active` endpoint for non-admin volunteers (see `apps/worker/routes/calls.ts` lines 28-32). The ban endpoint resolves the phone number server-side — the volunteer never sees it.
- **Call ownership enforcement**: All call action endpoints verify `call.answeredBy === pubkey` before executing. The UI should only show actions for the volunteer's own call, but server-side checks are the real enforcement.
- **E2EE notes**: Quick note creation uses the same ECIES envelope encryption as the desktop — per-note random key, wrapped for volunteer + admin. No change to the crypto path.

## Testing Gate

```bash
# Backend BDD (already passing — verifies API)
bun run test:backend:bdd

# Desktop (verify ban reason dialog doesn't break existing tests)
bun run test:desktop

# iOS (new XCUITest steps)
bun run test:ios

# Android (new Cucumber steps)
bun run test:android
```

## Estimated Scope

- **Phase 1 (iOS)**: ~200 lines new code (view + viewmodel changes)
- **Phase 2 (Android)**: ~250 lines new code (composable + viewmodel changes)
- **Phase 3 (Desktop)**: ~30 lines changed (dialog addition)
- **Phase 4 (i18n)**: ~100 lines across 13 locale files + codegen
- **Phase 5 (BDD)**: ~150 lines of step definitions across platforms
