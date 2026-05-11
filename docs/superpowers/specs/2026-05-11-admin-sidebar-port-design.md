# Admin Sidebar UX Port — Design Spec

**Date:** 2026-05-11  
**Source:** v1 (llamenos-hotline) → v2 (llamenos-platform)  
**Branch:** `feat/admin-sidebar-port`  
**Worktree:** `~/projects/llamenos-admin-sidebar-port`

## Overview

Port the v1 admin sidebar UX overhaul to v2. The v1 implementation provides a unified vertical-nav admin shell that replaces flat collapsible sections with a sidebar-plus-main-pane layout. This design spec maps the v1 implementation to v2's architecture across all platforms (Desktop, iOS, Android).

## v1 Implementation Summary

### What Was Built in v1

1. **Admin Shell** (`admin-shell.tsx`): Layout wrapper with sidebar + main pane + mobile Sheet drawer
2. **Admin Sidebar** (`admin-sidebar.tsx`): Renders nav groups/items from config with active-state highlighting
3. **Nav Config** (`admin-nav-config.ts`): Source of truth for groups, items, routes, permissions, testids, i18n keys
4. **Nav Visibility** (`admin-nav-visibility.ts`): Permission-based filtering logic with unit tests
5. **Section Registry** (`registry.ts`): Maps nav slugs to section components
6. **Section Layout** (`section-layout.tsx`): Shared primitives for consistent section UI
7. **Advanced Reveal** (`advanced-reveal.tsx`): Collapsible wrapper for technical fields
8. **Routes**: `/admin` → redirects to first accessible, `/admin/$section` → renders section by slug

### Nav Structure (v1)

```
This Hub
├── General
│   ├── Location Lookup
│   ├── Passkey Policy
│   ├── Recovery Group
│   └── Devices
├── People
│   ├── Hub Roles
│   ├── Teams
│   └── Tags
├── Intake
│   ├── Custom Fields
│   ├── Report Types
│   └── Firehose
├── Calls & Voice
│   ├── Call Settings
│   ├── Voice Prompts
│   ├── Phone Menu Languages
│   ├── Transcription
│   └── Spam Protection
├── Channels
│   ├── Phone Provider
│   ├── Messaging / SMS
│   ├── RCS
│   └── Signal
└── Operations (hub-admin visible)
    ├── Bans
    ├── Audit
    ├── Analytics
    └── Health

Platform (super-admin only)
├── Hubs
├── Roles
├── Bans
├── Audit
├── Analytics
├── Health
├── Platform
└── GDPR Erasure
```

## v2 Current State

### Desktop (Tauri/React)
- **Routes**: `/admin/settings` (flat collapsible sections), `/admin/hubs` (standalone page)
- **Components**: `admin-settings/*` directory with individual section components
- **Navigation**: No sidebar; sections are collapsible panels on a single page
- **i18n**: Standard i18next with `packages/i18n/locales/*.json`

### iOS (SwiftUI)
- **AdminTabView**: List-based navigation with sections for Users, Bans, Audit, Invites, Custom Fields, Events, Settings
- **Settings Section**: Report Categories, Telephony, Call Settings, IVR Languages, Transcription, Spam, System Health
- **Navigation**: `NavigationStack` + `NavigationLink` within `AdminTabView`

### Android (Kotlin/Compose)
- **AdminScreen**: Tabbed interface with `ScrollableTabRow` for Volunteers, Bans, Audit, Invites, Fields, Schema, Shifts, Settings, System Health
- **Navigation**: Compose `NavHost` with sealed interface routes

## Porting Strategy

### Phase 1: Desktop (Foundation)

**Goal:** Establish the admin shell and sidebar pattern in v2 desktop.

**Key Differences from v1:**
- v2 uses TanStack Router file-based routes (same as v1)
- v2 already has shadcn/ui components (Sheet, Collapsible, etc.)
- v2 has different API client structure
- v2 permissions system is already hub-scoped with `hasHubPermission()`

**Files to Create:**
```
src/client/components/admin-shell/
  admin-shell.tsx              # Layout: sidebar + main pane + mobile Sheet
  admin-sidebar.tsx            # Nav rendering from config
  admin-nav-config.ts          # Nav structure, permissions, i18n keys
  admin-nav-config.types.ts    # TypeScript types
  admin-nav-visibility.ts      # Permission filtering logic
  advanced-reveal.tsx          # Collapsible for technical fields
  section-layout.tsx           # Shared section primitives

src/client/components/admin-sections/
  registry.ts                  # Maps slugs to components
  # (migrate existing admin-settings/* components)

src/client/routes/admin/
  route.tsx                    # AdminShell wrapper (new)
  index.tsx                    # Redirect to first accessible (new)
  $section.tsx                 # Render section by slug (new)
  # (deprecate settings.tsx, hubs.tsx - migrate content to sections)
```

