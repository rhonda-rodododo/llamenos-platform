# Phase 7 Integration Spec — Admin Sidebar + Hub Self-Service

**Date:** 2026-05-11  
**Parent Spec:** `2026-05-11-admin-sidebar-port-design.md`  
**Phase 7 Spec:** `2026-05-10-autoconfig-phase7-hub-self-service-design.md`  
**Scope:** How admin sidebar port integrates with Phase 7 hub self-service work

## Current State

### Phase 7 (In Progress)
- Backend: Hub onboarding API, provider templates, quota management
- Desktop: Hub onboarding wizard, provider settings panel
- iOS/Android: Hub self-service screens (new)

### Admin Sidebar Port (This Work)
- Provides unified navigation structure for admin settings
- Groups settings by intent (General, People, Intake, etc.)
- Permission-based nav visibility
- Cross-platform (Desktop, iOS, Android)

## Integration Points

### 1. Nav Config Extension

**New Section: Hub Communications**

After Phase 7 completes, add to `admin-nav-config.ts`:

```typescript
{
  groupSlug: 'communications',
  scope: 'this-hub',
  labelKey: 'adminNav.groups.communications',
  items: [
    {
      slug: 'hub-onboarding',
      labelKey: 'adminNav.items.hubOnboarding',
      requiredPermissions: ['hubs:configure'],
      testid: 'admin-sidebar-item-hub-onboarding',
    },
    {
      slug: 'hub-provider',
      labelKey: 'adminNav.items.hubProvider',
      requiredPermissions: ['telephony:view-providers'],
      testid: 'admin-sidebar-item-hub-provider',
    },
    {
      slug: 'hub-channels',
      labelKey: 'adminNav.items.hubChannels',
      requiredPermissions: ['hubs:configure'],
      testid: 'admin-sidebar-item-hub-channels',
    },
    {
      slug: 'hub-usage',
      labelKey: 'adminNav.items.hubUsage',
      requiredPermissions: ['telephony:view-providers'],
      testid: 'admin-sidebar-item-hub-usage',
    },
  ],
}
```

**Placement:** After "Channels" group, before "Operations"

### 2. Route Integration

**Desktop:**
```
/admin/hub-onboarding     → HubOnboardingWizard
/admin/hub-provider       → HubProviderSettings
/admin/hub-channels       → ChannelChecklist
/admin/hub-usage          → HubUsageCard
```

**iOS:**
```swift
case .hubOnboarding:
    HubOnboardingSheet()
case .hubProvider:
    HubCommunicationsView()
// ... etc
```

**Android:**
```kotlin
"hub_onboarding" -> HubOnboardingFlow()
"hub_provider" -> HubCommunicationsScreen()
// ... etc
```

### 3. Permission Requirements

| Phase 7 Feature | Required Permission | Nav Item |
|-----------------|---------------------|----------|
| Hub onboarding | `hubs:configure` | Hub Onboarding |
| Provider setup | `telephony:manage-providers` | Hub Provider |
| Channel config | `hubs:configure` | Hub Channels |
| View usage | `telephony:view-providers` | Hub Usage |
| Set quotas | `system:manage-instance` | (Platform only) |

### 4. Conditional Display

**Onboarding Wizard Trigger:**
- If `providerSetupComplete: false` → Show onboarding wizard
- If `providerSetupComplete: true` → Show settings panel
- Gate on `hubs:configure` permission

**Implementation:**
```typescript
// In section component
function HubOnboardingSection() {
  const { data: hubSettings } = useHubSettings()
  const auth = useAuth()
  
  if (!auth.hasPermission('hubs:configure')) return null
  
  if (!hubSettings?.providerSetupComplete) {
    return <HubOnboardingWizard />
  }
  
  return <HubProviderSettings />
}
```

### 5. Auto-Config Phase Ordering

**Recommended Sequence:**

```
Phase 0: Security Prerequisite (remove global config fallback)
  ↓
Phase A: Admin Sidebar Port (this work)
  - Desktop shell + sidebar
  - iOS list-based navigation
  - Android drawer navigation
  ↓
Phase B: Phase 7 Backend
  - Provider templates API
  - Hub onboarding service
  - Quota management
  ↓
Phase C: Phase 7 Desktop UI
  - Hub onboarding wizard
  - Provider settings panel
  - Plugs into admin sidebar
  ↓
Phase D: Phase 7 Mobile UI
  - iOS hub self-service screens
  - Android hub self-service screens
  - Plugs into admin sidebar
```

**Rationale:**
1. Admin sidebar provides navigation foundation
2. Phase 7 backend needs the sidebar's permission system
3. Phase 7 UI plugs into existing sidebar structure
4. Mobile can parallelize after desktop sidebar is done

