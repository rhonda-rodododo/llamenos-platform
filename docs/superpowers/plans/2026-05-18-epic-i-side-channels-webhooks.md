# Epic I — Side Channels, Webhook Hardening & Error Disclosure: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 20 security audit findings from waves 4-5: eliminate timing side channels in the Rust crypto crate, harden webhook replay protection across all telephony/messaging providers, standardize error responses to prevent information disclosure, and wrap all external HTTP calls in a timeout-protected `safeFetch()` wrapper.

**Spec:** `docs/superpowers/specs/2026-05-18-epic-i-side-channels-webhooks.md`

**Architecture:** Changes span 4 codebases: `packages/crypto/` (Rust constant-time fixes), `apps/desktop/` (IPC-layer label validation + constant-time comparisons), `apps/worker/` (error handling, webhook middleware, safeFetch), and `sip-bridge/` (error disclosure). No schema changes to `packages/protocol/`. One new DB migration (`webhook_nonces`). One new Cargo dependency (`subtle = "2"`). One new TS module (`safe-fetch.ts`).

**Non-negotiable constraints:**
- Constant-time is REQUIRED for all hash/key/signature comparisons
- Error messages to clients must NEVER vary by failure type
- Webhook replay protection must not break legitimate provider retries (idempotent 200 OK)
- `safeFetch()` must become the ONLY way to make external HTTP calls

---

## File Map

| File | Action | Phase | Responsibility |
|------|--------|-------|----------------|
| `packages/crypto/Cargo.toml` | Modify | 2 | Add `subtle = "2"` direct dependency |
| `packages/crypto/src/labels.rs` | Modify | 2 | SIDE-01: HashMap lookup via LazyLock |
| `packages/crypto/src/sigchain.rs` | Modify | 2 | SIDE-02: constant-time hash + pubkey comparison |
| `packages/crypto/src/device_keys.rs` | Modify | 2 | SIDE-05: constant-time pubkey comparison after PIN |
| `packages/crypto/src/encryption.rs` | Modify | 2 | SIDE-06: full-scan recipient matching |
| `packages/crypto/src/lib.rs` | Modify | 2 | Add `ct_hex_eq` utility function |
| `apps/desktop/Cargo.toml` | Modify | 2 | Add `subtle = "2"` dependency |
| `apps/desktop/src/crypto.rs` | Modify | 2 | SIDE-03: shamir_verify constant-time; SIDE-04: label validation |
| `apps/worker/app.ts` | Modify | 1 | W05-H01: global error handler catch-all |
| `apps/worker/middleware/auth.ts` | Modify | 1 | W05-M05: uniform auth error messages |
| `apps/worker/lib/logger.ts` | Modify | 1 | W05-M03: expand SENSITIVE_KEY_RE |
| `apps/worker/lib/hub-event-crypto.ts` | Modify | 1 | AST-03: try-catch on decrypt-then-parse |
| `sip-bridge/src/index.ts` | Modify | 1 | AST-02: generic error messages (replace `String(err)`) |
| `apps/worker/lib/safe-fetch.ts` | Create | 3 | AST-04: safeFetch wrapper with AbortSignal.timeout |
| `apps/worker/telephony/twilio.ts` | Modify | 3,4 | safeFetch migration + replay protection |
| `apps/worker/telephony/signalwire.ts` | Modify | 3,4 | safeFetch migration + replay protection |
| `apps/worker/telephony/vonage.ts` | Modify | 3,4 | safeFetch migration + W05-M08: tighten to 60s |
| `apps/worker/telephony/telnyx.ts` | Modify | 3,4 | safeFetch migration + W05-M08: tighten to 60s |
| `apps/worker/telephony/plivo.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/telephony/bandwidth.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/telephony/sip-bridge-adapter.ts` | Modify | 3 | safeFetch migration (shorter timeout: 10s) |
| `apps/worker/messaging/signal/adapter.ts` | Modify | 3 | AST-05: safeFetch + SSRF guard placeholder |
| `apps/worker/messaging/signal/health.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/messaging/signal/identity.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/messaging/signal/registration.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/messaging/sms/twilio.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/messaging/sms/plivo.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/messaging/sms/signalwire.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/messaging/sms/vonage.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/messaging/telegram/client.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/messaging/whatsapp/meta-client.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/messaging/whatsapp/twilio-client.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/messaging/rcs/rbm-client.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/messaging/delivery-router.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/lib/storage-admin.ts` | Modify | 3 | safeFetch migration (internal: 10s) |
| `apps/worker/lib/storage-manager.ts` | Modify | 3 | safeFetch migration (internal: 10s) |
| `apps/worker/lib/transcription-client.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/lib/fcm-client.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/routes/health.ts` | Modify | 3 | safeFetch migration (5s timeout) |
| `apps/worker/routes/provider-setup.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/routes/setup.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/services/provider-setup/providers/*.ts` | Modify | 3 | safeFetch migration (8 provider files) |
| `apps/worker/services/provider-setup/utils.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/services/provider-setup/signal-registration.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/services/user-notifications.ts` | Modify | 3 | safeFetch migration |
| `apps/worker/db/schema/webhook-nonces.ts` | Create | 4 | Drizzle schema for webhook_nonces table |
| `apps/worker/db/schema/index.ts` | Modify | 4 | Re-export webhook-nonces schema |
| `apps/worker/db/migrations/0014_webhook_nonces.sql` | Create | 4 | Migration: webhook_nonces table + index |
| `apps/worker/middleware/webhook-auth.ts` | Create | 4 | W05-M10: shared webhook auth middleware |
| `apps/worker/middleware/webhook-ip-allowlist.ts` | Create | 4 | W05-H03: IP allowlist middleware |
| `apps/worker/middleware/webhook-content-type.ts` | Create | 4 | W05-M09: Content-Type enforcement |
| `apps/worker/services/webhook-replay.ts` | Create | 4 | W05-H02: nonce-based replay detection |
| `apps/worker/routes/telephony.ts` | Modify | 4 | Wire up webhook middleware pipeline |
| `apps/worker/messaging/router.ts` | Modify | 4 | Wire up webhook middleware pipeline |
| `packages/test-specs/features/security/error-disclosure.feature` | Create | 1 | BDD: error response standardization |
| `packages/test-specs/features/security/webhook-replay.feature` | Create | 4 | BDD: webhook replay + IP + Content-Type |

