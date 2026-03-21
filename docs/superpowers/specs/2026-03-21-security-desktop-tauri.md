# Security Remediation — Epic 4: Desktop / Tauri IPC

**Date**: 2026-03-21
**Audit ref**: `docs/security/SECURITY_AUDIT_2026-03-21.md`
**Findings addressed**: CRIT-D1, CRIT-D2, CRIT-D3, CRIT-D4, HIGH-D1–D4, MED-D1–D3 (11 total)
**Dependency order**: Requires Epic 2 (Crypto crate) — CRIT-D1 fix depends on removing `secret_key_hex` from the `KeyPair` struct.

---

## Context

The three CRIT-D findings represent the most consequential vulnerabilities in the codebase: the nsec crosses the IPC boundary in multiple places, directly negating the platform's foundational security guarantee. Any XSS in a rendered note, hub description, or volunteer name exfiltrates the volunteer's permanent identity key. This epic eliminates all nsec-crossing paths, hardens the CSP, aligns the isolation allowlist with the registered handler set, and fixes the updater key placeholder.

---

## Findings and Fixes

### CRIT-D1 — `KeyPair` IPC response includes `secretKeyHex` and `nsec` in plaintext

**Files**: `packages/crypto/src/keys.rs:16-25`; `apps/desktop/src/lib.rs:175,178`; `src/client/routes/onboarding.tsx`; `src/client/components/setup/AdminBootstrap.tsx`; `src/client/lib/auth.tsx:209-253`

The `KeyPair` struct serializes four fields: `secret_key_hex`, `public_key`, `nsec`, `npub`. Both `generate_keypair` and `key_pair_from_nsec` return all four fields over IPC to the webview. The nsec surfaces in at least three places:

1. **Keypair generation**: `onboarding.tsx` stores `kp.nsec` in React state and passes `kp.secretKeyHex` to `redeemInvite`. `AdminBootstrap.tsx` passes `kp.secretKeyHex` to `createAuthTokenStateless`.
2. **Sign-in flow** (`src/client/lib/auth.tsx:209-253`): `signIn(nsec: string)` receives the nsec as a JS string, calls `keyPairFromNsec(nsec)` (IPC), gets back `secretKeyHex`, then calls `createAuthTokenStateless(keyPair.secretKeyHex, ...)`.
3. **Backup flow**: `createBackup(nsec, confirmedPin, pubkey, recoveryKeyStr)` is called from `onboarding.tsx` with the nsec string held in component state.

All three paths must be closed simultaneously.

**Fix**: Replace the multi-step `generate_keypair → store-in-webview-state → call-api` pattern with atomic Rust commands that never surface the nsec in JavaScript. The existing `import_key_to_state` command handles key import atomically — the new work adds a generation variant and a server-signing integration.

**Note on internal references**: Within `apps/desktop/src/crypto.rs`, the crypto crate functions are accessed via the `keys::` module (e.g., `keys::generate_keypair()`, `keys::keypair_from_nsec()`). The IPC wrappers are what `generate_handler![]` registers.

**Step 1 — New command `generate_keypair_and_load`** in `apps/desktop/src/crypto.rs`:

```rust
/// Generate a new keypair, encrypt with PIN, persist, load into CryptoState.
/// Returns only public material — nsec never crosses the IPC boundary.
#[tauri::command]
pub fn generate_keypair_and_load(
    pin: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, CryptoState>,
) -> Result<PublicKeyPair, String> {
    if !is_valid_pin(&pin) {
        return Err("Invalid PIN format".to_string());
    }
    let kp = keys::generate_keypair().map_err(err_str)?;
    let public_key = kp.public_key.clone();
    let npub = kp.npub.clone();
    // Encrypt and persist (implementation mirrors import_key_to_state)
    let encrypted = encryption::encrypt_with_pin(&kp.secret_key_hex, &pin).map_err(err_str)?;
    let store = app_handle.store("keys.json").map_err(|e| e.to_string())?;
    store.set("encrypted_key", serde_json::to_value(&encrypted).map_err(err_str)?);
    store.save().map_err(|e| e.to_string())?;
    state.load_key(&kp.secret_key_hex).map_err(err_str)?;
    Ok(PublicKeyPair { public_key, npub })
}
```