### 6. Data Flow

```
User clicks "Hub Provider" in sidebar
  ↓
AdminSectionRoute renders HubProviderSection
  ↓
HubProviderSection checks providerSetupComplete
  ↓
If false: Render HubOnboardingWizard
  - Step 1: Welcome
  - Step 2: Template selection
  - Step 3: Provider connection
  - Step 4: Phone number
  - Step 5: Channel setup
  - Step 6: Summary
  ↓
If true: Render HubProviderSettings
  - Provider status card
  - Phone numbers list
  - Channel toggles
  - Usage display
```

### 7. i18n Integration

**New Keys:**
```json
{
  "adminNav": {
    "groups": {
      "communications": "Communications"
    },
    "items": {
      "hubOnboarding": "Setup Wizard",
      "hubProvider": "Provider",
      "hubChannels": "Channels",
      "hubUsage": "Usage"
    }
  },
  "hubOnboarding": {
    "title": "Hub Communications Setup",
    "welcome": "Set up your hub's communications",
    "templateTitle": "Choose a Template",
    "providerTitle": "Connect Provider",
    "numberTitle": "Phone Number",
    "channelsTitle": "Enable Channels",
    "summaryTitle": "Summary"
  }
}
```

**Propagation:**
1. Add to `packages/i18n/locales/en.json`
2. Copy to all 12 other locales
3. Run `bun run i18n:codegen`
4. Verify on all platforms

### 8. Test Integration

**New Test Scenarios:**

```gherkin
Feature: Hub Self-Service in Admin Sidebar

  Scenario: Hub admin sees communications group
    Given I am logged in as a hub admin
    When I navigate to admin settings
    Then I should see the "Communications" group
    And I should see "Setup Wizard"
    And I should see "Provider"
    And I should see "Channels"
    And I should see "Usage"

  Scenario: Onboarding wizard appears for unconfigured hub
    Given I am logged in as a hub admin
    And my hub has no provider configured
    When I tap "Setup Wizard"
    Then I should see the onboarding welcome screen

  Scenario: Settings panel appears for configured hub
    Given I am logged in as a hub admin
    And my hub has a provider configured
    When I tap "Provider"
    Then I should see the provider settings panel

  Scenario: Volunteer cannot see communications
    Given I am logged in as a volunteer
    When I navigate to admin settings
    Then I should not see the "Communications" group
```

### 9. Mobile-Specific Integration

**iOS:**
```swift
// In AdminSidebarView
Section(header: Text("Communications")) {
    NavigationLink(value: AdminNavItem.hubOnboarding) {
        Label("Setup Wizard", systemImage: "antenna.radiowaves.left.and.right")
    }
    NavigationLink(value: AdminNavItem.hubProvider) {
        Label("Provider", systemImage: "phone.connection")
    }
    // ... etc
}
```

**Android:**
```kotlin
// In AdminSidebar
NavigationDrawerItem(
    label = { Text("Communications") },
    selected = false,
    onClick = { }
)
NavigationDrawerItem(
    label = { Text("Setup Wizard") },
    selected = selectedSlug == "hub-onboarding",
    onClick = { onItemClick(AdminNavItem.hubOnboarding) },
    icon = { Icon(Icons.Default.SettingsInputAntenna, null) }
)
// ... etc
```

### 10. Backward Compatibility

**Legacy Routes:**
```
/admin/settings → /admin/location-lookup (redirect)
/admin/hubs → /admin/hubs (now in sidebar)
```

**Phase 7 Legacy:**
```
/hub/:hubId/settings/communications → /admin/hub-provider
```

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Phase 7 API not ready | Stub sections with "Coming soon" |
| Permission mismatch | Align with Phase 7's permission catalog |
| i18n key conflicts | Use `hubOnboarding` namespace |
| Mobile UX complexity | Keep onboarding as separate flow, not inline |
| Test maintenance | Add Phase 7 scenarios to existing test suites |

## Success Criteria

- [ ] Admin sidebar shows Communications group
- [ ] Hub onboarding wizard accessible from sidebar
- [ ] Provider settings accessible from sidebar
- [ ] Permission gating works for all Phase 7 features
- [ ] i18n strings properly propagated
- [ ] Tests cover Phase 7 + sidebar integration
- [ ] No regression in existing admin functionality

## Open Questions

1. Should hub onboarding be a modal flow or inline section?
2. How do we handle multi-hub users switching between hub configs?
3. Should quota settings be in Platform group or Communications group?
4. How do we handle provider template selection UI in mobile sidebar?

---

**Dependencies:**
- Phase 7 backend API complete
- Admin sidebar port complete
- i18n codegen working

**Estimated Effort:** 2-3 days (after both parent works complete)
