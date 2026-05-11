# iOS Admin Sidebar Port — Detailed Spec

**Date:** 2026-05-11  
**Parent Spec:** `2026-05-11-admin-sidebar-port-design.md`  
**Platform:** iOS (SwiftUI, iOS 17+, @Observable)

## Current iOS Architecture

### Existing Admin Implementation

**AdminTabView.swift:**
- List-based navigation with `NavigationLink`
- Two implicit sections: main items + Settings section
- Uses `NSLocalizedString` for i18n
- Navigation via `NavigationStack` in `ContentView`

**Current Admin Items:**
```
Main Section:
├── Users (Volunteers)
├── Ban List
├── Audit Log
├── Invites
├── Custom Fields
├── Schema Browser
├── Events

Settings Section:
├── Report Categories
├── Telephony
├── Call Settings
├── IVR Languages
├── Transcription
├── Spam Settings
├── System Health
```

### Navigation Architecture

**Router.swift:**
```swift
enum Route: Hashable {
    case admin
    // ... other routes
}
```

**ContentView.swift:**
- Dashboard state shows `MainTabView()`
- `.admin` route pushes `AdminTabView()`

**MainTabView.swift:**
- Tab-based navigation: Dashboard, Notes, Shifts, Settings
- Settings tab has link to Admin

## Design Decision: List-Based Navigation (Option B)

**Rationale:**
1. Consistent with existing iOS patterns in v2
2. Simpler than `NavigationSplitView` for iPhone-first design
3. Matches v1's mobile approach (Sheet drawer)
4. Easier to implement permission-based filtering
5. Works well with existing `NavigationStack`

**Alternative Rejected:** `NavigationSplitView`
- Better for iPad but adds complexity
- iPhone collapses to stack anyway
- v2 doesn't currently use split views

## Component Architecture

### 1. AdminNavConfig.swift

**Purpose:** Define nav structure, groups, items, permissions

**Structure:**
```swift
struct AdminNavConfig {
    let groups: [AdminNavGroup]
}

struct AdminNavGroup {
    let groupSlug: String
    let scope: AdminNavScope  // .thisHub or .platform
    let labelKey: String      // i18n key
    let items: [AdminNavItem]
}

struct AdminNavItem {
    let slug: String
    let labelKey: String
    let requiredPermissions: [String]
    let requiredRole: String?  // "role-super-admin"
    let icon: String           // SF Symbol name
}

enum AdminNavScope {
    case thisHub
    case platform
}
```

**File:** `apps/ios/Sources/Views/Admin/AdminNavConfig.swift`

### 2. AdminNavVisibility.swift

**Purpose:** Permission-based filtering

**Interface:**
```swift
struct AdminNavVisibility {
    static func canSee(_ item: AdminNavItem, auth: NavAuthContext) -> Bool
    static func canSeeGroup(_ group: AdminNavGroup, auth: NavAuthContext) -> Bool
}

struct NavAuthContext {
    let globalRoles: [String]
    let hubRoles: [HubRoleAssignment]
    let allRoleDefs: [Role]
    let currentHubId: String
}
```

**Permission Resolution:**
```swift
// Use resolveHubPermissions from shared permissions
// Equivalent to v2 TypeScript: resolveHubPermissions(globalRoles, hubRoles, allRoleDefs, currentHubId)
```

**File:** `apps/ios/Sources/Views/Admin/AdminNavVisibility.swift`

### 3. AdminSidebarView.swift

**Purpose:** Main admin view with grouped list

**Design:**
```swift
struct AdminSidebarView: View {
    @Environment(AppState.self) private var appState
    @State private var selectedSection: AdminNavItem?
    
    var body: some View {
        List {
            ForEach(visibleGroups) { group in
                Section(header: Text(NSLocalizedString(group.labelKey, comment: ""))) {
                    ForEach(visibleItems(in: group)) { item in
                        NavigationLink(value: item) {
                            Label(
                                NSLocalizedString(item.labelKey, comment: ""),
                                systemImage: item.icon
                            )
                        }
                        .accessibilityIdentifier("admin-sidebar-item-\(item.slug)")
                    }
                }
            }
        }
        .navigationTitle(NSLocalizedString("admin_title", comment: "Admin"))
        .navigationDestination(for: AdminNavItem.self) { item in
            AdminSectionView(item: item)
        }
    }
}
```

