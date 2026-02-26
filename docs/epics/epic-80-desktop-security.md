# Epic 80: Desktop Security Hardening (Tauri v2)

## Problem Statement

The Tauri desktop app (Epic 75) currently runs the Llamenos SPA inside a webview with basic configuration. While Tauri v2 provides a strong security foundation compared to Electron (no Node.js in the main process, capability-based permissions), the current setup has several gaps:

1. **No isolation pattern**: Malicious scripts injected into the webview via XSS can directly invoke Tauri IPC commands, accessing crypto operations and Stronghold.
2. **Overly broad capabilities**: The default capability grants `fs:default`, `shell:default`, and other permissions the app does not need. An attacker who compromises the webview inherits all of these.
3. **Stronghold password derivation uses SHA-256**: The current `lib.rs` derives the Stronghold password via a single SHA-256 hash of the PIN, which is fast to brute-force.
4. **No update signing**: The updater plugin is configured but inactive (`"active": false`). No signature verification is set up.
5. **Crypto keys in webview memory**: The JS `key-manager.ts` still holds the nsec in a closure variable when unlocked. On desktop, this should live in the Rust process / Stronghold instead.
6. **No build reproducibility for desktop binaries**: Epic 79 covers web builds but not Tauri/Rust compilation.
7. **CSP allows `'unsafe-inline'` for styles**: While required by some UI libraries, this widens the attack surface for CSS injection.

**Threat model**: Llamenos protects against well-funded adversaries (nation states, right-wing groups, private hacking firms). The desktop app is a privileged environment — if compromised, the attacker gains access to the volunteer's nsec, all decrypted notes, and call audio. Every layer of defense matters.

## Requirements

### Non-Functional Requirements

- **Defense in depth**: Multiple layers so that a single vulnerability does not compromise the entire system
- **Least privilege**: The webview can only invoke the exact IPC commands it needs
- **Key isolation**: Secret keys never exist in webview-accessible memory
- **Verifiable builds**: Anyone can reproduce the exact desktop binary from source
- **Automatic updates**: Signed updates that cannot be spoofed

## Technical Design

### Phase 1: Tauri Isolation Pattern

**What it does**: The isolation pattern injects a cryptographic sandboxing layer between the webview and Tauri core IPC. All IPC messages pass through an isolation script that can validate, filter, and transform them before they reach the Rust backend. Even if an attacker achieves arbitrary JS execution in the webview, they cannot bypass the isolation layer to invoke raw IPC commands.

**Security rationale**: Without isolation, XSS in the webview = full IPC access = Stronghold access = nsec extraction. With isolation, the attacker must also defeat the isolation script, which runs in a separate, locked-down context.

**Implementation**:

1. Create `src-tauri/isolation/` directory with the isolation script:

```javascript
// src-tauri/isolation/index.js
//
// This script runs in a separate, sandboxed iframe with a unique origin.
// It intercepts all IPC calls from the webview and validates them before
// forwarding to the Tauri core.

window.__TAURI_ISOLATION_HOOK__ = (payload) => {
  // Allowlist of commands the webview may invoke
  const ALLOWED_COMMANDS = new Set([
    'ecies_wrap_key',
    'ecies_unwrap_key',
    'encrypt_note',
    'decrypt_note',
    'encrypt_message',
    'decrypt_message',
    'create_auth_token',
    'encrypt_with_pin',
    'decrypt_with_pin',
    'generate_keypair',
    'get_public_key',
    'verify_schnorr',
    // Stronghold plugin commands
    'plugin:stronghold|initialize',
    'plugin:stronghold|save',
    'plugin:stronghold|load',
    'plugin:stronghold|remove',
    // Notification plugin commands
    'plugin:notification|notify',
    'plugin:notification|requestPermission',
    // Store plugin commands
    'plugin:store|get',
    'plugin:store|set',
    'plugin:store|delete',
    // Updater plugin commands
    'plugin:updater|check',
    'plugin:updater|install',
  ]);

  const cmd = payload?.cmd;
  if (!cmd || !ALLOWED_COMMANDS.has(cmd)) {
    return Promise.reject(
      new Error(`IPC command '${cmd}' is not allowed by the isolation policy`)
    );
  }

  return payload;
};
```

2. Enable isolation in `tauri.conf.json`:

```json
{
  "app": {
    "security": {
      "pattern": {
        "use": "isolation",
        "options": {
          "dir": "../isolation"
        }
      }
    }
  }
}
```

