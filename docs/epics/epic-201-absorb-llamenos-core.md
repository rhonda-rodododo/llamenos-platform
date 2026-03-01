# Epic 201: Absorb llamenos-core

## Goal

Move `~/projects/llamenos-core` into `packages/crypto/` within the monorepo, preserving full git history. Eliminate the cross-repo dependency and simplify CI/CD.

## Context

Currently `llamenos-core` is a sibling repo at `~/projects/llamenos-core/`. The desktop app depends on it via a path dep in `apps/desktop/Cargo.toml`:
```toml
llamenos-core = { path = "../../../llamenos-core" }  # after Epic 200
```

CI workflows use `sed` to swap this to a git dep for builds that can't have the sibling checkout:
```bash
sed -i 's|llamenos-core = { path = "../../llamenos-core" }|llamenos-core = { git = "https://github.com/rhonda-rodododo/llamenos-core.git" }|' src-tauri/Cargo.toml
```

This is fragile. Absorbing the crate eliminates all cross-repo coordination.

## llamenos-core Structure

```
llamenos-core/
├── Cargo.toml              # Package: llamenos-core, crate-types: [lib, cdylib, staticlib]
├── Cargo.lock
├── src/
│   ├── lib.rs              # Module declarations + public API
│   ├── auth.rs             # Authentication helpers
│   ├── ecies.rs            # ECIES encryption (secp256k1 + XChaCha20-Poly1305)
│   ├── encryption.rs       # Symmetric encryption (XChaCha20-Poly1305)
│   ├── errors.rs           # Error types
│   ├── ffi.rs              # UniFFI interface definitions
│   ├── keys.rs             # Keypair generation, Nostr bech32 encoding
│   ├── labels.rs           # Domain separation constants
│   ├── nostr.rs            # Nostr event signing/verification
│   └── bin/                # uniffi-bindgen binary
├── tests/                  # Integration tests
├── bindings/
│   ├── swift/              # Generated Swift bindings
│   └── kotlin/             # Generated Kotlin bindings
├── scripts/
│   ├── build-mobile.sh     # Build XCFramework + Android .so
│   ├── generate-bindings.sh # Run uniffi-bindgen
│   ├── bump-version.sh
│   └── dev-setup.sh
├── uniffi.toml             # UniFFI config
├── rust-toolchain.toml
├── CLAUDE.md
├── LICENSE
└── .github/workflows/
    ├── ci.yml              # Tests + clippy
    └── release.yml         # Build mobile libs + create release
```

Key deps: `k256 0.13` (ECDH + Schnorr), `chacha20poly1305 0.10`, `hkdf 0.12`, `pbkdf2 0.12`, `sha2 0.10`, `uniffi 0.28` (optional), `wasm-bindgen 0.2` (optional).

Feature flags: `mobile` (enables UniFFI), `uniffi-bindgen` (CLI tool), `wasm` (browser target).

## Implementation

### Step 1: Git Subtree Add (preserves history)

```bash
cd ~/projects/llamenos
git subtree add --prefix=packages/crypto ~/projects/llamenos-core main
```

This merges the entire history of llamenos-core into the monorepo under `packages/crypto/`. Every commit is preserved and `git log --follow packages/crypto/src/ecies.rs` traces back to the original repo.

**Alternative**: `git subtree add --prefix=packages/crypto --squash ~/projects/llamenos-core main` — squashes into a single merge commit. Simpler history but loses individual commit attribution. Given this is a small crate with meaningful commit history, prefer NO squash.

### Step 2: Update Path Dependencies

**`apps/desktop/Cargo.toml`**:
```toml
# Before (after Epic 200):
llamenos-core = { path = "../../../llamenos-core" }

# After:
llamenos-core = { path = "../../packages/crypto" }
```

This path resolves from `apps/desktop/` → `packages/crypto/` — same pattern as buildit's `buildit-crypto = { path = "../../packages/crypto" }`.

### Step 3: Remove CI Workarounds

**`.github/workflows/desktop-e2e.yml`** — Remove the `sed` command that swaps path dep to git dep:
```yaml
# REMOVE this step entirely (note: path is ../../../llamenos-core after Epic 200):
- name: Use llamenos-core from GitHub
  shell: bash
  run: sed -i 's|llamenos-core = { path = "../../../llamenos-core" }|...|' apps/desktop/Cargo.toml
```

**`.github/workflows/tauri-release.yml`** — Same removal.

