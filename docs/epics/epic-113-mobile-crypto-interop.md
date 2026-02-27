# Epic 113: Mobile Crypto Interop Validation

**Status: PENDING**
**Repo**: llamenos-mobile
**Priority**: High — ensures mobile crypto matches Rust reference implementation
**Depends on**: Epic 112 (test vectors must exist first)

## Summary

Create a lightweight Jest unit test suite in llamenos-mobile that validates the JS crypto fallback against Rust-generated test vectors. These tests run without a simulator/emulator (pure Node.js), providing fast CI feedback before the expensive Detox E2E tests.

## Motivation

The mobile app has two crypto paths:
1. **Native** — Rust via UniFFI (Expo Modules) — used on real devices
2. **JS fallback** — `@noble/*` libraries — used when native module is unavailable (CI, dev)

The JS fallback is the **only testable path in CI** (no native build). It must produce identical results to Rust. Test vectors from Epic 112 are the authoritative reference.

## Architecture

### Separate Jest Config (not Detox)

Detox tests (`e2e/jest.config.js`) use Detox's custom test environment, global setup/teardown, and 120s timeouts. Unit tests need a completely separate config:

```typescript
// jest.config.unit.ts
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',        // NOT detox environment
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  testTimeout: 30_000,             // PBKDF2 tests may take ~5s
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    // Map crypto imports to the JS implementation directly
    '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
  },
}
```

### Test Vector Loading

Copy `test-vectors.json` from llamenos-core into `__tests__/fixtures/`:

```typescript
import vectors from './fixtures/test-vectors.json'
```

The fixture file is copied (not symlinked) to avoid cross-repo path issues in CI. A `scripts/sync-test-vectors.sh` script keeps it updated:

```bash
#!/bin/bash
cp ../llamenos-core/tests/fixtures/test-vectors.json __tests__/fixtures/test-vectors.json
echo "Test vectors synced from llamenos-core"
```

## Test Cases

### File: `__tests__/crypto-interop.test.ts`

```typescript
import { describe, test, expect } from '@jest/globals'
import vectors from './fixtures/test-vectors.json'
import * as labels from '../src/lib/crypto-labels'
import { cryptoProvider } from './helpers/test-crypto-provider'
```

### Test 1: Label Constants Match (all 28)

```typescript
test('all 28 crypto labels match Rust definitions', () => {
  const rustLabels = vectors.labels
  expect(labels.LABEL_NOTE_KEY).toBe(rustLabels.labelNoteKey)
  expect(labels.LABEL_MESSAGE).toBe(rustLabels.labelMessage)
  expect(labels.LABEL_HUB_KEY_WRAP).toBe(rustLabels.labelHubKeyWrap)
  // ... all 28 labels
  expect(Object.keys(rustLabels).length).toBe(28)
})
```

### Test 2: Pubkey Derivation

```typescript
test('pubkey derivation matches Rust', () => {
  const { secretKeyHex, pubkeyHex } = vectors.keys
  const derived = cryptoProvider.getPublicKey(secretKeyHex)
  expect(derived).toBe(pubkeyHex)
})
```

### Test 3: ECIES Unwrap

```typescript
test('JS can unwrap ECIES envelope from Rust', () => {
  const { envelope, originalKeyHex, label } = vectors.ecies
  const adminSecret = vectors.keys.adminSecretKeyHex
  const unwrapped = eciesUnwrapKey(envelope, adminSecret, label)
  expect(unwrapped).toBe(originalKeyHex)
})
```

### Test 4: Note Decryption (Author + Admin)

```typescript
test('JS decrypts note as author', () => {
  const { plaintextJson, encryptedContent, authorEnvelope } = vectors.noteEncryption
  const result = cryptoProvider.decryptNote(encryptedContent, authorEnvelope, vectors.keys.secretKeyHex)
  expect(JSON.stringify(result)).toBe(plaintextJson)
})

test('JS decrypts note as admin', () => {
  const { plaintextJson, encryptedContent, adminEnvelopes } = vectors.noteEncryption
  const adminEnvelope = adminEnvelopes[0]
  const result = cryptoProvider.decryptNote(encryptedContent, adminEnvelope, vectors.keys.adminSecretKeyHex)
  expect(JSON.stringify(result)).toBe(plaintextJson)
})
```