Note: The existing `import_key_to_state` command (lines 162-174) already handles the import case. `generate_keypair_and_load` is its generation equivalent. Both should share the persistence and CryptoState load logic.

**Step 2 — Update `key_pair_from_nsec` IPC wrapper** or replace with `import_nsec_and_load` that delegates to `import_key_to_state` logic:

The existing `import_key_to_state` already accepts an nsec, validates it, encrypts with PIN, persists, and loads into CryptoState. The `key_pair_from_nsec` IPC wrapper only needs to be removed from `generate_handler![]` — callers should switch to `import_key_to_state`.

**Step 3 — Remove from `generate_handler![]`** in `apps/desktop/src/lib.rs`:

```rust
// Remove:
crypto::generate_keypair,      // line 175
crypto::key_pair_from_nsec,    // line 178
// Add:
crypto::generate_keypair_and_load,
```

**Step 3b — Remove from isolation allowlist** in `apps/desktop/isolation/index.html`:

Both `'generate_keypair'` (line 54) and `'key_pair_from_nsec'` (line 58) are currently in the isolation allowlist. Remove both entries. After this step, the only way to generate or import a keypair from the webview is through the new `generate_keypair_and_load` command and the existing `import_key_to_state` command — neither of which returns secret key material.

**Step 4 — Update `redeemInvite` in `api.ts`**:

The current signature is `redeemInvite(code: string, pubkey: string, secretKeyHex?: string)`. This must change to accept a pre-signed auth token instead:

```typescript
// Before:
async function redeemInvite(code: string, pubkey: string, secretKeyHex?: string): Promise<void> {
  const tokenJson = await createAuthTokenStateless(secretKeyHex, ...)
  // POST with tokenJson
}

// After:
async function redeemInvite(code: string, pubkey: string, authToken: string): Promise<void> {
  // POST with pre-signed authToken directly
}
```

**Step 5 — Update `platform.ts`** (`src/client/lib/platform.ts`):

```typescript
// Remove:
export async function generateKeyPair(): Promise<KeyPair> { ... }
export async function keyPairFromNsec(nsec: string): Promise<KeyPair> { ... }

// Add:
export async function generateKeypairAndLoad(pin: string): Promise<PublicKeyPair> {
  return tauriInvoke('generate_keypair_and_load', { pin })
}
// importKeyToState already exists — callers use it for nsec import
```

**Step 6 — Update onboarding flow** (`src/client/routes/onboarding.tsx`):

```typescript
// Before:
const kp = await generateKeyPair()
setNsec(kp.nsec)         // nsec enters React state
setPubkey(kp.publicKey)
await redeemInvite(inviteCode, kp.publicKey, kp.secretKeyHex)

// After:
const { publicKey, npub } = await generateKeypairAndLoad(pin)
setPubkey(publicKey)
// Key is in CryptoState; sign server-side
const authToken = await createAuthTokenFromState(Date.now(), 'POST', '/api/auth/redeem-invite')
await redeemInvite(inviteCode, publicKey, authToken)
// Remove setNsec entirely — no nsec state variable needed
```

**Step 7 — Update AdminBootstrap flow** (`src/client/components/setup/AdminBootstrap.tsx`):

```typescript
// Before:
const kp = await generateKeyPair()
setNsec(kp.nsec)
const tokenJson = await createAuthTokenStateless(kp.secretKeyHex, ...)

// After:
const { publicKey } = await generateKeypairAndLoad(pin)
setPubkey(publicKey)
const authToken = await createAuthTokenFromState(Date.now(), 'POST', '/api/auth/bootstrap')
await bootstrapAdmin(publicKey, authToken)
```

**Step 8 — Update sign-in flow** (`src/client/lib/auth.tsx`):

