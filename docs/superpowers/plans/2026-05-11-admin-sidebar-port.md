# Implementation Plan: Admin Sidebar UX Port (v1 → v2)

**Date:** 2026-05-11  
**Design Spec:** `docs/superpowers/specs/2026-05-11-admin-sidebar-port-design.md`  
**Source:** v1 (llamenos-hotline) admin sidebar UX overhaul  
**Target:** v2 (llamenos-platform) all platforms

## Overview

Port the v1 admin sidebar UX to v2 across Desktop (Tauri/React), iOS (SwiftUI), and Android (Kotlin/Compose). The v1 implementation provides a unified vertical-nav admin shell with permission-based nav visibility, mobile drawer support, and stable testids. This plan breaks the port into platform-specific tasks with dependencies.

## Architecture Decisions

1. **Desktop**: Direct port of v1's React components, adapted to v2's API client and route structure
2. **iOS**: Extend existing `AdminTabView` with grouped list sections and permission filtering
3. **Android**: Add `ModalNavigationDrawer` for admin settings, keep tabs for main admin functions
4. **Cross-platform**: Shared nav config structure, permission checks, and i18n keys

## Task Breakdown

---

### Phase A: Desktop Foundation

#### Task A1: Create Admin Shell Components
**Complexity:** M  
**Dependencies:** None  
**Files:**
- `src/client/components/admin-shell/admin-shell.tsx`
- `src/client/components/admin-shell/admin-sidebar.tsx`
- `src/client/components/admin-shell/admin-nav-config.ts`
- `src/client/components/admin-shell/admin-nav-config.types.ts`
- `src/client/components/admin-shell/admin-nav-visibility.ts`
- `src/client/components/admin-shell/advanced-reveal.tsx`
- `src/client/components/admin-shell/section-layout.tsx`

**Details:**
- Port v1's admin-shell components to v2
- Update imports to use v2's path aliases (`@/components/ui/*`)
- Adapt permission checks to use v2's `hasHubPermission()` and `resolveHubPermissions()`
- Use v2's i18n setup (react-i18next with `packages/i18n`)
- Add `data-testid` attributes matching v1 conventions

**Acceptance Criteria:**
- Components compile without errors
- Sidebar renders with correct groups and items
- Permission filtering works with v2's auth context
- Mobile Sheet drawer opens/closes

#### Task A2: Create Admin Routes
**Complexity:** S  
**Dependencies:** Task A1  
**Files:**
- `src/client/routes/admin/route.tsx`
- `src/client/routes/admin/index.tsx`
- `src/client/routes/admin/$section.tsx`

**Details:**
- Create TanStack Router file-based routes
- `route.tsx`: AdminShell wrapper with auth guard
- `index.tsx`: Redirect to first accessible section
- `$section.tsx`: Render section by slug from registry

**Acceptance Criteria:**
- `/admin` redirects to first accessible section
- `/admin/$section` renders correct section
- Unknown slugs return 404
- Auth guard redirects non-admins

#### Task A3: Create Section Registry
**Complexity:** S  
**Dependencies:** Task A1  
**Files:**
- `src/client/components/admin-sections/registry.ts`

**Details:**
- Map nav slugs to section components
- Start with stub registrations for each section
- Sections will be implemented in Task A4

**Acceptance Criteria:**
- Registry compiles
- All nav config slugs have corresponding registry entries

#### Task A4: Migrate Existing Admin Sections
**Complexity:** L  
**Dependencies:** Task A3  
**Files:**
- Migrate `src/client/components/admin-settings/*` → `src/client/components/admin-sections/`
- Update each section to use `SectionLayout` primitives
- Add `data-testid` attributes

