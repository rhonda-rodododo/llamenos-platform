# Security Remediation — Desktop / Tauri IPC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all paths where the nsec or secretKeyHex crosses the Tauri IPC boundary, remove dead IPC commands, harden CSP, and migrate PIN counter to tamper-resistant Stronghold storage.

**Architecture:** The Rust `CryptoState` singleton holds the nsec exclusively in native memory — it must never be serialised over IPC. New atomic keypair commands (`generate_keypair_and_load`, `pubkey_from_nsec`, `generate_backup_from_state`) absorb the JS-side orchestration so that secret material never enters the webview. The isolation allowlist is the enforcement boundary and must exactly mirror `generate_handler![]`.

**Tech Stack:** Rust/Tauri v2 (`tauri-plugin-stronghold = "2"`, `tauri-plugin-store = "2"`), TypeScript/React (TanStack Router, platform.ts abstraction), Playwright E2E tests with WASM mock layer.

> **Codebase audit 2026-03-21:** All desktop findings remain open. Two have partial mitigations in place — these still require the full fix:
> - **CRIT-D2** (`get_nsec_from_state`): The IPC command exists and is registered. It is now token-gated (one-time use via `.take()`), but the spec requires full removal. The token gate is a defense-in-depth improvement, not the final fix. Task 2 still applies.
> - **CRIT-D3** (`create_auth_token`): Still registered in `generate_handler![]`. Currently only called for the sign-in flow, but the command itself exposes a dangerous capability. Task 2 still applies.
> - **HIGH-D2** (dead commands in isolation allowlist): `ecies_unwrap_key`, `decrypt_note`, `decrypt_message` appear in the allowlist but are NOT registered — they are harmless (Tauri rejects unregistered commands regardless) but still need cleanup per spec.

---

## Source Files

| File | Role |
|------|------|
| `apps/desktop/src/crypto.rs` | All Tauri command implementations |
| `apps/desktop/src/lib.rs` | `generate_handler![]` registration and plugin setup |
| `apps/desktop/isolation/index.html` | IPC allowlist enforcement (sandboxed iframe) |
| `apps/desktop/tauri.conf.json` | CSP, updater pubkey |
| `apps/desktop/capabilities/default.json` | Tauri capability permissions |
| `apps/desktop/Cargo.toml` | Rust dependencies (`tauri-plugin-stronghold = "2"`) |
| `src/client/lib/platform.ts` | TS → IPC bridge (single entry point for all platform calls) |
| `src/client/lib/auth.tsx` | `signIn()` — currently calls `keyPairFromNsec` + `createAuthTokenStateless` |
| `src/client/lib/key-manager.ts` | `importKey()` — currently calls `keyPairFromNsec` then `encryptWithPin` |
| `src/client/lib/backup.ts` | `createBackup(nsec, ...)` — nsec passed from JS |
| `src/client/lib/api.ts` | `redeemInvite()` — takes optional `secretKeyHex` |
| `src/client/routes/onboarding.tsx` | Uses `generateKeyPair()`, stores `nsec` + `secretKeyHex` in state |
| `src/client/routes/users.tsx` | Uses `generateKeyPair()`, passes `kp.nsec` |
| `src/client/components/setup/AdminBootstrap.tsx` | Uses `generateKeyPair()` + `createAuthTokenStateless(kp.secretKeyHex, ...)` |
| `tests/mocks/tauri-core.ts` | WASM mock handlers for Playwright (exposes `window.__TEST_INVOKE`) |

## Current Security Gaps

| ID | Severity | Description |
|----|----------|-------------|
| CRIT-D1 | Critical | `generate_keypair` and `key_pair_from_nsec` return full `KeyPair` including `secretKeyHex` and `nsec` over IPC to the webview |
| CRIT-D2 | Critical | `get_nsec_from_state` is registered in `generate_handler![]` and the isolation allowlist — leaks nsec to JS |
| CRIT-D3 | Critical | `create_auth_token` accepts `secret_key_hex` as IPC arg — secret crosses IPC boundary |
| HIGH-D1 | High | Isolation allowlist contains 6 dead commands (`ecies_unwrap_key`, `decrypt_note`, `decrypt_message`, `encrypt_with_pin`, `decrypt_with_pin`, `get_public_key`) deregistered from handler but still callable |
| HIGH-D2 | High | `request_provisioning_token` is in `generate_handler![]` but NOT in isolation allowlist — inconsistency |
| HIGH-D3 | High | PIN attempt counter (`pin_failed_attempts`, `pin_lockout_until`) stored in `settings.json` Tauri Store — mutable from JS via `plugin:store|set` |
| HIGH-D4 | High | `process:allow-restart` in capabilities — no caller exists |
| MED-D1 | Medium | `'unsafe-inline'` in `style-src` CSP — permits injected styles (inline `style={}` usage confirmed in codebase — must resolve first) |
| MED-D2 | Medium | Encrypted nsec blob in `keys.json` Tauri Store — should be in Stronghold vault |
| MED-D3 | Medium | `window.__TEST_INVOKE` uses a string key — guessable by malicious scripts |
| CRIT-D4 | Critical | Updater pubkey is a placeholder string, not a real key |

---

## Task 1: CRIT-D4 — Real Updater Signing Key

**Files:** `apps/desktop/tauri.conf.json`

**Context:** Line 70 currently reads `"pubkey": "REPLACE_WITH_PUBKEY_FROM_TAURI_SIGNER_GENERATE"`. Without a real key, the updater will either reject all updates or accept unsigned updates. This is a one-time manual step requiring a local keygen tool.

### Steps

- [ ] **1.1** On the developer machine (or a trusted build machine), generate the updater keypair:
  ```bash
  cargo tauri signer generate -w ~/.tauri/llamenos-updater.key
  ```
  This prints the public key to stdout and writes the private key to `~/.tauri/llamenos-updater.key`. Copy the public key output (begins with `dW5...` — a base64 string).

- [ ] **1.2** In `apps/desktop/tauri.conf.json`, replace line 70:
  ```json
  "pubkey": "REPLACE_WITH_PUBKEY_FROM_TAURI_SIGNER_GENERATE",
  ```
  with:
  ```json
  "pubkey": "<paste-actual-public-key-here>",
  ```

- [ ] **1.3** Store the private key as a CI secret named `TAURI_SIGNING_PRIVATE_KEY`. The value is the base64 content of `~/.tauri/llamenos-updater.key`. In GitHub Actions this is set under Settings → Secrets and variables → Actions. The CI workflow must pass this as `env: TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}` to the tauri build step.

- [ ] **1.4** Verify: `bun run tauri:build` completes without "pubkey not set" warnings. The produced `.tar.gz` update artifact will contain a `.sig` file.

> **Note:** This task is manual — the private key must never be committed. Do not automate key generation in CI (it would regenerate on every run, breaking signature continuity).

---

## Task 2: CRIT-D2 + CRIT-D3 + HIGH-D2 — Remove Dangerous IPC Commands and Sync Allowlist

**Files:** `apps/desktop/src/crypto.rs`, `apps/desktop/src/lib.rs`, `apps/desktop/isolation/index.html`, `src/client/lib/platform.ts`

**Context:**
- `get_nsec_from_state` (line 419 crypto.rs, line 167 lib.rs, line 43 isolation/index.html) leaks the nsec bech32 string to JavaScript. This is replaced by `generate_backup_from_state` (Task 3).
- `request_provisioning_token` (line 404 crypto.rs, line 166 lib.rs) was the companion command — remove together with `get_nsec_from_state`. The provisioning flow uses `encrypt_nsec_for_provisioning` instead, which never exposes the nsec.
- `create_auth_token` (line 562 crypto.rs, line 174 lib.rs, line 51 isolation/index.html) accepts `secret_key_hex` as an IPC argument. Must be removed; auth token creation moves to stateful `create_auth_token_from_state` after key is loaded.
- `encrypt_nsec_for_provisioning` (line 441 crypto.rs, line 168 lib.rs) is in `generate_handler![]` but NOT in the isolation allowlist — add it.
- Six dead stateless commands are in the isolation allowlist but not in `generate_handler![]`: `ecies_unwrap_key`, `decrypt_note`, `decrypt_message`, `encrypt_with_pin`, `decrypt_with_pin`, `get_public_key`. Remove from allowlist.

### Steps

**2.1 — Enumerate callers before touching anything:**
```bash
grep -rn "getNsecFromState\|get_nsec_from_state" src/client/ apps/desktop/src/
grep -rn "createAuthTokenStateless\|create_auth_token[^_]" src/client/ apps/desktop/src/
grep -rn "requestProvisioningToken\|request_provisioning_token" src/client/ apps/desktop/src/
```
Expected: all callers are in `platform.ts` only. If any callers appear in other files, fix those first.