`signIn(nsec: string)` currently calls `keyPairFromNsec(nsec)` → `createAuthTokenStateless(secretKeyHex, ...)`. With the key loaded into CryptoState via `importKeyToState`, signing uses CryptoState directly.

The `import_key_to_state` Rust command (at `apps/desktop/src/crypto.rs:162-175`) requires **three arguments**: `nsec`, `pin`, AND `pubkey_hex`. Therefore `signIn` must also accept a PIN, and the pubkey must be derived first via `isValidNsec` — which validates the nsec and allows deriving the pubkey — followed by `keyPairFromNsec` only to obtain the pubkey hex without storing the secret. A cleaner approach: call `isValidNsec(nsec)` to confirm validity, then call `import_key_to_state` with the pubkey derived from the nsec in the same Rust call. Because `import_key_to_state` already derives and stores the pubkey internally (it accepts `pubkey_hex` as a parameter to avoid redundant derivation), the sign-in form must collect both the nsec and the PIN.

**The `signIn` function signature must change to `signIn(nsec: string, pin: string)`** — the sign-in form must have a PIN field alongside the nsec field.

```typescript
// Before:
const signIn = useCallback(async (nsec: string) => {
  const keyPair = await keyPairFromNsec(nsec)
  const tokenJson = await createAuthTokenStateless(keyPair.secretKeyHex, ...)

// After:
const signIn = useCallback(async (nsec: string, pin: string) => {
  // Validate nsec first (read-only, does not load into CryptoState)
  const isValid = await isValidNsec(nsec)
  if (!isValid) throw new Error('Invalid nsec')
  // Derive the pubkey — key_pair_from_nsec is being removed from generate_handler![],
  // so derive pubkey via a dedicated get_pubkey_from_nsec command, or pass the
  // pubkey_hex from the sign-in form (if the user has it), or add a lightweight
  // Rust command `pubkey_from_nsec(nsec) -> pubkey_hex` that returns only the pubkey.
  // Then call importKeyToState with all three required arguments:
  const { pubkey: pubkeyHex } = await pubkeyFromNsec(nsec) // new minimal command
  await importKeyToState(nsec, pin, pubkeyHex)  // all three args required by Rust
  const authToken = await createAuthTokenFromState(Date.now(), 'POST', '/api/auth/login')
  // ... use authToken for API call
```

Note: A lightweight `pubkey_from_nsec(nsec: String) -> Result<String, String>` Rust command should be added to `crypto.rs` and registered in `generate_handler![]` as a safe stateless helper (returns only the public key, never the secret). This avoids keeping `key_pair_from_nsec` registered just to obtain the pubkey.

**Step 9 — Backup flow**: The `createBackup(nsec, confirmedPin, pubkey, recoveryKeyStr)` function takes the nsec as a JS string. Replace with a Rust command that reads from CryptoState:

```rust
/// Generate an encrypted backup from the key currently in CryptoState.
/// Returns the encrypted backup blob as a hex string for download.
#[tauri::command]
pub fn generate_backup_from_state(
    recovery_key: String,  // User-visible recovery phrase or key
    state: tauri::State<'_, CryptoState>,
) -> Result<String, String> {
    let sk_hex = state.get_secret_key()?;
    // Encrypt with recovery_key and return encrypted blob
    let backup = encryption::create_backup(&sk_hex, &recovery_key).map_err(err_str)?;
    Ok(hex::encode(backup))
}
```

Remove the `nsec` parameter from `createBackup` in `platform.ts` and `api.ts`.

**Verification**: `grep -r "kp\.nsec\|kp\.secretKeyHex\|secretKeyHex\|KeyPair\b" src/client/` must return no results referencing secret key material. The `setNsec` state variable must be removed from both `onboarding.tsx` and `AdminBootstrap.tsx`. Add a Playwright test that generates a keypair through the onboarding flow and asserts the IPC response contains only `publicKey` and `npub`.

---

### CRIT-D2 — `get_nsec_from_state` returns raw nsec bech32 to the webview