---

## Dependency Graph

```
Phase 1 (no deps)              Phase 2 (subtle crate)
├─ AST-02 (sip-bridge)         ├─ SIDE-01 (labels HashMap)
├─ AST-03 (hub-event parse)    │   └─ SIDE-04 (label validation, depends SIDE-01)
├─ W05-H01 (global error)      ├─ SIDE-02 (sigchain ct)
├─ W05-M05 (auth errors)       ├─ SIDE-03 (shamir ct)
├─ W05-M03 (logger regex)      ├─ SIDE-05 (device keys ct)
└─ AST-01 (verify N/A)         └─ SIDE-06 (recipient scan ct)

Phase 3 (safeFetch)             Phase 4 (DB migration + middleware)
├─ AST-04 (create safeFetch)    ├─ webhook_nonces migration
├─ ~46 fetch() migrations       ├─ W05-H02 (replay protection service)
└─ AST-05 (Signal SSRF)         ├─ W05-H03 (IP allowlist middleware)
    ⚠ BLOCKED on Epic E         ├─ W05-M09 (Content-Type middleware)
                                 ├─ W05-M10 (shared webhookAuth middleware)
                                 └─ W05-M08 (Vonage/Telnyx 60s window)
```

---

## Phase 1: Error Disclosure & Parse Safety

**Findings:** AST-01, AST-02, AST-03, W05-H01, W05-M05, W05-M03

These fixes have zero dependencies and can be parallelized. They prevent information disclosure via error messages, stack traces, and log fields.

### Task 1: Global Error Handler — Catch-All (W05-H01)

**Files:**
- Modify: `apps/worker/app.ts`

Currently (`app.ts:74-79`), `app.onError` catches `ServiceError` but re-throws all other errors to Hono's default handler, which may include stack traces in the response body.

- [ ] **Step 1: Replace the re-throw with a generic 500 response**

  In `apps/worker/app.ts:73-79`, replace the `throw err` with:
  ```typescript
  app.onError((err, c) => {
    if (err instanceof ServiceError) {
      return c.json({ error: err.message }, err.status as 400 | 401 | 403 | 404 | 409 | 410 | 429 | 500)
    }
    // Log full error server-side — NEVER expose internals to clients
    logger.error('Unhandled error', { error: err.message, stack: err.stack, path: c.req.path })
    return c.json({ error: 'Internal server error' }, 500)
  })
  ```

  Add `import { createLogger } from './lib/logger'` and `const logger = createLogger('app')` at the top.

- [ ] **Step 2: Audit ServiceError messages**

  Grep all `new ServiceError(` and `throw new ServiceError(` across `apps/worker/`. Verify none include stack traces, SQL errors, key material, or internal details. ServiceError messages are sent directly to the client. Flag any that leak internals and fix them inline.

### Task 2: Uniform Auth Error Messages (W05-M05)

**Files:**
- Modify: `apps/worker/middleware/auth.ts`

Currently (`middleware/auth.ts:61`), auth failure returns `{ error: 'Unauthorized' }`. The spec requires `{ error: 'Authentication failed' }` and uniform responses for all failure paths.

- [ ] **Step 1: Standardize the 401 response**

  In `middleware/auth.ts:61`, change:
  ```typescript
  return c.json({ error: 'Unauthorized' }, 401)
  ```
  to:
  ```typescript
  return c.json({ error: 'Authentication failed' }, 401)
  ```

  The logging at lines 53-58 already records the specific reason server-side — that's correct behavior.

- [ ] **Step 2: Audit all 401 paths across the worker**

  Grep for `401` responses in `apps/worker/` (routes, middleware, lib). Ensure every path that returns 401 uses the identical `{ error: 'Authentication failed' }` body. Key locations to check:
  - `apps/worker/lib/auth.ts` — `authenticateRequest()` returns null (handled by middleware)
  - `apps/worker/routes/auth.ts` — any direct 401 responses
  - `apps/worker/routes/webauthn.ts` — any direct 401 responses

  Note: The WebAuthn enforcement at `middleware/auth.ts:89` returns 403 with `code: 'WEBAUTHN_REQUIRED'` — this is a distinct flow (not auth failure), so leave it as-is.

### Task 3: Expand Sensitive Key Regex (W05-M03)

**Files:**
- Modify: `apps/worker/lib/logger.ts`

- [ ] **Step 1: Add missing patterns to SENSITIVE_KEY_RE**

  At `logger.ts:147-148`, expand the regex:
  ```typescript
  const SENSITIVE_KEY_RE =
    /phone|email|nsec|secret|token|ciphertext|encrypted|content|recovery|^pin$|password|credential|apikey|auth_token|access_key|secret_key|private_key|server_secret|sid|signature|jwt|nonce|cookie|session|bearer/i
  ```

  New additions: `sid` (Twilio SIDs), `signature` (webhook signatures), `jwt`, `nonce`, `cookie`, `session`, `bearer`.

### Task 4: SIP Bridge Generic Error Messages (AST-02)

**Files:**
- Modify: `sip-bridge/src/index.ts`

Currently, 6 catch blocks at lines 135, 162, 183, 219, 243, 259 return `String(err)` to the client, leaking internal error information.

- [ ] **Step 1: Replace all `String(err)` error responses with generic messages**

  For each catch block in `sip-bridge/src/index.ts`:
  - Lines 133-135: `{ status: 'error', error: String(err), ...handler.getStatus() }` → `{ status: 'error', error: 'Command failed' }`
  - Lines 160-162: Same pattern → `{ status: 'error', error: 'Command failed', bridge: handler.getStatus() }`
  - Lines 182-183: `{ ok: false, error: String(err) }` status 500 → `{ ok: false, error: 'Invalid request' }` status 400
  - Lines 218-219: Same → `{ ok: false, error: 'Invalid request' }` status 400
  - Lines 242-243: Same → `{ ok: false, error: 'Invalid request' }` status 400
  - Lines 258-259: Same → `{ ok: false, error: 'Invalid request' }` status 400

  Also change status codes from 500 to 400 for JSON parse errors (client error, not server error).

  Keep the existing try-catch structure — just change the error response content.

