# Workspace Bootstrap Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `mise run setup` (first-time full bootstrap) and `bun run workspace-setup` (post-install incremental sync) commands that automate monorepo setup and keep generated artifacts fresh.

**Architecture:** Two bash scripts (`scripts/setup.sh` and `scripts/workspace-setup.sh`) orchestrate prerequisite checks, dependency installation, codegen, crypto builds, and platform-specific setup. `workspace-setup.sh` runs automatically via `package.json` `postinstall` and always regenerates codegen while using timestamp checks to skip expensive crypto rebuilds.

**Tech Stack:** Bash, mise, Bun, Cargo, Rust, xcodebuild, Gradle

---

## File Structure

| File | Action | Responsibility |
|------|--------|--------------|
| `scripts/workspace-setup.sh` | **Create** | Post-install orchestration: upstream sync check, codegen, crypto builds, artifact copying. Always runs codegen; uses mtime checks for crypto. |
| `scripts/setup.sh` | **Create** | First-time setup: prerequisites, `mise install`, `bun install`, then calls `workspace-setup.sh --force` + platform-specific setup. |
| `.mise.toml` | **Modify** | Update `[tasks.setup]` to point to `scripts/setup.sh`. Add `[tasks.workspace-setup]`. |
| `package.json` | **Modify** | Add `postinstall` and `workspace-setup` scripts. |
| `README.md` | **Modify** | Update Quick Start to use `mise run setup`. |
| `DEVELOPMENT_SETUP.md` | **Modify** | Update setup instructions. |
| `CLAUDE.md` | **Modify** | Update development commands section. |
| `CONTRIBUTING.md` | **Modify** | Update contributor setup instructions. |

---

## Task 1: Create `scripts/workspace-setup.sh`

**Files:**
- Create: `scripts/workspace-setup.sh`

### Step 1.1: Write the script header and utilities

```bash
#!/usr/bin/env bash
set -euo pipefail

# Workspace setup script — runs automatically after `bun install` via postinstall.
# Always regenerates codegen. Uses timestamp checks to skip expensive crypto rebuilds.
#
# Usage:
#   ./scripts/workspace-setup.sh           # Normal run (timestamp-aware)
#   ./scripts/workspace-setup.sh --force   # Skip timestamp checks, rebuild everything

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()    { echo -e "  ${GREEN}OK${NC}    $1"; }
warn()  { echo -e "  ${YELLOW}WARN${NC}  $1"; }
fail()  { echo -e "  ${RED}FAIL${NC}  $1"; exit 1; }
info()  { echo -e "  ${BLUE}INFO${NC}  $1"; }

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FORCE=false

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
  esac
done
```

### Step 1.2: Write upstream sync check

```bash
check_upstream_sync() {
  info "Checking upstream sync..."

  # Only check if we're in a git repo with an origin/main
  if ! git -C "$PROJECT_ROOT" rev-parse --git-dir &>/dev/null; then
    warn "Not a git repository — skipping upstream sync check"
    return 0
  fi

  if ! git -C "$PROJECT_ROOT" rev-parse --verify origin/main &>/dev/null; then
    warn "origin/main not found — skipping upstream sync check"
    return 0
  fi

  local local_head
  local remote_head
  local_head=$(git -C "$PROJECT_ROOT" rev-parse HEAD)
  remote_head=$(git -C "$PROJECT_ROOT" rev-parse origin/main)

  if [[ "$local_head" == "$remote_head" ]]; then
    ok "Up to date with origin/main"
    return 0
  fi

  # Check if local is behind origin/main
  if git -C "$PROJECT_ROOT" merge-base --is-ancestor "$local_head" "$remote_head"; then
    fail "Your branch is behind origin/main. Run 'git pull' first."
  else
    warn "Your branch has diverged from origin/main"
  fi
}
```

### Step 1.3: Write timestamp check helper

```bash
# Returns 0 (true) if sources are newer than outputs — rebuild needed
needs_rebuild() {
  local sources="$1"
  local outputs="$2"

  if [[ "$FORCE" == true ]]; then
    return 0
  fi

  if [[ ! -e "$outputs" ]]; then
    return 0
  fi

  local newest_source
  local newest_output
  newest_source=$(find $sources -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1)
  newest_output=$(find $outputs -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1)

  if [[ -z "$newest_source" || -z "$newest_output" ]]; then
    return 0
  fi

  if (( $(echo "$newest_source > $newest_output" | bc -l) )); then
    return 0
  fi

  return 1
}
```

### Step 1.4: Write codegen steps (always run)

```bash
run_codegen() {
  info "Running protocol codegen..."
  cd "$PROJECT_ROOT"
  bun run codegen
  ok "Protocol codegen complete"
}

run_i18n_codegen() {
  info "Running i18n codegen..."
  cd "$PROJECT_ROOT"
  bun run i18n:codegen
  ok "i18n codegen complete"
}
```

