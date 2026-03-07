---
name: cross-platform-feature-port
description: >
  Guide porting features across Desktop (Tauri/React), iOS (SwiftUI), and Android (Kotlin/Compose)
  in the Llamenos monorepo. Use this skill when implementing a feature that exists on one platform
  and needs to work on another, when the user mentions "port to iOS", "Android version", "feature
  parity", "cross-platform", "implement on all platforms", "build the iOS/Android/mobile version",
  "same thing on Swift/Kotlin/native side", or describes a feature that "doesn't exist on
  [platform] yet". Also use when the user says "the desktop version works, now build it for
  mobile", asks to "replicate" or "mirror" a feature across platforms, or when creating epics for
  mobile feature parity. If a user describes building a screen or feature and mentions a specific
  target platform while referencing an existing implementation on another platform, this skill
  applies. It ensures consistent architecture, shared types, proper crypto integration, and
  correct i18n string handling on each platform.
---

# Cross-Platform Feature Porting for Llamenos

This monorepo has 4 platforms that implement the same protocol. When a feature exists on desktop,
it needs to be ported to iOS and Android (and vice versa). This skill maps the architectural
patterns between platforms so ports are consistent and complete.

## Platform Architecture Map

| Concern | Desktop (Tauri/React) | iOS (SwiftUI) | Android (Kotlin/Compose) |
|---------|----------------------|---------------|--------------------------|
| **UI Framework** | React + shadcn/ui + TanStack Router | SwiftUI (iOS 17+, @Observable) | Jetpack Compose + Material 3 |
| **State** | React hooks + context | @Observable ViewModels | Hilt ViewModels + StateFlow |
| **Navigation** | TanStack file-based routes | NavigationStack + NavigationPath | Compose NavGraph + Hilt NavHost |
| **API Client** | fetch + platform.ts | APIService (URLSession) | ApiClient (OkHttp 5 + Retrofit) |
| **Crypto** | platform.ts → Tauri IPC → Rust | CryptoService (UniFFI XCFramework) | CryptoService (JNI .so) |
| **Key Storage** | Tauri Stronghold | iOS Keychain | Android Keystore (EncryptedSharedPreferences) |
| **i18n** | i18next t('key') | NSLocalizedString("key") | R.string.key / I18n.KEY |
| **Design System** | CSS vars + shadcn/ui | BrandColors.swift + shared components | Material 3 theme + brand colors |
| **Tests** | Playwright BDD | XCUITest + XCTest | Cucumber + Compose UI Test |

## Porting Workflow

### Step 1: Understand the Source Feature

Before porting, read the existing implementation:

1. **Desktop routes**: `src/client/routes/` — find the route file for the feature
2. **Desktop components**: `src/client/components/` — UI components used
3. **Worker endpoints**: `apps/worker/routes/` or `apps/worker/durable-objects/` — API surface
4. **Shared types**: `packages/shared/types.ts` or `packages/protocol/generated/` — data models
5. **Crypto operations**: What encryption/signing does the feature use? (Check platform.ts calls)

### Step 2: Protocol & Shared Layer

Ensure the shared layer is ready before writing platform code:

1. **Protocol schemas**: If the feature uses new types, they should exist in `packages/protocol/schemas/`
   and be generated via `bun run codegen` for all platforms
2. **i18n strings**: Add all needed strings to `packages/i18n/locales/en.json`, propagate to all
   locales, run `bun run i18n:codegen` (see `i18n-string-workflow` skill)
3. **Crypto labels**: If new encryption contexts are needed, add to `packages/protocol/crypto-labels.json`
   and regenerate

### Step 3: Backend (if needed)

If the feature needs new API endpoints:

1. **Worker route**: Add to `apps/worker/routes/` or the relevant Durable Object
2. **DORouter**: Register new method+path combination
3. **Auth guard**: Apply appropriate permission check
4. **Nostr broadcast**: If real-time updates needed, add encrypted event publishing
5. **Tests**: Worker integration tests via `bun run test:worker`

### Step 4: Platform Implementation

#### Porting to iOS (SwiftUI)

```
Feature structure:
apps/ios/Sources/
  Views/{FeatureName}View.swift        # SwiftUI view
  ViewModels/{FeatureName}ViewModel.swift  # @Observable ViewModel
  Services/APIService.swift            # Add API methods
  Services/CryptoService.swift         # If crypto needed
```