- [ ] **Step 2: Also check `sip-bridge/src/command-handler.ts:892`**

  Line 892: `return { ok: false, error: String(err) }` — replace with generic message.

### Task 5: Decrypt-Then-Parse Try-Catch (AST-03)

**Files:**
- Modify: `apps/worker/lib/hub-event-crypto.ts`

Currently (`hub-event-crypto.ts:162`), `JSON.parse` after decryption is unwrapped. If decryption produces valid bytes that aren't JSON (bit flip, wrong key that still passes GCM auth somehow), this crashes.

- [ ] **Step 1: Wrap JSON.parse in try-catch with type validation**

  Replace line 162:
  ```typescript
  return JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, unknown>
  ```
  with:
  ```typescript
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(plaintext))
  } catch {
    logger.warn('Hub event decryption produced non-JSON payload', { epoch })
    throw new Error('Hub event decryption produced invalid payload')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    logger.warn('Hub event decryption produced non-object payload', { epoch })
    throw new Error('Hub event decryption produced invalid payload')
  }
  return parsed as Record<string, unknown>
  ```

  Add `import { createLogger } from './logger'` and `const logger = createLogger('hub-event-crypto')` if not already present.

### Task 6: Verify AST-01 (Auth Header JSON.parse)

**Files:**
- Read: `apps/worker/lib/auth.ts`

- [ ] **Step 1: Verify the try-catch is present**

  `auth.ts:13-20` already has `parseAuthHeader()` wrapped in try-catch returning null. Confirmed present in current code. Mark AST-01 as **N/A — already fixed**.

### Task 7: BDD Tests — Error Disclosure

**Files:**
- Create: `packages/test-specs/features/security/error-disclosure.feature`

- [ ] **Step 1: Write BDD scenarios**

  ```gherkin
  @backend
  Feature: Error disclosure prevention
    Error responses must not leak internal details, stack traces, or failure reasons.

    Scenario: Server error does not expose stack trace
      Given a request that triggers an unhandled server error
      When the request is processed
      Then the response status should be 500
      And the response body should be exactly '{"error":"Internal server error"}'

    Scenario: Auth failure does not reveal failure reason
      Given a request with an expired auth token
      When the request is processed
      Then the response status should be 401
      And the response body should be exactly '{"error":"Authentication failed"}'

    Scenario: Auth failure with unknown pubkey returns same error
      Given a request with an auth token for an unknown pubkey
      When the request is processed
      Then the response status should be 401
      And the response body should be exactly '{"error":"Authentication failed"}'

    Scenario: Auth failure with malformed token returns same error
      Given a request with auth header "Bearer {not-json}"
      When the request is processed
      Then the response status should be 401
      And the response body should be exactly '{"error":"Authentication failed"}'

    Scenario: Malformed SIP bridge command returns 400 without details
      Given a valid SIP bridge webhook signature
      And the body is "this is not json"
      When the command endpoint is called
      Then the response status should be 400
      And the response should not contain any stack trace
  ```

- [ ] **Step 2: Implement step definitions**

  Add step definitions in `apps/worker/test/steps/` matching the existing BDD test infrastructure patterns. The "request that triggers an unhandled server error" scenario needs a test-only route or a way to trigger a non-ServiceError (e.g., a malformed internal call).

### Task 1-7 Verification

- [ ] Run `bun run typecheck` from repo root
- [ ] Run `bun run test:backend:bdd` to verify existing + new BDD tests pass
- [ ] Run `bun run crypto:test` to confirm no Rust regressions

---

## Phase 2: Crypto Side Channel Fixes (SIDE-01 through SIDE-06)

**Findings:** SIDE-01, SIDE-02, SIDE-03, SIDE-04, SIDE-05, SIDE-06

All changes are in Rust (`packages/crypto/` and `apps/desktop/`). SIDE-04 depends on SIDE-01 (HashMap lookup makes label validation O(1)). All others are independent.

### Task 8: Add `subtle` Crate Dependency

**Files:**
- Modify: `packages/crypto/Cargo.toml`
- Modify: `apps/desktop/Cargo.toml`

- [ ] **Step 1: Add subtle to packages/crypto**

  In `packages/crypto/Cargo.toml` under `[dependencies]`, add:
  ```toml
  # Constant-time comparison for security-sensitive values
  subtle = "2"
  ```

  `subtle` is already a transitive dependency (via ed25519-dalek, x25519-dalek), so this just makes it a direct dependency.

- [ ] **Step 2: Add subtle to apps/desktop**

  In `apps/desktop/Cargo.toml` under `[dependencies]`, add:
  ```toml
  subtle = "2"
  ```

  Needed for SIDE-03 (shamir_verify in the IPC layer).

### Task 9: Add `ct_hex_eq` Utility (Shared Pattern)

**Files:**
- Modify: `packages/crypto/src/lib.rs`

- [ ] **Step 1: Add constant-time hex comparison utility**

  Add a public utility function that will be used by sigchain, device_keys, and encryption modules:

  ```rust
  use subtle::ConstantTimeEq;

  /// Constant-time comparison of two hex-encoded strings.
  /// Returns false if either string is not valid hex or lengths differ.
  pub fn ct_hex_eq(a: &str, b: &str) -> bool {
      let Ok(a_bytes) = hex::decode(a) else { return false };
      let Ok(b_bytes) = hex::decode(b) else { return false };
      if a_bytes.len() != b_bytes.len() {
          return false;
      }
      a_bytes.ct_eq(&b_bytes).into()
  }
  ```

  Export this from the crate so `apps/desktop/src/crypto.rs` can also use it.

### Task 10: SIDE-01 — Label Registry HashMap

**Files:**
- Modify: `packages/crypto/src/labels.rs`

Currently (`labels.rs:441-449`), `label_to_id()` uses a linear scan via `.iter().position()` on an 81-element array.