**Acceptance criteria**:
- [ ] Isolation pattern enabled in `tauri.conf.json`
- [ ] Isolation script validates all IPC commands against an allowlist
- [ ] Attempting to invoke an unlisted command from the webview is rejected
- [ ] E2E test: inject a script that tries to invoke `plugin:fs|readFile` and verify it fails
- [ ] All existing crypto IPC commands continue to work through the isolation layer

---

### Phase 2: Stronghold Integration with Proper Key Derivation

**What it does**: Replace the SHA-256 password derivation with PBKDF2-SHA256 (600K iterations), matching the web app's key derivation parameters. The nsec should be stored in Stronghold exclusively on desktop — the webview's `key-manager.ts` delegates to Stronghold via IPC instead of holding the nsec in a JS closure.

**Security rationale**: A single SHA-256 hash over a 4-6 digit PIN is brute-forceable in seconds on consumer hardware. PBKDF2 with 600K iterations raises the cost to hours/days. Moving the nsec out of webview memory means XSS cannot extract it even with full JS execution control — the attacker would need to compromise the Rust process.

**Implementation**:

1. Update `lib.rs` Stronghold password derivation:

```rust
.plugin(
    tauri_plugin_stronghold::Builder::new(|password| {
        use sha2::Sha256;
        use hmac::Hmac;
        use pbkdf2::pbkdf2;

        // Match web app's PBKDF2 parameters (600K iterations)
        let salt = b"llamenos:stronghold:v1";
        let mut kek = vec![0u8; 32];
        pbkdf2::<Hmac<Sha256>>(
            password.as_bytes(),
            salt,
            600_000,
            &mut kek,
        ).expect("PBKDF2 derivation failed");
        kek
    })
    .build(),
)
```

2. Add Tauri commands for Stronghold-backed key management:

```rust
#[tauri::command]
async fn stronghold_store_nsec(
    app: tauri::AppHandle,
    nsec_hex: String,
) -> Result<(), String> {
    // Store nsec in Stronghold vault
    // The PIN-derived KEK protects the Stronghold file
}

#[tauri::command]
async fn stronghold_load_nsec(
    app: tauri::AppHandle,
) -> Result<String, String> {
    // Load nsec from Stronghold vault
    // Only callable after Stronghold is unlocked with PIN
}

#[tauri::command]
async fn stronghold_clear(
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Zero and lock the Stronghold vault
    // Called on lock/quit
}
```

3. Modify `key-manager.ts` to detect Tauri and delegate:

```typescript
// On desktop: nsec lives in Stronghold, not in JS closure
async function unlockFromStronghold(pin: string): Promise<void> {
  if (window.__TAURI__) {
    await invoke('plugin:stronghold|initialize', { password: pin })
    const nsecHex = await invoke('stronghold_load_nsec')
    publicKey = await invoke('get_public_key', { secretKeyHex: nsecHex })
    // nsecHex is NOT stored in the JS closure — it stays in Rust
  }
}
```

**Acceptance criteria**:
- [ ] Stronghold password derived via PBKDF2-SHA256 with 600K iterations and domain-separated salt
- [ ] nsec stored in Stronghold, not localStorage/IndexedDB, on desktop
- [ ] `key-manager.ts` detects Tauri and delegates key storage to Stronghold
- [ ] PIN unlock flow works through Stronghold on desktop
- [ ] Browser fallback unchanged (existing localStorage path)
- [ ] Locking the app clears the Stronghold session (zeroizes in-memory keys)

---

### Phase 3: CSP Hardening

**What it does**: Tighten the Content Security Policy for the desktop webview. Remove `'unsafe-inline'` for styles where possible, restrict `connect-src` to the specific API server origin, and ensure no `eval`-like capabilities are available.

**Security rationale**: A strict CSP is the primary defense against XSS in the webview. `'unsafe-inline'` for styles enables CSS-based data exfiltration attacks. `connect-src` limits where injected scripts can send stolen data.

**Implementation**:

Update `tauri.conf.json` CSP:

```json
{
  "app": {
    "security": {
      "csp": {
        "default-src": "'self' customprotocol: asset:",
        "script-src": "'self'",
        "connect-src": "ipc: http://ipc.localhost https://app.llamenos.org wss://relay.llamenos.org",
        "img-src": "'self' asset: http://asset.localhost blob: data:",
        "style-src": "'self' 'nonce-{RANDOM}'",
        "font-src": "'self'",
        "object-src": "'none'",
        "base-uri": "'self'",
        "form-action": "'none'",
        "frame-ancestors": "'none'"
      },
      "freezePrototype": true
    }
  }
}
```

