# Desktop Client Security Audit — Wave 3 (2026-06-25)

**Scope:** `apps/desktop/` (Tauri v2 Rust backend), `src/client/` (React frontend)
**Branch:** `audit-desktop-w3` from `d076a731` (main)
**Prior audits:** 2026-05-18 (initial), 2026-06-09 (wave 2 — backend focus)
**Commits since last desktop audit:** ~170 (includes security fixes from wave 1/2)

---

## Executive Summary

Wave 3 audit found **0 CRITICAL**, **4 HIGH**, **8 MEDIUM**, and **13 LOW** findings across IPC commands, isolation layer, CSP, platform abstraction, WebSocket, and local storage. The desktop client has a strong security architecture — device private keys never enter the webview, the Tauri isolation pattern enforces an IPC command allowlist, CSP is strict with no `unsafe-inline`/`unsafe-eval`, and WebSocket auth uses challenge-response with Ed25519. The most urgent fix is the isolation allowlist drift (12 IPC commands silently blocked in production), followed by symmetric key material transiting through JavaScript.

---

## CRITICAL

No critical findings.

---

## HIGH

### H1: Isolation allowlist missing 12 IPC commands — features silently broken
**File:** `apps/desktop/isolation/index.html`

The isolation hook `ALLOWED_COMMANDS` set is missing 12 commands registered in `lib.rs` via `generate_handler!`. These commands pass Rust-side registration but are **blocked by the isolation layer** at runtime in production builds:

- `device_import_and_load` (C06 device import)
- `generate_ephemeral_ed25519` (C06 ephemeral keypair)
- `generate_backup_from_state` (C06 backup)
- `encrypt_seed_for_provisioning` (Epic 355)
- `wipe_keys` (H17 panic wipe)
- `provision_encrypt_for_device` (provisioning)
- `provision_create_session` (provisioning)
- `provision_compute_sas` (provisioning)
- `provision_decrypt_and_import` (provisioning)
- `encrypt_hub_field` (hub field encryption)
- `decrypt_hub_field` (hub field decryption)
- `derive_sas` (SAS emoji verification)

**Impact:** Device provisioning, key backup, panic wipe (`wipe_keys`), hub field encryption, and SAS verification all fail silently in production. The `wipe_keys` gap is most severe — the emergency wipe flow does not work.

**Fix:** Add all 12 commands to the `ALLOWED_COMMANDS` set in `isolation/index.html`.

### H2: `sframe_derive_key` returns symmetric key material to the webview
**File:** `apps/desktop/src/crypto.rs:453-463`

The SFrame key derivation command returns the derived AES key as a hex string directly to JavaScript. Unlike hub keys and PUK seeds (which are correctly kept in CryptoState), this symmetric key enters the webview where it could be exfiltrated via XSS or a compromised dependency.

**Fix:** Move SFrame encrypt/decrypt operations into Rust. Store the derived SFrame key in `CryptoState` (keyed by `call_id + participant_index`) and expose only `sframe_encrypt`/`sframe_decrypt` IPC commands. If the key must reach WebRTC's `RTCRtpScriptTransform`, document as an accepted risk with justification.

### H3: `hpke_open_key_from_state` returns unwrapped 32-byte key to the webview
**File:** `apps/desktop/src/crypto.rs:317-329`

This generic HPKE-open command returns a 32-byte key as hex to JavaScript. While `hpke_unwrap_and_set_hub_key` and `puk_unwrap_seed_from_state` correctly store keys in CryptoState without returning them, this command leaks arbitrary unwrapped keys to the webview.

**Fix:** Audit all callers. Replace with purpose-specific commands that store keys in CryptoState (matching the hub key and PUK seed pattern). If used for items_key or content keys that must reach JS for note decryption, document as accepted risk.

### H4: `generate_ephemeral_ed25519` returns private seed to the webview
**File:** `apps/desktop/src/crypto.rs:1044-1056`

This command generates an Ed25519 keypair and returns `seedHex` (the private signing seed) to JavaScript. The comment says "seed intentionally returned for ephemeral provisioning" but this violates the core invariant that secrets never leave Rust.

**Fix:** Keep the seed in CryptoState and HPKE-wrap it for the target user entirely within Rust (similar to `provision_encrypt_for_device`). If the seed must enter JS for a legitimate protocol reason, document the threat model exception with justification.