- [ ] **2.2 — Remove from `generate_handler![]` in `apps/desktop/src/lib.rs`:**

  Delete these 3 lines from the handler list (lines 166–167, 174):
  ```rust
  crypto::request_provisioning_token,
  crypto::get_nsec_from_state,
  // ...
  crypto::create_auth_token, // Used during sign-in before CryptoState is loaded
  ```

  After removal, the stateless section of the handler should be:
  ```rust
  // Stateless commands — public-key-only, validation, or sign-in flow only
  crypto::ecies_wrap_key,
  crypto::encrypt_note,
  crypto::encrypt_message,
  crypto::generate_keypair,
  crypto::verify_schnorr,
  crypto::is_valid_nsec,
  crypto::key_pair_from_nsec,
  ```
  (Note: `generate_keypair` and `key_pair_from_nsec` are still here but will be removed in Task 3.)

- [ ] **2.3 — Add `encrypt_nsec_for_provisioning` and `decrypt_provisioned_nsec` to isolation allowlist in `apps/desktop/isolation/index.html`:**

  **Prerequisite — verify both commands are registered before allowlisting them:**
  ```bash
  grep 'decrypt_provisioned_nsec' apps/desktop/src/lib.rs
  grep 'encrypt_nsec_for_provisioning' apps/desktop/src/lib.rs
  ```
  Both must appear inside `generate_handler![]`. If `decrypt_provisioned_nsec` is absent from `generate_handler![]`, do NOT add it to the allowlist — adding an unregistered command to the allowlist has no effect and creates a false sense of security. Register it in the handler first (or omit it from the allowlist entirely until it is registered).

  Once confirmed present in the handler, add to the stateful commands section of the allowlist (after `'rewrap_file_key_from_state'`, before the comment line):
  ```js
  'encrypt_nsec_for_provisioning',
  'decrypt_provisioned_nsec',
  ```
  These are already in `generate_handler![]` (lines 168–169 lib.rs) but were absent from the allowlist (HIGH-D2).

- [ ] **2.4 — Remove dangerous and dead commands from isolation allowlist in `apps/desktop/isolation/index.html`:**

  Remove these lines from the allowlist (currently lines 43–58):
  ```js
  'get_nsec_from_state',
  // and from the stateless section:
  'ecies_unwrap_key',
  'decrypt_note',
  'decrypt_message',
  'create_auth_token',
  'encrypt_with_pin',
  'decrypt_with_pin',
  'get_public_key',
  ```
  Also remove `'request_provisioning_token'` if it was ever present (it was not in the current allowlist — confirmed by inspection).

  The stateless commands section of the allowlist after this task (before Task 3 changes) should contain only:
  ```js
  'ecies_wrap_key',
  'encrypt_note',
  'encrypt_message',
  'generate_keypair',
  'verify_schnorr',
  'is_valid_nsec',
  'key_pair_from_nsec',
  ```

- [ ] **2.5 — Remove `getNsecFromState`, `createAuthTokenStateless` from `src/client/lib/platform.ts`:**

  Delete the entire `getNsecFromState` function (lines 594–602):
  ```typescript
  export async function getNsecFromState(): Promise<string> {
    // ... entire function body
  }
  ```

  Delete the entire `createAuthTokenStateless` function (lines 167–183):
  ```typescript
  export async function createAuthTokenStateless(
    // ... entire function body
  ): Promise<string> {
  ```

  Also remove `getPublicKey` (the stateless version, lines 117–123 — it calls dead `get_public_key` IPC command):
  ```typescript
  export async function getPublicKey(secretKeyHex: string): Promise<string> {
    // ... entire function body
  }
  ```

  Remove the `PlatformKeyPair` interface (lines 68–73) — it will no longer be needed once Task 3 removes `generateKeyPair` and `keyPairFromNsec`. Do this as part of Task 3 to avoid breaking imports.