**Nav Config Mapping:**
- Port v1's `admin-nav-config.ts` structure
- Update permission strings to match v2's `PERMISSION_CATALOG`
- Use v2's i18n namespace structure (add `adminNav` to `packages/i18n/locales/en.json`)

**Section Migration:**
- Migrate existing `admin-settings/*` components to `admin-sections/`
- Wrap with `SectionLayout` primitives
- Add `data-testid` attributes for E2E tests
- Update API calls to use v2's API client

### Phase 2: iOS (Master-Detail Pattern)

**Goal:** Adapt sidebar pattern to iOS using NavigationSplitView or custom master-detail.

**Design Decision:**
iOS has two good options:

**Option A: NavigationSplitView (iPad/macOS optimized)**
- Uses SwiftUI's native `NavigationSplitView` for sidebar + detail
- Automatically adapts to iPhone (becomes navigation stack)
- Best for tablet/desktop-class experiences

**Option B: Custom List + NavigationStack (current pattern extension)**
- Extend existing `AdminTabView` with grouped lists
- Keep current navigation pattern
- Simpler, matches v1's mobile approach

**Recommendation:** Option B for consistency with existing v2 iOS patterns. The current `AdminTabView` already groups items; we enhance it with:
- Group headers matching desktop sidebar groups
- Permission-based item visibility
- Active state highlighting

**Files to Create:**
```
apps/ios/Sources/Views/Admin/
  AdminSidebarView.swift       # List with grouped nav items
  AdminNavConfig.swift         # Nav structure, permissions
  AdminNavVisibility.swift     # Permission filtering
  AdminSectionHost.swift       # Renders selected section
  AdminSectionRegistry.swift   # Maps slugs to views

apps/ios/Sources/Views/Admin/Sections/
  # (wrap existing admin views as sections)
```

**Architecture:**
```swift
// AdminTabView becomes the sidebar host
struct AdminTabView: View {
    @State private var selectedSection: AdminNavItem?
    
    var body: some View {
        // On iPad: NavigationSplitView
        // On iPhone: List + NavigationLink
        AdminSidebarList(selectedSection: $selectedSection)
    }
}
```

### Phase 3: Android (Navigation Drawer Pattern)

**Goal:** Adapt sidebar pattern to Android using Navigation Drawer or custom implementation.

**Design Decision:**

**Option A: Material 3 Navigation Drawer**
- Uses `ModalNavigationDrawer` or `PermanentNavigationDrawer`
- Standard Material Design pattern
- Good for tablets when expanded

**Option B: Custom Tab + Navigation Pattern (extend current)**
- Extend existing `AdminScreen` tab pattern
- Add grouped sections within tabs
- Keep current `ScrollableTabRow` for top-level, add sidebar-like list for settings

**Recommendation:** Option A for settings sections. The current tabbed approach works for main admin functions (Users, Bans, Audit), but settings needs the sidebar grouping.

**Files to Create:**
```
apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/
  AdminSidebar.kt              # Navigation drawer content
  AdminNavConfig.kt            # Nav structure, permissions
  AdminNavVisibility.kt        # Permission filtering
  AdminSectionHost.kt          # Renders selected section
  AdminSectionRegistry.kt      # Maps slugs to composables

apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/sections/
  # (wrap existing admin composables as sections)
```

**Architecture:**
```kotlin
// New route for admin settings with sidebar
composable("admin_settings") {
    AdminSettingsScreenWithSidebar(
        onNavigateBack = { navController.popBackStack() }
    )
}

// AdminSettingsScreenWithSidebar uses ModalNavigationDrawer
@Composable
fun AdminSettingsScreenWithSidebar(...) {
    ModalNavigationDrawer(
        drawerContent = { AdminSidebar(...) }
    ) {
        // Selected section content
    }
}
```

### Phase 4: Mobile UX Considerations

**Responsive Breakpoints:**
- **Desktop (>1024px)**: Permanent sidebar, always visible
- **Tablet (768px-1024px)**: Collapsible sidebar, hamburger toggle
- **Phone (<768px)**: Sheet drawer from left, hamburger toggle

**Mobile-Specific Adaptations:**

| Feature | Desktop | iOS | Android |
|---------|---------|-----|---------|
| Nav container | Fixed sidebar | List in NavigationStack | ModalNavigationDrawer |
| Group headers | Visual dividers | Section headers | List subheaders |
| Active state | Background highlight | Checkmark/selection | Selected item tint |
| Mobile toggle | Hamburger button | Back button + title | Hamburger in TopAppBar |
| Deep linking | URL `/admin/$section` | Deeplink to section | Deeplink to section |