---

## MEDIUM

### M1: Mutex `.unwrap()` calls can panic and cascade-crash the process
**File:** `apps/desktop/src/crypto.rs` — 25+ locations (lines 79, 81-85, 92, 100, 108, 127-128, 148-149, 154, 163-164, 174, 185-186, 206, 344, 365, 379, 399, 527, 538, 550, 582, 595, 957, 1035-1036, 1211, 1224, 1271, 1306-1307)

Every `Mutex::lock().unwrap()` panics if the mutex is poisoned (which happens if any thread panics while holding the lock). One panic in any IPC handler poisons the mutex, and **all subsequent IPC calls crash the process**.

**Fix:** Use `parking_lot::Mutex` (no poisoning semantics) or `.lock().unwrap_or_else(|e| e.into_inner())` to recover from poisoned mutexes.

### M2: `decrypt_server_event` uses wrong domain separation label
**File:** `apps/desktop/src/crypto.rs:1394`

AAD is constructed as `format!("{}:{}", llamenos_core::LABEL_HUB_EVENT, epoch)`. The crate defines `LABEL_HUB_EVENT_EPOCH` (`"llamenos:hub-event-epoch:v1"`) as the proper label for epoch-keyed events. Using the base label breaks interop with any server/client using the correct label.

**Fix:** Change to `format!("{}:{}", llamenos_core::labels::LABEL_HUB_EVENT_EPOCH, epoch)` and verify server uses the same format.

### M3: `set_server_event_keys` accepts plaintext keys from JavaScript over IPC
**File:** `apps/desktop/src/crypto.rs:567-583`

Server event keys arrive as plaintext hex from JavaScript, unlike hub keys which use `hpke_unwrap_and_set_hub_key` to decrypt directly into CryptoState. The keys also persist in React state (`AuthState.serverEventKeyHex`) for the lifetime of the auth component.

**Related file:** `src/client/lib/auth.tsx:33-34, 175-176, 273-274`
**Related file:** `src/client/routes/__root.tsx:196-210`

**Fix:** Add an `hpke_unwrap_and_set_server_event_keys` command that takes HPKE envelopes and decrypts directly into CryptoState. Null out `serverEventKeyHex` from React state after the IPC call succeeds.

### M4: AES-GCM content keys transit through JavaScript memory
**File:** `src/client/lib/platform.ts:813-832`

`aesGcmEncrypt` and `aesGcmDecrypt` use WebCrypto with hex key material as parameters. Per-note and per-message content keys briefly exist as hex strings in JS memory. Used in `encryptNote`, `decryptNote`, `encryptMessage`, `decryptMessage`, `decryptCallRecord`, `file-crypto.ts`, and `signal-notification-section.tsx`.

**Fix:** Move AES-GCM content encryption into Rust. Add IPC commands like `encrypt_note_content` / `decrypt_note_content` that take plaintext + key parameters and keep ephemeral content keys entirely in Rust. This is a hardening improvement — the keys are random per-operation and the device key itself never enters JS.

### M5: `generate_backup_from_state` accepts unused `pubkey` and `pin` parameters
**File:** `apps/desktop/src/crypto.rs:1061-1115`

The function accepts `pubkey: String` and `pin: String` parameters that are silently discarded (lines 1111-1112: `let _ = pubkey; let _ = pin;`). The PIN is transmitted over IPC unnecessarily. A caller may believe these parameters provide additional protection.

**Fix:** Remove unused `pubkey` and `pin` parameters from the function signature. Add them back when the implementation uses them.

### M6: Recovery group shares returned as plaintext to the webview
**File:** `apps/desktop/src/crypto.rs:883-908`

The recovery group private key is Shamir-split in Rust (good), but shares are returned to JavaScript as plaintext hex. An attacker with JS execution can collect all shares from the IPC response.

**Fix:** HPKE-wrap each share for its designated custodian's public key within Rust, returning only encrypted envelopes.

### M7: Remote device wipe with no secondary confirmation
**File:** `src/client/lib/relay/connection.ts:316-319, 334-355`

A `device:wipe` event from the WebSocket triggers immediate key destruction. While signed by the server (Ed25519 verified), a compromised server or stolen server signing key could remotely wipe all connected clients.

