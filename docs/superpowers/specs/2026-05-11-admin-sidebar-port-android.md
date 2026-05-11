# Android Admin Sidebar Port — Detailed Spec

**Date:** 2026-05-11  
**Parent Spec:** `2026-05-11-admin-sidebar-port-design.md`  
**Platform:** Android (Kotlin, Jetpack Compose, Material 3)

## Current Android Architecture

### Existing Admin Implementation

**AdminScreen.kt:**
- Tabbed interface with `ScrollableTabRow`
- 9 tabs: Volunteers, Bans, Audit, Invites, Fields, Schema, Shifts, Settings, System Health
- Uses `hiltViewModel()` for AdminViewModel
- TopAppBar with back button

**Current Tab Structure:**
```kotlin
enum class AdminTab {
    VOLUNTEERS, BANS, AUDIT, INVITES, 
    FIELDS, SCHEMA, SHIFTS, SETTINGS, SYSTEM_HEALTH
}
```

### Navigation Architecture

**Navigation.kt:**
- Sealed interface `LlamenosRoute` with route strings
- `NavHost` with `composable` destinations
- `Admin` route navigates to `AdminScreen`

**MainScreen.kt:**
- Bottom navigation: Dashboard, Notes, Conversations, Shifts, Settings
- Settings has link to Admin

## Design Decision: Modal Navigation Drawer for Settings

**Rationale:**
1. Current tabbed approach works well for main admin functions
2. Settings needs grouping (General, People, Intake, etc.)
3. Material 3 `ModalNavigationDrawer` is standard pattern
4. Keeps main admin tabs, adds drawer for settings sections

**Architecture:**
```
AdminScreen (tabs for main functions)
├── Volunteers Tab
├── Bans Tab
├── Audit Tab
├── Invites Tab
├── Fields Tab
├── Schema Tab
├── Shifts Tab
├── Settings Tab → Opens AdminSettingsScreenWithSidebar
└── System Health Tab

AdminSettingsScreenWithSidebar (drawer for settings)
├── Drawer: Grouped nav items
└── Content: Selected section
```

## Component Architecture

### 1. AdminNavConfig.kt

**Purpose:** Define nav structure, groups, items, permissions

**Structure:**
```kotlin
data class AdminNavConfig(
    val groups: List<AdminNavGroup>
)

data class AdminNavGroup(
    val groupSlug: String,
    val scope: AdminNavScope,
    val labelKey: String,
    val items: List<AdminNavItem>
)

data class AdminNavItem(
    val slug: String,
    val labelKey: String,
    val requiredPermissions: List<String>,
    val requiredRole: String? = null,
    val icon: Int  // Material icon resource
)

enum class AdminNavScope {
    THIS_HUB, PLATFORM
}
```

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/AdminNavConfig.kt`

### 2. AdminNavVisibility.kt

**Purpose:** Permission-based filtering

**Interface:**
```kotlin
object AdminNavVisibility {
    fun canSee(item: AdminNavItem, auth: NavAuthContext): Boolean
    fun canSeeGroup(group: AdminNavGroup, auth: NavAuthContext): Boolean
}

data class NavAuthContext(
    val globalRoles: List<String>,
    val hubRoles: List<HubRoleAssignment>,
    val allRoleDefs: List<Role>,
    val currentHubId: String
)
```

**Permission Resolution:**
```kotlin
// Use resolveHubPermissions equivalent
// Filter items based on resolved permissions
```

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/AdminNavVisibility.kt`

### 3. AdminSettingsScreen.kt

**Purpose:** Settings screen with navigation drawer

**Design:**
```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminSettingsScreen(
    onNavigateBack: () -> Unit,
    viewModel: AdminViewModel = hiltViewModel()
) {
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val selectedSection by viewModel.selectedSection.collectAsState()
    
    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            AdminSidebar(
                onItemClick = { item ->
                    viewModel.selectSection(item)
                    scope.launch { drawerState.close() }
                },
                selectedSlug = selectedSection?.slug
            )
        }
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(stringResource(R.string.admin_settings_title)) },
                    navigationIcon = {
                        IconButton(onClick = onNavigateBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, null)
                        }
                    },
                    actions = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Default.Menu, null)
                        }
                    }
                )
            }
        ) { padding ->
            selectedSection?.let { section ->
                AdminSectionContent(
                    section = section,
                    modifier = Modifier.padding(padding)
                )
            }
        }
    }
}
```

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/AdminSettingsScreen.kt`

### 4. AdminSidebar.kt

**Purpose:** Drawer content with grouped nav items

**Design:**
```kotlin
@Composable
fun AdminSidebar(
    onItemClick: (AdminNavItem) -> Unit,
    selectedSlug: String?,
    viewModel: AdminViewModel = hiltViewModel()
) {
    val visibleGroups by viewModel.visibleNavGroups.collectAsState()
    
    ModalDrawerSheet {
        Text(
            stringResource(R.string.admin_settings_title),
            modifier = Modifier.padding(16.dp),
            style = MaterialTheme.typography.titleLarge
        )
        
        visibleGroups.forEach { group ->
            NavigationDrawerItem(
                label = { Text(stringResource(R.string.adminNav_groups_platform)) },
                selected = false,
                onClick = { },
                modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)
            )
            
            group.items.forEach { item ->
                NavigationDrawerItem(
                    label = { Text(stringResource(getStringResource(item.labelKey))) },
                    selected = item.slug == selectedSlug,
                    onClick = { onItemClick(item) },
                    icon = { Icon(getIcon(item.icon), null) },
                    modifier = Modifier
                        .padding(NavigationDrawerItemDefaults.ItemPadding)
                        .testTag("admin-sidebar-item-${item.slug}")
                )
            }
        }
    }
}
```

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/AdminSidebar.kt`