**Performance:**
- Lazy load section components (code splitting on desktop)
- iOS: Use `@LazyViewBuilder` pattern
- Android: Use `rememberLazyListState()`

## Test Strategy

### Desktop E2E (Playwright)
- Port v1's `admin-shell.spec.ts`, `admin-nav-config.spec.ts`
- Update selectors for v2's DOM structure
- Add tests for permission-based visibility
- Mobile drawer tests (viewport emulation)

### iOS UI Tests (XCUITest)
- Sidebar visibility tests
- Navigation flow tests
- Permission-gated item tests
- Deeplink handling tests

### Android UI Tests (Compose + Cucumber)
- Drawer open/close tests
- Section navigation tests
- Permission boundary tests
- BDD scenarios for admin flows

## i18n Strategy

**New Namespace: `adminNav`**
```json
{
  "adminNav": {
    "scopes": {
      "thisHub": "This Hub",
      "platform": "Platform"
    },
    "groups": {
      "general": "General",
      "people": "People",
      "intake": "Intake",
      "callsVoice": "Calls & Voice",
      "channels": "Channels",
      "operations": "Operations",
      "platform": "Platform"
    },
    "items": {
      "locationLookup": "Location Lookup",
      "passkeyPolicy": "Passkey Policy",
      ...
    }
  }
}
```

**Propagation:**
1. Add to `packages/i18n/locales/en.json`
2. Copy to all 12 other locales
3. Run `bun run i18n:codegen` for iOS/Android
4. Run `bun run i18n:validate:all`

## Auto-Config Phase Ordering

The Phase 7 hub self-service auto-config work is currently in progress in v2. The admin sidebar port should be sequenced **after** Phase 7 backend is complete but **can proceed in parallel** with Phase 7 mobile UI work.

**Recommended Order:**
1. Complete Phase 7 backend (provider templates, hub onboarding API)
2. Port admin sidebar to v2 desktop (this work)
3. Port admin sidebar to v2 iOS/Android (this work)
4. Complete Phase 7 mobile UI (hub onboarding wizard)

**Rationale:**
- Admin sidebar provides the navigation structure for hub settings
- Phase 7's hub onboarding wizard will plug into the admin sidebar as a new section
- The sidebar's permission system needs to handle `hubs:configure` permission

## Migration Path

### v2 Current → v2 With Sidebar

**Step 1: Add new routes alongside existing**
- Create `/admin` route tree
- Keep `/admin/settings` working (legacy redirect)
- Gradually migrate sections

**Step 2: Migrate sections one by one**
- Move `admin-settings/telephony-provider-section.tsx` → `admin-sections/phone-provider-section.tsx`
- Update imports, add to registry
- Test, repeat for each section

**Step 3: Deprecate old routes**
- `/admin/settings` → redirect to `/admin/location-lookup`
- `/admin/hubs` → becomes section within sidebar

**Step 4: Remove legacy**
- Delete `admin-settings/` directory
- Delete old route files

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing admin flows | Keep legacy routes during migration, add redirects |
| Mobile UX feels cramped | Use native patterns (drawer/sheet), not forced desktop sidebar |
| Permission system mismatch | v2 already has hub-scoped permissions, verify alignment |
| i18n key explosion | Use shared `adminNav` namespace, codegen for mobile |
| Test maintenance burden | Port v1's test helpers, maintain stable testids |

## Success Criteria

- [ ] Desktop: Sidebar renders with all groups, permission-based visibility works
- [ ] Desktop: Mobile drawer works on narrow viewports
- [ ] Desktop: All existing admin sections migrated to new structure
- [ ] Desktop: E2E tests pass with new navigation
- [ ] iOS: Admin sidebar pattern implemented (list or split view)
- [ ] iOS: Permission-based nav item visibility works
- [ ] iOS: XCUITests pass
- [ ] Android: Admin sidebar pattern implemented (drawer)
- [ ] Android: Permission-based nav item visibility works
- [ ] Android: Compose UI + Cucumber tests pass
- [ ] All platforms: i18n strings properly propagated
- [ ] Legacy routes redirect to new structure
- [ ] No regression in existing functionality

## Open Questions

1. **iOS Navigation Pattern:** Should we use `NavigationSplitView` for iPad or stick to list-based navigation everywhere?
2. **Android Navigation Pattern:** Should admin settings be a separate screen with drawer, or extend existing tab pattern?
3. **Section Lazy Loading:** Do we need code-splitting for admin sections on desktop?
4. **Deep Linking:** How do mobile deep links to specific admin sections work with the new structure?
5. **Phase 7 Integration:** Should hub onboarding wizard be a section in the sidebar or a separate flow?

---

**Next Step:** Create implementation plan with detailed tasks for each platform.