### Step 1.5: Write crypto build steps with timestamp checks

```bash
build_crypto_server() {
  local crypto_dir="$PROJECT_ROOT/packages/crypto"
  local target_dir="$crypto_dir/target"

  if ! needs_rebuild "$crypto_dir/src $crypto_dir/Cargo.toml" "$target_dir"; then
    ok "Server crypto build is up to date — skipping"
    return 0
  fi

  info "Building server crypto..."
  cd "$crypto_dir"
  cargo build --release
  ok "Server crypto built"
}
```

### Step 1.6: Write platform detection and mobile crypto builds

```bash
can_build_ios() {
  [[ "$(uname)" == "Darwin" ]] && \
  command -v xcodebuild &>/dev/null && \
  rustup target list --installed 2>/dev/null | grep -q "aarch64-apple-ios"
}

can_build_android() {
  command -v cargo &>/dev/null && \
  cargo ndk --version &>/dev/null 2>&1 && \
  {
    [[ -n "${ANDROID_NDK_HOME:-}" ]] || {
      local ndk_candidates=(
        "$HOME/Android/Sdk/ndk"
        "$HOME/Library/Android/sdk/ndk"
        "/usr/local/lib/android/sdk/ndk"
        "${ANDROID_HOME:-/nonexistent}/ndk"
        "${ANDROID_SDK_ROOT:-/nonexistent}/ndk"
      )
      for base in "${ndk_candidates[@]}"; do
        if [[ -d "$base" ]]; then
          return 0
        fi
      done
      return 1
    }
  }
}

build_crypto_ios() {
  if ! can_build_ios; then
    warn "iOS toolchain not available — skipping iOS crypto build"
    return 0
  fi

  local crypto_dir="$PROJECT_ROOT/packages/crypto"
  local dist_dir="$crypto_dir/dist/ios"

  if ! needs_rebuild "$crypto_dir/src $crypto_dir/Cargo.toml" "$dist_dir"; then
    ok "iOS crypto build is up to date — skipping"
    return 0
  fi

  info "Building iOS crypto..."
  cd "$crypto_dir"
  bash scripts/build-mobile.sh ios
  ok "iOS crypto built"
}

build_crypto_android() {
  if ! can_build_android; then
    warn "Android toolchain not available — skipping Android crypto build"
    return 0
  fi

  local crypto_dir="$PROJECT_ROOT/packages/crypto"
  local dist_dir="$crypto_dir/dist/android"

  if ! needs_rebuild "$crypto_dir/src $crypto_dir/Cargo.toml" "$dist_dir"; then
    ok "Android crypto build is up to date — skipping"
    return 0
  fi

  info "Building Android crypto..."
  cd "$crypto_dir"
  bash scripts/build-mobile.sh android
  ok "Android crypto built"
}
```

### Step 1.7: Write artifact copy steps

```bash
copy_ios_artifacts() {
  if ! can_build_ios; then
    return 0
  fi

  local crypto_dist="$PROJECT_ROOT/packages/crypto/dist/ios"
  local ios_dir="$PROJECT_ROOT/apps/ios"

  if [[ ! -d "$crypto_dist/LlamenosCoreFFI.xcframework" ]]; then
    warn "iOS XCFramework not found in dist — skipping copy"
    return 0
  fi

  info "Copying iOS artifacts..."
  rm -rf "$ios_dir/LlamenosCoreFFI.xcframework"
  cp -R "$crypto_dist/LlamenosCoreFFI.xcframework" "$ios_dir/"
  cp "$crypto_dist/LlamenosCore.swift" "$ios_dir/Sources/Generated/LlamenosCore.swift"
  ok "iOS artifacts copied"
}

copy_android_artifacts() {
  if ! can_build_android; then
    return 0
  fi

  local crypto_dist="$PROJECT_ROOT/packages/crypto/dist/android/jniLibs"
  local android_jni="$PROJECT_ROOT/apps/android/app/src/main/jniLibs"

  if [[ ! -d "$crypto_dist" ]]; then
    warn "Android JNI libs not found in dist — skipping copy"
    return 0
  fi

  info "Copying Android artifacts..."
  mkdir -p "$android_jni"
  cp -R "$crypto_dist"/* "$android_jni/"
  ok "Android artifacts copied"
}
```

### Step 1.8: Write main function

```bash
main() {
  echo "Workspace Setup"
  echo "==============="
  echo ""

  check_upstream_sync
  run_codegen
  run_i18n_codegen
  build_crypto_server
  build_crypto_ios
  build_crypto_android
  copy_ios_artifacts
  copy_android_artifacts

  echo ""
  ok "Workspace setup complete!"
}

main "$@"
```

