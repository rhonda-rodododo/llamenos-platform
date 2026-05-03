# Epic 111: CI Security Hardening

**Status: PENDING**
**Repos**: All three (llamenos, llamenos-core, llamenos-mobile)
**Priority**: Critical — supply-chain security

## Summary

Pin all GitHub Action versions to immutable SHA commit hashes, standardize Bun version across all workflows, add PR triggers to the main CI workflow, add Dependabot for automated GitHub Actions updates, and fix silent failures in mobile CI.

## Motivation

**Tag mutation attack**: GitHub Action tags (e.g., `@v4`) are mutable Git refs. A compromised upstream action can silently replace a tag to point at malicious code. SHA-pinned references are immutable — the only defense against this.

**Build reproducibility**: 6 workflows use `bun@latest` instead of a pinned version. This means the same commit can produce different builds on different days, making debugging CI failures extremely difficult.

**PR gate gap**: `llamenos/.github/workflows/ci.yml` only runs on `push: branches: [main]`, meaning PRs are never validated before merge. This is the single biggest CI gap.

## Detailed Changes

### 1. Pin Unpinned Actions to SHA Hashes

#### `llamenos-mobile/.github/workflows/mobile-e2e.yml`

| Line | Current | Pinned |
|------|---------|--------|
| 44 | `actions/cache@v4` | `actions/cache@5a3ec84eff668545956fd18022155c47e93e2684 # v4.2.3` |
| 114 | `actions/cache@v4` | `actions/cache@5a3ec84eff668545956fd18022155c47e93e2684 # v4.2.3` |
| 124 | `reactivecircus/android-emulator-runner@v2` | `reactivecircus/android-emulator-runner@b530d96654c385303d652368551fb075bc2f0b6b # v2.35.0` |
| 139 | `reactivecircus/android-emulator-runner@v2` | `reactivecircus/android-emulator-runner@b530d96654c385303d652368551fb075bc2f0b6b # v2.35.0` |

#### `llamenos/.github/workflows/tauri-release.yml`

| Line | Current | Pinned |
|------|---------|--------|
| 183 | `flatpak/flatpak-github-actions/flatpak-builder@v6` | `flatpak/flatpak-github-actions/flatpak-builder@92ae9851ad316786193b1fd3f40c4b51eb5cb101 # v6.6` |

#### `llamenos-core/.github/workflows/release.yml`

| Line | Current | Pinned |
|------|---------|--------|
| 181 | `nttld/setup-ndk@v1` | `nttld/setup-ndk@ed92fe6cadad69be94a966a7ee3271275e62f779 # v1.6.0` |

**Note on `dtolnay/rust-toolchain@stable`**: This action uses `@stable` as a special reference that tells it to install the latest stable Rust. Pinning to a SHA would lock the Rust version, which is intentional for reproducibility. However, since Rust stable releases are well-tested and backward-compatible, and we want CI to catch new Rust warnings early, we leave `@stable` as-is. Dependabot will handle SHA updates for other actions.

### 2. Standardize Bun Version to 1.3.5

The `llamenos/.github/workflows/ci.yml` already defines `BUN_VERSION: "1.3.5"` as an env var at the top. Other workflows should follow suit.

| File | Current | Fix |
|------|---------|-----|
| `llamenos/.github/workflows/desktop-e2e.yml` line 77 | `version: latest` | `version: "1.3.5"` |
| `llamenos/.github/workflows/tauri-release.yml` line 82 | `version: latest` | `version: "1.3.5"` |
| `llamenos/.github/workflows/ci.yml` line 184 (audit job) | `version: "1.3"` | `version: ${{ env.BUN_VERSION }}` |
| `llamenos-mobile/.github/workflows/mobile-e2e.yml` line 35 | `version: latest` | `version: "1.3.5"` |
| `llamenos-mobile/.github/workflows/mobile-e2e.yml` line 96 | `version: latest` | `version: "1.3.5"` |
| `llamenos-mobile/.github/workflows/mobile-build.yml` line 34 | `version: latest` | `version: "1.3.5"` |
| `llamenos-mobile/.github/workflows/mobile-build.yml` line 76 | `version: latest` | `version: "1.3.5"` |

### 3. Add PR Trigger to `llamenos/.github/workflows/ci.yml`

Current trigger:
```yaml
on:
  push:
    branches: [main]
```

