---
name: dependency-upgrade
description: >
  Guide dependency and tooling upgrades across all platforms in the Llamenos monorepo. Use this
  skill when upgrading Gradle/AGP/KSP (Android), Xcode/SPM (iOS), Cargo/Rust (crypto), Bun/npm
  packages (desktop/worker), or any cross-cutting dependency. Also use when the user mentions
  "upgrade", "update dependencies", "bump version", "new version of", "migrate to", "breaking
  change from upstream", "outdated packages", "bun audit", "cargo outdated", "security advisory",
  "npm vulnerability", or when Dependabot PRs need processing. Use when the user asks to check
  for or fix dependency vulnerabilities, wants to know if packages are up to date, or when a
  new major version of a framework (Tauri, Compose, SwiftUI) is released and the user wants to
  evaluate or apply the upgrade. This skill prevents the most common upgrade failures: breaking
  API changes, missed platform-specific migration steps, and untested regressions.
---

# Dependency Upgrades for Llamenos

The monorepo has 5 dependency ecosystems that need coordinated upgrades. Each has different
tooling, different breaking change patterns, and different verification steps.

## Ecosystems

| Ecosystem | Location | Tool | Check for updates |
|-----------|----------|------|-------------------|
| **TypeScript/Bun** | `package.json`, `bun.lockb` | `bun outdated`, `bun update` | `bun outdated` |
| **Rust** | `packages/crypto/Cargo.toml`, `apps/desktop/Cargo.toml` | `cargo update` | `cargo outdated` (install via `cargo install cargo-outdated`) |
| **Android** | `apps/android/gradle/libs.versions.toml`, `build.gradle.kts` | Gradle version catalog | Check Maven Central / Google Maven |
| **iOS** | `apps/ios/Package.swift` | SPM | Check GitHub releases of dependencies |
| **Docker** | `Dockerfile`, `docker-compose.yml`, Helm charts | Manual | Check Docker Hub for image digests |

## Upgrade Workflow

### Step 1: Audit Current Versions

Before upgrading, understand what you have:

```bash
# TypeScript
bun outdated

# Rust
cd packages/crypto && cargo outdated
cd apps/desktop && cargo outdated

# Android — check version catalog
cat apps/android/gradle/libs.versions.toml

# iOS — check Package.swift
cat apps/ios/Package.swift
```

### Step 2: Research the Upgrade

Before changing any version:

1. **Read the changelog/release notes** for the new version
2. **Use context7 MCP** to look up current documentation for the library
3. **Check for breaking changes** — migration guides, deprecated APIs
4. **Check compatibility matrix** — does the new version require a different runtime/SDK?

Key compatibility chains to watch:

**Android**:
```
AGP version → requires minimum Gradle version
Kotlin version → requires compatible KSP version
Hilt version → requires compatible KSP + AGP
Compose BOM → pins all Compose library versions
compileSdk → must match or exceed targetSdk
```

**iOS**:
```
Xcode version → determines available SDK versions
Swift version → determines available language features
iOS deployment target → determines available APIs
```

**Rust**:
```
rust-toolchain.toml → pins Rust version for all crates
UniFFI version → must match across Rust crate + Swift/Kotlin bindings
```

**Desktop**:
```
Tauri version → determines available plugins/APIs
Vite version → determines build behavior
TanStack Router → determines routing API
```

### Step 3: Apply the Upgrade

#### TypeScript/Bun

```bash
# Update specific package
bun add package-name@latest

# Update all
bun update

# For major version bumps with breaking changes, update one at a time
bun add @tanstack/react-router@latest
```

Check `tsconfig.json` if TypeScript itself is upgraded.

#### Rust

```bash
# Update Cargo.lock to latest compatible versions
cd packages/crypto && cargo update

# For major version bumps, edit Cargo.toml manually
# Then: cargo update -p specific-crate
```

Update `rust-toolchain.toml` if Rust itself is upgraded.

#### Android

Edit `apps/android/gradle/libs.versions.toml`:
```toml
[versions]
agp = "9.1.0"
kotlin = "2.3.0"
ksp = "2.3.6"
composeBom = "2026.02.01"
```

Then sync:
```bash
cd apps/android
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=~/Library/Android/sdk
./gradlew dependencies --configuration debugCompileClasspath
```

**AGP 9 specifics** (current state):
- `kotlin-android` plugin removed (built-in Kotlin)
- `kapt` fully replaced by KSP
- `jniLibs.srcDirs()` → `jniLibs.directories.add()`
- `kotlinOptions {}` → `kotlin { compilerOptions {} }`

#### iOS

Edit `apps/ios/Package.swift` for SPM dependencies.

For Xcode itself: install from Mac App Store or `xcode-select`.

After Xcode upgrade, check:
- Available simulators: `xcrun simctl list devices available`
- Rebuild XCFramework: `bun run ios:xcframework`
- Regenerate Xcode project: `cd apps/ios && xcodegen generate`

#### Docker Images

Pin to SHA256 digests, not tags:
```yaml
# BAD
image: node:22

# GOOD
image: node:22@sha256:abc123...
```

Update digests in: `Dockerfile`, `docker-compose.yml`, `deploy/helm/*/values.yaml`

### Step 4: Fix Breaking Changes

Common breaking change patterns:

| Pattern | Detection | Fix |
|---------|-----------|-----|
| Removed API | Compile error | Find replacement in changelog/docs |
| Renamed API | Compile error | Find-and-replace with new name |
| Changed return type | Type error | Update consuming code |
| New required parameter | Compile error | Add parameter with appropriate value |
| Deprecated warning | Build warning | Update to recommended replacement |
| Behavior change | Test failure | Update test expectations or code logic |

### Step 5: Verify

Run the full verification suite for affected platforms:

```bash
# Quick — only affected platforms
bun run test:changed

# Thorough — everything
bun run test:all
```

Platform-specific verification:

```bash
# TypeScript
bun run typecheck && bun run build

# Rust
bun run crypto:test && bun run crypto:clippy && bun run crypto:fmt

# Android
cd apps/android && ./gradlew assembleDebug testDebugUnitTest lintDebug

# iOS
bun run ios:build && bun run ios:test && bun run ios:uitest

# Desktop
bun run tauri:build  # Full Tauri build (Rust + Vite)
```

### Step 6: Update Documentation

After upgrade:
- Update version numbers in `CLAUDE.md` if they're documented there
- Update `docs/` if setup instructions reference specific versions
- Update CI workflows if they pin versions

## Batch Upgrades (Dependabot)

When Dependabot creates grouped PRs:

1. Review the PR for breaking changes
2. Check if any dependency in the group requires a cascade upgrade
3. Test locally before merging
4. If a single dep in the group breaks, split it out and handle separately

## Version Bumping (Cross-Platform)

For app version bumps across all platforms:

```bash
bun run version:bump <major|minor|patch> [description]
```

This updates version in: `package.json`, `tauri.conf.json`, `Cargo.toml`, iOS `project.yml`,
Android `build.gradle.kts`, and creates a git tag.

## Emergency Rollback

If an upgrade breaks things and you can't fix quickly:

```bash
# Revert the lockfile
git checkout HEAD~1 -- bun.lockb  # or Cargo.lock, etc.

# Revert the version file
git checkout HEAD~1 -- package.json  # or Cargo.toml, etc.

# Reinstall
bun install  # or cargo update
```

For Rust: `Cargo.lock` pins exact versions. Reverting it restores previous state.
For Bun: `bun.lockb` is binary. Reverting it + `bun install` restores previous state.