### Step 4: Add Crypto Tests to Root Scripts

**`package.json`**:
```json
{
  "scripts": {
    "crypto:test": "cargo test --manifest-path packages/crypto/Cargo.toml",
    "crypto:clippy": "cargo clippy --manifest-path packages/crypto/Cargo.toml -- -D warnings",
    "crypto:fmt": "cargo fmt --manifest-path packages/crypto/Cargo.toml --check"
  }
}
```

### Step 5: Update CI to Test Crypto

**`.github/workflows/ci.yml`** — Add a crypto test job:
```yaml
crypto-tests:
  needs: changes
  if: needs.changes.outputs.docs_only != 'true'
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@v4
    - uses: dtolnay/rust-toolchain@stable
    - uses: swatinem/rust-cache@v2
      with:
        workspaces: packages/crypto
    - run: cargo test --manifest-path packages/crypto/Cargo.toml
    - run: cargo clippy --manifest-path packages/crypto/Cargo.toml -- -D warnings
```

Update `APP_PATTERNS` to include `packages/`:
```bash
APP_PATTERNS="^src/|^apps/|^packages/|^tests/|..."
```

### Step 6: Remove repository_dispatch

The `ci.yml` currently listens for `repository_dispatch: types: [core-updated]` from llamenos-core. Since the crate is now in-repo, this trigger is no longer needed. Remove it.

### Step 7: Update Documentation

- `CLAUDE.md`: Remove llamenos-core sibling requirement, update path dep reference, update `cargo test` command
- `docs/DEVELOPMENT.md`: Remove cross-repo setup instructions

### Step 8: Archive llamenos-core Repo

After merge is confirmed working:
1. Add a `README.md` to llamenos-core pointing to `packages/crypto/` in the monorepo
2. Archive the repo on GitHub (Settings → Archive)
3. Don't delete — the git subtree preserves history but the original repo serves as provenance

## Flatpak Manifest Update

**`flatpak/org.llamenos.Hotline.yml`** — The llamenos-core module is no longer needed as a separate git source. Remove the entire `llamenos-core` module and the symlink command:

```yaml
# REMOVE the llamenos-core module entirely:
# - name: llamenos-core
#   buildsystem: simple
#   build-commands:
#     - cp -r . /run/build/llamenos-core
#   sources:
#     - type: git
#       url: https://github.com/rhonda-rodododo/llamenos-core.git
#       branch: main

# In the desktop build commands, REMOVE the symlink:
# - ln -sf /run/build/llamenos-core ../llamenos-core
```

The crate is now at `packages/crypto/` within the source tree, so the path dep resolves naturally.

### Step 8b: Verify Mobile Build Scripts

After absorption, verify that `packages/crypto/scripts/build-mobile.sh` still works from its new location. The script uses relative paths for output (`dist/`) — ensure these resolve correctly:

```bash
cd packages/crypto
./scripts/build-mobile.sh ios    # → packages/crypto/dist/ios/LlamenosCoreFFI.xcframework
./scripts/build-mobile.sh android # → packages/crypto/dist/android/jniLibs/
```

If the scripts use `$SCRIPT_DIR` or `$(dirname $0)` for path resolution (which they should), they'll work in the new location. If they use hardcoded paths, update them. This is a prerequisite for Epics 206-207.

## Verification Checklist

1. `cargo test --manifest-path packages/crypto/Cargo.toml` — all crypto tests pass
2. `cargo clippy --manifest-path packages/crypto/Cargo.toml` — no warnings
3. `bun run tauri:dev` — desktop app builds and launches with in-repo crypto
4. `bun run typecheck` — still passes
5. `bun run build` — still passes
6. `bun run test` — Playwright E2E tests pass
7. `git log --follow packages/crypto/src/ecies.rs` — shows history from original repo
8. CI workflows no longer reference `llamenos-core` as external dep

## Risk Assessment

- **Low risk**: `git subtree add` is well-tested and non-destructive
- **Low risk**: Path dep update is a one-line change
- **Medium risk**: Flatpak manifest change — Flatpak builds may need testing
- **Mitigation**: The original repo remains archived as fallback

## Dependencies

- Epic 200 (Monorepo Foundation)

## Blocks

- Epic 202 (Protocol Schema & Codegen) — needs `packages/crypto` for Rust type generation
- Epic 206 (iOS Foundation) — needs UniFFI bindings from `packages/crypto`
- Epic 207 (Android Foundation) — needs JNI bindings from `packages/crypto`