**Section Mapping:**
| v1 Section | v2 Source | Notes |
|------------|-----------|-------|
| location-lookup | geocoding-settings-section.tsx | Rename, update API |
| passkey-policy | passkey-policy-section.tsx | Direct port |
| hub-roles | roles-section.tsx | Wrap existing |
| call-settings | call-settings-section.tsx | Direct port |
| voice-prompts | voice-prompts-section.tsx | Direct port |
| phone-menu-languages | ivr-languages-section.tsx | Rename |
| transcription | transcription-section.tsx | Direct port |
| spam-protection | spam-section.tsx | Rename |
| phone-provider | telephony-provider-section.tsx | Rename |
| messaging-sms | (new) | Extract from settings.tsx |
| rcs | rcs-channel-section.tsx | Direct port |
| signal | signal-channel-section.tsx | Direct port |
| custom-fields | custom-fields-section.tsx | Direct port |
| report-types | report-types-section.tsx | Direct port |
| hubs | hubs.tsx | Migrate to section |

**Acceptance Criteria:**
- All sections render without errors
- Sections use `SectionLayout` primitives
- All interactive elements have `data-testid`
- API calls use v2's client

#### Task A5: Add i18n Strings
**Complexity:** S  
**Dependencies:** Task A1  
**Files:**
- `packages/i18n/locales/en.json` (add `adminNav` namespace)
- `packages/i18n/locales/{es,zh,tl,vi,ar,fr,ht,ko,ru,hi,pt,de}.json`

**Details:**
- Add `adminNav` namespace with groups, items, scopes
- Add section-specific strings
- Run `bun run i18n:codegen`
- Run `bun run i18n:validate:all`

**Acceptance Criteria:**
- All 13 locales have adminNav keys
- Codegen succeeds
- Validation passes

#### Task A6: Add Desktop E2E Tests
**Complexity:** M  
**Dependencies:** Task A2, Task A4  
**Files:**
- `tests/helpers/admin-settings.ts`
- `tests/ui/admin-shell.spec.ts`
- `tests/ui/admin-nav-config.spec.ts`

**Details:**
- Port v1's test helpers
- Add shell navigation tests
- Add mobile drawer tests
- Add permission visibility tests

**Acceptance Criteria:**
- All tests pass with Tauri IPC mocks
- Tests use testid selectors only

---

### Phase B: iOS Implementation

#### Task B1: Create iOS Admin Nav Config
**Complexity:** S  
**Dependencies:** None  
**Files:**
- `apps/ios/Sources/Views/Admin/AdminNavConfig.swift`
- `apps/ios/Sources/Views/Admin/AdminNavVisibility.swift`

**Details:**
- Create Swift structs matching v1's nav config structure
- Implement permission filtering using v2's `resolveHubPermissions()` equivalent
- Add i18n key references

**Acceptance Criteria:**
- Config compiles
- Visibility logic works with iOS auth state

#### Task B2: Create iOS Admin Sidebar View
**Complexity:** M  
**Dependencies:** Task B1  
**Files:**
- `apps/ios/Sources/Views/Admin/AdminSidebarView.swift`

**Details:**
- Extend existing `AdminTabView` with grouped list sections
- Add group headers (General, People, Intake, etc.)
- Implement permission-based item filtering
- Add active state highlighting
- Use `NavigationLink` for section navigation

**Acceptance Criteria:**
- Sidebar renders with groups and items
- Permission filtering works
- Active state updates on selection
- Accessible identifiers for XCUITest

#### Task B3: Create iOS Section Registry
**Complexity:** S  
**Dependencies:** Task B2  
**Files:**
- `apps/ios/Sources/Views/Admin/AdminSectionRegistry.swift`

**Details:**
- Map nav slugs to SwiftUI views
- Wrap existing admin views as sections

**Acceptance Criteria:**
- Registry compiles
- All nav items map to views

#### Task B4: Migrate iOS Admin Sections
**Complexity:** M  
**Dependencies:** Task B3  
**Files:**
- Wrap existing admin views in section structure
- Update navigation to work with sidebar

**Acceptance Criteria:**
- All sections accessible from sidebar
- Navigation works correctly

#### Task B5: Add iOS UI Tests
**Complexity:** M  
**Dependencies:** Task B4  
**Files:**
- `apps/ios/Tests/XCUITests/AdminSidebarUITests.swift`