- [ ] **Step 1: Replace linear scan with LazyLock HashMap**

  Add at the top of `labels.rs`:
  ```rust
  use std::collections::HashMap;
  use std::sync::LazyLock;
  ```

  Add after the `LABEL_REGISTRY` array definition:
  ```rust
  static LABEL_MAP: LazyLock<HashMap<&'static str, u8>> = LazyLock::new(|| {
      let mut map = HashMap::with_capacity(LABEL_REGISTRY.len());
      for (i, &label) in LABEL_REGISTRY.iter().enumerate() {
          if !label.is_empty() {
              map.insert(label, i as u8);
          }
      }
      map
  });
  ```

  Replace `label_to_id()`:
  ```rust
  pub fn label_to_id(label: &str) -> Option<u8> {
      if label.is_empty() {
          return None;
      }
      LABEL_MAP.get(label).copied()
  }
  ```

  `id_to_label()` remains unchanged — array index lookup is already O(1).

- [ ] **Step 2: Add Rust unit test**

  ```rust
  #[test]
  fn label_lookup_is_hashmap_backed() {
      // Verify that known labels resolve correctly
      assert_eq!(label_to_id("llamenos:note-key:v1"), Some(/* expected index */));
      // Verify unknown labels return None
      assert_eq!(label_to_id("llamenos:nonexistent:v1"), None);
      // Verify empty string returns None
      assert_eq!(label_to_id(""), None);
      // Verify round-trip for all labels
      for (i, &label) in LABEL_REGISTRY.iter().enumerate() {
          if !label.is_empty() {
              assert_eq!(label_to_id(label), Some(i as u8));
              assert_eq!(id_to_label(i as u8), Some(label));
          }
      }
  }
  ```

### Task 11: SIDE-02 — Sigchain Constant-Time Comparison

**Files:**
- Modify: `packages/crypto/src/sigchain.rs`

Two variable-time comparisons in `verify_sigchain_link`:
- Line 155: `link.signer_pubkey != expected_signer_pubkey` (pubkey)
- Line 169: `expected_hash != link.entry_hash` (SHA-256 hash)

Also the prev_hash comparison at line 264-272.

- [ ] **Step 1: Import ct_hex_eq and replace comparisons**

  At the top of `sigchain.rs`:
  ```rust
  use crate::ct_hex_eq;
  ```

  Replace line 155:
  ```rust
  if !ct_hex_eq(&link.signer_pubkey, expected_signer_pubkey) {
  ```

  Replace line 169:
  ```rust
  if !ct_hex_eq(&expected_hash, &link.entry_hash) {
  ```

  Replace the prev_hash comparison at line 264-272:
  ```rust
  match &link.prev_hash {
      Some(ph) if ct_hex_eq(ph, &prev_hash) => {}
      Some(_) => {
          return Err(CryptoError::InvalidInput(
              "previous hash mismatch in sigchain".into(),
          ))
      }
      None => {
          return Err(CryptoError::InvalidInput(
              "missing previous hash in sigchain".into(),
          ))
      }
  }
  ```

- [ ] **Step 2: Add Rust unit test**

  ```rust
  #[test]
  fn sigchain_hash_comparison_is_constant_time() {
      // Verify that ct_hex_eq is used by testing with known values
      let hash_a = "a".repeat(64);
      let hash_b = "b".repeat(64);
      let hash_a_copy = hash_a.clone();
      assert!(ct_hex_eq(&hash_a, &hash_a_copy));
      assert!(!ct_hex_eq(&hash_a, &hash_b));
      // Different lengths
      assert!(!ct_hex_eq("aabb", "aabbcc"));
  }
  ```

### Task 12: SIDE-03 — Shamir Verify Constant-Time (Desktop IPC)

**Files:**
- Modify: `apps/desktop/src/crypto.rs`

Currently (`crypto.rs:747`), `shamir_verify` uses `==` on hex strings.

- [ ] **Step 1: Replace with constant-time comparison**

  ```rust
  #[tauri::command]
  pub fn shamir_verify(x: u8, y_hex: String, commitment_hex: String) -> Result<bool, String> {
      let computed = shamir_commit(x, y_hex)?;
      let computed_bytes = hex::decode(&computed).map_err(|e| e.to_string())?;
      let expected_bytes = hex::decode(&commitment_hex).map_err(|e| e.to_string())?;
      if computed_bytes.len() != expected_bytes.len() {
          return Ok(false);
      }
      use subtle::ConstantTimeEq;
      Ok(computed_bytes.ct_eq(&expected_bytes).into())
  }
  ```

### Task 13: SIDE-04 — Hub Field Label Validation

**Files:**
- Modify: `apps/desktop/src/crypto.rs`

**Depends on:** Task 10 (SIDE-01 — HashMap makes `label_to_id` O(1))

Currently (`crypto.rs:531-584`), `encrypt_hub_field` and `decrypt_hub_field` accept an arbitrary label string from JS without validation against the registry.

- [ ] **Step 1: Add label validation to encrypt_hub_field**

  At the call site in `encrypt_hub_field`, before using the label:
  ```rust
  use llamenos_core::labels::label_to_id;

  if label_to_id(&label).is_none() {
      return Err("Unknown crypto label: not in LABEL_REGISTRY".into());
  }
  ```

  Note: Generic error message — do NOT include the rejected label value.

- [ ] **Step 2: Add label validation to decrypt_hub_field**

  Same pattern in `decrypt_hub_field`:
  ```rust
  if label_to_id(&label).is_none() {
      return Err("Unknown crypto label: not in LABEL_REGISTRY".into());
  }
  ```

- [ ] **Step 3: Add Rust unit test**

  ```rust
  #[test]
  fn hub_field_rejects_unknown_label() {
      // This tests at the label level since the IPC layer is hard to unit test
      use llamenos_core::labels::label_to_id;
      assert!(label_to_id("llamenos:hub-role-encrypt:v1").is_some());
      assert!(label_to_id("llamenos:fake-label:v1").is_none());
      assert!(label_to_id("").is_none());
      assert!(label_to_id("arbitrary-string").is_none());
  }
  ```

### Task 14: SIDE-05 — Device Keys Constant-Time Pubkey Comparison

**Files:**
- Modify: `packages/crypto/src/device_keys.rs`

Currently (`device_keys.rs:212-218`), pubkey comparison after PIN unlock uses `!=` on hex strings.