**Key Features:**
- Grouped list with section headers
- SF Symbols for icons
- Permission-based filtering
- Active state via `NavigationLink` selection
- Accessibility identifiers for XCUITest

**File:** `apps/ios/Sources/Views/Admin/AdminSidebarView.swift`

### 4. AdminSectionView.swift

**Purpose:** Render selected section

**Design:**
```swift
struct AdminSectionView: View {
    let item: AdminNavItem
    
    var body: some View {
        switch item.slug {
        case "users":
            UsersView(viewModel: adminViewModel)
        case "bans":
            BanListView(viewModel: adminViewModel)
        case "audit":
            AuditLogView(viewModel: adminViewModel)
        // ... etc
        default:
            Text("Section not implemented")
        }
    }
}
```

**File:** `apps/ios/Sources/Views/Admin/AdminSectionView.swift`

### 5. AdminSectionRegistry.swift

**Purpose:** Map slugs to view types

**Design:**
```swift
enum AdminSectionRegistry {
    @ViewBuilder
    static func view(for slug: String, viewModel: AdminViewModel) -> some View {
        switch slug {
        case "users":
            UsersView(viewModel: viewModel)
        case "bans":
            BanListView(viewModel: viewModel)
        // ... etc
        default:
            EmptySectionView(slug: slug)
        }
    }
}
```

**File:** `apps/ios/Sources/Views/Admin/AdminSectionRegistry.swift`

## Nav Structure Mapping

### v1 Desktop Groups → iOS Sections

| v1 Group | v1 Items | iOS Section | Notes |
|----------|----------|-------------|-------|
| General | Location Lookup, Passkey Policy | Settings → General | Merge into settings |
| People | Hub Roles, Teams, Tags | Admin → People | New section |
| Intake | Custom Fields, Report Types, Firehose | Admin → Intake | New section |
| Calls & Voice | Call Settings, Voice Prompts, IVR, Transcription, Spam | Admin → Voice | Merge existing |
| Channels | Phone Provider, SMS, RCS, Signal | Admin → Channels | New section |
| Operations | Bans, Audit, Analytics, Health | Admin → Operations | Existing items |
| Platform | Hubs, Roles, Bans, Audit, Analytics, Health, Platform | Admin → Platform | Super-admin only |

### iOS Nav Structure

```
Admin (AdminSidebarView)
├── Operations
│   ├── Users (existing)
│   ├── Ban List (existing)
│   ├── Audit Log (existing)
│   ├── Invites (existing)
│   ├── Custom Fields (existing)
│   ├── Events (existing)
│   └── Schema Browser (existing)
├── Settings
│   ├── Report Categories (existing)
│   ├── Telephony (existing)
│   ├── Call Settings (existing)
│   ├── IVR Languages (existing)
│   ├── Transcription (existing)
│   ├── Spam Settings (existing)
│   └── System Health (existing)
└── Platform (super-admin only)
    ├── Hubs
    ├── Roles
    ├── Analytics
    └── Platform Settings
```

## Permission Integration

### Auth State Access

**AppState.swift** currently has:
```swift
@Observable
class AppState {
    var apiService: APIService
    var cryptoService: CryptoService
    var hubContext: HubContext
    // Need to add: user roles, permissions
}
```

**Required Additions:**
```swift
extension AppState {
    var currentUser: User? { get }
    var globalRoles: [String] { get }
    var hubRoles: [HubRoleAssignment] { get }
    var allRoleDefs: [Role] { get }
    
    func hasPermission(_ permission: String) -> Bool
    func resolveHubPermissions() -> [String]
}
```

### Hub Context

**Current:**
```swift
struct HubContext {
    var activeHubId: String?
    var availableHubs: [Hub]
}
```

**Usage:**
- Get current hub ID from `hubContext.activeHubId`
- Resolve permissions for that hub
- Filter nav items accordingly

