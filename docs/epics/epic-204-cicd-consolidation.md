# Epic 204: CI/CD Consolidation

## Goal

Unify CI/CD workflows from all three repos (llamenos, llamenos-core, llamenos-mobile) into a single monorepo CI that builds, tests, and deploys all platforms with smart path-based filtering and shared caching.

## Context

Currently three repos have separate CI:

| Repo | Workflows | Purpose |
|------|-----------|---------|
| llamenos | `ci.yml`, `desktop-e2e.yml`, `tauri-release.yml`, `docker.yml` | Web E2E, desktop E2E, desktop release, Docker images |
| llamenos-core | `ci.yml`, `release.yml` | Rust tests, mobile library release |
| llamenos-mobile | `mobile-build.yml`, `mobile-e2e.yml` | Mobile builds, Detox E2E |

Cross-repo coordination uses `repository_dispatch` (core → llamenos, core → mobile) and `sed` commands to swap path deps for git deps. This is fragile. In the monorepo, everything builds from local paths.

### Workflow Inventory After Consolidation

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push/PR | Typecheck, build, lint, E2E tests (web + desktop) |
| `crypto.yml` | push/PR (packages/crypto/) | Rust tests + clippy |
| `mobile.yml` | push/PR (apps/ios/, apps/android/) | Mobile builds + tests |
| `release.yml` | tags (v*) | Desktop + mobile + Docker releases |
| `deploy.yml` | push to main | Worker + site deployment |

## Implementation

### Step 1: Update `ci.yml` Change Detection

Replace the current `APP_PATTERNS` regex to include monorepo paths:

```bash
APP_PATTERNS="^src/|^apps/|^packages/|^tests/|^playwright|^wrangler|^vite|^tsconfig|^package\.json|^bun\.lockb|^deploy/"
```

This already covers `apps/` and `packages/`, so after Epic 200's directory moves, change detection works without further modification.

### Step 2: Remove Cross-Repo Triggers

**`ci.yml`** — Remove the `repository_dispatch` trigger:
```yaml
# REMOVE:
on:
  repository_dispatch:
    types: [core-updated]
```

Since `packages/crypto/` is now in-repo, changes to it trigger CI via the normal `push`/`pull_request` events.

### Step 3: Add Crypto Test Job

**`ci.yml`** — Add a job for Rust crypto tests:

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
    - name: Run tests
      run: cargo test --manifest-path packages/crypto/Cargo.toml
    - name: Clippy
      run: cargo clippy --manifest-path packages/crypto/Cargo.toml -- -D warnings
    - name: Format check
      run: cargo fmt --manifest-path packages/crypto/Cargo.toml --check
```

### Step 4: Update Desktop E2E Paths

**`desktop-e2e.yml`**:

```yaml
on:
  pull_request:
    paths:
      - 'apps/desktop/**'      # was src-tauri/**
      - 'packages/crypto/**'   # new: crypto changes affect desktop
      - 'tests/desktop/**'
  workflow_dispatch:

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-24.04, windows-latest]
    runs-on: ${{ matrix.os }}
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      # ... existing setup steps ...
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: apps/desktop  # was src-tauri
      # NO MORE sed command for llamenos-core path swap
      - name: Build Tauri
        run: cargo build --manifest-path apps/desktop/Cargo.toml
      # ... rest of test steps ...