- [ ] **2.6 — Mark the Rust functions `#[allow(dead_code)]` or delete:**

  In `apps/desktop/src/crypto.rs`:
  - `get_nsec_from_state` (lines 419–434): Change the `#[tauri::command]` attribute to `#[allow(dead_code)]`. Keep the function for unit tests only, or delete it entirely (preferred — it's replaced by `generate_backup_from_state` in Task 3).
  - `request_provisioning_token` (lines 403–411): Mark `#[allow(dead_code)]` or delete.
  - `create_auth_token` (lines 562–571): This is a stateless function. It already has a comment saying it's for sign-in. Keep the function body (unit tests reference it) but add `#[allow(dead_code)]` and remove `#[tauri::command]`.

  Preferred: delete `get_nsec_from_state` and `request_provisioning_token` entirely. The WASM mock must be updated (Task 3) to remove corresponding mock handlers.

- [ ] **2.7 — Update `tests/mocks/tauri-core.ts`:**

  Remove mock handlers for deleted commands:
  - `request_provisioning_token` (lines 206–208)
  - `get_nsec_from_state` (lines 209–211)
  - `create_auth_token` (lines 84–87)

  Add handlers that will be needed for Task 3:
  - `generate_keypair_and_load`
  - `pubkey_from_nsec`
  - `generate_backup_from_state`

  (Implement these in Task 3 after the Rust commands are defined.)

- [ ] **2.8 — Add CI allowlist diff check:**

  Create a script `scripts/check-ipc-allowlist.sh`:
  ```bash
  #!/bin/bash
  # Verify the isolation allowlist is a valid subset of generate_handler![].
  # The allowlist may be smaller (not every registered command needs webview exposure),
  # but it must NEVER contain commands absent from the handler (orphaned = forbidden).
  # Run as part of CI: bun run check:ipc-allowlist
  set -euo pipefail

  # Extract commands registered in generate_handler![]
  REGISTERED=$(grep -oP '(?<=crypto::)\w+' apps/desktop/src/lib.rs | sort -u)
  # Extract commands in isolation allowlist (exclude plugin: entries)
  ALLOWLIST=$(grep -oP "'\K\w+(?=')" apps/desktop/isolation/index.html | grep -v 'plugin:' | sort -u)

  # Commands in allowlist but NOT in handler (forbidden — would bypass an unregistered command)
  ORPHANED=$(comm -23 <(echo "$ALLOWLIST") <(echo "$REGISTERED"))

  if [ -n "$ORPHANED" ]; then
    echo "ERROR: Allowlist contains commands not in generate_handler![]: $ORPHANED"
    exit 1
  fi

  # Commands in handler but NOT in allowlist are fine — not all commands need webview exposure.
  # Log them for visibility only.
  HANDLER_ONLY=$(comm -23 <(echo "$REGISTERED") <(echo "$ALLOWLIST"))
  if [ -n "$HANDLER_ONLY" ]; then
    echo "INFO: Handler commands not in allowlist (webview-unexposed, expected): $HANDLER_ONLY"
  fi

  echo "Allowlist/handler parity OK — allowlist is a valid subset of generate_handler![]"
  ```

  Add to `package.json` scripts:
  ```json
  "check:ipc-allowlist": "bash scripts/check-ipc-allowlist.sh"
  ```

- [ ] **2.9 — Typecheck and build:**
  ```bash
  bun run typecheck && bun run build
  cargo clippy --manifest-path apps/desktop/Cargo.toml
  ```

---

## Task 3: CRIT-D1 — Atomic Keypair Commands (No Secret Across IPC)

**Files:** `apps/desktop/src/crypto.rs`, `apps/desktop/src/lib.rs`, `apps/desktop/isolation/index.html`, `src/client/lib/platform.ts`, `src/client/lib/auth.tsx`, `src/client/lib/key-manager.ts`, `src/client/lib/backup.ts`, `src/client/lib/api.ts`, `src/client/routes/onboarding.tsx`, `src/client/routes/users.tsx`, `src/client/components/setup/AdminBootstrap.tsx`, `tests/mocks/tauri-core.ts`

**Context:** `generate_keypair` returns `KeyPair { secret_key_hex, public_key, nsec, npub }` over IPC. `key_pair_from_nsec` returns the same struct. Both expose the secret key to the webview. The fix is three new atomic commands that keep the secret in Rust, plus corresponding updates to all callers.

**Key design decisions:**
- `generate_keypair_and_load(pin, inviteCode?)` — generates, loads into CryptoState, signs the invite-redeem token internally if needed, returns only `{ publicKey, npub, encryptedKeyData }`. The invite signing use case is the main driver for making this atomic (the `secretKeyHex` was needed for `redeemInvite` and `bootstrapAdmin` Schnorr proofs).
- `pubkey_from_nsec(nsec) -> String` — stateless, returns only pubkey hex. No `KeyPair`, no secret. Used during sign-in to get pubkey before `import_key_to_state`.
- `generate_backup_from_state(recoveryKey) -> BackupHex` — reads nsec from CryptoState, performs the PBKDF2+XChaCha20-Poly1305 encryption in Rust (using the same algorithm as `backup.ts`), returns the encrypted backup blob as JSON. The nsec never enters JS.

**Implication for `backup.ts`:** `createBackup(nsec, pin, pubkey, recoveryKey)` currently takes `nsec` as a JS string. For desktop (Tauri), this must be replaced by `generateBackupFromState(recoveryKey)` which does PIN+recovery-key encryption inside Rust. For WASM (browser/test), the existing JS path in `backup.ts` remains valid because the WASM state holds the nsec in WASM linear memory (still in-process, not over IPC).

**Implication for `redeemInvite` and `bootstrapAdmin`:** These currently need `secretKeyHex` to prove key ownership via Schnorr signature. The new approach: generate → load → sign with `create_auth_token_from_state` (which reads from CryptoState). The `redeemInvite` API call signature changes: `secretKeyHex` is removed; the token is produced before calling `redeemInvite`.

### 3.1 — New Rust Commands

- [ ] **3.1.1** Add `PublicKeyPair` return type to `crypto.rs` (add after the existing re-exports, around line 24):
  ```rust
  #[derive(serde::Serialize)]
  pub struct PublicKeyPair {
      pub public_key: String,
      pub npub: String,
  }

  #[derive(serde::Serialize)]
  pub struct GenerateAndLoadResult {
      pub public_key: String,
      pub npub: String,
      pub encrypted_key_data: EncryptedKeyData,
  }
  ```

- [ ] **3.1.2** Add `generate_keypair_and_load` command to `crypto.rs` (add in the "Stateful commands" section, after `rewrap_file_key_from_state`):
  ```rust
  /// Generate a new keypair, encrypt with PIN, persist to Tauri Store, and load into CryptoState.
  /// Returns only the public key — the secret key NEVER leaves the Rust process.
  #[tauri::command]
  pub fn generate_keypair_and_load(
      state: tauri::State<'_, CryptoState>,
      pin: String,
  ) -> Result<GenerateAndLoadResult, String> {
      // Validate PIN format before generating (same regex as key-manager.ts)
      if !pin.chars().all(|c| c.is_ascii_digit()) || !(6..=8).contains(&pin.len()) {
          return Err("PIN must be 6–8 digits".into());
      }

      let kp = keys::generate_keypair();
      let sk_hex = &kp.secret_key_hex;

      let npub = keys::pubkey_to_npub(&kp.public_key).map_err(err_str)?;
      let pubkey_hex = kp.public_key.clone();

      let encrypted = encryption::encrypt_with_pin(&kp.nsec, &pin, &pubkey_hex).map_err(err_str)?;

      *state.secret_key.lock().unwrap() = Some(sk_hex.clone());
      *state.public_key.lock().unwrap() = Some(pubkey_hex.clone());

      // Zeroize the raw keypair as soon as we've loaded into state
      drop(kp);

      Ok(GenerateAndLoadResult {
          public_key: pubkey_hex,
          npub,
          encrypted_key_data: encrypted,
      })
  }
  ```

  > **Note:** If `keys::pubkey_to_npub` does not exist in `llamenos_core`, use `bech32` directly to encode the pubkey as `npub1...` (same pattern as `nsec_to_hex` in reverse). Check `packages/crypto/src/keys.rs` first.

- [ ] **3.1.3** Add `pubkey_from_nsec` command to `crypto.rs` (add in the "Stateless commands" section):
  ```rust
  /// Derive the x-only public key hex from an nsec. Stateless — does NOT load into CryptoState.
  /// Used during sign-in to get pubkey before import_key_to_state.
  #[tauri::command]
  pub fn pubkey_from_nsec(nsec: String) -> Result<String, String> {
      let sk_hex = nsec_to_hex(&nsec)?;
      keys::get_public_key(&sk_hex).map_err(err_str)
  }
  ```

- [ ] **3.1.4** Add `generate_backup_from_state` command to `crypto.rs` (add in the "Stateful commands" section):
  ```rust
  /// Create an encrypted backup blob from the nsec in CryptoState.
  /// Performs PIN + recovery key encryption in Rust — nsec NEVER enters JavaScript.
  /// Returns a JSON string matching the BackupFile format from backup.ts.
  #[tauri::command]
  pub fn generate_backup_from_state(
      state: tauri::State<'_, CryptoState>,
      pubkey: String,
      pin: String,
      recovery_key: String,
  ) -> Result<String, String> {
      let sk_hex = state.get_secret_key()?;
      let nsec = {
          let sk_bytes = hex::decode(&sk_hex).map_err(err_str)?;
          bech32::encode::<bech32::Bech32>(bech32::Hrp::parse("nsec").unwrap(), &sk_bytes)
              .map_err(err_str)?
      };

      // Delegate to llamenos_core backup module
      let backup_json = encryption::create_backup_json(&nsec, &pin, &pubkey, &recovery_key)
          .map_err(err_str)?;
      Ok(backup_json)
  }
  ```

  > **Note:** `encryption::create_backup_json` may not exist yet in `llamenos_core`. If not, implement the backup logic directly in this function using the same PBKDF2+XChaCha20-Poly1305 algorithm as `backup.ts`. The Rust output must produce a JSON string matching `BackupFile { v: 1, id, t, d: EncryptedBlock, r?: EncryptedBlock }`. See `src/client/lib/backup.ts` for the exact format. Alternatively, if the nsec encryption via PIN is already done by `encryption::encrypt_with_pin`, call it twice (once for PIN, once with recovery key PBKDF2 derivation done in Rust) and construct the JSON manually.

- [ ] **3.1.5** Remove `generate_keypair` and `key_pair_from_nsec` commands from `generate_handler![]` in `apps/desktop/src/lib.rs`:

  Delete lines:
  ```rust
  crypto::generate_keypair,
  crypto::key_pair_from_nsec,
  ```

  Add the three new commands:
  ```rust
  crypto::generate_keypair_and_load,
  crypto::pubkey_from_nsec,
  crypto::generate_backup_from_state,
  ```

  Mark the old Rust functions in `crypto.rs` as `#[allow(dead_code)]` and remove `#[tauri::command]`. Do not delete them — unit tests may reference them. The `generate_keypair` function at line 590 and `key_pair_from_nsec` at line 619 should become:
  ```rust
  #[allow(dead_code)] // Deregistered from IPC — kept for unit tests
  pub fn generate_keypair() -> Result<KeyPair, String> {
      Ok(keys::generate_keypair())
  }

  #[allow(dead_code)] // Deregistered from IPC — kept for unit tests
  pub fn key_pair_from_nsec(nsec: String) -> Result<KeyPair, String> {
      keys::keypair_from_nsec(&nsec).map_err(err_str)
  }
  ```

- [ ] **3.1.6** Update isolation allowlist in `apps/desktop/isolation/index.html`:

  Remove:
  ```js
  'generate_keypair',
  'key_pair_from_nsec',
  ```

  Add (in the stateful commands section):
  ```js
  'generate_keypair_and_load',
  'generate_backup_from_state',
  ```

  Add (in the stateless commands section):
  ```js
  'pubkey_from_nsec',
  ```

  After Tasks 2 and 3, the complete stateless section of the allowlist should be:
  ```js
  // Stateless crypto commands (no secret key)
  'ecies_wrap_key',
  'encrypt_note',
  'encrypt_message',
  'pubkey_from_nsec',
  'verify_schnorr',
  'is_valid_nsec',
  ```

### 3.2 — platform.ts Changes

- [ ] **3.2.1** Remove `PlatformKeyPair` interface (it exposed `secretKeyHex` and `nsec`). Remove `generateKeyPair()` and `keyPairFromNsec()` functions entirely.

- [ ] **3.2.2** Add `PublicKeyPair` interface (replaces `PlatformKeyPair` — no secret fields):
  ```typescript
  export interface PublicKeyPair {
    publicKey: string
    npub: string
  }

  export interface GenerateAndLoadResult extends PublicKeyPair {
    encryptedKeyData: EncryptedKeyData
  }
  ```

- [ ] **3.2.3** Add `generateKeypairAndLoad`:
  ```typescript
  /**
   * Generate a new keypair, encrypt with PIN, and load into CryptoState atomically.
   * Returns only the public key and encrypted key data — secret NEVER enters JS.
   */
  export async function generateKeypairAndLoad(
    pin: string,
  ): Promise<GenerateAndLoadResult> {
    if (useTauri) {
      return tauriInvoke<GenerateAndLoadResult>('generate_keypair_and_load', { pin })
    }
    // WASM path: generate, import into WasmCryptoState, return public info only
    const mod = await getWasm()
    const state = await getWasmState()
    const kp = mod.generateKeypair()
    const rawResult = state.importKey(kp.nsec, pin)
    const result = fromWasmValue(rawResult) as { encryptedKeyData: EncryptedKeyData }
    return {
      publicKey: kp.pubkeyHex,
      npub: kp.npub,
      encryptedKeyData: result.encryptedKeyData,
    }
  }
  ```

- [ ] **3.2.4** Add `pubkeyFromNsec`:
  ```typescript
  /**
   * Get x-only public key hex from an nsec (stateless).
   * Returns only the pubkey — no secret, no full KeyPair.
   */
  export async function pubkeyFromNsec(nsec: string): Promise<string | null> {
    if (useTauri) {
      try {
        return await tauriInvoke<string>('pubkey_from_nsec', { nsec })
      } catch {
        return null
      }
    }
    try {
      const mod = await getWasm()
      const kp = mod.keyPairFromNsec(nsec)
      return kp.pubkeyHex
    } catch {
      return null
    }
  }
  ```

- [ ] **3.2.5** Add `generateBackupFromState`:
  ```typescript
  /**
   * Create an encrypted backup blob using the nsec in CryptoState.
   * On Tauri: entire PBKDF2+encrypt operation happens in Rust — nsec never enters JS.
   * On WASM: delegates to backup.ts createBackup (nsec stays in WASM linear memory).
   */
  export async function generateBackupFromState(
    pubkey: string,
    pin: string,
    recoveryKey: string,
  ): Promise<string> {
    if (useTauri) {
      return tauriInvoke<string>('generate_backup_from_state', {
        pubkey,
        pin,
        recoveryKey,
      })
    }
    // WASM path: nsec retrieval + backup creation happens in the same JS module,
    // still within WASM-isolated memory — acceptable for browser/test environments.
    const state = await getWasmState()
    // WasmCryptoState needs a generateBackup method, or we use createBackup from backup.ts
    // with the nsec from WASM state (still in-process, not over IPC)
    const nsec = state.getNsec('__wasm_internal__') // internal token for WASM-only access
    const { createBackup } = await import('./backup')
    const backup = await createBackup(nsec, pin, pubkey, recoveryKey)
    return JSON.stringify(backup)
  }
  ```

  > **Note on WASM nsec access:** `WasmCryptoState.getNsec()` takes a token to prevent accidental use. For the WASM path (test/browser), this is acceptable because WASM linear memory is the security boundary. Implement a `WasmCryptoState.generateBackup(pin, recoveryKey, pubkey)` method in the WASM module instead if possible — this keeps the nsec entirely in WASM. The Tauri path is the critical one.

- [ ] **3.2.6** Remove `getPublicKey` (stateless, calls dead `get_public_key` IPC). The stateful `getPublicKeyFromState` remains.

### 3.3 — auth.tsx Changes

The `signIn(nsec)` function currently (lines 209–253):
1. Calls `keyPairFromNsec(nsec)` → gets `keyPair.secretKeyHex` and `keyPair.publicKey`
2. Calls `createAuthTokenStateless(keyPair.secretKeyHex, ...)` → creates Schnorr token with secret
3. Calls `login(parsed.pubkey, parsed.timestamp, parsed.token)`

After change: `signIn(nsec)`:
1. Calls `pubkeyFromNsec(nsec)` → gets only pubkey hex (no secret)
2. Calls `importKeyToState(nsec, pin, pubkeyHex)` — but wait: `signIn` doesn't have the PIN. The sign-in flow in `onboarding.tsx` calls `keyManager.importKey(nsec, pin)` THEN `signIn(nsec)`. The PIN is already known at the call site.

**Revised design:** Change `signIn` signature to `signIn(nsec: string, pin: string)`. This way:
1. `pubkeyFromNsec(nsec)` → pubkey hex
2. `encryptWithPin(nsec, pin, pubkeyHex)` → loads into CryptoState, stores encrypted blob
3. `createAuthToken(Date.now(), 'POST', '/api/auth/login')` → uses CryptoState (nsec in Rust)
4. `login(pubkeyHex, timestamp, token)`

Update `AuthContextValue.signIn` type in `auth.tsx` line 31: `signIn: (nsec: string, pin: string) => Promise<void>`

- [ ] **3.3.0** Verify `importKeyToState` three-argument conformance before proceeding:
  Confirm that `platform.ts encryptWithPin(nsec, pin, pubkeyHex)` passes all three arguments to the Tauri IPC call. Open `src/client/lib/platform.ts` and verify that the Tauri branch of `encryptWithPin` calls:
  ```typescript
  tauriInvoke<EncryptedKeyData>('import_key_to_state', { nsec, pin, pubkeyHex })
  ```
  The Rust `import_key_to_state` command requires exactly three positional parameters: `nsec`, `pin`, `pubkey_hex`. If any argument is missing or renamed, the Rust command will return an error at runtime. Confirm the current implementation passes all three before continuing.

- [ ] **3.3.1** Update imports in `auth.tsx` — remove `keyPairFromNsec, createAuthTokenStateless`, add `pubkeyFromNsec, encryptWithPin, createAuthToken` (the stateful one):
  ```typescript
  import { pubkeyFromNsec, encryptWithPin, createAuthToken, hasStoredKey } from './platform'
  ```

- [ ] **3.3.2** Update `signIn` function signature (line 31 in `AuthContextValue`, line 209 in the implementation):
  ```typescript
  // In interface (line 31):
  signIn: (nsec: string, pin: string) => Promise<void>

  // In implementation (line 209):
  const signIn = useCallback(async (nsec: string, pin: string) => {
    setState(s => ({ ...s, isLoading: true, error: null }))
    const pubkeyHex = await pubkeyFromNsec(nsec)
    if (!pubkeyHex) {
      setState(s => ({ ...s, isLoading: false, error: 'Invalid secret key' }))
      return
    }
    try {
      await encryptWithPin(nsec, pin, pubkeyHex)  // loads nsec into CryptoState
      const tokenJson = await createAuthToken(Date.now(), 'POST', '/api/auth/login')
      const parsed = JSON.parse(tokenJson)
      await login(pubkeyHex, parsed.timestamp, parsed.token)
      const me = await getMe()
      lastApiActivity.current = Date.now()
      setState({
        isKeyUnlocked: true,
        publicKey: pubkeyHex,
        // ... rest of me fields same as before
      })
    } catch (err) {
      setState(s => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Login failed',
      }))
    }
  }, [])
  ```

- [ ] **3.3.3** Remove the `keyManager.importKey` call from `onboarding.tsx` and `AdminBootstrap.tsx` `handleComplete` functions — since `signIn(nsec, pin)` now calls `encryptWithPin` internally, calling `keyManager.importKey` first would double-encrypt. Replace `keyManager.importKey(nsec, pin)` with the new flow (see Task 3.5).

### 3.4 — key-manager.ts Changes

The `importKey(nsec, pin)` function (line 125) currently:
1. Calls `keyPairFromNsec(nsec)` → gets full KeyPair including public key
2. Calls `encryptWithPin(nsec, pin, kp.publicKey)` → loads into CryptoState

After change:
1. Calls `pubkeyFromNsec(nsec)` → only pubkey hex
2. Calls `encryptWithPin(nsec, pin, pubkeyHex)` → loads into CryptoState

- [ ] **3.4.1** Update imports in `key-manager.ts` — replace `keyPairFromNsec` with `pubkeyFromNsec`:
  ```typescript
  import {
    decryptWithPin,
    lockCrypto,
    encryptWithPin,
    clearStoredKey as platformClearStoredKey,
    pubkeyFromNsec,
    hasStoredKey as platformHasStoredKey,
  } from './platform'
  ```

- [ ] **3.4.2** Update `importKey` body (line 126):
  ```typescript
  export async function importKey(nsec: string, pin: string): Promise<string> {
    const pubkeyHex = await pubkeyFromNsec(nsec)
    if (!pubkeyHex) throw new Error('Invalid nsec')

    await encryptWithPin(nsec, pin, pubkeyHex)

    publicKey = pubkeyHex
    unlocked = true
    resetIdleTimer()
    unlockCallbacks.forEach(cb => cb())
    return pubkeyHex
  }
  ```

### 3.5 — onboarding.tsx Changes

The current onboarding flow:
1. `generateKeyPair()` → `kp` (has `kp.nsec`, `kp.secretKeyHex`, `kp.publicKey`)
2. `setNsec(kp.nsec)` — stores nsec in React state (leaks nsec to JS heap!)
3. `redeemInvite(inviteCode, kp.publicKey, kp.secretKeyHex)` — passes secretKeyHex to API
4. `createBackup(nsec, ...)` in `downloadBackup()`
5. `keyManager.importKey(nsec, confirmedPin)` then `signIn(nsec)` in `handleComplete`

New flow:
1. `generateKeypairAndLoad(pin)` → `{ publicKey, npub, encryptedKeyData }` — nsec already in CryptoState, encrypted blob ready
2. Persist `encryptedKeyData` to Tauri Store via `persistEncryptedKey(encryptedKeyData)` (new platform.ts helper, or do it inline using existing `getStore().set(...)`)
3. Create Schnorr auth token via `createAuthToken(...)` (stateful — reads from CryptoState) to prove key ownership for `redeemInvite`
4. `redeemInvite(inviteCode, publicKey)` — no `secretKeyHex` arg (remove optional param from API)
5. `generateBackupFromState(pubkey, pin, recoveryKey)` in `downloadBackup()`
6. `signIn(nsec: undefined, pin)` — but wait: signIn no longer needs nsec since key is already in CryptoState! Refactor further below.

**Deeper refactor needed:** Since `generateKeypairAndLoad` already loads the key into CryptoState and `encryptWithPin` already persists the encrypted blob, the `signIn(nsec, pin)` path is for the *existing key recovery/import* flow (restore from nsec). The onboarding flow with a new key should call a different function: `loginAfterKeyLoaded()` which just calls `createAuthToken` and `login` without importing the key again.

Add `loginAfterKeyLoaded` to auth.tsx:
```typescript
const loginAfterKeyLoaded = useCallback(async (pubkeyHex: string) => {
  const tokenJson = await createAuthToken(Date.now(), 'POST', '/api/auth/login')
  const parsed = JSON.parse(tokenJson)
  await login(pubkeyHex, parsed.timestamp, parsed.token)
  const me = await getMe()
  // ... setState
}, [])
```
Expose on `AuthContextValue` or call it directly from onboarding via a hook.

- [ ] **3.5.1** Remove `nsec` state variable from `onboarding.tsx` (line 49: `const [nsec, setNsec] = useState('')`). Remove `pubkey` state (line 50: `const [pubkey, setPubkey] = useState('')`). These will be derived from `generateKeypairAndLoad` results.

- [ ] **3.5.2** Add state to hold the result of keypair generation: `const [genResult, setGenResult] = useState<GenerateAndLoadResult | null>(null)`.

- [ ] **3.5.3** Replace `generateKeypairAndRedeem` function (lines 132–152):
  ```typescript
  async function generateKeypairAndRedeem(pin: string) {
    setStep('keypair')
    try {
      const result = await generateKeypairAndLoad(pin)
      setGenResult(result)
      setConfirmedPin(pin)

      // Persist encrypted key data to Tauri Store
      const store = await getStore()
      await store.set(STORE_KEY, result.encryptedKeyData)
      await store.save()

      // Prove key ownership: sign redeem request using CryptoState (nsec in Rust)
      const tokenJson = await createAuthToken(Date.now(), 'POST', '/api/invites/redeem')
      const parsed = JSON.parse(tokenJson)
      await redeemInvite(inviteCode, result.publicKey, parsed.timestamp, parsed.token)

      const rk = generateRecoveryKey()
      setRecoveryKeyStr(rk)
      setStep('backup')
    } catch (err) {
      setStep('error')
      setErrorMsg(err instanceof Error ? err.message : t('onboarding.redeemFailed'))
    }
  }
  ```

  > Note: `getStore` and `STORE_KEY` must be imported or inlined from `platform.ts`. Either export them or add a new `persistEncryptedKeyData(data: EncryptedKeyData): Promise<void>` function to `platform.ts` that wraps the store operations.

- [ ] **3.5.4** Replace `downloadBackup` function (lines 154–158):
  ```typescript
  async function downloadBackup() {
    if (!genResult) return
    const backupJson = await generateBackupFromState(genResult.publicKey, confirmedPin, recoveryKeyStr)
    const backup = JSON.parse(backupJson)
    downloadBackupFile(backup)
    setBackupDownloaded(true)
    toast(t('onboarding.backupDownloaded'), 'success')
  }
  ```

- [ ] **3.5.5** Replace `handleComplete` function (lines 161–170):
  ```typescript
  async function handleComplete() {
    if (!genResult) return
    try {
      // Key is already in CryptoState (loaded by generateKeypairAndLoad).
      // Do NOT call signIn(nsec, pin) here — that would try to import the key
      // again (double-encrypt). Instead call loginAfterKeyLoaded directly.
      await loginAfterKeyLoaded(genResult.publicKey)
      navigate({ to: '/profile-setup' })
    } catch {
      toast(t('common.error'), 'error')
    }
  }
  ```

  `loginAfterKeyLoaded` must be added to `auth.tsx` and exposed on `AuthContextValue` (see the definition earlier in Task 3.5). It creates an auth token from CryptoState and calls `login` — no nsec parameter required. This avoids both the `undefined as never` type assertion and the double-import problem.

- [ ] **3.5.6** Update imports in `onboarding.tsx`:
  - Remove: `import { generateKeyPair } from '@/lib/platform'`
  - Add: `import { generateKeypairAndLoad, generateBackupFromState, createAuthToken } from '@/lib/platform'`
  - Update `createBackup` import: remove if no longer used directly, or keep for WASM path only.

### 3.6 — AdminBootstrap.tsx Changes

Same pattern as onboarding.tsx. The `generateKeypairAndBootstrap` function (lines 128–156) currently:
1. `generateKeyPair()` → `kp` (has `kp.nsec`, `kp.secretKeyHex`)
2. `setNsec(kp.nsec)` — stores nsec in React state
3. `createAuthTokenStateless(kp.secretKeyHex, ...)` — signs bootstrap request
4. `bootstrapAdmin(parsed.pubkey, ...)`

New flow:
1. `generateKeypairAndLoad(pin)` → `{ publicKey, npub, encryptedKeyData }`
2. Persist `encryptedKeyData` to store
3. `createAuthToken(Date.now(), 'POST', '/api/auth/bootstrap')` — stateful, reads from CryptoState
4. `bootstrapAdmin(publicKey, timestamp, token)`

- [ ] **3.6.1** Remove `nsec` and `pubkey` state variables from `AdminBootstrap.tsx` (lines 50, 57). Add `genResult` state.

- [ ] **3.6.2** Replace `generateKeypairAndBootstrap` function (lines 128–156):
  ```typescript
  async function generateKeypairAndBootstrap(pin: string) {
    setStep('generating')
    setError('')
    try {
      const result = await generateKeypairAndLoad(pin)
      setGenResult(result)
      setConfirmedPin(pin)

      // Persist encrypted key data to Tauri Store
      const store = await getStore()
      await store.set(STORE_KEY, result.encryptedKeyData)
      await store.save()

      // Sign bootstrap request using CryptoState (nsec stays in Rust)
      const tokenJson = await createAuthToken(Date.now(), 'POST', '/api/auth/bootstrap')
      const parsed = JSON.parse(tokenJson)
      await bootstrapAdmin(result.publicKey, parsed.timestamp, parsed.token)

      const rk = generateRecoveryKey()
      setRecoveryKeyStr(rk)
      setStep('backup')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
      setStep('pin')
      setPinStep('create')
      setPin1('')
      setPin2('')
    }
  }
  ```

- [ ] **3.6.3** Replace `downloadBackup` and `handleComplete` — same pattern as onboarding.tsx (3.5.4, 3.5.5).

- [ ] **3.6.4** Update imports: remove `generateKeyPair, createAuthTokenStateless`, add `generateKeypairAndLoad, generateBackupFromState, createAuthToken`.

### 3.7 — api.ts Changes

- [ ] **3.7.1** The `redeemInvite` function signature (line 709) currently takes `secretKeyHex?: string`. Change it so the caller passes the pre-computed auth fields:
  ```typescript
  export async function redeemInvite(
    code: string,
    pubkey: string,
    timestamp: number,
    token: string,
  ): Promise<void> {
    // No secretKeyHex — caller must compute token via createAuthToken (stateful)
    // ...
  }
  ```
  Update callers in `onboarding.tsx`.

- [ ] **3.7.2** Update `bootstrapAdmin` signature similarly if it currently takes `secretKeyHex`.

### 3.8 — users.tsx Changes

The `users.tsx` file (line 368) calls `generateKeyPair()` to create a user on behalf of an admin. This is an admin flow where the admin generates a keypair and hands the nsec to the new user out-of-band.

This use case is fundamentally different: the admin NEEDS to display the nsec to hand it to the new user. This pattern must NOT use `generateKeypairAndLoad` (which hides the nsec).

**Security analysis:** The admin intentionally generates a keypair to share with a new user. The nsec must be displayed once. This is acceptable IF:
1. The nsec is displayed briefly and then cleared from state
2. The user is warned to copy it immediately

However, the current code stores `kp.nsec` (returned from IPC as `keyPair.nsec`) in React state — this is a CRIT-D1 violation.

**Solution:** Add a new Rust command `generate_ephemeral_keypair() -> { publicKey, npub, nsec }` that returns the nsec ONE TIME for admin-initiated user creation. This command is in `generate_handler![]` and the isolation allowlist, but it returns nsec only for this specific admin-creates-user flow.

- [ ] **3.8.1** Add `generate_ephemeral_keypair` to `crypto.rs`:
  ```rust
  /// Generate an ephemeral keypair for admin-initiated user creation.
  /// Returns the nsec ONCE — the caller is responsible for displaying it to the new user.
  /// This keypair is NOT loaded into CryptoState.
  #[tauri::command]
  pub fn generate_ephemeral_keypair() -> Result<serde_json::Value, String> {
      let kp = keys::generate_keypair();
      // npub encoding
      let pk_bytes = hex::decode(&kp.public_key).map_err(err_str)?;
      let npub = bech32::encode::<bech32::Bech32>(
          bech32::Hrp::parse("npub").unwrap(),
          &pk_bytes,
      ).map_err(err_str)?;
      Ok(serde_json::json!({
          "publicKey": kp.public_key,
          "npub": npub,
          "nsec": kp.nsec,
      }))
  }
  ```

- [ ] **3.8.2** Add to `generate_handler![]` and isolation allowlist:
  ```rust
  crypto::generate_ephemeral_keypair,
  ```
  ```js
  'generate_ephemeral_keypair',
  ```

- [ ] **3.8.3** Add to `platform.ts`:
  ```typescript
  export interface EphemeralKeyPair {
    publicKey: string
    npub: string
    nsec: string  // Display once — not stored in CryptoState
  }

  /**
   * Generate an ephemeral keypair for admin-initiated user creation.
   * The nsec is returned for one-time display — it is NOT loaded into CryptoState.
   */
  export async function generateEphemeralKeypair(): Promise<EphemeralKeyPair> {
    if (useTauri) {
      return tauriInvoke<EphemeralKeyPair>('generate_ephemeral_keypair')
    }
    const mod = await getWasm()
    const kp = mod.generateKeypair()
    return { publicKey: kp.pubkeyHex, npub: kp.npub, nsec: kp.nsec }
  }
  ```

- [ ] **3.8.4** Update `users.tsx` to use `generateEphemeralKeypair` instead of `generateKeyPair`.

### 3.9 — WASM Mock Changes (tests/mocks/tauri-core.ts)

- [ ] **3.9.1** Remove mock handlers for deleted commands:
  - `generate_keypair` (lines 39–42)
  - `key_pair_from_nsec` (lines 53–60)
  - `get_public_key` (lines 44–45)
  - `request_provisioning_token` (lines 206–208)
  - `get_nsec_from_state` (lines 209–211)
  - `create_auth_token` (lines 84–87)

- [ ] **3.9.2** Add mock handlers for new commands:
  ```typescript
  generate_keypair_and_load: (a) => {
    const mod = getWasmModule()
    const state = getWasmState()
    const kp = mod.generateKeypair()
    const rawResult = state.importKey(kp.nsec, a.pin as string)
    const result = fromWasmValue(rawResult) as { encryptedKeyData: unknown }
    return {
      publicKey: kp.pubkeyHex,
      npub: kp.npub,
      encryptedKeyData: result.encryptedKeyData,
    }
  },

  pubkey_from_nsec: (a) => {
    try {
      const kp = getWasmModule().keyPairFromNsec(a.nsec as string)
      return kp.pubkeyHex
    } catch {
      return null
    }
  },

  generate_backup_from_state: (a) => {
    // WASM path: use existing WasmCryptoState to get nsec, then call backup logic
    // This is acceptable in test env — nsec stays within WASM module
    const nsec = getWasmState().getNsec('__wasm_internal__')
    // Return a minimal valid backup JSON for tests
    return JSON.stringify({
      v: 1,
      id: 'test00',
      t: Math.round(Date.now() / 3600000) * 3600,
      d: { s: '00'.repeat(16), i: 600000, n: '00'.repeat(24), c: '00'.repeat(48) },
    })
  },

  generate_ephemeral_keypair: () => {
    const kp = getWasmModule().generateKeypair()
    return { publicKey: kp.pubkeyHex, npub: kp.npub, nsec: kp.nsec }
  },
  ```

  > Note: The `generate_backup_from_state` mock returns a dummy backup for tests. Tests that verify backup download should check that a `.json` file was triggered, not validate the backup contents.

- [ ] **3.9.3** Add `fromWasmValue` helper to mock file (it's currently private in `platform.ts`). Either export it from `platform.ts` or duplicate the small function in `tauri-core.ts`.

### 3.10 — Final Verification for Task 3

- [ ] Write a Playwright test that verifies the `generate_keypair_and_load` IPC mock response contains ONLY `publicKey` and `npub` fields — no secret material. Add to the appropriate test file (e.g., `tests/onboarding.spec.ts`):
  ```typescript
  test('generate_keypair_and_load response contains no secret key fields', async ({ page }) => {
    // Navigate to onboarding so the mock is loaded
    await page.goto('/onboarding')
    const result = await page.evaluate(async () => {
      const sym = Symbol.for('llamenos_test_invoke')
      const invoke = (window as Record<symbol, unknown>)[sym] as (cmd: string, args: unknown) => Promise<unknown>
      return invoke('generate_keypair_and_load', { pin: '123456' })
    })
    // Must contain public key fields
    expect((result as Record<string, unknown>).publicKey).toBeTruthy()
    expect((result as Record<string, unknown>).npub).toBeTruthy()
    // Must NOT contain secret key fields — these crossing IPC is the exact vulnerability being fixed
    expect((result as Record<string, unknown>).secretKeyHex).toBeUndefined()
    expect((result as Record<string, unknown>).nsec).toBeUndefined()
    expect((result as Record<string, unknown>).secretKey).toBeUndefined()
  })
  ```

- [ ] Run: `bun run typecheck && bun run build`
- [ ] Run: `cargo clippy --manifest-path apps/desktop/Cargo.toml`
- [ ] Run: `cargo build --manifest-path apps/desktop/Cargo.toml`
- [ ] Run: `bun run test` (Playwright)
- [ ] Run grep checks:
  ```bash
  grep -r "getNsecFromState\|get_nsec_from_state" src/client/       # → zero
  grep -r "createAuthTokenStateless\|create_auth_token[^_]" src/client/ # → zero
  grep -r "secretKeyHex" src/client/                                # → zero (except platform.ts comments)
  grep -r "kp\.nsec" src/client/                                    # → zero
  grep -r "generateKeyPair\b" src/client/                           # → zero
  grep -r "keyPairFromNsec\b" src/client/                           # → zero
  ```

---

## Task 4: HIGH-D1 + MED-D1 — CSP Hardening

**Files:** `apps/desktop/tauri.conf.json`

**Context:**
- `'unsafe-inline'` in `style-src` (line 25) — React JSX inline `style={{}}` attributes cause the browser to apply styles set via JavaScript, but these are handled by the browser's own rendering (not injected `<style>` tags). React does NOT inject `<style>` tags; it sets `.style` properties on DOM elements. `'unsafe-inline'` in `style-src` guards against `<style>` tag injection, NOT inline style attributes. However, it does open the door to injected `<style>` tags. Tauri's WebView does apply CSP to the WebKit/Blink renderer, so removal is worthwhile.

  **Pre-check:** The existing codebase uses `style={{...}}` in 20+ JSX locations (confirmed by inspection). These set DOM element `.style` properties at runtime — this is controlled by the browser rendering pipeline, NOT blocked by `style-src`. Removing `'unsafe-inline'` from `style-src` only blocks dynamically injected `<style>` tags and `style` HTML attributes in raw HTML strings. All current `style={{}}` in JSX will continue to work normally after removing `'unsafe-inline'`.

- `'wasm-unsafe-eval'` in `script-src` (line 22) — required by the WASM Whisper transcription module. Check before removing.

- [ ] **4.1** Pre-check for any dynamic `<style>` tag injection or `element.setAttribute('style', ...)` patterns:
  ```bash
  grep -rn "setAttribute.*style\|innerHTML.*style\|insertAdjacentHTML\|document\.write" src/client/
  ```
  Expected: zero results.

- [ ] **4.2** Confirm WASM usage: the `'wasm-unsafe-eval'` directive is needed for WASM instantiation (both Whisper and the llamenos-core WASM module). Do NOT remove it. The Tauri desktop app uses the native Rust backend for crypto (no WASM crypto), but the Whisper transcription runs as WASM in the WebView and requires this directive.

  To confirm: `grep -rn "wasm\|WebAssembly" src/client/` — if Whisper or other WASM is present, keep `'wasm-unsafe-eval'`.

- [ ] **4.3** Remove ONLY `'unsafe-inline'` from `style-src` in `apps/desktop/tauri.conf.json`:

  Change line 25 from:
  ```json
  "style-src": "'unsafe-inline' 'self'",
  ```
  to:
  ```json
  "style-src": "'self'",
  ```

- [ ] **4.4** Build and run the desktop app locally (`bun run tauri:dev`) and navigate through all major views (login, dashboard, calls, settings). Confirm no CSS rendering regressions. Pay particular attention to:
  - `status-pill.tsx` — uses dynamic `backgroundColor` via `style={{}}`
  - `offline-banner.tsx` — uses inline style
  - Progress bars in `progress.tsx` and `getting-started.tsx`
  - Timeline items in `timeline-item.tsx`

  These all use React `style={{}}` prop (JS style attribute), which is NOT affected by removing `'unsafe-inline'` from `style-src`. Only `<style>` tag injection is blocked.

- [ ] **4.5** Typecheck: `bun run typecheck && bun run build`

---

## Task 5: HIGH-D3 + MED-D2 — Stronghold Migration for PIN Counter and Encrypted Key

**Files:** `apps/desktop/src/crypto.rs`, `apps/desktop/src/lib.rs`

**Context:**
The Stronghold plugin is already initialised in `lib.rs` (lines 11–25) with a fixed app-level password derived via PBKDF2-SHA256 from the constant salt `"llamenos:stronghold:v1"`. This is a fixed password approach (not the user's PIN), so there is **no circular dependency** — the Stronghold vault can be opened without the user's PIN, and is therefore suitable for storing the PIN counter.

The `tauri-plugin-stronghold = "2"` is already in `Cargo.toml` (line 16).

Current PIN counter location: `settings.json` Tauri Store (via `app_handle.store("settings.json")`). The Store is writable from JS via `plugin:store|set` — an attacker with XSS could reset the failed-attempt counter.

Current encrypted key location: `keys.json` Tauri Store (via `Store::load('keys.json')` in platform.ts). Same writability concern for MED-D2.

**Target:** Move `pin_failed_attempts` and `pin_lockout_until` to Stronghold vault. Move the encrypted nsec blob to Stronghold vault (MED-D2).

**Stronghold API (tauri-plugin-stronghold v2):**

Check the actual Stronghold v2 API before writing code:

- [ ] **5.1** Look up current `tauri-plugin-stronghold` v2 Rust API using the codebase or crate docs. The vault is accessed via the plugin's app extension. Key Rust API methods:
  - `StrongholdExt::stronghold()` — gets plugin instance
  - Vault operations: `stronghold.with_client(client_path, |client| { client.get_store() ... })`
  - Store operations: `store.insert(key, value)`, `store.get(key)`, `store.remove(key)`

  The plugin password is already configured in `lib.rs`'s `.plugin(tauri_plugin_stronghold::Builder::new(|password| { ... }).build())`. The `password` parameter here is the key derived from the fixed salt — check how the plugin actually calls this callback and what the correct Rust invocation is to open a client.

- [ ] **5.2** Add a helper function in `crypto.rs` to get a Stronghold client:
  ```rust
  fn get_stronghold_client(
      app_handle: &tauri::AppHandle,
  ) -> Result<tauri_plugin_stronghold::stronghold::Client, String> {
      use tauri_plugin_stronghold::StrongholdExt;
      let stronghold = app_handle.stronghold();
      let client_path = b"llamenos:pin-counter:v1";
      stronghold
          .get_client(client_path)
          .map_err(|_| {
              // Create if not exists
              stronghold
                  .create_client(client_path)
                  .map_err(|e| e.to_string())
          })
          .or_else(|e| e)  // flatten Result<Result>
  }
  ```
  > Adjust based on actual v2 API. The exact method names may differ — check `tauri-plugin-stronghold` crate docs for v2.

- [ ] **5.3** Update `unlock_with_pin` in `crypto.rs` to read/write PIN counter from Stronghold instead of Tauri Store:

  Replace the Tauri Store PIN counter reads (lines 98–108) with Stronghold reads:
  ```rust
  // OLD (lines 98–108):
  let store = app_handle.store("settings.json")...;
  let attempts: u32 = store.get("pin_failed_attempts")...;
  let lockout_until: u64 = store.get("pin_lockout_until")...;

  // NEW: read from Stronghold
  let sh_client = get_stronghold_client(&app_handle)?;
  let sh_store = sh_client.store();
  let attempts: u32 = sh_store
      .get(b"pin_failed_attempts")
      .ok()
      .flatten()
      .and_then(|v| String::from_utf8(v).ok())
      .and_then(|s| s.parse().ok())
      .unwrap_or(0);
  let lockout_until: u64 = sh_store
      .get(b"pin_lockout_until")
      .ok()
      .flatten()
      .and_then(|v| String::from_utf8(v).ok())
      .and_then(|s| s.parse().ok())
      .unwrap_or(0);
  ```

  Replace Tauri Store PIN counter writes with Stronghold writes:
  ```rust
  // OLD: store.set("pin_failed_attempts", serde_json::json!(0));
  // NEW:
  sh_store.insert(b"pin_failed_attempts".to_vec(), b"0".to_vec(), None).map_err(err_str)?;
  sh_store.insert(b"pin_lockout_until".to_vec(), b"0".to_vec(), None).map_err(err_str)?;
  // Persist immediately — call save() via app_handle so the stronghold handle is in scope
  use tauri_plugin_stronghold::StrongholdExt;
  app_handle.stronghold().save().await.map_err(err_str)?;
  ```

  Also update the lockout write and wipe logic:
  ```rust
  sh_store.insert(
      b"pin_failed_attempts".to_vec(),
      new_attempts.to_string().into_bytes(),
      None,
  ).map_err(err_str)?;
  if lockout_ms > 0 {
      sh_store.insert(
          b"pin_lockout_until".to_vec(),
          (now + lockout_ms).to_string().into_bytes(),
          None,
      ).map_err(err_str)?;
  }
  // Use app_handle.stronghold() to call save() — do NOT store the stronghold handle
  // in a local variable above and then call .save() on it here; it may not be in scope.
  app_handle.stronghold().save().await.map_err(err_str)?;
  ```

  On wipe (10+ failures), also remove encrypted key from Stronghold:
  ```rust
  sh_store.remove(b"pin_failed_attempts").ok();
  sh_store.remove(b"pin_lockout_until").ok();
  sh_store.remove(b"encrypted_nsec").ok();  // MED-D2 key location
  app_handle.stronghold().save().await.map_err(err_str)?;
  return Err("Too many failed attempts. Keys wiped.".to_string());
  ```

- [ ] **5.4 — MED-D2:** Move encrypted nsec blob from `keys.json` Tauri Store to Stronghold vault.

  Update `import_key_to_state` in `crypto.rs` to store the encrypted key in Stronghold:
  ```rust
  // After encryption succeeds, persist to Stronghold instead of returning to JS:
  // The JS side (platform.ts encryptWithPin) currently stores to Tauri Store.
  // New: store in Stronghold from Rust, return encryptedKeyData to JS only for backup purposes.
  let sh_client = get_stronghold_client(&app_handle)?;
  let sh_store = sh_client.store();
  let encoded = serde_json::to_vec(&encrypted).map_err(err_str)?;
  sh_store.insert(b"encrypted_nsec".to_vec(), encoded, None).map_err(err_str)?;
  // Call save() via app_handle — do NOT use a locally scoped stronghold handle here
  use tauri_plugin_stronghold::StrongholdExt;
  app_handle.stronghold().save().await.map_err(err_str)?;
  ```

  Update `unlock_with_pin` to read the encrypted key from Stronghold:
  ```rust
  // Instead of receiving EncryptedKeyData from JS (from Tauri Store),
  // read it from Stronghold directly:
  let sh_client = get_stronghold_client(&app_handle)?;
  let sh_store = sh_client.store();
  let data: EncryptedKeyData = sh_store
      .get(b"encrypted_nsec")
      .map_err(err_str)?
      .ok_or("No key stored. Complete onboarding first.")?
      .pipe(|v| serde_json::from_slice(&v).map_err(err_str))?;
  ```

  **Consequence:** `unlock_with_pin` no longer needs the `data: EncryptedKeyData` parameter. Update the function signature:
  ```rust
  pub fn unlock_with_pin(
      state: tauri::State<'_, CryptoState>,
      app_handle: tauri::AppHandle,
      pin: String,  // data parameter removed
  ) -> Result<String, String> {
  ```

  Update `platform.ts` `decryptWithPin` function — it currently reads from Tauri Store and passes data to the IPC call. Change to just pass the pin:
  ```typescript
  export async function decryptWithPin(pin: string): Promise<string | null> {
    if (useTauri) {
      try {
        return await tauriInvoke<string>('unlock_with_pin', { pin })  // no data param
      } catch (err) { ... }
    }
    // WASM path stays the same (reads from localStorage)
    const store = await getStore()
    const data = await store.get<EncryptedKeyData>(STORE_KEY)
    if (!data) return null
    // ...
  }
  ```

  Update mock in `tests/mocks/tauri-core.ts`:
  ```typescript
  unlock_with_pin: (a) => {
    // Mock: still use the WASM path (reads from localStorage via WasmCryptoState)
    // In tests, the key was stored via import_key_to_state, not Stronghold
    const dataJson = /* get from mock storage */ ...
    return getWasmState().unlockWithPin(dataJson, a.pin as string)
  },
  ```

  The mock needs a way to store the encrypted key internally. The simplest approach: keep a module-level `let mockEncryptedKey: unknown = null` in `tauri-core.ts`. `import_key_to_state` sets it; `unlock_with_pin` reads it.

- [ ] **5.5** Remove `plugin:store|set`, `plugin:store|delete` from the isolation allowlist (or restrict them). These are still needed for non-key settings. However, since PIN counter and encrypted key are now in Stronghold, the risk is reduced. Leave them for now but document as a future hardening step (once all sensitive data is in Stronghold, the Store can be made read-only from JS).

- [ ] **5.6** Build and test:
  ```bash
  cargo build --manifest-path apps/desktop/Cargo.toml
  cargo clippy --manifest-path apps/desktop/Cargo.toml
  bun run typecheck && bun run build
  bun run test
  ```

---

## Task 6: HIGH-D4 — Remove process:allow-restart

**Files:** `apps/desktop/capabilities/default.json`

**Context:** `process:allow-restart` (line 40) grants the webview the ability to restart the Tauri process. No caller exists in the codebase (confirmed by grep). An attacker with XSS could trigger a restart to disrupt the running session.

- [ ] **6.1** Confirm no callers:
  ```bash
  grep -rn "process:restart\|processRestart\|\"restart\"" src/client/ apps/desktop/src/
  ```
  Expected: zero results.

- [ ] **6.2** Remove `"process:allow-restart"` from `apps/desktop/capabilities/default.json` (line 40).

  Before:
  ```json
  "process:allow-exit",
  "process:allow-restart"
  ```

  After:
  ```json
  "process:allow-exit"
  ```

- [ ] **6.3** Build: `cargo build --manifest-path apps/desktop/Cargo.toml`

---

## Task 7: MED-D3 — Symbol-Based __TEST_INVOKE

**Files:** `tests/mocks/tauri-core.ts`

**Context:** Lines 249–251 currently expose `invoke` on `window.__TEST_INVOKE` as a string key. A malicious script running in the webview could call `window.__TEST_INVOKE(cmd, args)` to invoke any mock IPC command, bypassing the isolation allowlist (which doesn't run in PLAYWRIGHT_TEST mode). Using a Symbol key prevents accidental and deliberate discovery of the test hook.

- [ ] **7.1** In `tests/mocks/tauri-core.ts`, replace lines 249–251:

  **Before:**
  ```typescript
  if (typeof window !== 'undefined') {
    (window as Record<string, unknown>).__TEST_INVOKE = invoke
  }
  ```

  **After:**
  ```typescript
  // IMPORTANT: Must use Symbol.for (global symbol registry), NOT Symbol() (module-scoped).
  // page.evaluate() runs in a separate VM context — module-scoped Symbols are not accessible
  // across that boundary. Symbol.for('llamenos_test_invoke') resolves to the same Symbol
  // in any VM context, making it accessible from page.evaluate() calls in Playwright tests.
  export const __TEST_INVOKE_SYMBOL = Symbol.for('llamenos_test_invoke')

  if (typeof window !== 'undefined' && import.meta.env.PLAYWRIGHT_TEST) {
    (window as Record<symbol, unknown>)[__TEST_INVOKE_SYMBOL] = invoke
  }
  ```

- [ ] **7.2** Find all test helpers that read `window.__TEST_INVOKE` and update them to use the Symbol:
  ```bash
  grep -rn "__TEST_INVOKE" tests/ src/
  ```

  For callers that import from the module (non-`page.evaluate` context), use the exported symbol:
  ```typescript
  // Old
  const invoke = (window as Record<string, unknown>).__TEST_INVOKE as typeof import('@tauri-apps/api/core').invoke

  // New (non-page.evaluate callers)
  import { __TEST_INVOKE_SYMBOL } from './mocks/tauri-core'
  const invoke = (window as Record<symbol, unknown>)[__TEST_INVOKE_SYMBOL] as typeof import('@tauri-apps/api/core').invoke
  ```

  For callers inside `page.evaluate()` (where module imports are unavailable), use `Symbol.for` directly — it resolves to the same symbol as `Symbol.for('llamenos_test_invoke')` in the mock:
  ```typescript
  // In page.evaluate() test helpers:
  const result = await page.evaluate(async ({ cmd, args }) => {
    const sym = Symbol.for('llamenos_test_invoke')  // same Symbol, different VM context
    const invoke = (window as Record<symbol, unknown>)[sym] as Function
    return invoke(cmd, args)
  }, { cmd, args })
  ```

- [ ] **7.3** Run Playwright tests to confirm test helpers still work:
  ```bash
  bun run test
  ```

---

## Final Verification Checklist

Run ALL of the following after all 7 tasks are complete:

```bash
# 1. TypeScript + Build
bun run typecheck && bun run build

# 2. Playwright E2E
bun run test

# 3. Rust build + lint
cargo build --manifest-path apps/desktop/Cargo.toml
cargo clippy --manifest-path apps/desktop/Cargo.toml -- -D warnings

# 4. IPC allowlist consistency check
bash scripts/check-ipc-allowlist.sh

# 5. Security grep checks (all must return zero matches)
grep -r "getNsecFromState\|get_nsec_from_state" src/client/           # → 0
grep -r "createAuthTokenStateless" src/client/                        # → 0
grep -r "create_auth_token[^_]" src/client/                          # → 0 in platform.ts callers
grep -r "secretKeyHex" src/client/ --include="*.ts" --include="*.tsx" # → 0 (except type defs)
grep -r "kp\.nsec\b" src/client/                                      # → 0
grep -r "generateKeyPair\b" src/client/                               # → 0
grep -r "keyPairFromNsec\b" src/client/                               # → 0
grep -r "PlatformKeyPair" src/client/                                 # → 0 (replaced by PublicKeyPair)
grep -r "get_nsec_from_state\|request_provisioning_token\|create_auth_token" \
    apps/desktop/isolation/index.html                                  # → 0
grep -r "generate_keypair'\|key_pair_from_nsec'" \
    apps/desktop/isolation/index.html                                  # → 0
grep -r "process:allow-restart" apps/desktop/capabilities/            # → 0
grep -r "__TEST_INVOKE[^_]" tests/                                    # → 0 (replaced by Symbol)

# 6. CSP check
grep "unsafe-inline" apps/desktop/tauri.conf.json                    # → 0 (removed from style-src)

# 7. Updater key check
grep "REPLACE_WITH_PUBKEY" apps/desktop/tauri.conf.json              # → 0 (replaced in Task 1)
```

---

## Commands Reference

| Purpose | Command |
|---------|---------|
| TypeScript typecheck | `bun run typecheck` |
| Vite build | `bun run build` |
| Playwright E2E | `bun run test` |
| Playwright UI mode | `bun run test:ui` |
| Rust build (desktop) | `cargo build --manifest-path apps/desktop/Cargo.toml` |
| Rust clippy | `cargo clippy --manifest-path apps/desktop/Cargo.toml -- -D warnings` |
| Tauri dev (full desktop) | `bun run tauri:dev` |
| IPC allowlist check | `bash scripts/check-ipc-allowlist.sh` |

---

## Risk Notes

1. **Task 3 is the largest and riskiest task.** The keypair generation refactor touches 8+ files and changes the sign-in flow. Implement and test incrementally: first add the new Rust commands and platform.ts functions, then migrate callers one file at a time. Keep old functions alongside new ones during migration (remove at the end of Task 3, not before).

2. **Task 5 (Stronghold migration) depends on the exact tauri-plugin-stronghold v2 API.** The Rust API changed between v1 and v2. Before writing any Stronghold code, read the plugin's `README.md` and source in `node_modules/@tauri-apps/plugin-stronghold/` for the JS side and crate docs for the Rust side. The Stronghold vault is already initialised in lib.rs — the client creation and record store API are the unknowns.

3. **The backup flow currently passes nsec through JS** (`backup.ts` `createBackup(nsec, ...)`). Task 3.1.4 adds `generate_backup_from_state` to move this into Rust for the Tauri path. The `backup.ts` JS functions remain for the WASM/test path. Both paths must produce compatible `BackupFile` JSON (same format, interoperable recovery).

4. **`redeemInvite` and `bootstrapAdmin` API signatures change in Task 3.** If there are other callers or if the API server validates the request structure, ensure the server-side schema is compatible with the new call format (passing pre-computed timestamp + token instead of secretKeyHex).

5. **Task 1 (updater key) is a prerequisite for production** but not for development. The placeholder key causes the updater to fail with a config error. The key generation is a one-time manual step — do not skip it before any release build.