- [ ] **Step 1: Replace with constant-time comparison**

  At the top of `device_keys.rs`:
  ```rust
  use crate::ct_hex_eq;
  ```

  Replace lines 212-218:
  ```rust
  // Combine both comparisons to avoid short-circuit on first mismatch
  let sign_match = ct_hex_eq(&derived_signing_pubkey, &encrypted.state.signing_pubkey_hex);
  let enc_match = ct_hex_eq(&derived_encryption_pubkey, &encrypted.state.encryption_pubkey_hex);

  if !(sign_match && enc_match) {
      return Err(CryptoError::InvalidFormat(
          "derived public keys do not match stored state".into(),
      ));
  }
  ```

  Note: Using `&&` here is acceptable because `ct_hex_eq` already evaluates fully (no short-circuit within the comparison). The `&&` only determines which error path — both comparisons have already completed.

### Task 15: SIDE-06 — Recipient Matching Full Scan

**Files:**
- Modify: `packages/crypto/src/encryption.rs`

Currently (`encryption.rs:264-267`), `.find()` returns on first match, leaking recipient position via timing.

- [ ] **Step 1: Replace .find() with full-scan loop for note decryption**

  Replace the `.find()` pattern at line 264:
  ```rust
  let envelope = {
      let mut found: Option<&RecipientKeyEnvelope> = None;
      for e in reader_envelopes.iter() {
          if ct_hex_eq(&e.pubkey, reader_pubkey) {
              found = Some(e);
          }
          // Continue iterating — do NOT break
      }
      found.ok_or(CryptoError::DecryptionFailed)?
  };
  ```

  Add `use crate::ct_hex_eq;` at the top.

- [ ] **Step 2: Apply same pattern to decrypt_call_record**

  Find the equivalent `.find()` at line ~296 and apply the same full-scan pattern.

- [ ] **Step 3: Add Rust unit test**

  ```rust
  #[test]
  fn recipient_scan_iterates_all() {
      // Create test envelopes with known pubkeys
      let envelopes = vec![
          RecipientKeyEnvelope { pubkey: "aa".repeat(32), enc: vec![], ct: vec![] },
          RecipientKeyEnvelope { pubkey: "bb".repeat(32), enc: vec![], ct: vec![] },
          RecipientKeyEnvelope { pubkey: "cc".repeat(32), enc: vec![], ct: vec![] },
      ];
      // Verify the last one is found (would be fastest with early-return, slowest with full scan)
      let target = "cc".repeat(32);
      let mut found: Option<&RecipientKeyEnvelope> = None;
      for e in envelopes.iter() {
          if ct_hex_eq(&e.pubkey, &target) {
              found = Some(e);
          }
      }
      assert!(found.is_some());
      assert_eq!(found.unwrap().pubkey, target);
  }
  ```

### Phase 2 Verification

- [ ] Run `bun run crypto:test` — all existing + new tests pass
- [ ] Run `bun run crypto:clippy` — no warnings
- [ ] Run `bun run crypto:fmt` — formatted
- [ ] Verify `cargo build -p llamenos-desktop` compiles (desktop IPC changes)

---

## Phase 3: Fetch Safety (AST-04, AST-05)

**Findings:** AST-04 (safeFetch wrapper), AST-05 (Signal SSRF — BLOCKED on Epic E)

### Task 16: Create `safeFetch()` Wrapper (AST-04)

**Files:**
- Create: `apps/worker/lib/safe-fetch.ts`

- [ ] **Step 1: Implement safeFetch**

  ```typescript
  import { createLogger } from './logger'

  const logger = createLogger('safe-fetch')

  const DEFAULT_TIMEOUT_MS = 30_000  // 30 seconds
  const MAX_TIMEOUT_MS = 120_000     // 2 minutes (for large media downloads)

  export interface SafeFetchOptions extends RequestInit {
    /** Timeout in milliseconds (default: 30000, max: 120000) */
    timeoutMs?: number
    /** Whether to validate the URL against SSRF rules (default: false) */
    ssrfGuard?: boolean
  }

  export async function safeFetch(
    url: string | URL,
    options: SafeFetchOptions = {},
  ): Promise<Response> {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, ssrfGuard = false, ...fetchOptions } = options

    const effectiveTimeout = Math.min(Math.max(timeoutMs, 1000), MAX_TIMEOUT_MS)

    const parsed = new URL(url)

    if (ssrfGuard) {
      // Block private/reserved IP ranges — fail-closed
      // Full SSRF guard in Epic E; this is a baseline check
      const hostname = parsed.hostname
      if (
        hostname === 'localhost' ||
        hostname.startsWith('127.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('169.254.') ||
        hostname === '[::1]' ||
        hostname.startsWith('172.') && parseInt(hostname.split('.')[1], 10) >= 16 && parseInt(hostname.split('.')[1], 10) <= 31
      ) {
        throw new Error('SSRF: blocked request to private/reserved IP range')
      }
    }

    // Enforce HTTPS for external calls (allow localhost for internal services)
    if (
      parsed.hostname !== 'localhost' &&
      parsed.hostname !== '127.0.0.1' &&
      !parsed.hostname.startsWith('10.') &&
      !parsed.hostname.startsWith('192.168.') &&
      parsed.protocol !== 'https:'
    ) {
      throw new Error('External fetch requires HTTPS')
    }

    return fetch(url, {
      ...fetchOptions,
      signal: fetchOptions.signal ?? AbortSignal.timeout(effectiveTimeout),
    })
  }
  ```

  Note: If the caller already provides a signal (e.g., for manual abort), respect it. Otherwise use the timeout signal.

- [ ] **Step 2: Add unit test for safeFetch**

  Create `apps/worker/lib/__tests__/safe-fetch.test.ts`:
  - Test that timeout is enforced (mock a slow server)
  - Test that SSRF guard blocks `localhost`, `169.254.x.x`, `10.x.x.x`
  - Test that HTTPS is enforced for external URLs
  - Test that internal URLs (`localhost`, `127.0.0.1`) allow HTTP

### Task 17: Migrate External fetch() Calls to safeFetch

**Files:** ~38 files with fetch() calls (see File Map)

This is the largest task by file count but each change is mechanical. Group by timeout tier:

- [ ] **Step 1: Telephony adapters (30s default)**

  Files: `apps/worker/telephony/twilio.ts`, `signalwire.ts`, `vonage.ts`, `telnyx.ts`, `plivo.ts`, `bandwidth.ts`

  Replace all bare `fetch(url, options)` with `safeFetch(url, { ...options })`. These are API calls to external telephony providers — 30s default timeout is appropriate.