**Files**: `apps/desktop/src/crypto.rs:419-434`; `apps/desktop/isolation/index.html:43`; `src/client/lib/platform.ts:590-602`

`get_nsec_from_state` returns the volunteer's raw nsec bech32 string over IPC. The provisioning token guard limits when it can be called, but the command is live and the nsec is materialized as a JS string on any successful call.

**Fix**:

0. **Enumerate all callers first**:
   ```bash
   grep -r "getNsecFromState" src/client/
   ```
   This identifies every route, component, or utility that calls `getNsecFromState` and must be updated before the function is deleted. All call sites must be migrated to `encrypt_nsec_for_provisioning` before step 3 below.

1. Remove `get_nsec_from_state` from `generate_handler![]` in `apps/desktop/src/lib.rs`.
2. Remove `'get_nsec_from_state'` from the isolation allowlist in `apps/desktop/isolation/index.html`.
3. Delete `getNsecFromState()` from `src/client/lib/platform.ts`.
4. Remove `request_provisioning_token` from `generate_handler![]` as well — the one-time token serves no purpose if `get_nsec_from_state` is removed. Note: `request_provisioning_token` is not in the isolation allowlist (only `get_nsec_from_state` is), so no allowlist change is needed for it.
5. All provisioning flows must use `encrypt_nsec_for_provisioning` exclusively, which produces an ECIES-encrypted payload without materializing the nsec in JavaScript. `encrypt_nsec_for_provisioning` is in `generate_handler![]` (line 168) but currently not in the isolation allowlist. Since provisioning is triggered from the webview (the user initiates device linking from the desktop UI), **add `'encrypt_nsec_for_provisioning'` to the isolation allowlist** as a required step. This is the safe replacement for `get_nsec_from_state`: the nsec never crosses the IPC boundary, only the ECIES-encrypted provisioning payload does.

**Verification**: `grep -r "getNsecFromState\|get_nsec_from_state\|request_provisioning_token" src/client/` must return no results. The isolation allowlist must not contain these strings.

---

### CRIT-D3 — `create_auth_token` accepts raw `secret_key_hex` from the webview

**Files**: `apps/desktop/src/crypto.rs:561-571`; `apps/desktop/src/lib.rs:174`; `apps/desktop/isolation/index.html:51`

`create_auth_token` remains in `generate_handler![]` and the isolation allowlist. The preferred stateful replacement `create_auth_token_from_state` exists and should be the only signing command.

**Fix**:

1. Remove `create_auth_token` from `generate_handler![]`.
2. Remove `'create_auth_token'` from the isolation allowlist.
3. Remove `createAuthTokenStateless` from `platform.ts` (or make it throw if called).
4. All sign-in flows must load the key into CryptoState first (`import_nsec_and_load` or `unlock_with_pin`), then use `create_auth_token_from_state` for all signing operations.

**Rationale**: The sign-in flow needs to sign a token before the key is persisted. With CRIT-D1's `import_nsec_and_load` command, the key is loaded into CryptoState atomically. `create_auth_token_from_state` can be called immediately after.

**Verification**: `grep -r "createAuthTokenStateless\|create_auth_token[^_]" src/client/` must return no results. The isolation allowlist must not contain `'create_auth_token'`.

---

### CRIT-D4 — Updater public key is a literal placeholder

**File**: `apps/desktop/tauri.conf.json:70`

Current value: `"pubkey": "REPLACE_WITH_PUBKEY_FROM_TAURI_SIGNER_GENERATE"`. Tauri verifies update payloads against this key. A non-functional pubkey may cause the updater to skip signature verification and install unverified binaries.

**Fix**:

1. Generate a real Ed25519 signing key:
   ```bash
   # Run locally, not in CI
   tauri signer generate -w ~/.tauri/llamenos-updater.key
   ```
   This outputs a private key file and prints the corresponding public key.

2. Store the private key in the repository's CI/CD secrets as `TAURI_SIGNING_PRIVATE_KEY`. The existing `tauri-release.yml` already reads this secret.

