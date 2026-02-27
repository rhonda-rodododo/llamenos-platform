# Epic 105: Cross-Platform Crypto Verification

**Status: PENDING** (depends on Epics 100, 101)
**Repos**: All three

## Summary

Verify that data encrypted on one platform can be decrypted on another — desktop, mobile, API.

## Deliverables

1. `llamenos-core/tests/interop.rs` — Rust interop test suite
2. `llamenos-core/tests/fixtures/test-vectors.json` — known-good encrypted payloads
3. `llamenos/tests/crypto-interop.spec.ts` — Playwright test consuming test vectors
4. `llamenos-mobile/e2e/crypto-interop.test.ts` — Detox test consuming test vectors

## Test Vectors

- Note encryption roundtrip (Rust encrypt → JS decrypt, JS encrypt → Rust decrypt)
- Message encryption roundtrip
- PIN encryption roundtrip
- Auth token verification cross-platform
- ECIES key wrapping cross-platform
- Crypto label consistency validation
