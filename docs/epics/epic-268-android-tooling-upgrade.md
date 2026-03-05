# Epic 268: Android Tooling Upgrade

**Status:** Complete
**Priority:** High
**Risk:** High — major version bumps across the entire toolchain
**Dependencies:** Epic 265 (i18n alignment) should complete first so we start with a green build

## Summary

Upgrade the Android build toolchain from current versions to latest stable releases as of March 2026. This includes Gradle 9.x, AGP 9.1, Kotlin 2.3, Compose BOM 2026.02, SDK 36, and migrating from kapt to KSP for annotation processing.

## Motivation

The current toolchain is over a year behind latest stable releases. AGP 9.x deprecates kapt in favor of KSP, Kotlin 2.3 brings performance and language improvements, and targeting SDK 36 is required for upcoming Play Store submission deadlines. Staying current reduces technical debt and ensures access to security patches and new platform APIs.

## Current State

| Component | Current Version |
|-----------|----------------|
| Gradle | 8.9 |
| AGP | 8.7.3 |
| Kotlin | 2.0.21 |
| Compose BOM | 2024.12.01 |
| Annotation Processing | kapt |
| compileSdk | 35 |
| targetSdk | 35 |
| JDK | 21 |

## Target State

| Component | Target Version |
|-----------|---------------|
| Gradle | 9.4.0 |
| AGP | 9.1.0 |
| Kotlin | 2.3.0 |
| KSP | 2.3.6 |
| Compose BOM | 2026.02.01 |
| Annotation Processing | KSP (kapt fully removed) |
| compileSdk | 36 |
| targetSdk | 36 |
| JDK | 21 (still compatible) |

## Breaking Changes

### 1. kapt to KSP Migration

AGP 9 deprecates kapt. Hilt has supported KSP since Dagger 2.48+.

**Required changes:**
- Remove the `kotlin-kapt` plugin from `build.gradle.kts`
- Add the `com.google.devtools.ksp` plugin
- Change all `kapt(...)` dependency declarations to `ksp(...)`
- Specifically: `kapt(libs.hilt.compiler)` becomes `ksp(libs.hilt.compiler)`
- Verify Hilt code generation produces correct output
- Confirm all `@HiltViewModel`, `@Inject`, `@Module`, `@InstallIn` annotations still resolve

### 2. Kotlin 2.0.21 to 2.3.x

- Compose compiler is built into Kotlin 2.x (no separate compose-compiler plugin needed — already the case since Kotlin 2.0, but verify no stale configuration remains)
- kotlinx-serialization plugin and runtime must be compatible with Kotlin 2.3
- Audit for deprecated API usage introduced in 2.1/2.2/2.3
- Check coroutines compatibility with Kotlin 2.3

### 3. Gradle 8.9 to 9.x

- Gradle 9 contains breaking changes in build script APIs
- Update `gradle/wrapper/gradle-wrapper.properties` distributionUrl
- Audit all `build.gradle.kts` files for deprecated or removed APIs
- Configuration cache behavior changes — verify compatibility
- Check custom task definitions and build logic

### 4. AGP 8.7.3 to 9.1.0

- New namespace requirements may affect configuration
- Built-in Kotlin support changes
- compileSdk/targetSdk 36 support
- New lint rules — may surface new warnings/errors
- Check for removed or renamed AGP extension properties

### 5. Compose BOM 2024.12.01 to 2026.02.01

- Material 3 API changes — check for removed or renamed composables
- Previously experimental APIs becoming stable (remove `@OptIn` annotations where applicable)
- Navigation Compose API changes
- Animation and layout API updates

### 6. All Library Updates

Update all entries in `apps/android/gradle/libs.versions.toml`:

- navigation — latest compatible with Compose BOM
- okhttp — 5.x if stable, otherwise latest 4.x
- coroutines — latest compatible with Kotlin 2.3
- lifecycle — latest
- activity-compose — latest
- camerax — latest
- hilt — latest with KSP support
- kotlinx-serialization — latest compatible with Kotlin 2.3
- All remaining dependencies

## Execution Plan

### Phase 1: Gradle Wrapper + AGP

1. Update `gradle/wrapper/gradle-wrapper.properties` to Gradle 9.3.x
2. Update AGP to 9.1.0 in `libs.versions.toml`
3. Fix any `build.gradle.kts` API breakages from Gradle 9 or AGP 9
4. Verify the project syncs and compiles
5. Commit checkpoint

### Phase 2: Kotlin + KSP

1. Update Kotlin to 2.3.x in `libs.versions.toml`
2. Add KSP plugin version to `libs.versions.toml`
3. Replace `kotlin-kapt` plugin with `com.google.devtools.ksp` in `build.gradle.kts`
4. Change all `kapt(...)` to `ksp(...)` in dependency blocks
5. Update kotlinx-serialization to Kotlin 2.3-compatible version
6. Verify Hilt DI code generation works correctly
7. Commit checkpoint

### Phase 3: SDK + Compose

1. Update `compileSdk` and `targetSdk` to 36 in `build.gradle.kts`
2. Update Compose BOM to 2026.02.01 in `libs.versions.toml`
3. Fix any deprecated or removed Compose API usage
4. Remove unnecessary `@OptIn` annotations for APIs that are now stable
5. Commit checkpoint

### Phase 4: All Dependencies

1. Update all remaining dependency versions in `libs.versions.toml`
2. Fix any compilation issues from API changes
3. Resolve any version conflict or alignment issues
4. Commit checkpoint

### Phase 5: Verify

1. `./gradlew testDebugUnitTest` — all unit tests pass
2. `./gradlew lintDebug` — lint clean (no errors)
3. `./gradlew compileDebugAndroidTestKotlin` — androidTest compilation works
4. `bun run test:android:e2e` — E2E tests pass on device/emulator
5. Spot-check build times — no significant regression
6. Final commit

## Files to Modify

| File | Changes |
|------|---------|
| `apps/android/gradle/wrapper/gradle-wrapper.properties` | Gradle 9.3.x distribution URL |
| `apps/android/gradle/libs.versions.toml` | All version updates |
| `apps/android/build.gradle.kts` | Plugin updates, AGP 9 API changes |
| `apps/android/app/build.gradle.kts` | kapt to KSP, compileSdk/targetSdk 36, dependency changes |
| `apps/android/app/src/main/kotlin/**` | Fix deprecated API usage |
| `apps/android/app/src/androidTest/kotlin/**` | Fix test API changes |
| `apps/android/settings.gradle.kts` | Plugin management updates if needed |

## Acceptance Criteria

- [ ] All dependencies at latest stable versions
- [ ] kapt fully replaced with KSP — no kapt references remain
- [ ] compileSdk and targetSdk set to 36
- [ ] All unit tests pass (`./gradlew testDebugUnitTest`)
- [ ] Lint clean (`./gradlew lintDebug`)
- [ ] androidTest compilation works (`./gradlew compileDebugAndroidTestKotlin`)
- [ ] E2E tests pass on device/emulator
- [ ] Build time not significantly regressed (< 20% increase)
- [ ] No new warnings from KSP migration

## Risk Mitigation

- **High risk** due to simultaneous major version bumps across Gradle, AGP, Kotlin, and Compose
- Commit after each phase so issues can be bisected
- If a phase causes irrecoverable issues, revert to the previous checkpoint and investigate
- Use context7 to look up latest migration guides for each component before starting each phase
- Run the full verification suite after every phase, not just at the end