- [ ] **Step 2: Internal service calls (10s timeout)**

  Files: `apps/worker/telephony/sip-bridge-adapter.ts`, `apps/worker/lib/storage-admin.ts`, `apps/worker/lib/storage-manager.ts`

  Use `safeFetch(url, { ...options, timeoutMs: 10_000 })`. These are calls to co-located services (sip-bridge, RustFS) that should respond within seconds.

- [ ] **Step 3: Messaging adapters (30s default)**

  Files: All files in `apps/worker/messaging/` (sms/, whatsapp/, signal/, telegram/, rcs/), `delivery-router.ts`

  Replace with `safeFetch(url, options)`. Default 30s timeout.

- [ ] **Step 4: Signal media download (60s + SSRF guard)**

  File: `apps/worker/messaging/signal/adapter.ts` (line ~176)

  ```typescript
  const mediaResponse = await safeFetch(params.mediaUrl, {
    ssrfGuard: true,
    timeoutMs: 60_000,  // media downloads may be large
  })
  ```

  This is AST-05. The baseline SSRF guard is in safeFetch. Full SSRF guard depends on Epic E — add a `// TODO(Epic-E): Replace with fail-closed SSRF guard` comment.

- [ ] **Step 5: Health checks (5s timeout)**

  File: `apps/worker/routes/health.ts`

  Use `safeFetch(url, { timeoutMs: 5_000 })`. Health probes must be fast.

- [ ] **Step 6: Provider setup + misc (30s default)**

  Files: `apps/worker/services/provider-setup/providers/*.ts` (8 files), `utils.ts`, `signal-registration.ts`, `apps/worker/routes/provider-setup.ts`, `apps/worker/routes/setup.ts`, `apps/worker/services/user-notifications.ts`, `apps/worker/lib/transcription-client.ts`, `apps/worker/lib/fcm-client.ts`

- [ ] **Step 7: Grep verification — no bare fetch() remaining**

  Run: `grep -rn 'fetch(' apps/worker/ --include='*.ts' | grep -v 'safeFetch\|import\|mock\|test\|\.d\.ts\|node_modules\|// fetch'`

  The result should be empty (or contain only type references, not actual calls). Any remaining bare `fetch()` calls must be migrated or have a documented exception.

### Phase 3 Verification

- [ ] Run `bun run typecheck` — no type errors
- [ ] Run `bun run test:backend:bdd` — all tests pass
- [ ] Grep confirms no bare `fetch()` calls remain in `apps/worker/`

---

## Phase 4: Webhook Replay Protection & Middleware Pipeline

**Findings:** W05-H02, W05-H03, W05-M08, W05-M09, W05-M10

### Task 18: Database Migration — webhook_nonces Table

**Files:**
- Create: `apps/worker/db/schema/webhook-nonces.ts`
- Modify: `apps/worker/db/schema/index.ts`
- Create: `apps/worker/db/migrations/0014_webhook_nonces.sql`

- [ ] **Step 1: Create Drizzle schema**

  ```typescript
  // apps/worker/db/schema/webhook-nonces.ts
  import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'

  export const webhookNonces = pgTable('webhook_nonces', {
    nonceHash: text('nonce_hash').primaryKey(),
    provider: text('provider').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  }, (table) => [
    index('idx_webhook_nonces_expires').on(table.expiresAt),
  ])
  ```

- [ ] **Step 2: Export from schema index**

  In `apps/worker/db/schema/index.ts`, add:
  ```typescript
  export * from './webhook-nonces'
  ```

- [ ] **Step 3: Create SQL migration**

  ```sql
  -- 0014_webhook_nonces.sql
  -- Webhook replay protection: stores nonce hashes to detect duplicate deliveries

  CREATE TABLE webhook_nonces (
    nonce_hash  TEXT PRIMARY KEY,
    provider    TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL
  );

  CREATE INDEX idx_webhook_nonces_expires ON webhook_nonces (expires_at);
  ```

### Task 19: Webhook Replay Protection Service (W05-H02)

**Files:**
- Create: `apps/worker/services/webhook-replay.ts`

- [ ] **Step 1: Implement replay detection**

  ```typescript
  import { createHash } from 'crypto'
  import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
  import { webhookNonces } from '../db/schema/webhook-nonces'
  import { lt } from 'drizzle-orm'
  import { createLogger } from '../lib/logger'

  const logger = createLogger('webhook-replay')

  const DEFAULT_WINDOW_S = 300  // 5 minutes

  /**
   * Check if a webhook has already been processed.
   * Returns true if this is the first delivery (proceed with processing).
   * Returns false if this is a replay (skip processing, return idempotent 200).
   */
  export async function checkWebhookReplay(
    db: PostgresJsDatabase,
    provider: string,
    bodyText: string,
    windowSeconds: number = DEFAULT_WINDOW_S,
  ): Promise<boolean> {
    // Compute nonce hash from provider + body
    const nonceInput = `${provider}:${bodyText}`
    const hash = createHash('sha256').update(nonceInput).digest('hex')

    const expiresAt = new Date(Date.now() + windowSeconds * 1000)

    try {
      await db.insert(webhookNonces).values({
        nonceHash: hash,
        provider,
        expiresAt,
      })
      return true  // First time seen
    } catch (e: unknown) {
      if ((e as { code?: string }).code === '23505') {
        // Unique constraint violation = replay
        logger.info('Webhook replay detected', { provider })
        return false
      }
      throw e
    }
  }

  /**
   * Cleanup expired nonce records. Call periodically (e.g., every 60s).
   */
  export async function cleanupExpiredNonces(db: PostgresJsDatabase): Promise<number> {
    const result = await db.delete(webhookNonces).where(
      lt(webhookNonces.expiresAt, new Date())
    )
    return result.rowCount ?? 0
  }
  ```

- [ ] **Step 2: Set up periodic cleanup**

  In `apps/worker/app.ts` or the server startup file, add an interval:
  ```typescript
  // Cleanup expired webhook nonces every 60 seconds
  setInterval(async () => {
    try {
      const deleted = await cleanupExpiredNonces(db)
      if (deleted > 0) {
        logger.debug('Cleaned up expired webhook nonces', { deleted })
      }
    } catch (e) {
      logger.error('Failed to cleanup webhook nonces', { error: e })
    }
  }, 60_000)
  ```