```

Key changes:
- Path triggers: `src-tauri/**` → `apps/desktop/**`, add `packages/crypto/**`
- Rust cache workspace: `src-tauri` → `apps/desktop`
- **Remove** the `sed` command that swapped `llamenos-core` path dep to git dep — no longer needed

### Step 5: Update Tauri Release Workflow

**`tauri-release.yml`**:

```yaml
jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            args: --target universal-apple-darwin
          - os: windows-latest
          - os: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: apps/desktop  # was src-tauri
      # NO MORE sed for llamenos-core path swap
      - uses: nicolo-ribaudo/action-tauri-release@v0.9.0
        with:
          project-path: apps/desktop  # new: Tauri project location
      # Artifact paths: apps/desktop/target/ instead of src-tauri/target/
```

Changes:
- Rust cache workspace → `apps/desktop`
- Remove `sed` command for llamenos-core
- Add `project-path: apps/desktop` to Tauri action
- Update artifact upload paths from `src-tauri/target/` → `apps/desktop/target/`
- Update `tauri.conf.json` path references

### Step 6: Update Docker Workflow

**`docker.yml`** — Minimal changes. The Dockerfile builds from the repo root, so it already sees the new structure after Epic 200. Just verify:
- `COPY apps/worker/ apps/worker/` (was `COPY src/worker/ src/worker/`)
- `COPY packages/ packages/` (new: shared packages)
- esbuild entry point still resolves correctly

### Step 7: Add CI Status Gate

Following buildit's pattern, add a final gate job that all required checks depend on:

```yaml
ci-status:
  needs: [build, audit, e2e-cf, crypto-tests]
  if: always()
  runs-on: ubuntu-latest
  steps:
    - name: Check all jobs
      run: |
        if [[ "${{ needs.build.result }}" != "success" ]] ||
           [[ "${{ needs.audit.result }}" != "success" && "${{ needs.audit.result }}" != "skipped" ]] ||
           [[ "${{ needs.e2e-cf.result }}" != "success" && "${{ needs.e2e-cf.result }}" != "skipped" ]] ||
           [[ "${{ needs.crypto-tests.result }}" != "success" && "${{ needs.crypto-tests.result }}" != "skipped" ]]; then
          echo "One or more required jobs failed"
          exit 1
        fi
```

This gives a single status check for branch protection rules.

### Step 8: Update `scripts/bump-version.ts`

Already covered in Epic 200, but verify:
```typescript
const TAURI_CONF_PATH = resolve(ROOT, 'apps/desktop/tauri.conf.json')
const CARGO_TOML_PATH = resolve(ROOT, 'apps/desktop/Cargo.toml')
```

### Step 9: Update `scripts/sync-versions.sh`

```bash
TAURI_CONF="$ROOT/apps/desktop/tauri.conf.json"
CARGO_TOML="$ROOT/apps/desktop/Cargo.toml"
```

### Step 10: Add i18n Validation to Build Job

After Epic 205 extracts i18n, add validation to the build job to catch missing translations:

```yaml
- name: Validate i18n coverage
  run: bun run i18n:validate
```

This ensures all 13 locales have complete key coverage relative to the English source.

## What Does NOT Change (Yet)

- **No mobile CI yet** — iOS and Android CI will be added when Epics 206-207 are implemented
- **No codegen CI yet** — Protocol codegen CI will be added with Epic 202
- **No multi-worker deployment** — Single worker deploy stays simple
- **Concurrency strategy** — Keep `cancel-in-progress: false` (current behavior)
- **Version strategy** — Keep automatic version bumping from conventional commits

## Future Additions (When Native Mobile Arrives)

When Epics 206-207 add iOS and Android:

```yaml
# Future: mobile-ci.yml
mobile-build:
  runs-on: macos-latest  # iOS requires macOS
  steps:
    - cargo build --manifest-path packages/crypto/Cargo.toml --features mobile
    - # uniffi-bindgen → Swift + Kotlin
    - # xcodebuild (iOS)
    - # gradle assembleDebug (Android)
```

This is documented here for planning but NOT implemented in this epic.

## Verification Checklist

1. Push to a PR branch — CI triggers with correct path filtering
2. Change only `docs/` files — E2E tests are skipped
3. Change `packages/crypto/` — crypto-tests job runs
4. Change `apps/desktop/` — desktop-e2e job runs
5. Tag a release — tauri-release builds without `sed` workaround
6. `ci-status` gate job accurately reflects all job results

## Risk Assessment

- **Low risk**: Path trigger updates — declarative, easy to verify
- **Low risk**: Removing `sed` commands — the path dep now resolves naturally
- **Low risk**: Adding crypto-tests job — additive, doesn't affect existing jobs
- **Medium risk**: Tauri release action with `project-path` — needs testing on actual release
- **Mitigation**: Test with `workflow_dispatch` manual trigger before tagging a real release

## Dependencies

- Epic 200 (Monorepo Foundation) — new directory structure

## Blocks

- Future mobile CI (Epics 206-207)
