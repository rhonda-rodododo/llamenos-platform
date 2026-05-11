# Workspace Bootstrap Automation Design

**Date:** 2026-05-10
**Status:** Approved
**Related:** `.mise.toml`, `package.json`, `scripts/dev-setup.sh`

## Problem

New contributors face a multi-step, error-prone setup process. Existing developers run manual commands after pulling changes that affect generated code (schemas, i18n, crypto). There is no single command that bootstraps the entire monorepo from a fresh clone, and no automated hook that keeps the workspace in sync after `bun install`.

## Goals

1. **One-command first-time setup**: A new contributor runs a single command and gets a fully working development environment.
2. **Automated post-install sync**: After `bun install`, the workspace automatically rebuilds generated artifacts (codegen, crypto, i18n) so developers never work with stale generated code.
3. **Platform-aware**: Skip platform-specific steps when the required toolchain is missing (e.g., skip iOS on Linux without macOS SSH).
4. **Idempotent**: Both commands can be re-run safely. `workspace-setup` always regenerates codegen but skips expensive crypto builds when artifacts are up-to-date.
5. **Documented**: All setup documentation references the new commands.

## Non-Goals

- Replacing `mise install` — mise still manages tool versions.
- Installing system-level dependencies (Docker, Xcode, Android Studio) — we check and warn, but don't install.
- Running in CI — these are developer-experience commands; CI continues to use explicit `bun run` scripts.

## Design

### Two Commands

#### 1. `mise run setup` (First-Time Setup)

Runs once per developer machine. Replaces the manual steps in README.md and DEVELOPMENT_SETUP.md.

**What it does:**

| Step | Description | Failure Behavior |
|------|-------------|------------------|
| 1. Check upstream sync | Verify local `main` has all commits from `origin/main` | Exit with message if behind |
| 2. Check prerequisites | Verify Bun, Rust, Docker, mise are installed | Fail with install instructions |
| 3. `mise install` | Install pinned tools (Bun, Java, Ruby) | Fail |
| 4. `bun install` | Install all workspace dependencies | Fail |
| 5. Build crypto (server) | `cargo build` in `packages/crypto` | Fail |
| 6. Run codegen | `bun run codegen` | Fail |
| 7. Run i18n codegen | `bun run i18n:codegen` | Fail |
| 8. Build crypto (iOS) | `packages/crypto/scripts/build-mobile.sh ios` | Warn and skip if not on macOS |
| 9. Build crypto (Android) | `packages/crypto/scripts/build-mobile.sh android` | Warn and skip if NDK missing |
| 10. iOS setup | `xcodegen generate`, `bundle install` in `apps/ios/` | Warn and skip if not on macOS |
| 11. Android setup | `./gradlew` sync in `apps/android/` | Warn and skip if Android SDK missing |
| 12. Generate `.env` | Copy `.env.example` → `.env` if `.env` missing | Warn if `.env.example` missing |
| 13. Version sync check | `bash scripts/sync-versions.sh` | Warn if out of sync |

**Interface:**
```bash
mise run setup              # Full first-time setup
mise run setup --quick      # Skip mobile builds (desktop/backend only)
```

#### 2. `bun run workspace-setup` (Post-Install Hook)

Runs automatically after `bun install` via `package.json` `postinstall`. Assumes mise and all toolchains are already installed.

**What it does:**

| Step | Description | Skip Condition |
|------|-------------|----------------|
| 1. Check upstream sync | Verify local branch has all commits from `origin/main` | Exit with message if behind |
| 2. Run codegen | `bun run codegen` | Always run — ensures latest generated output |
| 3. Run i18n codegen | `bun run i18n:codegen` | Always run — ensures latest generated output |
| 4. Build crypto (server) | `cargo build` in `packages/crypto` | Skip if `target/` artifacts are newer than `src/` |
| 5. Build crypto (iOS) | `packages/crypto/scripts/build-mobile.sh ios` | Only if `--ios` flag or branch name matches `feat/ios-*` / `feat/mobile-*` |
| 6. Build crypto (Android) | `packages/crypto/scripts/build-mobile.sh android` | Only if `--android` flag or branch name matches `feat/android-*` / `feat/mobile-*` |
| 7. Copy iOS artifacts | Copy XCFramework + Swift bindings to `apps/ios/` | Skip if already in place and up-to-date |
| 8. Copy Android artifacts | Copy `.so` files to `apps/android/app/src/main/jniLibs/` | Skip if already in place and up-to-date |

**Interface:**
```bash
bun run workspace-setup              # Manual run (skips mobile by default)
bun run workspace-setup --force      # Skip timestamp checks, rebuild everything
bun run workspace-setup --ios        # Include iOS crypto build
bun run workspace-setup --android    # Include Android crypto build
```

Mobile builds are skipped by default for speed. Pass `--ios` or `--android` explicitly, or use branch names like `feat/ios-*` / `feat/android-*` / `feat/mobile-*` to auto-enable them.

**Post-install integration:**
```json
// package.json
{
  "scripts": {
    "postinstall": "bun run workspace-setup",
    "workspace-setup": "bash scripts/workspace-setup.sh"
  }
}
```

### Implementation: `scripts/workspace-setup.sh`

A new Bash script that orchestrates the post-install steps.

**Key behaviors:**

