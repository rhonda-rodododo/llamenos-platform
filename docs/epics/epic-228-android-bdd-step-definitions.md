# Epic 228: Android BDD Step Definitions for Full Feature Coverage

## Goal

Implement Cucumber step definitions for ALL feature file scenarios tagged `@android`, covering existing UI screens with real test logic and stubbing features that need new UI (deferred to Epics 229/230).

## Context

After Epic 224 (cucumber-android migration), the Android test suite had 189 step definitions across 14 step files covering the original 31 test scenarios. However, the cross-platform BDD feature files (Epics 218-222, 225) define 193+ scenarios across 44+ feature files with many step phrases that lacked Android step definitions. This epic bridges the gap.

## Implementation

### New Step Files (12)

| File | Package | Steps | Domain |
|------|---------|-------|--------|
| `GenericSteps.kt` | `common` | 29 | Shared click/fill/assert/dialog patterns |
| `BanSteps.kt` | `admin` | 19 | Ban CRUD with real UI interactions |
| `InviteSteps.kt` | `admin` | 10 | Invite creation/listing |
| `ReportSteps.kt` | `admin` | 13 | Reports feature (stubs) |
| `RoleSteps.kt` | `admin` | 21 | Roles management (stubs) |
| `DemoModeSteps.kt` | `admin` | 12 | Demo mode (stubs) |
| `VolunteerSteps.kt` | `auth` | 9 | Volunteer CRUD/login |
| `PanicWipeSteps.kt` | `auth` | 10 | Panic wipe (web-specific, stubs) |
| `BlastSteps.kt` | `messaging` | 10 | Blast messaging (stubs) |
| `CustomFieldSteps.kt` | `notes` | 26 | Custom fields admin + notes (stubs) |
| `ProfileSettingsSteps.kt` | `settings` | 33 | Profile editing, theme, section toggling |
| (ConversationSteps extension) | `conversations` | +19 | Detail view, threads, assignments |

### Modified Step Files (7)

- **BaseSteps.kt** — Added `navigateToAdminTab()` helper, `hasTestTagPrefix()` semantic matcher
- **NavigationSteps.kt** — Added admin page navigation, URL path routing, logout
- **AdminSteps.kt** — Added audit log assertions, filter/search stubs
- **ConversationSteps.kt** — Extended from 9→28 steps (detail view, threads, channels)
- **ShiftSteps.kt** — Extended from 9→30 steps (scheduling, signup, fallback)
- **PinSteps.kt** — Removed duplicate `I should see a confirmation dialog` (moved to GenericSteps)

### Key Technical Decisions

1. **hasTestTagPrefix() matcher** — Custom `SemanticsMatcher` for dynamic testTags (e.g., `remove-ban-{id}`, `shift-signup-{id}`). Uses `SemanticsProperties.TestTag in node.config` check (not `getOrNull` which doesn't exist).

2. **navigateToAdminTab()** — Settings tab → Admin card → Target tab. Maps web URL-based navigation to Compose tab navigation.

3. **GenericSteps for shared patterns** — `I click {string}`, `I should see {string}`, `I should see a confirmation dialog`, form filling. Maps known button names to testTags for icon-only buttons (FABs).

4. **Zero duplicate step patterns** — Each Cucumber step pattern defined exactly once across all 26 step classes. Moved shared patterns (confirmation dialog, page navigation) to GenericSteps/NavigationSteps.

5. **Stub convention** — Steps for unbuilt UI follow the project's existing pattern: empty method body with a comment explaining what's needed (e.g., `// Profile editing UI not yet built on Android — stub`).

## Results

| Metric | Before | After |
|--------|--------|-------|
| Step definitions | 189 | 498 |
| Step files | 14 | 26 |
| Step packages | 6 | 8 |
| Feature file coverage | ~31 scenarios | All @android scenarios |

### Verification
- `./gradlew assembleDebugAndroidTest` → BUILD SUCCESSFUL
- `./gradlew lintDebug` → BUILD SUCCESSFUL

## Deferred to Epics 229/230

Steps implemented as stubs (real UI not yet built):
- **Epic 229**: Audit filters/search, volunteer CRUD forms, shift scheduling admin, reports, roles, custom fields admin
- **Epic 230**: Profile editing, theme picker, form validation, panic wipe, blasts, demo mode