### Task 20: Content-Type Enforcement Middleware (W05-M09)

**Files:**
- Create: `apps/worker/middleware/webhook-content-type.ts`

- [ ] **Step 1: Implement middleware**

  ```typescript
  import { createMiddleware } from 'hono/factory'
  import type { AppEnv } from '../types'

  const ALLOWED_CONTENT_TYPES: Record<string, string[]> = {
    twilio: ['application/x-www-form-urlencoded'],
    signalwire: ['application/x-www-form-urlencoded'],
    vonage: ['application/json'],
    telnyx: ['application/json'],
    plivo: ['application/x-www-form-urlencoded'],
    bandwidth: ['application/json'],
    signal: ['application/json'],
    whatsapp: ['application/json'],
    telegram: ['application/json'],
    rcs: ['application/json'],
  }

  export function enforceWebhookContentType(provider: string) {
    return createMiddleware<AppEnv>(async (c, next) => {
      const contentType = c.req.header('content-type')?.split(';')[0]?.trim()
      const allowed = ALLOWED_CONTENT_TYPES[provider]
      if (allowed && contentType && !allowed.includes(contentType)) {
        return c.text('Unsupported Media Type', 415)
      }
      return next()
    })
  }
  ```

### Task 21: IP Allowlist Middleware (W05-H03)

**Files:**
- Create: `apps/worker/middleware/webhook-ip-allowlist.ts`

- [ ] **Step 1: Implement opt-in IP allowlist middleware**

  ```typescript
  import { createMiddleware } from 'hono/factory'
  import type { AppEnv } from '../types'
  import { createLogger } from '../lib/logger'

  const logger = createLogger('webhook-ip')

  /**
   * Parse a CIDR notation (e.g., '54.172.60.0/23') and check if an IP is in range.
   */
  function isIpInCidr(ip: string, cidr: string): boolean {
    const [range, bits] = cidr.split('/')
    const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1) >>> 0
    const ipNum = ipToNum(ip)
    const rangeNum = ipToNum(range)
    return (ipNum & mask) === (rangeNum & mask)
  }

  function ipToNum(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
  }

  function isIpInCidrs(ip: string, cidrs: string[]): boolean {
    return cidrs.some((cidr) => isIpInCidr(ip, cidr))
  }

  /**
   * Get provider IP allowlist from env vars.
   * Format: TWILIO_WEBHOOK_IPS=54.172.60.0/23,34.203.250.0/23
   * Returns empty array if not configured (disabled).
   */
  function getProviderCidrs(env: Record<string, string | undefined>, provider: string): string[] {
    const key = `${provider.toUpperCase()}_WEBHOOK_IPS`
    const value = env[key]
    if (!value) return []
    return value.split(',').map((s) => s.trim()).filter(Boolean)
  }

  export function webhookIpAllowlist(provider: string) {
    return createMiddleware<AppEnv>(async (c, next) => {
      const cidrs = getProviderCidrs(c.env as Record<string, string | undefined>, provider)
      if (cidrs.length === 0) return next()  // Not configured — pass through

      const clientIp = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
      if (!clientIp || !isIpInCidrs(clientIp, cidrs)) {
        logger.warn('Webhook IP not in allowlist', { provider, clientIp })
        return c.text('Forbidden', 403)
      }
      return next()
    })
  }
  ```

### Task 22: Shared Webhook Auth Middleware (W05-M10)

**Files:**
- Create: `apps/worker/middleware/webhook-auth.ts`

- [ ] **Step 1: Create the unified webhook validation pipeline**

  This middleware combines: Content-Type → IP allowlist → signature validation → replay protection.

  ```typescript
  import { createMiddleware } from 'hono/factory'
  import type { AppEnv } from '../types'
  import { createLogger } from '../lib/logger'
  import { checkWebhookReplay } from '../services/webhook-replay'

  const logger = createLogger('webhook-auth')

  interface WebhookAuthOptions {
    /** Provider name for Content-Type and IP checks */
    provider: string
    /** Allowed Content-Type values */
    allowedContentTypes?: string[]
    /** Replay protection window in seconds (default: 300) */
    replayWindowSeconds?: number
    /** Skip replay check (e.g., if provider has built-in nonce) */
    skipReplay?: boolean
  }

  export function webhookAuth(options: WebhookAuthOptions) {
    return createMiddleware<AppEnv>(async (c, next) => {
      const { provider, allowedContentTypes, replayWindowSeconds = 300, skipReplay = false } = options

      // 1. Content-Type enforcement
      if (allowedContentTypes) {
        const contentType = c.req.header('content-type')?.split(';')[0]?.trim()
        if (contentType && !allowedContentTypes.includes(contentType)) {
          return c.text('Unsupported Media Type', 415)
        }
      }

      // 2. IP allowlist (configured via env var)
      const cidrKey = `${provider.toUpperCase()}_WEBHOOK_IPS`
      const cidrs = (c.env as Record<string, string | undefined>)[cidrKey]
      if (cidrs) {
        const { isIpInCidrs } = await import('./webhook-ip-allowlist')
        const clientIp = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
        if (!clientIp || !isIpInCidrs(clientIp, cidrs.split(',').map(s => s.trim()))) {
          logger.warn('Webhook IP not in allowlist', { provider })
          return c.text('Forbidden', 403)
        }
      }

      // 3. Replay protection
      if (!skipReplay) {
        const bodyText = await c.req.text()
        const db = c.get('services').db
        const isFirst = await checkWebhookReplay(db, provider, bodyText, replayWindowSeconds)
        if (!isFirst) {
          // Already processed — return idempotent 200 to stop retries
          return c.text('OK', 200)
        }
      }

      return next()
    })
  }
  ```

  Note: Signature validation remains in the adapter-specific middleware (telephony.ts, messaging/router.ts) because each adapter has its own validation logic. The shared middleware handles the common pipeline steps that run before/after signature validation.

### Task 23: Tighten Vonage/Telnyx Replay Window (W05-M08)

**Files:**
- Modify: `apps/worker/telephony/vonage.ts`
- Modify: `apps/worker/telephony/telnyx.ts`

