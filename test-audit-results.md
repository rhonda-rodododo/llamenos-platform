# Desktop E2E Test Audit Results

**Date:** 2026-05-08
**Branch:** `local-desktop-e2e-audit`
**Baseline:** After 3 recovery PRs

## Summary

| Suite | Passed | Failed | Skipped | Status |
|-------|--------|--------|---------|--------|
| Desktop BDD | 346 | 0 | 12 | **PASSING** |
| Chromium (non-BDD) | 75 | 0 | 23 | **PASSING** |
| Backend BDD | 679 | 14 | 60 | Partial |
| **Total Desktop** | **421** | **0** | **35** | **PASSING** |

## Fixes Applied

### 1. Token Age Validation / Clock Skew (Critical)
**File:** `apps/worker/lib/auth.ts`
**Problem:** `validateToken()` used a hardcoded 5-minute max age (`TOKEN_MAX_AGE_MS = 5 * 60 * 1000`). Clock skew between test client and server caused tokens to be rejected as stale, which blocked the dev-mode signature bypass from running.
**Fix:** Made `TOKEN_MAX_AGE_MS` configurable via environment variable:
```typescript
const TOKEN_MAX_AGE_MS = Number(process.env.TOKEN_MAX_AGE_MS) || 5 * 60 * 1000
```
**File:** `start-server.sh`
**Added:** `export TOKEN_MAX_AGE_MS=3600000` (1 hour) for dev/test environments.

### 2. Admin Key Mismatch (Critical)
**File:** `tests/helpers.ts` — `loginAsAdmin()`
**Problem:** The bootstrap test creates a new Ed25519 admin via UI, but `restore normal test state` calls `test-reset` which re-creates the legacy admin from `ADMIN_PUBKEY` env var. This caused `tests/storage/admin.json` (bootstrap admin keys) to mismatch the database admin pubkey.
**Fix:** Added fallback detection in `loginAsAdmin()`. After attempting login with `admin.json` keys, if still on `/login`, clear storage and fall back to `ADMIN_SEED` with Ed25519 import via `deviceImportAndLoad()`.

### 3. Legacy secp256k1 Import Mismatch (Critical)
**File:** `tests/helpers.ts` — `loginAsAdmin()` fallback
**Problem:** The fallback used `legacyImportNsec()` which derives a secp256k1/Schnorr pubkey, but `ADMIN_PUBKEY` env var and API helpers use Ed25519 pubkeys derived from the same seed. This caused browser login and API auth to use different pubkeys.
**Fix:** Changed fallback to use `deviceImportAndLoad()` (Ed25519) instead of `legacyImportNsec()` (secp256k1), ensuring browser and API auth use identical pubkeys.

### 4. `loginAsVolunteer` Undefined Variable (Medium)
**File:** `tests/helpers.ts` — `loginAsVolunteer()`
**Problem:** Reference to undefined `isNsec` variable caused `ReferenceError`.
**Fix:** Removed `isNsec` conditional and always use `deviceImportAndLoad()` (Ed25519), matching the volunteer key generation path.

## Failure Categories (Backend BDD Only)

The 14 backend BDD failures are **not desktop E2E issues** — they are backend service/integration issues:

| Category | Count | Description |
|----------|-------|-------------|
| **B. Nostr Relay Decryption** | 7 | Relay event delivery tests fail because `decryptEventPayload()` returns null. Likely event encryption key mismatch or relay event format issue. |
| **C. Hub Key API 500** | 6 | `PUT /api/hubs/{id}/key` returns HTTP 500 when setting hub key envelopes. Server-side error not logged in detail. |
| **D. Invite Validation** | 1 | Invite lifecycle test fails in full suite but passes in isolation — possible state bleed between scenarios. |

## Root Cause Analysis

### Desktop Auth Cascade Failure
The original desktop E2E failures were a **cascade** of related auth issues:

1. **Clock skew** → token age validation fails
2. **Token age fail** → dev bypass never runs
3. **Bootstrap admin mismatch** → even if bypass ran, wrong pubkey in DB
4. **Legacy vs Ed25519 mismatch** → fallback admin seed produced wrong pubkey type

All four had to be fixed together for login to work end-to-end.

## Verification

```bash
# Desktop BDD
npx playwright test --project=bdd
# Result: 346 passed, 12 skipped

# Chromium (non-BDD)
npx playwright test --project=chromium
# Result: 75 passed, 23 skipped

# Backend BDD
npx playwright test --project=backend-bdd
# Result: 679 passed, 14 failed, 60 skipped
```

## Recommendations

1. **Backend BDD:** Investigate Nostr relay event decryption and hub key envelope 500 errors. These are pre-existing backend issues unrelated to desktop E2E.
2. **Test Isolation:** The invite validation test passes in isolation but may fail in full suite — review shared state between backend BDD scenarios.
3. **Clock Skew:** The `TOKEN_MAX_AGE_MS` env var fix should remain for dev/test environments to tolerate CI/container clock drift.
4. **Admin Seed Consistency:** Ensure `ADMIN_SEED` in `tests/helpers.ts` and `tests/api-helpers.ts` always derives the same Ed25519 pubkey as `ADMIN_PUBKEY` in server config.