3. Commit only the public key to `tauri.conf.json`:
   ```json
   "plugins": {
     "updater": {
       "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk...",
       "endpoints": [...]
     }
   }
   ```

4. Store the private key offline (hardware token or air-gapped machine) in addition to CI secrets. Losing this key requires a full update channel migration.

**Verification**: Build a release binary. Tamper with the `.sig` file. The updater must refuse to install the modified payload.

---

### HIGH-D1 — `unsafe-inline` in `style-src` CSP enables CSS injection exfiltration

**File**: `apps/desktop/tauri.conf.json:24`

`"style-src": "'unsafe-inline' 'self'"` permits CSS injection via crafted content. CSS attribute selectors can exfiltrate form field values character-by-character without JavaScript.

**Fix**:

Remove `'unsafe-inline'` from `style-src`:

```json
"style-src": "'self'"
```

The project uses Tailwind, which generates only static class names, and shadcn/ui, which applies classes via `className` (not inline styles). Verify that no component uses `style={{ ... }}` inline style props that would be blocked by removing `unsafe-inline`. If any are found, replace with Tailwind classes.

**Verification**: After removing `unsafe-inline`, run `bun run tauri:dev` and verify no CSP violations appear in the console. Run `bun run test` (Playwright) and confirm all tests pass.

---

### HIGH-D2 — Isolation allowlist contains commands not in `generate_handler![]`

**File**: `apps/desktop/isolation/index.html:44-58`

Commands in the isolation allowlist but absent from `generate_handler![]`:
- `ecies_unwrap_key`, `decrypt_note`, `decrypt_message`, `encrypt_with_pin`, `decrypt_with_pin`, `get_public_key` — deregistered in crypto.rs with `#[allow(dead_code)]`

Commands to remove from the allowlist as part of this epic (fixes CRIT-D2 and CRIT-D3):
- `get_nsec_from_state`, `create_auth_token`

**Fix**:

1. Remove all of the above from the isolation allowlist in `apps/desktop/isolation/index.html`.

2. Add a CI check that diffs `generate_handler![]` against the isolation allowlist and fails the build if they diverge. Add to `Taskfile` or as a CI step:

```bash
# Extract registered commands from lib.rs
registered=$(grep -oP '(?<=crypto::)\w+' apps/desktop/src/lib.rs | sort)
# Extract commands from isolation allowlist
allowed=$(grep -oP "'\w+'" apps/desktop/isolation/index.html | tr -d "'" | sort)
# Allowlist must be a subset of registered (extra registered commands are OK — not all need IPC exposure)
diff <(echo "$allowed") <(comm -12 <(echo "$allowed") <(echo "$registered"))
```

**Verification**: The isolation allowlist must contain exactly the commands in `generate_handler![]` that are exposed to the webview. No deregistered commands should appear.

---

### HIGH-D3 — PIN lockout counter stored in plain JSON — bypassable with filesystem access

**File**: `apps/desktop/src/crypto.rs:98-157`

`pin_failed_attempts` and `pin_lockout_until` are stored in `settings.json` via `tauri_plugin_store` (plain JSON on disk). An adversary with filesystem access can delete or edit `settings.json` to reset the counter, bypassing the 10-attempt wipe threshold.

**Fix**: Store the PIN lockout counter in Tauri Stronghold, which is already initialized with a PBKDF2-derived KEK in `apps/desktop/src/lib.rs`.

The Stronghold plugin API must be verified against the installed version's documentation before implementation — the API surface varies between tauri-plugin-stronghold versions. The code below is illustrative of intent; consult `tauri-plugin-stronghold` documentation for the exact method signatures:

```rust
// Illustrative — verify against actual tauri-plugin-stronghold API:
// Read counter from Stronghold store
// Write counter to Stronghold store
// Both use the plugin's key-value store interface, not the vault
```

Apply the same approach for `pin_lockout_until` (store as u64 LE bytes).

Remove the `pin_failed_attempts` and `pin_lockout_until` keys from `settings.json`/`tauri_plugin_store` reads/writes in `unlock_with_pin`.