**Key patterns**:
- ViewModels use `@Observable` macro (iOS 17+) — no `@Published` needed
- API calls go through `APIService` singleton
- Crypto operations go through `CryptoService` (never call FFI directly from views)
- Navigation via `NavigationStack` + `NavigationLink` or programmatic `NavigationPath`
- Use `BrandCard`, `StatusDot`, `BadgeView` and other shared components from `Design/`
- Brand colors from `BrandColors.swift` (15 semantic tokens)
- Accessibility: add `accessibilityIdentifier("feature-element")` for XCUITest targeting

**Testing**:
- Unit tests in `Tests/Unit/{Feature}Tests.swift`
- UI tests in `Tests/UI/{Feature}UITests.swift` extending `BaseUITest`
- Use BDD helpers: `given()`, `when()`, `then()`

#### Porting to Android (Kotlin/Compose)

```
Feature structure:
apps/android/app/src/main/java/org/llamenos/hotline/
  ui/{feature}/{Feature}Screen.kt      # Compose screen
  ui/{feature}/{Feature}ViewModel.kt   # Hilt ViewModel
  api/ApiClient.kt                     # Add API methods
  crypto/CryptoService.kt              # If crypto needed
```

**Key patterns**:
- ViewModels use `@HiltViewModel` + `@Inject constructor`
- State exposed via `StateFlow` or `MutableStateFlow`
- API calls through `ApiClient` (OkHttp 5 + kotlinx.serialization)
- Crypto through `CryptoService` singleton (never call JNI directly from UI)
- Navigation via Compose `NavHost` with routes as sealed class/string
- Material 3 theming with brand color overrides
- Test tags: `Modifier.testTag("feature-element")` for Compose UI tests

**Testing**:
- Unit tests in `src/test/java/org/llamenos/hotline/{Feature}Test.kt`
- UI tests in `src/androidTest/` using Cucumber step definitions
- Build: `export JAVA_HOME=... && ./gradlew testDebugUnitTest`

### Step 5: Crypto Porting

When a feature involves encryption (notes, messaging, file uploads):

| Operation | Desktop | iOS | Android |
|-----------|---------|-----|---------|
| **Encrypt** | `platform.encryptForRecipients()` | `CryptoService.shared.encryptForRecipients()` | `cryptoService.encryptForRecipients()` |
| **Decrypt** | `platform.decryptEnvelope()` | `CryptoService.shared.decryptEnvelope()` | `cryptoService.decryptEnvelope()` |
| **Sign** | `platform.signSchnorr()` | `CryptoService.shared.signSchnorr()` | `cryptoService.signSchnorr()` |
| **Auth token** | `platform.createAuthToken()` | `CryptoService.shared.createAuthToken()` | `cryptoService.createAuthToken()` |

All platforms call into the same Rust `packages/crypto/` crate via different FFI mechanisms.
The API surface is identical — same function names, same parameters, same return types.

Domain separation labels MUST come from generated constants:
- Desktop: `import { LABEL_* } from '@shared/crypto-labels'`
- iOS: `CryptoLabels.labelNoteSeal` (generated Swift)
- Android: `CryptoLabels.LABEL_NOTE_SEAL` (generated Kotlin)

### Step 6: Verify

1. **Run platform tests**: `bun run test:changed`
2. **Check i18n**: `bun run i18n:validate:all`
3. **Check codegen**: `bun run codegen:check`
4. **Cross-platform crypto**: If crypto involved, verify same test vectors pass on all platforms

## Feature Parity Checklist

When porting, ensure the target platform has:

- [ ] All UI screens matching the source feature's functionality
- [ ] API client methods for all endpoints the feature uses
- [ ] Crypto integration through the platform's CryptoService
- [ ] i18n strings referenced correctly (platform-specific format)
- [ ] Error handling (network errors, auth failures, crypto failures)
- [ ] Loading states and empty states
- [ ] Accessibility identifiers for test targeting
- [ ] Unit tests for ViewModels/business logic
- [ ] UI/E2E tests for user-facing flows
- [ ] Permission guards matching the source (admin-only, volunteer-only, etc.)

## Common Porting Mistakes

| Mistake | Impact | Prevention |
|---------|--------|------------|
| Calling crypto directly instead of through CryptoService | Key material leaks to UI layer | Always use service abstraction |
| Hardcoding strings instead of using i18n | Not localizable | Always use platform i18n system |
| Using platform-specific types instead of protocol types | Type mismatch across platforms | Import from generated protocol types |
| Forgetting auth token in API calls | 401 errors | Check source platform's API client for auth header pattern |
| Not handling offline/error states | Crashes or blank screens | Mirror source platform's error boundaries |
| Wrong accessibility identifiers | Tests can't find elements | Match naming convention: `feature-element-action` |