### Step 1.9: Make executable and commit

```bash
chmod +x scripts/workspace-setup.sh
git add scripts/workspace-setup.sh
git commit -m "feat: add workspace-setup.sh post-install script"
```

---

## Task 2: Create `scripts/setup.sh`

**Files:**
- Create: `scripts/setup.sh`

### Step 2.1: Write the script header

```bash
#!/usr/bin/env bash
set -euo pipefail

# First-time setup script for new contributors.
# Checks prerequisites, installs tools, deps, and bootstraps the entire workspace.
#
# Usage:
#   ./scripts/setup.sh           # Full setup
#   ./scripts/setup.sh --quick   # Skip mobile builds (desktop/backend only)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()    { echo -e "  ${GREEN}OK${NC}    $1"; }
warn()  { echo -e "  ${YELLOW}WARN${NC}  $1"; }
fail()  { echo -e "  ${RED}FAIL${NC}  $1"; exit 1; }
info()  { echo -e "  ${BLUE}INFO${NC}  $1"; }

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QUICK=false

for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=true ;;
  esac
done
```

### Step 2.2: Write prerequisite check

```bash
check_prerequisites() {
  info "Checking prerequisites..."

  if ! command -v mise &>/dev/null; then
    fail "mise not found — install from https://mise.jdx.dev"
  fi
  ok "mise"

  if ! command -v bun &>/dev/null; then
    fail "Bun not found — install from https://bun.sh"
  fi
  ok "Bun $(bun --version)"

  if ! command -v rustc &>/dev/null; then
    fail "Rust not found — install from https://rustup.rs"
  fi
  ok "Rust $(rustc --version | awk '{print $2}')"

  if ! command -v docker &>/dev/null; then
    warn "Docker not found — required for local backend"
  else
    ok "Docker"
  fi
}
```

### Step 2.3: Write mise install and bun install

```bash
install_tools() {
  info "Installing mise tools..."
  cd "$PROJECT_ROOT"
  mise install
  ok "mise tools installed"
}

install_deps() {
  info "Installing dependencies..."
  cd "$PROJECT_ROOT"
  bun install
  ok "Dependencies installed"
}
```

### Step 2.4: Write workspace bootstrap call

```bash
bootstrap_workspace() {
  info "Bootstrapping workspace..."
  cd "$PROJECT_ROOT"

  if [[ "$QUICK" == true ]]; then
    bash scripts/workspace-setup.sh --force
  else
    bash scripts/workspace-setup.sh --force
  fi
  ok "Workspace bootstrapped"
}
```

### Step 2.5: Write platform-specific first-time setup

```bash
setup_ios() {
  if [[ "$QUICK" == true ]]; then
    info "Skipping iOS setup (--quick)"
    return 0
  fi

  if [[ "$(uname)" != "Darwin" ]]; then
    warn "Not on macOS — skipping iOS setup"
    return 0
  fi

  info "Setting up iOS..."
  cd "$PROJECT_ROOT/apps/ios"

  if command -v xcodegen &>/dev/null; then
    xcodegen generate
    ok "Xcode project generated"
  else
    warn "xcodegen not found — skipping Xcode project generation"
  fi

  if [[ -f "Gemfile" ]] && command -v bundle &>/dev/null; then
    bundle install
    ok "iOS Ruby gems installed"
  else
    warn "Bundler not found — skipping iOS gem installation"
  fi
}

setup_android() {
  if [[ "$QUICK" == true ]]; then
    info "Skipping Android setup (--quick)"
    return 0
  fi

  info "Setting up Android..."
  cd "$PROJECT_ROOT/apps/android"

  if [[ -f "gradlew" ]]; then
    ./gradlew tasks &>/dev/null || true
    ok "Android Gradle synced"
  else
    warn "gradlew not found — skipping Android setup"
  fi
}
```

### Step 2.6: Write .env generation

```bash
generate_env() {
  if [[ -f "$PROJECT_ROOT/.env" ]]; then
    ok ".env already exists — skipping"
    return 0
  fi

  if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
    info "Generating .env from .env.example..."
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    ok ".env created — edit it with your credentials"
  else
    warn ".env.example not found — create .env manually"
  fi
}
```

### Step 2.7: Write version sync check

```bash
check_version_sync() {
  info "Checking version sync..."
  cd "$PROJECT_ROOT"
  if bash scripts/sync-versions.sh &>/dev/null; then
    ok "Version files in sync"
  else
    warn "Version files out of sync — run: bash scripts/sync-versions.sh --fix"
  fi
}
```

### Step 2.8: Write main function

```bash
main() {
  echo "Llamenos Setup"
  echo "=============="
  echo ""

  check_prerequisites
  install_tools
  install_deps
  bootstrap_workspace
  setup_ios
  setup_android
  generate_env
  check_version_sync

  echo ""
  ok "Setup complete! You can now run:"
  echo "  bun run dev:server       # Start backend"
  echo "  bun run tauri:dev        # Start desktop"
}

main "$@"
```

