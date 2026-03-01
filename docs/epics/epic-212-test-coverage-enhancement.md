# Epic 212: Test Coverage Enhancement

## Goal

Strengthen test suites across all platforms with behavior-driven patterns, cross-platform test vectors, and comprehensive edge-case coverage. Target: every user-visible feature has automated verification.

## Context

Current state:
- **Desktop**: 38 Playwright E2E tests — comprehensive but could use edge-case coverage
- **Android**: 2 unit tests (CryptoService, KeystoreService) + 5 UI tests — foundational only
- **iOS**: 2 unit tests (CryptoService, KeychainService) + 5 UI tests — foundational only
- **Crypto**: ~45 Rust tests — solid

The mobile tests are thin. Many screens have basic navigation tests but lack behavioral verification (e.g., "when I create a note, the decrypted note appears in the list").

## Implementation

### 1. Cross-Platform Crypto Test Vectors

Create a shared test vector file that all platforms validate against:

```json
// packages/protocol/test-vectors.json
{
  "schnorr_auth": [
    {
      "nsec": "nsec1...",
      "method": "GET",
      "path": "/api/v1/identity",
      "timestamp": 1709337600,
      "expected_message": "GET:/api/v1/identity:1709337600",
      "expected_pubkey": "..."
    }
  ],
  "ecies_roundtrip": [...],
  "pin_encryption": [...],
  "note_encryption": [...],
  "sas_code_derivation": [...]
}
```

This ensures all crypto implementations (Rust, JS mock, Swift stand-in, Kotlin stand-in) produce identical outputs for identical inputs.

### 2. Android Unit Test Expansion

Add comprehensive unit tests for:

**`ApiServiceTest.kt`** — Mock OkHttp responses, test error handling
**`WebSocketServiceTest.kt`** — Test event parsing, reconnection logic
**`AuthInterceptorTest.kt`** — Test token injection, locked-state handling
**`NotesViewModelTest.kt`** — Test note list loading, encryption/decryption flow
**`ShiftsViewModelTest.kt`** — Test shift loading, clock in/out state transitions
**`ConversationsViewModelTest.kt`** — Test message loading, status filtering
**`AdminViewModelTest.kt`** — Test CRUD operations, search, pagination
**`DeviceLinkViewModelTest.kt`** — Test state machine transitions (scanning → connecting → verifying → importing → complete)

Pattern: Test ViewModel state transitions with mock services using kotlinx-coroutines-test `runTest` and `Turbine` for StateFlow testing.

### 3. iOS Unit Test Expansion

Add comprehensive unit tests for:

**`APIServiceTests.swift`** — Mock URLSession responses, test auth token injection
**`WebSocketServiceTests.swift`** — Test connection state, event parsing
**`AuthServiceTests.swift`** — Test auth state machine transitions
**`NotesViewModelTests.swift`** — Test note list, encryption, pagination
**`ShiftsViewModelTests.swift`** — Test shift operations, day grouping, timer
**`ConversationsViewModelTests.swift`** — Test message decryption, status filters
**`AdminViewModelTests.swift`** — Test volunteer/ban/audit CRUD
**`DeviceLinkViewModelTests.swift`** — Test ECDH flow state machine

Pattern: Use Swift async/await testing with `@Observable` state validation.

### 4. Desktop E2E Enhancement

Add missing edge-case tests:

**`e2ee-notes.spec.ts`** — Full E2EE roundtrip: create note → verify encrypted in API → verify decrypted in UI
**`multi-admin-notes.spec.ts`** — Create note with multiple admin envelopes, verify all admins can decrypt
**`shift-scheduling.spec.ts`** — Clock in → wait → verify timer → clock out → verify status
**`conversation-e2ee.spec.ts`** — Send encrypted message → verify decryption for volunteer + admin
**`device-linking.spec.ts`** (enhanced) — Full ECDH provisioning flow with SAS verification
**`error-recovery.spec.ts`** — Network errors, API failures, graceful degradation
**`concurrent-operations.spec.ts`** — Multiple volunteers operating simultaneously

### 5. BDD-Style Test Organization

Adopt Gherkin-style descriptions for all test files:

```typescript
// Desktop pattern
test.describe('Notes E2EE', () => {
  test('Given a volunteer is on-shift, when they create a note, then it is encrypted and visible', async ({ page }) => {
    // Arrange
    await createVolunteerAndGetNsec(page, 'bdd-vol');
    // Act
    await page.getByTestId('create-note').click();
    await page.getByTestId('note-text').fill('Test E2EE note content');
    await page.getByTestId('save-note').click();
    // Assert
    await expect(page.getByTestId('note-card')).toContainText('Test E2EE note content');
  });
});
```

### 6. Test Infrastructure Improvements

- **Android**: Add Turbine for StateFlow testing, MockK for mocking
- **iOS**: Add protocol-based mocking for services
- **Desktop**: Add shared test utilities for multi-role scenarios (admin + volunteer in same test)

## Dependencies in libs.versions.toml (Android)

```toml
turbine = "1.2.0"
mockk = "1.13.13"

[libraries]
turbine = { group = "app.cash.turbine", name = "turbine", version.ref = "turbine" }
mockk = { group = "io.mockk", name = "mockk", version.ref = "mockk" }
```

## Verification

1. All platforms compile and pass existing tests (no regressions)
2. Android: 20+ unit tests, 5+ UI tests
3. iOS: 20+ unit tests, 5+ UI tests
4. Desktop: 40+ E2E tests
5. Cross-platform crypto test vectors pass on all platforms
6. CI runs all tests as part of gate

## Dependencies

- Epic 211 (Mobile CI) — tests need CI to run automatically
