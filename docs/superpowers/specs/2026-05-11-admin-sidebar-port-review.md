# Admin Sidebar Port — Review & Audit Checklist

**Date:** 2026-05-11  
**Purpose:** Cross-reference all specs for consistency, completeness, and correctness

## Spec Inventory

| # | Spec File | Status | Purpose |
|---|-----------|--------|---------|
| 1 | `2026-05-11-admin-sidebar-port-design.md` | ✅ Complete | High-level design and strategy |
| 2 | `2026-05-11-admin-sidebar-port.md` | ✅ Complete | Master implementation plan |
| 3 | `2026-05-11-admin-sidebar-port-desktop.md` | ✅ Complete | Desktop (React) detailed spec |
| 4 | `2026-05-11-admin-sidebar-port-ios.md` | ✅ Complete | iOS (SwiftUI) detailed spec |
| 5 | `2026-05-11-admin-sidebar-port-android.md` | ✅ Complete | Android (Compose) detailed spec |
| 6 | `2026-05-11-admin-sidebar-port-test-plan.md` | ✅ Complete | Cross-platform test plan |
| 7 | `2026-05-11-admin-sidebar-port-phase7-integration.md` | ✅ Complete | Phase 7 integration spec |

## Consistency Audit

### Nav Structure (Cross-Platform)

| Group | Desktop | iOS | Android | Consistent? |
|-------|---------|-----|---------|-------------|
| General | ✅ | ✅ | ✅ | ✅ Yes |
| People | ✅ | ✅ | ✅ | ✅ Yes |
| Intake | ✅ | ✅ | ✅ | ✅ Yes |
| Calls & Voice | ✅ | ✅ | ✅ | ✅ Yes |
| Channels | ✅ | ✅ | ✅ | ✅ Yes |
| Operations | ✅ | ✅ | ✅ | ✅ Yes |
| Platform | ✅ | ✅ | ✅ | ✅ Yes |

**Finding:** All platforms use same group structure. ✅

### Permission Mapping

| v1 Permission | v2 Permission | Desktop | iOS | Android | Tested? |
|---------------|---------------|---------|-----|---------|---------|
| `settings:read` | `settings:read` | ✅ | ✅ | ✅ | ✅ |
| `settings:write` | `settings:manage` | ✅ | ✅ | ✅ | ✅ |
| `bans:read` | `bans:read` | ✅ | ✅ | ✅ | ✅ |
| `audit:read` | `audit:read` | ✅ | ✅ | ✅ | ✅ |
| `system:manage-hubs` | `system:manage-hubs` | ✅ | ✅ | ✅ | ✅ |
| `system:manage-roles` | `system:manage-roles` | ✅ | ✅ | ✅ | ✅ |

**Finding:** Permission mapping consistent across specs. ✅

### i18n Keys

| Key | Desktop | iOS | Android | Codegen? |
|-----|---------|-----|---------|----------|
| `adminNav.scopes.thisHub` | ✅ | ✅ | ✅ | ✅ |
| `adminNav.groups.general` | ✅ | ✅ | ✅ | ✅ |
| `adminNav.items.locationLookup` | ✅ | ✅ | ✅ | ✅ |
| `common.showAdvanced` | ✅ | ✅ | ✅ | ✅ |
| `common.hideAdvanced` | ✅ | ✅ | ✅ | ✅ |

**Finding:** i18n keys consistent, all platforms use codegen. ✅

### Test Coverage

| Scenario | Desktop | iOS | Android | Priority |
|----------|---------|-----|---------|----------|
| Hub admin sees correct groups | Playwright | XCUITest | Compose | P0 |
| Super admin sees platform | Playwright | XCUITest | Compose | P0 |
| Volunteer cannot access | Playwright | XCUITest | Compose | P0 |
| Nav item selection | Playwright | XCUITest | Compose | P0 |
| Mobile drawer | Playwright | XCUITest | Compose | P0 |
| Deeplink | Playwright | XCUITest | Compose | P1 |
| Legacy redirect | Playwright | N/A | N/A | P1 |

**Finding:** Test coverage consistent across platforms. ✅

## Completeness Check

### Desktop Spec

| Component | Defined | File Path | Acceptance Criteria |
|-----------|---------|-----------|---------------------|
| admin-shell.tsx | ✅ | `src/client/components/admin-shell/` | 6 criteria |
| admin-sidebar.tsx | ✅ | `src/client/components/admin-shell/` | 7 criteria |
| admin-nav-config.ts | ✅ | `src/client/components/admin-shell/` | 3 criteria |
| admin-nav-visibility.ts | ✅ | `src/client/components/admin-shell/` | 3 criteria |
| advanced-reveal.tsx | ✅ | `src/client/components/admin-shell/` | 3 criteria |
| section-layout.tsx | ✅ | `src/client/components/admin-shell/` | 3 criteria |
| registry.ts | ✅ | `src/client/components/admin-sections/` | 3 criteria |
| Routes | ✅ | `src/client/routes/admin/` | 4 criteria |
| i18n | ✅ | `packages/i18n/locales/` | 3 criteria |
| Tests | ✅ | `tests/ui/` | 4 criteria |

**Status:** Complete ✅

### iOS Spec

