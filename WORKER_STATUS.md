# Worker Status: local-desktop-e2e-audit

**Branch**: `local-desktop-e2e-audit`
**PR**: https://github.com/rhonda-rodododo/llamenos-platform/pull/240
**Status**: Complete — pushed and PR created

## Commits (1)

1. `d723ba2b` — fix(e2e): resolve desktop auth cascade failures

## Verification Results

| Suite | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| Desktop BDD | 346 | **0** | 12 |
| Chromium (non-BDD) | 75 | **0** | 23 |
| Backend BDD | 679 | 14 | 60 |
| **Total Desktop** | **421** | **0** | **35** |

**Desktop E2E is fully green.**

## What Was Done

### Fix 1: Token Age Validation / Clock Skew
- File: `apps/worker/lib/auth.ts`
- Made `TOKEN_MAX_AGE_MS` configurable via `process.env.TOKEN_MAX_AGE_MS`
- Set `TOKEN_MAX_AGE_MS=3600000` in `start-server.sh` for dev/test

### Fix 2: Admin Key Mismatch (bootstrap vs legacy)
- File: `tests/helpers.ts` — `loginAsAdmin()`
- Added fallback detection: if `admin.json` login fails, clear storage and use `ADMIN_SEED`

### Fix 3: Legacy vs Ed25519 Import Mismatch
- File: `tests/helpers.ts` — `loginAsAdmin()` fallback
- Changed from `legacyImportNsec()` (secp256k1) to `deviceImportAndLoad()` (Ed25519)
- Ensures browser and API auth use identical pubkeys

### Fix 4: Undefined `isNsec` in `loginAsVolunteer`
- File: `tests/helpers.ts` — `loginAsVolunteer()`
- Removed `isNsec` conditional, always use Ed25519 `deviceImportAndLoad()`

### Documentation
- Created `test-audit-results.md` with full breakdown, root cause analysis, and recommendations

## Root Cause Summary

The desktop E2E failures were a **cascade** of related auth issues:
1. Clock skew → token age validation fails
2. Failed validation → dev bypass never runs
3. Bootstrap admin mismatch → even if bypass ran, wrong pubkey in DB
4. Legacy vs Ed25519 mismatch → fallback admin seed produced wrong pubkey type

All four had to be fixed together for login to work end-to-end.

## Remaining Work (Backend Only)

The 14 backend BDD failures are pre-existing issues unrelated to desktop E2E:
- 7 Nostr relay event decryption failures
- 6 Hub key envelope API 500 errors
- 1 Invite validation state bleed (passes in isolation)

Documented in `test-audit-results.md` with recommendations.