**Notes**:
- If `'unsafe-inline'` for styles cannot be removed due to shadcn/ui or Tailwind runtime injection, document the specific reason and constrain it with a nonce or hash approach.
- The wildcard `https://*.llamenos.org` in `connect-src` should be replaced with the exact origins the app connects to.
- `object-src: 'none'`, `base-uri: 'self'`, `form-action: 'none'`, and `frame-ancestors: 'none'` close common XSS escalation paths.

**Acceptance criteria**:
- [ ] `script-src` set to `'self'` (no `'unsafe-eval'`, no `'unsafe-inline'`)
- [ ] `connect-src` lists only the specific API and relay origins
- [ ] `object-src` set to `'none'`
- [ ] `base-uri`, `form-action`, `frame-ancestors` locked down
- [ ] `style-src` uses nonce or hash instead of `'unsafe-inline'` (or documents why it cannot)
- [ ] All app functionality verified working under the hardened CSP
- [ ] E2E test: verify that inline script injection is blocked by CSP

---

### Phase 4: IPC Command Allowlist (Capability Scoping)

**What it does**: Replace the broad `fs:default`, `shell:default`, and other default permissions with the minimum specific permissions required. The current `capabilities/default.json` grants far more access than the app needs.

**Security rationale**: Default plugin permissions often include dangerous capabilities like arbitrary file reads, shell command execution, and directory listing. If the webview is compromised, these become the attacker's toolkit. Scoping permissions to exactly what the app needs limits blast radius.

**Implementation**:

Rewrite `capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Minimum capabilities for the Hotline desktop app",
  "windows": ["main"],
  "permissions": [
    "core:default",

    "stronghold:default",

    "store:allow-get",
    "store:allow-set",
    "store:allow-delete",

    "notification:allow-notify",
    "notification:allow-is-permission-granted",
    "notification:allow-request-permission",

    "updater:allow-check",
    "updater:allow-download-and-install",

    "window-state:allow-restore-state",
    "window-state:allow-save-window-state",

    "autostart:allow-enable",
    "autostart:allow-disable",
    "autostart:allow-is-enabled",

    "log:default"
  ]
}
```

**What was removed and why**:
- `fs:default` -- the app does not need arbitrary filesystem access. If backup export is needed, use a Tauri file dialog command scoped to specific paths.
- `shell:default` -- the app does not need to execute shell commands. If `open` (for URLs) is needed, add only `shell:allow-open`.

**Acceptance criteria**:
- [ ] `fs:default` removed from capabilities (or replaced with specific scoped permissions if backup export needs it)
- [ ] `shell:default` removed from capabilities (or replaced with `shell:allow-open` if URL opening is needed)
- [ ] All 12 crypto IPC commands work without additional permissions (they are custom commands, not plugin commands)
- [ ] Each plugin permission is documented with its justification
- [ ] Attempting to use a removed capability from the webview returns an error
- [ ] E2E test: verify that `window.__TAURI__.fs.readFile('/etc/passwd')` is rejected

---

### Phase 5: Auto-Updater Security

**What it does**: Enable the Tauri updater plugin with signature verification. Updates are signed with an Ed25519 key. The public key is embedded in the app binary; the private key is held in CI secrets (or an HSM). Supports self-hosted update servers for operators who do not trust GitHub releases.

**Security rationale**: Without signed updates, an attacker who compromises the update channel (DNS, CDN, MITM) can push malicious binaries to all users. Tauri's updater verifies Ed25519 signatures before applying updates, making this attack require compromise of the signing key.

**Implementation**:

1. Generate update signing keypair:

```bash
bunx @tauri-apps/cli signer generate -w ~/.tauri/llamenos-update-key.key
```

2. Update `tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "pubkey": "<Ed25519 public key from generation step>",
      "endpoints": [
        "https://releases.llamenos.org/{{target}}/{{arch}}/{{current_version}}"
      ],
      "dialog": true,
      "windows": {
        "installMode": "passive"
      }
    }
  }
}
```

3. CI signs binaries during release:

```yaml
- name: Build Tauri (signed)
  env:
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PASSWORD }}
  run: bunx @tauri-apps/cli build
```

4. Self-hosted update server support:
   - Operators configure `endpoints` in their build to point to their own server
   - Server serves a JSON manifest with version, download URL, and signature
   - Same Ed25519 verification regardless of hosting