**Note on Stronghold KEK and circular dependency**: `lib.rs` initializes Stronghold with a `|password|` closure that derives a KEK via PBKDF2 from whatever string the plugin passes. There is a potential circular dependency: if Stronghold is locked until the user's PIN is entered, the PIN attempt counter cannot be read from Stronghold before PIN entry — defeating the purpose. Two concrete options resolve this:

- **Option A (preferred): Fixed app-level Stronghold password for the PIN counter vault**. Use a separate Stronghold vault initialized with a fixed application-level password (e.g., derived from a device-bound secret such as machine UUID or a value from the OS keychain, NOT the user's PIN). This vault holds only the PIN attempt counter and lockout timestamp. Because it is initialized at app startup without user input, the counter is always readable before PIN entry. The main key vault (holding the encrypted nsec) remains PIN-protected in Tauri Store or a separate Stronghold vault. This eliminates the circular dependency entirely.

- **Option B: Tauri Store with OS-level encryption (simpler, less tamper-resistant)**. Store the PIN attempt counter in Tauri Store (`settings.json`) as it is today, but enable Tauri Store's OS-level encryption (if available on the target platform) rather than plain JSON. This is simpler but offers weaker tamper resistance than Stronghold — an adversary with filesystem access and knowledge of the OS encryption key can still reset the counter. However, combined with HIGH-D4 (removing `process:allow-restart`), the attack surface is significantly reduced.

If Option A is chosen: verify that `lib.rs` already uses a fixed application-level password for Stronghold initialization (not derived from the user's PIN), which would mean there is no circular dependency and the approach is already sound. Inspect the `|password|` closure in `lib.rs` before implementation.

**Verification**: Set PIN attempts counter to 9 in Stronghold. Attempt one more wrong PIN. Verify the app wipes the key. Then manually inspect `settings.json` and confirm `pin_failed_attempts` is absent from the file.

---

### HIGH-D4 — `process:allow-restart` capability granted unnecessarily

**File**: `apps/desktop/capabilities/default.json:39-40`

`process:allow-restart` is granted. It is not in the isolation allowlist and has no user-facing use case. Combined with HIGH-D3, JavaScript code that achieves execution can force a process restart to cycle the in-memory state after resetting the JSON counter.

**Fix**: Remove `process:allow-restart` from `capabilities/default.json`. Retain `process:allow-exit` only if it is used by an identified user-facing control (e.g., a "Quit" menu item).

```json
// Remove:
"process:allow-exit",
"process:allow-restart"
// Keep only if actively used:
// "process:allow-exit"
```

**Verification**: Search for any `process:restart` invocation in `src/client/`. If none found, the capability is unused and removal is safe.

---

### MED-D1 — `wasm-unsafe-eval` in production Tauri CSP is unnecessary

**File**: `apps/desktop/tauri.conf.json:22`

`'wasm-unsafe-eval'` permits WASM instantiation. All crypto in production routes through native Rust IPC — no WASM runs in the Tauri webview.

**Fix**: Remove `'wasm-unsafe-eval'` from `script-src` in the production Tauri CSP. If WASM is used in Playwright test builds (e.g., WASM crypto mocks), enable it conditionally via a separate build config or environment-specific CSP overrides.

**Verification**: `bun run tauri:dev` with the updated CSP must show no WASM-related CSP violations in the Tauri webview console.

---

### MED-D2 — Stronghold initialized but never used for key storage

**File**: `apps/desktop/src/lib.rs:11-25`; `apps/desktop/capabilities/default.json:9`

Stronghold is initialized with a PBKDF2-derived KEK and the capability is granted, but no IPC commands read from or write to the Stronghold vault. Keys are stored in `tauri-plugin-store` (plain JSON). CLAUDE.md documents Stronghold use, but the implementation uses plain store.

**Fix**: As part of HIGH-D3 (PIN counter in Stronghold), the Stronghold client is established. Extend the migration to include the encrypted nsec blob:

- Store the PIN-encrypted nsec in Stronghold's vault (`client.get_vault`) instead of `keys.json` via `tauri_plugin_store`.
- The `keys.json` Tauri Store entry for `encrypted_key` is replaced by a Stronghold vault record.
- Remove the `keys.json` store reference from `unlock_with_pin` and `generate_keypair_and_load`.

If full Stronghold migration is deferred, add a comment to `lib.rs` documenting the known gap and update CLAUDE.md to reflect the actual implementation.

**Verification**: After migration, `cat ~/.local/share/llamenos/keys.json` (or equivalent platform path) must not contain the encrypted key blob. Key persistence must survive app restart only via Stronghold.

---

### MED-D3 — `__TEST_INVOKE` on `window` exposes full crypto dispatch in test builds

**File**: `tests/mocks/tauri-core.ts:249-251`

```typescript
if (typeof window !== 'undefined') {
  (window as Record<string, unknown>).__TEST_INVOKE = invoke
}
```

The module-level guard at line 12 throws if `import.meta.env.PLAYWRIGHT_TEST` is not set, preventing the mock from loading in production. However, in any test build where the mock is loaded, `__TEST_INVOKE` is attached to `window` under a predictable string key, accessible to any JavaScript in the same browsing context.

**Fix**:

1. Replace the string key with a Symbol to prevent predictable access:

```typescript
export const __TEST_INVOKE_SYMBOL = Symbol('llamenos_test_invoke')

if (typeof window !== 'undefined') {
  (window as Record<symbol, unknown>)[__TEST_INVOKE_SYMBOL] = invoke
}
```

2. Update test helpers that access `__TEST_INVOKE` to import and use `__TEST_INVOKE_SYMBOL` instead.

3. Add an explicit `process.env.NODE_ENV !== 'production'` guard inside the `if (typeof window !== 'undefined')` block as belt-and-suspenders.

**Verification**: In a Playwright test, confirm that `window.__TEST_INVOKE` (string key) returns `undefined`. Confirm that tests using the Symbol-based accessor continue to pass.

---

## Implementation Sequence

All CRIT and HIGH fixes in this epic must be applied together, as they interact:

1. CRIT-D4 (updater key — independent, no code dependency)
2. CRIT-D2 + CRIT-D3 (remove `get_nsec_from_state` and `create_auth_token` from handler + allowlist)
3. HIGH-D2 (sync isolation allowlist — do this immediately after CRIT-D2 + CRIT-D3)
4. CRIT-D1 (new combined keypair generation commands; update onboarding + bootstrap flows)
5. HIGH-D1 (remove `unsafe-inline` from style-src)
6. HIGH-D3 + MED-D2 (Stronghold migration for PIN counter and key storage)
7. HIGH-D4 (remove `process:allow-restart`)
8. MED-D1 (remove `wasm-unsafe-eval`)
9. MED-D3 (Symbol-based `__TEST_INVOKE`)

---

## Verification Checklist

- [ ] `grep -r "getNsecFromState\|get_nsec_from_state" src/client/` returns no results
- [ ] `grep -r "createAuthTokenStateless\|create_auth_token[^_]" src/client/` returns no results
- [ ] `grep -r "kp\.nsec\|kp\.secretKeyHex\|secretKeyHex" src/client/` returns no results
- [ ] Isolation allowlist contains exactly the commands registered in `generate_handler![]`
- [ ] `bun run tauri:dev` shows no CSP violations with `unsafe-inline` and `wasm-unsafe-eval` removed
- [ ] `bun run test` (Playwright) passes fully after IPC command changes
- [ ] `settings.json` does not contain `pin_failed_attempts` or `pin_lockout_until` after Stronghold migration
- [ ] `keys.json` does not contain `encrypted_key` after Stronghold migration
- [ ] `tauri.conf.json` updater `pubkey` is a real Ed25519 public key (not the placeholder string)
- [ ] A tampered `.sig` update file causes the updater to refuse installation
- [ ] PIN lockout survives process restart (Stronghold persistence)
- [ ] PIN lockout counter cannot be reset by editing any JSON file in the app data directory