- [ ] **Step 1: Reduce Vonage replay window from 300s to 60s**

  At `vonage.ts:351`, change:
  ```typescript
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false
  ```
  to:
  ```typescript
  const WEBHOOK_TIMESTAMP_MAX_AGE_S = 60
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > WEBHOOK_TIMESTAMP_MAX_AGE_S) return false
  ```

- [ ] **Step 2: Reduce Telnyx replay window from 300s to 60s**

  At `telnyx.ts:539`, same change:
  ```typescript
  const WEBHOOK_TIMESTAMP_MAX_AGE_S = 60
  if (Math.abs(now - ts) > WEBHOOK_TIMESTAMP_MAX_AGE_S) return false
  ```

### Task 24: Wire Up Webhook Middleware to Routes

**Files:**
- Modify: `apps/worker/routes/telephony.ts`
- Modify: `apps/worker/messaging/router.ts`

- [ ] **Step 1: Add replay protection to telephony webhooks**

  In `apps/worker/routes/telephony.ts`, after the existing signature validation middleware (lines 34-62), add replay protection. The cleanest approach is to integrate with the existing middleware rather than replacing it:

  After the signature validation passes (line 60), add:
  ```typescript
  // Replay protection — after signature validation
  const bodyText = await c.req.text()
  const db = c.get('services').db
  const isFirst = await checkWebhookReplay(db, adapter.providerName, bodyText)
  if (!isFirst) {
    return c.text('OK', 200)  // Idempotent ack for retries
  }
  ```

  Import `checkWebhookReplay` from `../services/webhook-replay`.

  Note: Must handle the body carefully — `c.req.text()` consumes the body. May need to clone the request or use a body cache middleware. Check if Hono supports re-reading the body (it does via `c.req.raw.clone()`).

- [ ] **Step 2: Add Content-Type enforcement to telephony webhooks**

  Add Content-Type checking before signature validation. The telephony provider determines the expected Content-Type (form-encoded for Twilio/SignalWire/Plivo, JSON for Vonage/Telnyx/Bandwidth).

- [ ] **Step 3: Add replay protection to messaging webhooks**

  In `apps/worker/messaging/router.ts`, after the signature validation at line 87-91, add the same replay protection pattern.

- [ ] **Step 4: Add Content-Type enforcement to messaging webhooks**

  Before the signature validation in the messaging webhook handler.

### Task 25: BDD Tests — Webhook Hardening

**Files:**
- Create: `packages/test-specs/features/security/webhook-replay.feature`

- [ ] **Step 1: Write BDD scenarios**

  ```gherkin
  @backend
  Feature: Webhook replay protection
    Webhooks from telephony and messaging providers must not be replayable.
    Replayed webhooks return idempotent 200 OK (not 403) to support provider retries.

    Scenario: First delivery of a webhook succeeds
      Given a configured telephony provider
      And a valid webhook with a unique body
      When the webhook is delivered for the first time
      Then the response status should be 200
      And the webhook should be processed

    Scenario: Replay of an identical webhook returns idempotent 200
      Given a configured telephony provider
      And a valid webhook that has already been processed
      When the same webhook is delivered again
      Then the response status should be 200
      And the webhook should NOT be processed again

    Scenario: Webhook with wrong Content-Type is rejected
      Given a configured telephony provider expecting form-encoded content
      And a webhook with Content-Type "application/json"
      When the webhook is delivered
      Then the response status should be 415

    Scenario: Webhook from non-allowlisted IP is rejected
      Given a configured telephony provider
      And IP allowlisting is enabled via environment variable
      And the request comes from a non-allowlisted IP
      When the webhook is delivered
      Then the response status should be 403

    Scenario: Vonage webhook with timestamp older than 60 seconds is rejected
      Given a configured Vonage telephony provider
      And a webhook with a timestamp 90 seconds in the past
      When the webhook is delivered
      Then the response status should be 403
  ```

- [ ] **Step 2: Implement step definitions**

  Add step definitions matching the existing BDD test patterns (database-per-test isolation, real API calls).

### Phase 4 Verification

- [ ] Run database migration locally: `docker compose -f deploy/docker/docker-compose.dev.yml up -d && bun run dev:server` (auto-migrates)
- [ ] Run `bun run typecheck`
- [ ] Run `bun run test:backend:bdd` — all existing + new tests pass
- [ ] Manual smoke test: send a webhook twice, verify second returns 200 without processing

---

## Cross-Phase Verification

- [ ] Run `bun run crypto:test` — all Rust tests pass
- [ ] Run `bun run crypto:clippy` — no warnings
- [ ] Run `bun run typecheck` — no TS errors
- [ ] Run `bun run test:backend:bdd` — all BDD scenarios pass (including new security features)
- [ ] Run `bun run test:build` — Vite build succeeds
- [ ] Grep: no bare `fetch()` in `apps/worker/` (all migrated to `safeFetch`)
- [ ] Grep: no `String(err)` in error responses to clients in `sip-bridge/`
- [ ] Grep: no `== ` or `!= ` on hex-encoded secrets in `packages/crypto/src/` (use `ct_hex_eq`)

---

## Blocked Items

| Finding | Blocked On | Partial Fix Available |
|---------|-----------|----------------------|
| AST-05 (Signal media SSRF) | Epic E — fail-closed SSRF guard | Yes: baseline private IP block in `safeFetch` + timeout. Full SSRF guard (DNS rebinding, redirect following) requires Epic E. |
| SIDE-07 (SFrame raw nonce) | Epic B — H10 | No action in this epic. |

---

## Summary

| Phase | Findings | Estimated Complexity | Parallelizable |
|-------|----------|---------------------|----------------|
| 1 — Error Disclosure | AST-01, AST-02, AST-03, W05-H01, W05-M05, W05-M03 | Low — mostly string replacements | Tasks 1-6 fully parallel |
| 2 — Side Channels | SIDE-01 through SIDE-06 | Medium — Rust changes, subtle crate | Tasks 10-15 parallel (except 13 depends on 10) |
| 3 — Fetch Safety | AST-04, AST-05 | High — 38+ files to migrate | Task 16 first, then 17 (subtasks parallel) |
| 4 — Webhook Hardening | W05-H02, W05-H03, W05-M08, W05-M09, W05-M10 | High — new middleware + DB migration | Tasks 18-21 parallel, then 22-24 |
