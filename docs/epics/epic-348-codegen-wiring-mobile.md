# Epic 348: Wire Codegen Types into Mobile Builds

## Overview

Protocol codegen already generates 264+ Swift structs and 262+ Kotlin data classes from 148 Zod schemas. Both platforms have build config pointing to the generated output. This epic verifies the wiring works end-to-end, resolves any naming collisions with hand-written types, and adds CMS-specific model imports needed by Epics 344-347.

## Current State

### What exists

| Platform | Build config | Status |
|----------|-------------|--------|
| iOS | `project.yml` references `../../packages/protocol/generated/swift` as source group | Configured but not verified for CMS types |
| Android | `build.gradle.kts` has `kotlin.srcDir("...generated/kotlin")` | Working — `ReportTypeDefinition` already imported by `TypedReportCreateScreen.kt` |

### Generated CMS types available (from `bun run codegen`)
- `ReportTypeDefinition`, `ReportFieldDefinition`, `ReportFieldDefinitionType`
- `Event`, `CaseEvent`, `ReportEvent`
- `ContactRelationship`, `AffinityGroup`, `GroupMember`
- `CaseInteraction`, `InteractionContent`
- `Evidence`, `EvidenceMetadata`, `CustodyChain`, `CustodyEntry`
- `Record`, `RecordNotesEnvelope`
- `ReportCaseLink`, `LinkReportToCaseBody`

### Hand-written types that may collide

**iOS** (`Sources/Models/ReportType.swift`):
- `ClientReportTypeDefinition` — intentionally prefixed `Client*` to avoid collision with generated `ReportTypeDefinition`. **No collision** — coexistence is by design.
- Same pattern for `ClientReportFieldDefinition`, etc.

**Android** (`model/ReportTypeModels.kt`):
- `CmsReportTypesResponse` — wrapper, no collision
- `CreateTypedReportRequest` — request model, no collision
- Android already imports generated `ReportTypeDefinition` directly

## Implementation Plan

### Phase 1: Verify codegen output
1. Run `bun run codegen` — ensure all 148 schemas generate cleanly
2. Verify `packages/protocol/generated/swift/Types.swift` contains CMS types: `Event`, `CaseInteraction`, `Evidence`, `Record`
3. Verify `packages/protocol/generated/kotlin/Types.kt` contains same CMS types

### Phase 2: Verify iOS compilation
1. Run `ssh mac 'cd ~/projects/llamenos/apps/ios && xcodegen generate'` — regenerate Xcode project
2. Run `ssh mac 'cd ~/projects/llamenos/apps/ios && xcodebuild build -scheme Llamenos-Package -destination "platform=iOS Simulator,name=iPhone 17" -quiet'`
3. If compilation fails due to naming collisions:
   - Check if any generated type names collide with `Client*` hand-written types
   - Resolution strategy: generated types use quicktype naming, `Client*` types are the runtime-facing API — both coexist
   - If a generated type IS needed at runtime, create a typealias in a new `Sources/Models/CaseModels.swift`

### Phase 3: Verify Android compilation
1. Run `cd apps/android && ./gradlew compileDebugKotlin` — verify generated types compile
2. Run `cd apps/android && ./gradlew compileDebugAndroidTestKotlin` — verify test compilation
3. If compilation fails:
   - Check for duplicate class names between `model/` and generated `Types.kt`
   - Resolution: rename hand-written types or use qualified imports

### Phase 4: Add CMS model typealiases/wrappers (if needed)
For new CMS case views (Epics 344-345), the mobile apps need models for:
- Case records (list + detail)
- Entity types (for tab rendering)
- Interactions (timeline)
- Evidence items
- Contacts (linked to cases)

**Decision**: Use codegen types directly where they match the API wire format. Create lightweight client-side wrappers (like `ClientReportTypeDefinition`) ONLY where custom computed properties are needed (e.g., field visibility evaluation, status color resolution).

### Phase 5: Add codegen to CI build prerequisites
Verify that `bun run codegen` runs before mobile builds in CI:
- iOS: `bun run ios:build` should run codegen first
- Android: `bun run test:android` should run codegen first
- Check `package.json` script definitions

## Files to verify/modify
- `packages/protocol/generated/swift/Types.swift` — verify CMS types present
- `packages/protocol/generated/kotlin/Types.kt` — verify CMS types present
- `apps/ios/project.yml` — already configured, verify source group intact
- `apps/android/app/build.gradle.kts` — already configured, verify srcDir intact
- `apps/ios/Sources/Models/CaseModels.swift` — NEW if typealiases needed
- `apps/android/app/src/main/java/org/llamenos/hotline/model/CaseModels.kt` — NEW if wrappers needed

## Gate
```bash
bun run codegen                    # Generate fresh
bun run ios:build                  # iOS compiles with generated types
bun run test:android               # Android compiles with generated types
```

## Risk
Low — both platforms already have the wiring configured. The main risk is naming collisions, which are mitigated by the existing `Client*` prefix convention on iOS.