**Acceptance criteria**:
- [ ] Updater enabled with Ed25519 public key embedded in the binary
- [ ] CI builds sign all desktop binaries with the private key
- [ ] Update check verifies signature before download/install
- [ ] Self-hosted endpoint documented and tested
- [ ] Rollback: if signature verification fails, update is rejected with user-facing error
- [ ] Update manifest includes SHA-256 hash of the binary alongside the Ed25519 signature
- [ ] E2E test: serve an unsigned update and verify the app rejects it

---

### Phase 6: Memory Protection and Process Isolation

**What it does**: Ensure all cryptographic operations happen in the Rust process, not the webview. The nsec, derived keys, and plaintext note content should never exist in webview-accessible memory. On lock or quit, all sensitive memory in the Rust process is zeroized.

**Security rationale**: The webview is the most exposed attack surface (renders untrusted content, runs JS). If crypto keys exist only in the Rust process, a webview compromise (XSS, browser engine bug) cannot directly extract them. The attacker would need a separate Rust process exploit.

**Implementation**:

1. **Crypto operations stay in Rust**: The existing `crypto.rs` commands already delegate to `llamenos-core`. This is correct. What must change is that the webview never receives raw key material:

```rust
// CURRENT (leaks nsec to webview):
#[tauri::command]
fn decrypt_with_pin(data: EncryptedKeyData, pin: String) -> Result<String, String> {
    // Returns nsec hex string to the webview!
    encryption::decrypt_with_pin(&data, &pin).map_err(err_str)
}

// NEW (nsec stays in Rust):
#[tauri::command]
fn unlock_with_pin(
    state: tauri::State<'_, CryptoState>,
    data: EncryptedKeyData,
    pin: String,
) -> Result<String, String> {
    let nsec = encryption::decrypt_with_pin(&data, &pin).map_err(err_str)?;
    let pubkey = keys::get_public_key(&nsec).map_err(err_str)?;
    // Store nsec in Rust state, return only pubkey
    state.set_secret_key(nsec);
    Ok(pubkey)
}
```

2. **Zeroize on lock/quit**:

```rust
use zeroize::Zeroize;

struct CryptoState {
    secret_key: Mutex<Option<ZeroizingVec<u8>>>,
}

impl CryptoState {
    fn lock(&self) {
        let mut key = self.secret_key.lock().unwrap();
        if let Some(ref mut k) = *key {
            k.zeroize();
        }
        *key = None;
    }
}

// On app quit:
app.on_window_event(|event| {
    if let tauri::WindowEvent::Destroyed = event.event() {
        crypto_state.lock();
    }
});
```

3. **Wire up to app lifecycle**:
   - Lock event (idle timeout, manual lock): `crypto_state.lock()`
   - Quit event: `crypto_state.lock()` before process exit
   - Sleep/hibernate: `crypto_state.lock()` (requires OS event listener)

**Acceptance criteria**:
- [ ] nsec hex string is never returned to the webview (only pubkey returned after unlock)
- [ ] All crypto operations that need the nsec use the Rust-side `CryptoState`
- [ ] `CryptoState` uses `zeroize` to clear sensitive memory on lock
- [ ] Lock/quit/sleep events trigger zeroization
- [ ] After locking, all crypto commands that require the nsec return an error until re-unlocked
- [ ] Memory dump of the Rust process after lock shows no residual key material (manual verification)

---

### Phase 7: Build Reproducibility for Desktop

**What it does**: Extend Epic 79's reproducible build pipeline to Tauri desktop builds. Deterministic Rust compilation, pinned toolchain, content-hashed output, and signed binaries published alongside web build checksums.

**Security rationale**: Same as Epic 79 — users must be able to verify that the desktop binary they download matches the open source repository. Desktop binaries are especially important because they run with more privileges than a web app.

**Implementation**:

1. **Pin Rust toolchain** (already partially done via `rust-toolchain.toml`):

```toml
[toolchain]
channel = "1.85.0"
components = ["rustfmt", "clippy"]
targets = ["x86_64-apple-darwin", "aarch64-apple-darwin", "x86_64-pc-windows-msvc"]
```

2. **Deterministic Cargo builds**:

```bash
# Set SOURCE_DATE_EPOCH for Rust (eliminates build timestamps)
export SOURCE_DATE_EPOCH=$(git log -1 --format=%ct)

# Lock Cargo dependencies
cargo build --locked --release
```