### 5. AdminSectionContent.kt

**Purpose:** Render selected section

**Design:**
```kotlin
@Composable
fun AdminSectionContent(
    section: AdminNavItem,
    modifier: Modifier = Modifier
) {
    when (section.slug) {
        "location-lookup" -> LocationLookupSection()
        "passkey-policy" -> PasskeyPolicySection()
        "call-settings" -> CallSettingsSection()
        // ... etc
        else -> EmptySection(slug = section.slug)
    }
}
```

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/AdminSectionContent.kt`

### 6. AdminSectionRegistry.kt

**Purpose:** Map slugs to composables

**Design:**
```kotlin
object AdminSectionRegistry {
    @Composable
    fun SectionForSlug(slug: String, viewModel: AdminViewModel) {
        when (slug) {
            "users" -> VolunteersTab(viewModel = viewModel)
            "bans" -> BanListTab(viewModel = viewModel)
            "audit" -> AuditLogTab(viewModel = viewModel)
            // ... etc
            else -> EmptySection(slug)
        }
    }
}
```

**File:** `apps/android/app/src/main/java/org/llamenos/hotline/ui/admin/AdminSectionRegistry.kt`

## Nav Structure Mapping

### v1 Desktop Groups → Android Sections

| v1 Group | v1 Items | Android Location | Notes |
|----------|----------|------------------|-------|
| Operations | Users, Bans, Audit, Invites | AdminScreen tabs | Keep as tabs |
| Intake | Custom Fields, Report Types | AdminScreen tabs | Keep as tabs |
| Calls & Voice | Call Settings, Voice Prompts, etc. | Settings drawer | Group in drawer |
| Channels | Phone Provider, SMS, RCS, Signal | Settings drawer | Group in drawer |
| Platform | Hubs, Roles, Analytics | Settings drawer | Super-admin only |

### Android Nav Structure

```
AdminScreen (tabs)
├── Volunteers Tab (existing)
├── Bans Tab (existing)
├── Audit Tab (existing)
├── Invites Tab (existing)
├── Fields Tab (existing)
├── Schema Tab (existing)
├── Shifts Tab (existing)
├── Settings Tab → AdminSettingsScreenWithSidebar
│   ├── General
│   │   ├── Location Lookup
│   │   └── Passkey Policy
│   ├── Calls & Voice
│   │   ├── Call Settings
│   │   ├── Voice Prompts
│   │   ├── IVR Languages
│   │   ├── Transcription
│   │   └── Spam Protection
│   ├── Channels
│   │   ├── Phone Provider
│   │   ├── Messaging / SMS
│   │   ├── RCS
│   │   └── Signal
│   └── Platform (super-admin)
│       ├── Hubs
│       ├── Roles
│       ├── Analytics
│       └── Platform Settings
└── System Health Tab (existing)
```

## Permission Integration

### Auth State Access

**SessionState.kt** (or similar) currently has:
```kotlin
data class SessionState(
    val user: User?,
    val globalRoles: List<String>,
    val hubRoles: List<HubRoleAssignment>,
    val allRoleDefs: List<Role>
)
```

**Required:**
```kotlin
fun SessionState.resolveHubPermissions(hubId: String): List<String> {
    // Union of global permissions + hub-specific permissions
}

fun SessionState.hasPermission(permission: String, hubId: String): Boolean {
    // Check resolved permissions
}
```

### ViewModel Integration

**AdminViewModel.kt:**
```kotlin
@HiltViewModel
class AdminViewModel @Inject constructor(
    private val apiService: ApiService,
    // ...
) : ViewModel() {
    
    private val _selectedSection = MutableStateFlow<AdminNavItem?>(null)
    val selectedSection: StateFlow<AdminNavItem?> = _selectedSection.asStateFlow()
    
    private val _visibleNavGroups = MutableStateFlow<List<AdminNavGroup>>(emptyList())
    val visibleNavGroups: StateFlow<List<AdminNavGroup>> = _visibleNavGroups.asStateFlow()
    
    fun selectSection(item: AdminNavItem) {
        _selectedSection.value = item
    }
    
    fun refreshNavVisibility() {
        // Filter groups based on current permissions
    }
}
```

## i18n Strategy

### String Resources

**New Keys (strings.xml):**
```xml
<string name="adminNav_groups_operations">Operations</string>
<string name="adminNav_groups_platform">Platform</string>
<string name="adminNav_items_analytics">Analytics</string>
<string name="adminNav_items_health">Health</string>
<string name="admin_settings_title">Admin Settings</string>
```

**Existing Keys (keep):**
```xml
<string name="admin_users">Volunteers</string>
<string name="admin_bans">Ban List</string>
<string name="admin_audit">Audit Log</string>
<string name="admin_invites">Invites</string>
<string name="admin_fields">Custom Fields</string>
```

**Codegen:**
- Run `bun run i18n:codegen` to generate `strings.xml` and `I18n.kt`
- Use `stringResource(R.string.key)` in Compose

## Navigation Updates

### Route Changes

**Current:**
```kotlin
// Admin is a single screen with tabs
composable(LlamenosRoute.Admin.route) {
    AdminScreen(onNavigateBack = { navController.popBackStack() })
}
```

**New:**
```kotlin
// Admin screen with tabs (unchanged)
composable(LlamenosRoute.Admin.route) {
    AdminScreen(
        onNavigateBack = { navController.popBackStack() },
        onNavigateToSettings = {
            navController.navigate("admin_settings")
        }
    )
}