**Fix:** Require a secondary confirmation (e.g., wipe event includes hash of target device pubkey to prevent broadcast wipe). Log the wipe event before executing.

### M8: Crash reports may contain sensitive stack traces
**File:** `src/client/lib/crash-reporting.ts:70-77`

Crash reports in localStorage (`crash-reports-pending`) include `errorMessage` and `stackTrace`. Error messages from crypto operations or API calls could contain endpoint URLs, pubkey hex strings, or operation context.

**Fix:** Sanitize error messages before storing: strip hex strings (32+ chars), URL path segments with IDs, and query parameters.

---

## LOW

### L1: No PIN complexity or length validation in Rust
**File:** `apps/desktop/src/crypto.rs:117-131, 143-195`

`device_generate_and_load` and `unlock_with_pin` accept any string as PIN with no minimum length. A single-character or empty PIN provides negligible protection even with Argon2id. Client-side validation alone is insufficient since IPC commands can be called directly.

**Fix:** Enforce minimum PIN length (e.g., 6 characters) in the Rust IPC handler.

### L2: `gf256_inv` uses `assert!` that panics on zero input
**File:** `apps/desktop/src/crypto.rs:719`

`assert!(a != 0, "Cannot invert zero in GF(256)")` panics on zero x-value. Malicious or corrupted Shamir share data from the webview could trigger a process crash.

**Fix:** Replace with `if a == 0 { return Err(...) }` and propagate the error.

### L3: `hpke_open_from_state` accepts any label without allowlist
**File:** `apps/desktop/src/crypto.rs:283-294`

Generic HPKE-open returns arbitrary decrypted plaintext to JavaScript for any `expected_label`. A compromised webview could call this with any label to decrypt content it shouldn't access.

**Fix:** Add an allowlist of permitted labels (e.g., note-related labels only), rejecting others.

### L4: Store plugin loaded but no capability permissions granted
**File:** `apps/desktop/src/lib.rs:26`, `apps/desktop/capabilities/default.json`

`tauri-plugin-store` is initialized but has zero permissions in the capability file. The plugin is loaded for no observable reason, adding attack surface.

**Fix:** If unused, remove from `lib.rs` and `Cargo.toml`. If needed for Rust-side use, document why.

### L5: CSP `font-src` allows `data:` URIs
**File:** `apps/desktop/tauri.conf.json:26`

`font-src: 'self' data:` allows inline base64-encoded fonts. Minor exfiltration vector via CSS injection.

**Fix:** If fonts are bundled as files, remove `data:` from `font-src`.

### L6: CSP `img-src` allows `data:` URIs
**File:** `apps/desktop/tauri.conf.json:24`

`img-src: 'self' asset: http://asset.localhost blob: data:` allows data URI images. Commonly needed for avatars/icons but slightly expands attack surface.

**Fix:** Evaluate whether `data:` is actually needed for images. If not, remove it.

### L7: Dependency version ranges too broad in Cargo.toml
**File:** `apps/desktop/Cargo.toml`

All Tauri plugins use version `"2"` (equivalent to `>=2.0.0, <3.0.0`). `cargo update` could pull in a compromised minor version.

**Fix:** Pin to specific minor versions for security-critical dependencies (e.g., `"=2.2.1"` for `tauri`, `tauri-plugin-stronghold`, `aes-gcm`).

### L8: No `cargo audit` in CI pipeline
No evidence of `cargo audit` or `cargo deny` in the build pipeline. Security-critical crates (`aes-gcm`, `ed25519-dalek`, `x25519-dalek`, `argon2`) need vulnerability checking.

**Fix:** Add `cargo audit` to CI. Consider `cargo deny` for license and advisory checking.

### L9: `encryptedNsec` variable name persists in provisioning code
**Files:** `src/client/routes/link-device.tsx:39,63,67,70,93,99,159`, `src/client/lib/provisioning.ts:63,135,145`