3. **Dockerfile.build-desktop**:

```dockerfile
FROM rust:1.85.0-bookworm@sha256:<pinned-digest>

# Pin Bun version for frontend build
COPY --from=oven/bun:1.0.25-alpine@sha256:<pinned-digest> /usr/local/bin/bun /usr/local/bin/bun

ENV SOURCE_DATE_EPOCH=0
ENV CARGO_INCREMENTAL=0
ENV RUSTFLAGS="-C strip=none"

WORKDIR /build
COPY . .

RUN bun install --frozen-lockfile
RUN cargo build --locked --release
```

4. **CI publishes desktop checksums alongside web checksums**:

```yaml
- name: Checksum desktop binaries
  run: |
    sha256sum target/release/bundle/appimage/*.AppImage >> CHECKSUMS.txt
    sha256sum target/release/bundle/dmg/*.dmg >> CHECKSUMS.txt
    sha256sum target/release/bundle/msi/*.msi >> CHECKSUMS.txt
```

**Known limitations**:
- Rust reproducible builds are not yet fully deterministic across all platforms (debug info, linker differences). Focus on same-platform reproducibility first.
- macOS code signing adds non-reproducible metadata to the binary. Verification compares the unsigned binary, with signing as a separate step.
- AppImage, DMG, and MSI packaging tools may introduce their own non-determinism. Document and mitigate per-format.

**Acceptance criteria**:
- [ ] `rust-toolchain.toml` pins exact Rust version with all required targets
- [ ] `Cargo.lock` committed and `--locked` used in CI
- [ ] `SOURCE_DATE_EPOCH` set from git commit time in CI
- [ ] Two builds from the same source on the same platform produce identical unsigned binaries
- [ ] Desktop binary checksums published in the same GitHub Release as web checksums
- [ ] `verify-build.sh` updated to verify desktop binaries (same-platform only)

---

### Phase 8: Single Instance Enforcement

**What it does**: Prevent multiple instances of the desktop app from running simultaneously. The current `single-instance` plugin is already configured but this phase hardens it.

**Security rationale**: Multiple instances can cause Stronghold lock file conflicts, duplicate relay subscriptions (causing event deduplication failures), and confusing UX where a volunteer might answer a call from one instance without the other knowing.

**Implementation**:

The existing `tauri_plugin_single_instance` in `lib.rs` handles this correctly:

```rust
.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}))
```

**Additional hardening**:

1. **Stronghold lock file**: Verify that Stronghold's file-level lock prevents corruption if single-instance detection fails (e.g., process crash leaves lock file).

2. **Startup check**: Before initializing Stronghold, verify no stale lock files exist. If the previous instance crashed, clean up and proceed.

3. **User feedback**: When the second instance is blocked, the first instance should visually flash/bounce to indicate it is already running.

**Acceptance criteria**:
- [ ] Second app launch focuses the existing window instead of opening a new instance
- [ ] Stronghold lock file is cleaned up on crash recovery
- [ ] No data corruption if single-instance detection races (process A starting while process B is shutting down)
- [ ] Visual feedback on the existing window when a second launch attempt is detected

## Implementation Phases Summary

| Phase | Description | Duration | Dependencies |
|-------|-------------|----------|-------------|
| 1 | Tauri Isolation Pattern | 3 days | None |
| 2 | Stronghold + PBKDF2 key derivation | 4 days | Phase 1 |
| 3 | CSP Hardening | 2 days | Phase 1 |
| 4 | IPC Command Allowlist | 2 days | Phase 1 |
| 5 | Auto-Updater Security | 3 days | None (parallel with 2-4) |
| 6 | Memory Protection | 4 days | Phase 2 |
| 7 | Build Reproducibility | 3 days | Phase 5, Epic 79 |
| 8 | Single Instance Hardening | 1 day | Phase 2 |

**Total estimated duration**: ~3 weeks (phases 1-4 are sequential; 5 can run in parallel)

## Security Considerations

### Attack Surface Reduction

| Attack Vector | Before | After |
|--------------|--------|-------|
| XSS -> IPC access | Full IPC access | Isolation pattern blocks unlisted commands |
| XSS -> nsec extraction | nsec in JS closure | nsec only in Rust process |
| XSS -> filesystem read | `fs:default` allows it | `fs` capability removed |
| XSS -> shell execution | `shell:default` allows it | `shell` capability removed |
| Stronghold brute-force | SHA-256 (instant) | PBKDF2 600K iterations |
| Malicious update | No signature check | Ed25519 verification |
| Memory dump after lock | nsec in JS heap | Zeroized in Rust |
| CSS injection | `'unsafe-inline'` styles | Nonce-based or removed |