**Acceptance Criteria:**
- Tests pass on simulator
- Cover navigation, visibility, accessibility

---

### Phase C: Android Implementation

#### Task C1: Create Android Admin Nav Config
**Complexity:** S  
**Dependencies:** None  
**Files:**
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/AdminNavConfig.kt`
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/AdminNavVisibility.kt`

**Details:**
- Create Kotlin data classes matching nav config
- Implement permission filtering

**Acceptance Criteria:**
- Config compiles
- Visibility logic works

#### Task C2: Create Android Admin Sidebar
**Complexity:** M  
**Dependencies:** Task C1  
**Files:**
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/AdminSidebar.kt`
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/AdminSettingsScreen.kt`

**Details:**
- Create `ModalNavigationDrawer` for admin settings
- Add grouped list with headers
- Implement permission filtering
- Add active state

**Acceptance Criteria:**
- Drawer opens/closes
- Groups and items render correctly
- Permission filtering works

#### Task C3: Create Android Section Registry
**Complexity:** S  
**Dependencies:** Task C2  
**Files:**
- `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/AdminSectionRegistry.kt`

**Acceptance Criteria:**
- Registry compiles
- All items map to composables

#### Task C4: Migrate Android Admin Sections
**Complexity:** M  
**Dependencies:** Task C3  
**Files:**
- Wrap existing admin composables
- Update to work with sidebar navigation

**Acceptance Criteria:**
- All sections accessible
- Navigation works

#### Task C5: Add Android UI Tests
**Complexity:** M  
**Dependencies:** Task C4  
**Files:**
- `apps/android/app/src/androidTest/kotlin/org/llamenos/hotline/ui/AdminSidebarTest.kt`
- Cucumber feature file

**Acceptance Criteria:**
- Compose UI tests pass
- Cucumber BDD scenarios pass

---

### Phase D: Cross-Platform Integration

#### Task D1: Legacy Route Redirects
**Complexity:** XS  
**Dependencies:** Phase A, B, C  
**Files:**
- Desktop: Update old routes to redirect
- iOS/Android: Update deep link handling

**Details:**
- `/admin/settings` → `/admin/location-lookup`
- `/admin/hubs` → `/admin/hubs` (now in sidebar)

**Acceptance Criteria:**
- Old URLs redirect correctly
- No broken bookmarks

#### Task D2: Final Verification
**Complexity:** S  
**Dependencies:** All above  
**Commands:**
```bash
bun run typecheck
bun run build
bun run test:desktop
bun run test:ios
bun run test:android
bun run i18n:validate:all
```

**Acceptance Criteria:**
- All checks pass
- No regressions

## Execution Order

```
Phase A (Desktop):
  Task A1 → Task A2 → Task A3 → Task A4 → Task A5 → Task A6

Phase B (iOS) - parallel with Phase A after Task A1:
  Task B1 → Task B2 → Task B3 → Task B4 → Task B5

Phase C (Android) - parallel with Phase A after Task A1:
  Task C1 → Task C2 → Task C3 → Task C4 → Task C5

Phase D (Integration):
  Task D1 → Task D2
```

## Critical Path

```
Task A1 (shell) → Task A2 (routes) → Task A4 (sections) → Task D2 (verification)
```

## Estimated Effort

| Phase | Tasks | Est. Effort |
|-------|-------|-------------|
| A (Desktop) | 6 | 3-4 days |
| B (iOS) | 5 | 2-3 days |
| C (Android) | 5 | 2-3 days |
| D (Integration) | 2 | 1 day |
| **Total** | **18** | **8-11 days** |

## Notes

- **Parallelization:** iOS and Android work can proceed in parallel after desktop shell is established
- **Phase 7 Integration:** Hub onboarding wizard will add a new section to the sidebar; ensure nav config is extensible
- **Testing:** Port v1's test patterns; maintain stable testids across platforms
- **i18n:** All strings must go through `packages/i18n` → codegen; never hardcode in platform files