Despite the nsec purge (PR #510), device provisioning still uses `encryptedNsec` as a variable/field name. The actual data is an encrypted Ed25519 signing seed. Misleading for future developers.

**Fix:** Rename to `encryptedSigningSeed` or `encryptedDeviceKey`.

### L10: Lock delay preference in localStorage is not integrity-protected
**File:** `src/client/lib/key-manager.ts:43-61`

`llamenos-lock-delay` in localStorage controls how quickly the app locks (0 to 600000ms). An attacker with localStorage write access (XSS) could extend the unlock window.

**Fix:** Store in Tauri Store (encrypted) or cap lower for high-security deployments.

### L11: DOMPurify configured but never used in client components
**File:** `src/client/lib/sanitize.ts`

`sanitizeHtml()` is defined with a strict DOMPurify allowlist but has zero imports across `.tsx` files. Dead code — future HTML-rendering features may forget to use it.

**Fix:** Either use `sanitizeHtml` where needed or add an ESLint rule to require sanitization for dynamic HTML rendering.

### L12: Unencrypted security event export
**File:** `src/client/routes/security/history.tsx:41-50`

The `exportJson()` function exports security audit events as plaintext JSON. Notes export (`notes.tsx:275`) correctly encrypts before download, but security event export does not. Security events contain metadata about login activity, device information, and operational data.

**Fix:** Either remove this export capability or encrypt the output like notes export does.

### L13: Draft encryption uses broken deprecated functions
**Files:** `src/client/lib/use-draft.ts:2,34,59`, `src/client/lib/platform.ts:1034-1043`

`encryptDraft` and `decryptDraft` both throw `Error('... removed in v3')`. Draft auto-save silently fails (catch at line 63 swallows the error). Drafts are never persisted.

**Fix:** Implement v3 draft encryption using hub field encryption or HPKE, or remove the draft feature entirely.

---

## Positive Security Observations

The codebase demonstrates strong security engineering:

1. **Device key isolation** — `DeviceSecrets` never leaves Rust memory. The `with_secrets` pattern ensures controlled access.
2. **Tauri isolation pattern** enabled with `freezePrototype: true` and explicit IPC command allowlist.
3. **CSP is strict** — no `unsafe-inline`/`unsafe-eval` (only `wasm-unsafe-eval` for WASM Whisper), `object-src: 'none'`, `form-action: 'none'`, `frame-ancestors: 'none'`.
4. **Single-instance enforcement** prevents multi-window attacks.
5. **PIN lockout with exponential backoff** and key wipe after 10 failures.
6. **Crypto state zeroization** on window destroy and quit events.
7. **Hub key, PUK seed, and recovery group key** all correctly stored in CryptoState rather than returned to JS.
8. **Domain separation labels** validated against the registry in `encrypt_hub_field`/`decrypt_hub_field`.
9. **Constant-time comparison** used in `shamir_verify` via `subtle::ConstantTimeEq`.
10. **WebSocket challenge-response auth** with domain-separated Ed25519 signatures and event signature verification.
11. **Event deduplication** with time-bucketed replay prevention (5-minute window).
12. **Open redirect protection** — `returnTo` validated via `isSafeRelativePath()` with comprehensive test coverage.
13. **Stronghold vault** for key persistence, with explicit rejection of localStorage fallback.
14. **Session tokens** use `sessionStorage` (cleared on tab close).
15. **Dependency overrides** pin 18 transitive dependencies to CVE-patched versions.

---

## Changes Since May 18, 2026

~170 commits since last audit. Key security-relevant desktop/client changes:

| Commit | Description | Status |
|--------|-------------|--------|
| `df5ccc77` | Pubkey format detection + low-order point checks in provisioning | Verified |
| `fabe413c` | IPC commands made stateful — keys never cross JS bridge | Verified |
| `2e8ea3ba` | Removed demo private key seeds from client bundle | Verified |
| `e7e0749e` | Removed IPC commands that leaked private keys to webview | Verified |
| `4b955f3e` | Replaced bech32 nsec encoding with raw bytes in provisioning | Verified (naming lag — L9) |
| `591877a6` | Prevented open redirect in OAuth callback and login return path | Verified |
| `15ac10a3` | PIN attempt counter persists across refreshes | Verified |
| `f5288a2f` | Hardened scanning pipeline, added DOMPurify | Verified (unused — L11) |

All security fixes from wave 1/2 audits are properly implemented. No regressions found.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 4 |
| MEDIUM | 8 |
| LOW | 13 |
| **Total** | **25** |

The desktop client's strongest asset is its defense-in-depth: Tauri isolation pattern → CSP → IPC command allowlist → CryptoState key isolation → PIN lockout → Stronghold vault. The highest priority fix is H1 (isolation allowlist drift) which silently breaks 12 features including emergency key wipe.