## View Model Updates

### AdminViewModel.swift

**Current:**
```swift
@Observable
class AdminViewModel {
    var users: [User] = []
    var bans: [Ban] = []
    // ...
}
```

**Additions:**
```swift
extension AdminViewModel {
    var visibleNavGroups: [AdminNavGroup] {
        // Filter based on permissions
    }
    
    func canAccessSection(_ slug: String) -> Bool {
        // Check permissions for section
    }
}
```

## i18n Strategy

### String Keys

**New Keys to Add:**
```
adminNav.groups.operations = "Operations"
adminNav.groups.platform = "Platform"
adminNav.items.analytics = "Analytics"
adminNav.items.health = "Health"
adminNav.items.platform = "Platform"
```

**Existing Keys (keep):**
```
admin_tab_users = "Volunteers"
admin_tab_bans = "Ban List"
admin_tab_audit = "Audit Log"
admin_tab_invites = "Invites"
admin_tab_fields = "Custom Fields"
admin_settings_section = "Settings"
admin_report_categories = "Report Categories"
admin_telephony_settings = "Telephony"
// ... etc
```

**Codegen:**
- Run `bun run i18n:codegen` to generate `.strings` files
- Import `NSLocalizedString` with generated keys

## Navigation Flow

### Current Flow
```
MainTabView (Settings tab)
  └── Tap "Admin"
        └── Push AdminTabView
              └── Tap item
                    └── Push detail view
```

### New Flow
```
MainTabView (Settings tab)
  └── Tap "Admin"
        └── Push AdminSidebarView
              ├── Operations section
              │   └── Tap item → Push section view
              ├── Settings section
              │   └── Tap item → Push section view
              └── Platform section (super-admin)
                    └── Tap item → Push section view
```

## Accessibility

### Identifiers

```swift
// Admin sidebar
.accessibilityIdentifier("admin-sidebar")

// Group headers
.accessibilityIdentifier("admin-sidebar-group-\(groupSlug)")

// Nav items
.accessibilityIdentifier("admin-sidebar-item-\(item.slug)")

// Section views
.accessibilityIdentifier("admin-section-\(slug)")
```

### VoiceOver

- Group headers should announce as headings
- Active item should announce selection state
- Section changes should announce new title

## Testing Strategy

### XCUITest Plan

**AdminSidebarUITests.swift:**
```swift
class AdminSidebarUITests: XCTestCase {
    func testHubAdminSeesOperationsNotPlatform() {
        // Login as hub admin
        // Navigate to Admin
        // Verify Operations items visible
        // Verify Platform items not visible
    }
    
    func testSuperAdminSeesPlatform() {
        // Login as super admin
        // Navigate to Admin
        // Verify Platform section visible
    }
    
    func testNavItemSelection() {
        // Tap nav item
        // Verify section view pushed
        // Verify correct title
    }
    
    func testPermissionFiltering() {
        // Login as volunteer (no admin)
        // Verify Admin tab not visible
    }
}
```

## Migration Checklist

- [ ] Create `AdminNavConfig.swift`
- [ ] Create `AdminNavVisibility.swift`
- [ ] Create `AdminSidebarView.swift`
- [ ] Create `AdminSectionView.swift`
- [ ] Create `AdminSectionRegistry.swift`
- [ ] Update `AdminTabView.swift` to use new structure
- [ ] Update `ContentView.swift` navigation
- [ ] Add i18n keys
- [ ] Update `AdminViewModel.swift`
- [ ] Add XCUITests
- [ ] Verify no regressions

## Performance Considerations

1. **Lazy Loading:** Sections should load data only when selected
2. **List Caching:** Nav config is static, cache visible groups
3. **Permission Caching:** Resolve permissions once per auth change

## Open Questions

1. Should we use `@Observable` or `@StateObject` for AdminViewModel?
2. How do we handle deep linking to specific admin sections?
3. Should Platform section be a separate tab or within Admin?
4. How do we handle iPad-specific layout (wider screen)?

---

**Next:** Android detailed spec