### Residual Risks

1. **Webview engine 0-day**: A browser engine vulnerability could bypass all webview-level protections. Mitigation: keep WebView2/WKWebView updated, isolation pattern limits post-exploitation utility.
2. **Rust process compromise**: If the attacker achieves code execution in the Rust process, all keys are accessible. Mitigation: minimal Rust surface area, audited dependencies.
3. **OS-level keylogger**: Cannot protect against a compromised OS capturing PIN entry. Mitigation: out of scope (hardware security key support is a future consideration).

## Success Criteria

1. **Isolation**
   - [ ] Isolation pattern enabled and tested
   - [ ] IPC allowlist blocks all unlisted commands
   - [ ] CSP blocks inline scripts and restricts connections

2. **Key Protection**
   - [ ] nsec never exists in webview memory on desktop
   - [ ] Stronghold uses PBKDF2 with 600K iterations
   - [ ] Memory zeroized on lock/quit/sleep

3. **Capabilities**
   - [ ] `fs:default` and `shell:default` removed
   - [ ] Each permission documented with justification
   - [ ] Attempting removed capabilities returns an error

4. **Updates**
   - [ ] Signed updates with Ed25519 verification
   - [ ] Self-hosted update server documented
   - [ ] Unsigned updates rejected

5. **Reproducibility**
   - [ ] Desktop builds reproducible on same platform
   - [ ] Checksums published in GitHub Releases

## Dependencies

- **Epic 75 (Native Call Clients)** -- the desktop app this epic hardens
- **Epic 79 (Reproducible Builds)** -- Phase 7 extends this to desktop
- **Epic 81 (Native Crypto Migration)** -- Phase 6 (memory protection) aligns with the platform abstraction layer
- **llamenos-core crate** -- Rust crypto operations already exist; this epic ensures they are used exclusively on desktop

## Open Questions

1. **`style-src 'unsafe-inline'` removal**: Can shadcn/ui and Tailwind work without inline styles in the Tauri webview? Needs investigation. If not, document the specific components that require it and use CSP hashes for known inline styles.

2. **Stronghold vs OS Keychain**: Should the nsec be stored in Stronghold (cross-platform, Tauri-managed) or the OS keychain (macOS Keychain, Windows Credential Manager)? Stronghold is recommended for consistency and Tauri integration, but OS keychains offer hardware-backed protection on macOS (Secure Enclave).

3. **Sleep event detection**: Does Tauri expose OS sleep/hibernate events? If not, the zeroize-on-sleep behavior requires platform-specific native code.

4. **Isolation pattern + Stronghold plugin**: Verify that Stronghold plugin IPC commands work correctly through the isolation layer. The isolation script must allowlist the correct plugin command identifiers.

## Execution Context

### Current Tauri Configuration
- `src-tauri/tauri.conf.json` -- CSP config, updater config, window config
- `src-tauri/capabilities/default.json` -- overly broad `fs:default`, `shell:default`
- `src-tauri/src/lib.rs` -- Stronghold with SHA-256 password, plugin registration, system tray
- `src-tauri/src/crypto.rs` -- 12 IPC commands wrapping llamenos-core
- `src-tauri/Cargo.toml` -- dependencies including stronghold, fs, shell plugins

### Key Files to Modify
- `src-tauri/src/lib.rs` -- Stronghold PBKDF2, isolation setup, CryptoState, lifecycle events
- `src-tauri/src/crypto.rs` -- commands that should not return nsec to webview
- `src-tauri/tauri.conf.json` -- isolation pattern, CSP, updater config
- `src-tauri/capabilities/default.json` -- scoped permissions
- `src/client/lib/key-manager.ts` -- Tauri-aware delegation to Stronghold
- `src-tauri/Cargo.toml` -- add `zeroize`, `pbkdf2`, `hmac` dependencies

### Existing llamenos-core Commands
The following 12 commands are already registered and should remain in the isolation allowlist:
- `ecies_wrap_key`, `ecies_unwrap_key`
- `encrypt_note`, `decrypt_note`
- `encrypt_message`, `decrypt_message`
- `create_auth_token`
- `encrypt_with_pin`, `decrypt_with_pin`
- `generate_keypair`, `get_public_key`
- `verify_schnorr`