### Test 5: Auth Token Verification

```typescript
test('JS verifies auth token from Rust', () => {
  const { token, method, path } = vectors.auth
  // Reconstruct message and verify Schnorr signature
  const message = `${labels.AUTH_PREFIX}${token.pubkey}:${token.timestamp}:${method}:${path}`
  const messageHash = sha256(utf8ToBytes(message))
  const valid = schnorr.verify(token.token, messageHash, token.pubkey)
  expect(valid).toBe(true)
})
```

### Test 6: Draft Decryption

```typescript
test('JS decrypts draft from Rust', () => {
  const { plaintext, encryptedHex } = vectors.draftEncryption
  const result = cryptoProvider.decryptDraft(encryptedHex, vectors.keys.secretKeyHex)
  expect(result).toBe(plaintext)
})
```

### Test 7: Message Decryption (Epic 112 vector)

```typescript
test('JS decrypts message as volunteer', () => {
  const { plaintext, encryptedContent, readerEnvelopes } = vectors.messageEncryption
  const result = cryptoProvider.decryptMessage(
    encryptedContent, readerEnvelopes,
    vectors.keys.secretKeyHex, vectors.keys.pubkeyHex
  )
  expect(result).toBe(plaintext)
})
```

### Test 8: Hub Key Unwrap (Epic 112 vector)

```typescript
test('JS unwraps hub key from Rust', () => {
  const { hubKeyHex, wrappedEnvelopes } = vectors.hubKey
  const unwrapped = eciesUnwrapKey(
    wrappedEnvelopes[0], vectors.keys.secretKeyHex, labels.LABEL_HUB_KEY_WRAP
  )
  expect(unwrapped).toBe(hubKeyHex)
})
```

## Test Helper

### File: `__tests__/helpers/test-crypto-provider.ts`

Imports the JS crypto functions directly (not through the CryptoProvider abstraction, which tries to load the native module):

```typescript
import {
  eciesUnwrapKey,
  decryptNoteV2,
  decryptMessage,
  decryptDraft,
  createAuthToken,
  getPublicKey,
} from '../../src/lib/crypto'

export const cryptoProvider = {
  getPublicKey,
  decryptNote: decryptNoteV2,
  decryptMessage,
  decryptDraft,
  eciesUnwrapKey,
  createAuthToken,
}
```

## CI Integration

### File: `llamenos-mobile/package.json`

Add test script:
```json
{
  "scripts": {
    "test:unit": "jest --config jest.config.unit.ts",
    "test:unit:ci": "jest --config jest.config.unit.ts --ci --forceExit"
  }
}
```

### File: `llamenos-mobile/.github/workflows/mobile-e2e.yml`

Add unit test step **before** Detox builds (faster feedback):

```yaml
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - name: Install Bun
        uses: oven-sh/setup-bun@4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5 # v2.0.2
        with:
          version: "1.3.5"

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run unit tests
        run: bun run test:unit:ci

  e2e-ios:
    needs: [unit-tests]   # Only run E2E if unit tests pass
    # ... existing iOS job
```

## Files to Create/Modify

### New Files
- `llamenos-mobile/__tests__/crypto-interop.test.ts` — 8+ test cases
- `llamenos-mobile/__tests__/fixtures/test-vectors.json` — copied from llamenos-core
- `llamenos-mobile/__tests__/helpers/test-crypto-provider.ts` — JS crypto wrapper
- `llamenos-mobile/jest.config.unit.ts` — separate from Detox config
- `llamenos-mobile/scripts/sync-test-vectors.sh` — vector sync script

### Modified Files
- `llamenos-mobile/package.json` — add `test:unit` and `test:unit:ci` scripts
- `llamenos-mobile/.github/workflows/mobile-e2e.yml` — add unit-tests job before E2E

## Verification

1. `cd ~/projects/llamenos-mobile && bun run test:unit` — all 8+ tests pass
2. Unit tests complete in <10 seconds (PBKDF2 test may take ~5s)
3. CI unit-tests job runs before iOS/Android E2E jobs
4. All 28 label constants validated against Rust
5. Volunteer and admin decryption paths both tested