// New route for settings with sidebar
composable("admin_settings") {
    AdminSettingsScreen(onNavigateBack = { navController.popBackStack() })
}
```

### AdminScreen Updates

**Add to AdminScreen.kt:**
```kotlin
@Composable
fun AdminScreen(
    onNavigateBack: () -> Unit,
    onNavigateToSettings: () -> Unit = {},
    // ... existing params
) {
    // ... existing tab row
    
    when (uiState.selectedTab) {
        // ... existing tabs
        AdminTab.SETTINGS -> {
            // Instead of inline settings, navigate to settings screen
            LaunchedEffect(Unit) {
                onNavigateToSettings()
            }
        }
        // ... rest
    }
}
```

## Testing Strategy

### Compose UI Tests

**AdminSidebarTest.kt:**
```kotlin
class AdminSidebarTest {
    @get:Rule
    val composeTestRule = createComposeRule()
    
    @Test
    fun hubAdminSeesOperationsNotPlatform() {
        // Set up hub admin auth
        // Open admin settings
        // Verify Operations items visible
        // Verify Platform items not visible
    }
    
    @Test
    fun drawerOpensAndCloses() {
        // Tap menu button
        // Verify drawer visible
        // Tap item
        // Verify drawer closed
    }
    
    @Test
    fun sectionSelectionWorks() {
        // Open drawer
        // Tap section
        // Verify section content displayed
    }
}
```

### Cucumber BDD

**admin-sidebar.feature:**
```gherkin
Feature: Admin Sidebar Navigation

  Scenario: Hub admin sees operations sections
    Given I am logged in as a hub admin
    When I navigate to admin settings
    Then I should see "Calls & Voice" section
    And I should see "Channels" section
    And I should not see "Platform" section

  Scenario: Super admin sees platform sections
    Given I am logged in as a super admin
    When I navigate to admin settings
    Then I should see "Platform" section
    And I should see "Hubs" item

  Scenario: Navigate to section
    Given I am on admin settings
    When I tap "Call Settings" in the sidebar
    Then I should see the Call Settings screen
```

## Migration Checklist

- [ ] Create `AdminNavConfig.kt`
- [ ] Create `AdminNavVisibility.kt`
- [ ] Create `AdminSettingsScreen.kt`
- [ ] Create `AdminSidebar.kt`
- [ ] Create `AdminSectionContent.kt`
- [ ] Create `AdminSectionRegistry.kt`
- [ ] Update `AdminScreen.kt` to link to settings
- [ ] Update `Navigation.kt` with new route
- [ ] Add i18n strings
- [ ] Update `AdminViewModel.kt`
- [ ] Add Compose UI tests
- [ ] Add Cucumber BDD scenarios
- [ ] Verify no regressions

## Performance Considerations

1. **Lazy Loading:** Load section data only when selected
2. **Drawer State:** Remember drawer state across config changes
3. **Permission Caching:** Resolve permissions once per auth change
4. **List Recycling:** Use `LazyColumn` for drawer items

## Material 3 Guidelines

### Drawer Design
- Use `ModalNavigationDrawer` for phone
- Use `PermanentNavigationDrawer` for tablet (future)
- Follow Material 3 color scheme
- Use `NavigationDrawerItem` for items
- Add proper padding and spacing

### Responsive Design
```kotlin
@Composable
fun AdminSettingsScreen(...) {
    val windowSizeClass = calculateWindowSizeClass()
    
    when (windowSizeClass.widthSizeClass) {
        WindowWidthSizeClass.Compact -> {
            // Phone: Modal drawer
            ModalNavigationDrawer(...)
        }
        WindowWidthSizeClass.Medium,
        WindowWidthSizeClass.Expanded -> {
            // Tablet: Permanent drawer or rail
            PermanentNavigationDrawer(...)
        }
    }
}
```

## Open Questions

1. Should we use `PermanentNavigationDrawer` for tablets?
2. How do we handle deep linking to specific settings sections?
3. Should settings sections be separate screens or inline?
4. How do we handle the back button when drawer is open?
5. Should we animate section transitions?

---

**Next:** Cross-platform test plan spec