### Step 2.9: Make executable and commit

```bash
chmod +x scripts/setup.sh
git add scripts/setup.sh
git commit -m "feat: add setup.sh first-time bootstrap script"
```

---

## Task 3: Update `.mise.toml`

**Files:**
- Modify: `.mise.toml`

### Step 3.1: Replace `[tasks.setup]`

Replace the existing `[tasks.setup]` block:

```toml
[tasks.setup]
description = "Full first-time setup for new contributors"
run = "bash scripts/setup.sh"
```

### Step 3.2: Add `[tasks.workspace-setup]`

Add after `[tasks.setup]`:

```toml
[tasks.workspace-setup]
description = "Regenerate codegen and rebuild crypto artifacts (runs automatically on bun install)"
run = "bash scripts/workspace-setup.sh"
```

### Step 3.3: Commit

```bash
git add .mise.toml
git commit -m "chore(mise): update setup task and add workspace-setup task"
```

---

## Task 4: Update `package.json`

**Files:**
- Modify: `package.json`

### Step 4.1: Add scripts

Add to the `scripts` object:

```json
{
  "scripts": {
    "postinstall": "bash scripts/workspace-setup.sh",
    "workspace-setup": "bash scripts/workspace-setup.sh",
    "setup": "bash scripts/setup.sh"
  }
}
```

### Step 4.2: Commit

```bash
git add package.json
git commit -m "chore(package): add postinstall hook and workspace-setup script"
```

---

## Task 5: Update Documentation

### Task 5.1: Update `README.md`

**Files:**
- Modify: `README.md`

Replace the Quick Start section with:

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

Commit:
```bash
git add README.md
git commit -m "docs(readme): update quick start to use mise run setup"
```

### Task 5.2: Update `DEVELOPMENT_SETUP.md`

**Files:**
- Modify: `DEVELOPMENT_SETUP.md`

Add at the top:

```markdown
## Automated Setup

Run `mise run setup` for first-time setup. This installs all tools, dependencies, and builds generated artifacts.

For subsequent dependency updates, `bun install` automatically runs `bun run workspace-setup` to keep generated code in sync.
```

Commit:
```bash
git add DEVELOPMENT_SETUP.md
git commit -m "docs(dev-setup): document automated setup commands"
```

### Task 5.3: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

Update the "Development Commands" section to add:

```markdown
### Workspace Bootstrap

```bash
mise run setup              # First-time full setup
mise run setup --quick      # Skip mobile builds
bun run workspace-setup     # Manual incremental sync
bun run workspace-setup --force  # Full rebuild
```
```

Commit:
```bash
git add CLAUDE.md
git commit -m "docs(claude): document workspace bootstrap commands"
```

### Task 5.4: Update `CONTRIBUTING.md`

**Files:**
- Modify: `CONTRIBUTING.md`

Update the setup section to reference `mise run setup`.

Commit:
```bash
git add CONTRIBUTING.md
git commit -m "docs(contributing): update setup instructions"
```

---

## Task 6: Test and Verify

### Step 6.1: Test `workspace-setup.sh` manually

```bash
bash scripts/workspace-setup.sh
```

Expected output:
- Upstream sync check passes (or warns)
- Codegen runs
- i18n codegen runs
- Crypto builds (or skips if up-to-date)
- Artifacts copy (or skip if missing toolchains)

### Step 6.2: Test `setup.sh` manually

```bash
bash scripts/setup.sh --quick
```

Expected output:
- Prerequisites checked
- mise install runs
- bun install runs
- Workspace bootstrapped
- iOS/Android skipped (--quick)
- .env generated if missing

### Step 6.3: Test postinstall hook

```bash
rm -rf node_modules bun.lockb
bun install
```

Expected: `workspace-setup.sh` runs automatically after install.

### Step 6.4: Commit any fixes

```bash
git add -A
git commit -m "fix: address review feedback on workspace setup scripts"
```

---

## Self-Review Checklist

- [x] Spec coverage: All requirements from the spec are addressed.
- [x] Placeholder scan: No TBDs, TODOs, or vague steps.
- [x] Type consistency: Bash functions and variables are consistent.
- [x] File paths: All paths are exact and relative to repo root.
- [x] Error handling: Fatal errors exit 1; warnings continue.
- [x] Platform awareness: iOS/Android steps skip gracefully on missing toolchains.
- [x] Idempotency: Timestamp checks prevent redundant work.
- [x] Documentation: README, DEVELOPMENT_SETUP, CLAUDE, CONTRIBUTING updated.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-10-workspace-bootstrap-automation.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