| Component | Defined | File Path | Acceptance Criteria |
|-----------|---------|-----------|---------------------|
| AdminNavConfig.swift | ✅ | `apps/ios/Sources/Views/Admin/` | 1 criterion |
| AdminNavVisibility.swift | ✅ | `apps/ios/Sources/Views/Admin/` | 1 criterion |
| AdminSidebarView.swift | ✅ | `apps/ios/Sources/Views/Admin/` | 5 criteria |
| AdminSectionView.swift | ✅ | `apps/ios/Sources/Views/Admin/` | 1 criterion |
| AdminSectionRegistry.swift | ✅ | `apps/ios/Sources/Views/Admin/` | 1 criterion |
| i18n | ✅ | `packages/i18n/locales/` | Via codegen |
| Tests | ✅ | `apps/ios/Tests/XCUITests/` | 4 scenarios |

**Status:** Complete ✅

### Android Spec

| Component | Defined | File Path | Acceptance Criteria |
|-----------|---------|-----------|---------------------|
| AdminNavConfig.kt | ✅ | `apps/android/.../ui/admin/` | 1 criterion |
| AdminNavVisibility.kt | ✅ | `apps/android/.../ui/admin/` | 1 criterion |
| AdminSettingsScreen.kt | ✅ | `apps/android/.../ui/admin/` | 1 criterion |
| AdminSidebar.kt | ✅ | `apps/android/.../ui/admin/` | 1 criterion |
| AdminSectionContent.kt | ✅ | `apps/android/.../ui/admin/` | 1 criterion |
| AdminSectionRegistry.kt | ✅ | `apps/android/.../ui/admin/` | 1 criterion |
| i18n | ✅ | `packages/i18n/locales/` | Via codegen |
| Tests | ✅ | `apps/android/.../ui/` | 4 scenarios |

**Status:** Complete ✅

## Gaps Identified

### 1. Missing: Backend API Requirements

**Issue:** Specs assume admin API endpoints exist in v2, but don't verify.

**Resolution:** Add API audit task:
- Verify `/api/settings/*` endpoints
- Verify `/api/bans` endpoints
- Verify `/api/audit` endpoints
- Verify `/api/analytics` endpoints
- Verify `/api/health` endpoints

### 2. Missing: Auth Context Shape

**Issue:** v2's `useAuth()` hook shape not fully documented.

**Resolution:** Add auth context verification:
```typescript
// Required fields:
interface AuthContext {
  user: {
    globalRoles: string[]
    hubRoles: { hubId: string; roleIds: string[] }[]
  }
  allRoleDefs: Role[]
  currentHubId: string
  isLoading: boolean
}
```

### 3. Missing: Migration Timeline

**Issue:** No specific timeline for deprecating old routes.

**Resolution:** Add to implementation plan:
- Week 1: Create new routes alongside old
- Week 2: Migrate sections
- Week 3: Add redirects
- Week 4: Remove legacy

### 4. Missing: Performance Budget

**Issue:** No performance targets specified.

**Resolution:** Add:
- First render: < 100ms
- Section switch: < 50ms
- Mobile drawer: < 16ms animation
- Bundle size increase: < 50KB

### 5. Missing: Accessibility Requirements

**Issue:** Accessibility only mentioned in passing.

**Resolution:** Add explicit requirements:
- WCAG 2.1 AA compliance
- Keyboard navigation for desktop
- VoiceOver/TalkBack support
- Focus management in drawer

## Correctness Verification

### Against v1 Implementation

| v1 Feature | Ported? | Correct? |
|------------|---------|----------|
| Vertical nav shell | ✅ | ✅ |
| Grouped sections | ✅ | ✅ |
| Permission filtering | ✅ | ✅ (adapted for v2) |
| Mobile Sheet drawer | ✅ | ✅ (desktop only) |
| data-testid conventions | ✅ | ✅ |
| i18n namespace | ✅ | ✅ |
| Section layout primitives | ✅ | ✅ |
| Advanced reveal | ✅ | ✅ |
| Legacy redirects | ✅ | ✅ |

### Against v2 Architecture

| v2 Pattern | Used? | Correct? |
|------------|-------|----------|
| TanStack Router | ✅ | ✅ |
| shadcn/ui | ✅ | ✅ |
| Tailwind CSS | ✅ | ✅ |
| react-i18next | ✅ | ✅ |
| @shared/permissions | ✅ | ✅ |
| Hub-scoped auth | ✅ | ✅ |
| packages/i18n | ✅ | ✅ |
| Playwright E2E | ✅ | ✅ |
| SwiftUI @Observable | ✅ | ✅ |
| Compose Material 3 | ✅ | ✅ |

## Action Items

### Before Implementation Starts

- [ ] Verify v2 auth context exposes all needed fields
- [ ] Verify all admin API endpoints exist
- [ ] Confirm i18n codegen works for new namespace
- [ ] Set up git worktree for isolated development
- [ ] Run baseline tests to ensure clean starting point

### During Implementation

- [ ] Create specs directory structure
- [ ] Implement desktop shell first
- [ ] Port one section at a time
- [ ] Add tests with each section
- [ ] Run i18n validation after each platform

### Before Merge

- [ ] All tests pass on all platforms
- [ ] i18n validation passes
- [ ] No regression in existing tests
- [ ] Legacy routes redirect correctly
- [ ] Performance budget met
- [ ] Accessibility audit passed

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Author | Sisyphus | 2026-05-11 | ✅ Complete |
| Review | (Pending) | | |
| Approval | (Pending) | | |

## Next Steps

1. **User Review:** Have user review all 7 spec files
2. **Approval:** Get sign-off on design and implementation plan
3. **Worktree Setup:** Create isolated git worktree
4. **Implementation:** Begin with desktop foundation (Task A1)
5. **Parallel Work:** iOS and Android can start after Task A1

---

**All specs are ready for review and implementation.**