New trigger:
```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

For PRs, conditionally skip version bump, deploy, and release jobs:
```yaml
  version:
    if: github.event_name == 'push'
    # ...

  deploy:
    if: github.event_name == 'push'
    # ...

  release:
    if: github.event_name == 'push'
    # ...
```

The `changes`, `build`, `e2e-cf`, and `audit` jobs run on both push and PR. The `e2e-docker` job is slow (30 min) — consider running it only on push to main, not on every PR.

### 4. Add Missing Path Triggers to `mobile-e2e.yml`

Current path triggers:
```yaml
paths:
  - 'src/**'
  - 'app/**'
  - 'e2e/**'
  - '.detoxrc.js'
```

Add:
```yaml
paths:
  - 'src/**'
  - 'app/**'
  - 'e2e/**'
  - '.detoxrc.js'
  - 'package.json'
  - 'bun.lock'
```

Dependency changes can break builds without touching src/.

### 5. Fix Silent Failures

#### `mobile-e2e.yml` line 57 — CocoaPods `continue-on-error: true`

Remove `continue-on-error: true`. If pod install fails, the iOS build will fail anyway — better to fail fast with a clear error than to proceed and get a confusing build failure.

#### `mobile-build.yml` lines 47, 83 — Native lib download warnings

Current:
```bash
./scripts/download-core-libs.sh android || echo "::warning::Native lib download failed"
```

Change to hard failure:
```bash
./scripts/download-core-libs.sh android
```

If native libs are unavailable, the build will produce a non-functional app (no Rust crypto). Better to fail explicitly.

### 6. Add Dependabot to All Three Repos

Create `.github/dependabot.yml` in each repo. Only enable GitHub Actions ecosystem (npm/cargo deps need manual review due to crypto sensitivity):

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "ci"
    labels:
      - "dependencies"
      - "ci"
```

### 7. Add CI Status Badges to READMEs

Add workflow status badges to the top of each repo's README.md:

**llamenos:**
```markdown
[![CI](https://github.com/user/llamenos/actions/workflows/ci.yml/badge.svg)](https://github.com/user/llamenos/actions/workflows/ci.yml)
[![Desktop E2E](https://github.com/user/llamenos/actions/workflows/desktop-e2e.yml/badge.svg)](https://github.com/user/llamenos/actions/workflows/desktop-e2e.yml)
```

**llamenos-core:**
```markdown
[![CI](https://github.com/user/llamenos-core/actions/workflows/ci.yml/badge.svg)](https://github.com/user/llamenos-core/actions/workflows/ci.yml)
```

**llamenos-mobile:**
```markdown
[![Mobile E2E](https://github.com/rhonda-rodododo/llamenos-hotline/actions/workflows/mobile-e2e.yml/badge.svg)](https://github.com/rhonda-rodododo/llamenos-hotline/actions/workflows/mobile-e2e.yml)
```

## Files to Modify

### llamenos
- `.github/workflows/ci.yml` — add PR trigger, fix audit bun version, add PR-skip conditions
- `.github/workflows/desktop-e2e.yml` — pin bun to 1.3.5
- `.github/workflows/tauri-release.yml` — pin flatpak action SHA, pin bun to 1.3.5
- `.github/dependabot.yml` — new
- `README.md` — add CI badges

### llamenos-core
- `.github/workflows/release.yml` — pin nttld/setup-ndk to SHA
- `.github/dependabot.yml` — new
- `README.md` — add CI badge

### llamenos-mobile
- `.github/workflows/mobile-e2e.yml` — pin actions/cache + android-emulator-runner to SHA, pin bun, add path triggers, remove continue-on-error
- `.github/workflows/mobile-build.yml` — pin bun, remove native lib soft failure
- `.github/dependabot.yml` — new
- `README.md` — add CI badge

## Verification

1. All `uses:` lines in all workflows reference SHA hashes (except `dtolnay/rust-toolchain@stable`)
2. `grep -r 'version: latest' .github/` returns no results in any repo
3. `grep -r 'version: "1.3"' .github/` returns no results (all use 1.3.5)
4. PR to llamenos triggers ci.yml build + typecheck + e2e-cf (verify via GitHub Actions UI)
5. Dependabot creates first PR within 1 week of merge
6. `continue-on-error` removed from mobile-e2e.yml CocoaPods step