- **Always regenerate codegen**: `codegen` and `i18n:codegen` always run to ensure generated output is never stale. Other steps use timestamp checking to skip unnecessary work.
- **Platform detection**: Uses `uname` and command existence to determine what can be built.
- **Graceful degradation**: Missing mobile toolchains produce warnings, not failures.
- **Colorized output**: Green = done, yellow = skipped, red = error.
- **Exit codes**: 0 = success (even if some steps skipped), 1 = fatal error (codegen or server crypto failed).

**Platform detection logic:**
```bash
# iOS: requires macOS + xcodebuild + Rust iOS targets
 can_build_ios() {
   [[ "$(uname)" == "Darwin" ]] && \
   command -v xcodebuild &>/dev/null && \
   rustup target list --installed 2>/dev/null | grep -q "aarch64-apple-ios"
 }

 # Android: requires Rust + cargo-ndk + NDK
 can_build_android() {
   command -v cargo &>/dev/null && \
   cargo ndk --version &>/dev/null && \
   [[ -n "${ANDROID_NDK_HOME:-}" ]] || detect_ndk &>/dev/null
 }
```

### Implementation: Update `mise run setup`

Replace the existing `[tasks.setup]` in `.mise.toml`:

```toml
[tasks.setup]
description = "Full first-time setup for new contributors"
run = "bash scripts/setup.sh"
```

Create `scripts/setup.sh` that:
1. Wraps `scripts/dev-setup.sh` (prerequisite checks + `bun install`)
2. Then calls `scripts/workspace-setup.sh --force` (full rebuild, skip timestamp checks)
3. Then runs platform-specific first-time steps (iOS `bundle install`, Android SDK setup if needed)

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `scripts/workspace-setup.sh` | **Create** | Main post-install orchestration script |
| `scripts/setup.sh` | **Create** | First-time setup script (wraps dev-setup + workspace-setup) |
| `.mise.toml` | **Modify** | Update `[tasks.setup]` to point to new script |
| `package.json` | **Modify** | Add `postinstall` and `workspace-setup` scripts |
| `README.md` | **Modify** | Update Quick Start to use `mise run setup` |
| `DEVELOPMENT_SETUP.md` | **Modify** | Update setup instructions |
| `CLAUDE.md` | **Modify** | Update development commands section |
| `CONTRIBUTING.md` | **Modify** | Update contributor setup instructions |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Codegen fails | Fatal — exit 1. Generated code is required for all platforms. |
| Server crypto build fails | Fatal — desktop and backend won't compile. |
| iOS build fails on macOS | Fatal during `setup`, warn during `workspace-setup`. |
| Android build fails | Warn — Android is optional for most contributors. |
| Missing `.env.example` | Warn — developer can create `.env` manually. |
| Codegen/i18n sources unchanged | Still runs — always regenerates to guarantee freshness. |
| Crypto build artifacts up-to-date | Skip with info message. |

## Performance

| Command | Expected Duration | Notes |
|---------|-------------------|-------|
| `mise run setup` | 5–15 min | Depends on mobile builds and network speed. |
| `bun run workspace-setup` | 30–90 sec | Always runs codegen + i18n; crypto uses timestamp checks. |
| `bun run workspace-setup --force` | 2–5 min | Full rebuild without timestamp optimization. |

## Security Considerations

- The `postinstall` hook runs automatically after `bun install`. It only executes trusted scripts from the repo (no network calls, no arbitrary code execution).
- The script does not write to system directories or modify shell profiles.
- No secrets are generated or exposed.

## Testing Plan

1. **Fresh clone test**: Clone repo to a temp directory, run `mise run setup`, verify all platforms build.
2. **Post-install test**: Run `bun install` after modifying a Zod schema, verify codegen re-runs.
3. **Idempotency test**: Run `mise run setup` twice — second run should skip most steps.
4. **Platform skip test**: On Linux without macOS SSH, verify iOS steps are skipped with warnings.

## Documentation Updates

### README.md — Quick Start Section

Replace the existing multi-step quick start with:

```markdown
### Quick Start

```bash
git clone https://github.com/your-org/llamenos.git
cd llamenos
mise run setup    # One command: installs tools, deps, builds crypto, runs codegen
```

Then start developing:
```bash
bun run dev:server       # Backend
bun run tauri:dev        # Desktop
```
```

### DEVELOPMENT_SETUP.md

Add a new section at the top:

```markdown
## Automated Setup

Run `mise run setup` for first-time setup. This installs all tools, dependencies, and builds generated artifacts.

For subsequent dependency updates, `bun install` automatically runs `bun run workspace-setup` to keep generated code in sync.
```

### CLAUDE.md — Development Commands

Update the "Development Commands" section to reference `mise run setup` and `bun run workspace-setup`.

## Open Questions

1. Should `workspace-setup` also run `bun run typecheck` to catch codegen issues early?
   - **Recommendation**: No — typecheck is too slow for a post-install hook. Keep it manual.

2. Should `workspace-setup` run database migrations?
   - **Recommendation**: No — migrations require a running PostgreSQL instance. Keep it manual.

3. Should we add a `--desktop-only` flag to skip all mobile builds?
   - **Recommendation**: Yes — add to both `setup` and `workspace-setup` for contributors who only work on desktop/backend.

## Appendix: Script Structure

```
scripts/
  setup.sh              # First-time setup (calls dev-setup.sh + workspace-setup.sh --force)
  workspace-setup.sh    # Post-install / incremental setup
  dev-setup.sh          # Existing prerequisite checker (unchanged)
```

---

*Approved for implementation.*
