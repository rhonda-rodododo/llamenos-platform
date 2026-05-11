# Desktop Admin Sidebar Port — Detailed Spec

**Date:** 2026-05-11  
**Parent Spec:** `2026-05-11-admin-sidebar-port-design.md`  
**Platform:** Desktop (Tauri v2 + React + TanStack Router + shadcn/ui)

## Component-by-Component Port Mapping

### 1. Admin Shell (`admin-shell.tsx`)

**v1 Source:** `src/client/components/admin-shell/admin-shell.tsx`

**v2 Changes:**
- Import paths: `@/components/ui/*` (same as v1)
- i18n: `useTranslation()` from `react-i18next` (same)
- Mobile breakpoint: 1024px (same)
- Sheet component: shadcn/ui `Sheet` (same)

**File:** `src/client/components/admin-shell/admin-shell.tsx`

```typescript
// Key differences from v1:
// - v2 uses same shadcn/ui components
// - v2 has same Tailwind setup
// - Direct port with minimal changes
```

**Acceptance Criteria:**
- [ ] Renders sidebar + main pane layout
- [ ] Mobile Sheet drawer works (<1024px)
- [ ] Sticky header with hamburger + section title
- [ ] `data-testid="admin-shell"` on root
- [ ] `data-testid="admin-sidebar-toggle"` on mobile button
- [ ] `data-testid="admin-sidebar-drawer"` on Sheet

### 2. Admin Sidebar (`admin-sidebar.tsx`)

**v1 Source:** `src/client/components/admin-shell/admin-sidebar.tsx`

**v2 Changes:**
- Auth context: v2's `useAuth()` returns different shape; adapt `canSee`/`canSeeGroup` calls
- Router: TanStack Router (same as v1)
- i18n: Same pattern

**Auth Context Adaptation:**
```typescript
// v1 auth context:
interface NavAuthContext {
  roles: string[]
  hasPermission: (permission: string) => boolean
}

// v2 auth context (from useAuth):
// Need to construct NavAuthContext from v2's auth state
// v2 has: user.globalRoles, user.hubRoles, allRoleDefs
// For admin sidebar, we need effective permissions for current hub
```

**File:** `src/client/components/admin-shell/admin-sidebar.tsx`

**Acceptance Criteria:**
- [ ] Renders groups from config
- [ ] Filters items by permissions
- [ ] Highlights active item
- [ ] Shows scope headers ("This Hub", "Platform")
- [ ] `data-testid="admin-sidebar"` on nav
- [ ] `data-testid="admin-sidebar-group-{slug}"` on groups
- [ ] `data-testid="admin-sidebar-item-{slug}"` on items

### 3. Nav Config (`admin-nav-config.ts`)

**v1 Source:** `src/client/components/admin-shell/admin-nav-config.ts`

**v2 Permission Mapping:**

| v1 Permission | v2 Permission | Notes |
|---------------|---------------|-------|
| `settings:read` | `settings:read` | Same |
| `settings:write` | `settings:manage` | v2 uses `manage` |
| `bans:read` | `bans:read` | Same |
| `audit:read` | `audit:read` | Same |
| `calls:read-history` | `calls:read-history` | Same |
| `system:manage-hubs` | `system:manage-hubs` | Same |
| `system:manage-roles` | `system:manage-roles` | Same |
| `gdpr:admin` | (none) | v2 doesn't have GDPR admin yet |

**v2 Additions:**
- Add `hubs:configure` permission for hub settings
- Add `telephony:manage-providers` for provider sections
- Add `telephony:view-providers` for read-only provider sections

**File:** `src/client/components/admin-shell/admin-nav-config.ts`

**Acceptance Criteria:**
- [ ] All v1 items mapped to v2 permissions
- [ ] New v2-specific items added (case-management, events, etc.)
- [ ] `findNavItem()` helper works
- [ ] Config is source of truth for nav structure

### 4. Nav Visibility (`admin-nav-visibility.ts`)

**v1 Source:** `src/client/components/admin-shell/admin-nav-visibility.ts`

**v2 Changes:**
- Need to integrate with v2's hub-scoped permission system
- Use `resolveHubPermissions()` from `@shared/permissions`

**Implementation:**
```typescript
import { resolveHubPermissions, permissionGranted } from '@shared/permissions'
import type { AdminNavGroup, AdminNavItem } from './admin-nav-config.types'

export interface NavAuthContext {
  globalRoles: string[]
  hubRoles: { hubId: string; roleIds: string[] }[]
  allRoleDefs: Role[]
  currentHubId: string
}

export function canSee(item: AdminNavItem, auth: NavAuthContext): boolean {
  if (item.requiredRole && !auth.globalRoles.includes(item.requiredRole)) return false
  
  const perms = resolveHubPermissions(
    auth.globalRoles,
    auth.hubRoles,
    auth.allRoleDefs,
    auth.currentHubId
  )
  
  if (item.requiredPermissions.length === 0) return true
  return item.requiredPermissions.every((p) => permissionGranted(perms, p))
}
```

**File:** `src/client/components/admin-shell/admin-nav-visibility.ts`

**Acceptance Criteria:**
- [ ] `canSee()` works with v2's hub-scoped permissions
- [ ] `canSeeGroup()` returns correct visibility
- [ ] Unit tests pass (port v1's tests)

### 5. Section Layout (`section-layout.tsx`)

**v1 Source:** `src/client/components/admin-shell/section-layout.tsx`

**v2 Changes:**
- Direct port; v2 has same shadcn/ui Button, Label components
- Same Tailwind utility classes

**Components:**
- `SectionBody`: Outer wrapper with `space-y-7 max-w-3xl`
- `SectionDescription`: Muted intro paragraph
- `SectionField`: Label + control + help/error
- `SectionToggleField`: Label + switch
- `SectionActions`: Save button + success indicator

**File:** `src/client/components/admin-shell/section-layout.tsx`

**Acceptance Criteria:**
- [ ] All primitives render correctly
- [ ] Consistent spacing and typography
- [ ] Save actions show loading/success states

### 6. Advanced Reveal (`advanced-reveal.tsx`)

**v1 Source:** `src/client/components/admin-shell/advanced-reveal.tsx`

**v2 Changes:**
- Direct port; uses shadcn/ui `Collapsible`

**File:** `src/client/components/admin-shell/advanced-reveal.tsx`

**Acceptance Criteria:**
- [ ] Collapsible opens/closes
- [ ] Shows/hides "Show advanced"/"Hide advanced"
- [ ] `data-testid` attributes present

### 7. Section Registry (`registry.ts`)

**v1 Source:** `src/client/components/admin-sections/registry.ts`

**v2 Mapping:**

| Registry Slug | v2 Component Source | Status |
|---------------|---------------------|--------|
| `location-lookup` | `admin-settings/geocoding-settings-section.tsx` | Rename + wrap |
| `passkey-policy` | `admin-settings/passkey-policy-section.tsx` | Wrap |
| `hub-roles` | `admin-settings/roles-section.tsx` | Wrap |
| `call-settings` | `admin-settings/call-settings-section.tsx` | Wrap |
| `voice-prompts` | `admin-settings/voice-prompts-section.tsx` | Wrap |
| `phone-menu-languages` | `admin-settings/ivr-languages-section.tsx` | Rename + wrap |
| `transcription` | `admin-settings/transcription-section.tsx` | Wrap |
| `spam-protection` | `admin-settings/spam-section.tsx` | Rename + wrap |
| `phone-provider` | `admin-settings/telephony-provider-section.tsx` | Rename + wrap |
| `rcs` | `admin-settings/rcs-channel-section.tsx` | Wrap |
| `signal` | `admin-settings/signal-channel-section.tsx` | Wrap |
| `custom-fields` | `admin-settings/custom-fields-section.tsx` | Wrap |
| `report-types` | `admin-settings/report-types-section.tsx` | Wrap |
| `hubs` | `routes/admin/hubs.tsx` | Extract section |
| `platform-roles` | (new) | Create |
| `bans` | (new) | Create |
| `audit` | (new) | Create |
| `analytics` | (new) | Create |
| `health` | (new) | Create |
| `platform` | (new) | Create |

**File:** `src/client/components/admin-sections/registry.ts`

**Acceptance Criteria:**
- [ ] All slugs mapped to components
- [ ] Missing sections stubbed with "Coming soon"
- [ ] Registry exports `getSectionComponent()`

### 8. Routes

**v1 Source:** `src/client/routes/admin/{route,index,$section}.tsx`

**v2 Route Structure:**
```
src/client/routes/admin/
  route.tsx        # Layout wrapper + auth guard
  index.tsx        # Redirect to first accessible
  $section.tsx     # Render section by slug
```

**Auth Guard (route.tsx):**
```typescript
// v2 uses different auth check
function AdminRoute() {
  const auth = useAuth()
  
  if (auth.isLoading) return null
  
  // Check if user has any admin permissions
  const hasAdminAccess = auth.user && (
    auth.user.globalRoles.includes('role-super-admin') ||
    auth.user.globalRoles.includes('role-hub-admin') ||
    auth.user.hubRoles.some(hr => hr.roleIds.includes('role-hub-admin'))
  )
  
  if (!hasAdminAccess) return <Navigate to="/" />
  
  return <Outlet />
}
```

**Acceptance Criteria:**
- [ ] `/admin` redirects to first accessible section
- [ ] `/admin/$section` renders correct section
- [ ] Auth guard prevents non-admin access
- [ ] 404 for unknown slugs

## Section Migration Details

### Location Lookup Section

**v1:** `location-lookup-section.tsx`  
**v2 Source:** `admin-settings/geocoding-settings-section.tsx`

**Changes:**
- Rename component to `LocationLookupSection`
- Wrap with `SectionBody`, `SectionDescription`
- Update API imports to v2's client
- Add `data-testid="admin-location-lookup-save"`

### Hubs Section

**v1:** `hubs-section.tsx`  
**v2 Source:** `routes/admin/hubs.tsx`

**Changes:**
- Extract section content from route file
- Remove route-level layout (now handled by AdminShell)
- Keep dialogs (Create, Edit, Delete)
- Add `data-testid` attributes

### New Sections (Not in v2 Yet)

**Platform Roles:**
- CRUD for custom roles
- Read-only for system roles

**Bans:**
- Global ban list management
- Bulk import

**Audit:**
- Audit log viewer
- Filters

**Analytics:**
- Call statistics
- Usage charts

**Health:**
- Provider health badges
- System status

## i18n Key Mapping

### adminNav Namespace

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
      "hubRoles": "Hub Roles",
      "teams": "Teams",
      "tags": "Tags",
      "customFields": "Custom Fields",
      "reportTypes": "Report Types",
      "firehose": "Firehose",
      "callSettings": "Call Settings",
      "voicePrompts": "Voice Prompts",
      "phoneMenuLanguages": "Phone Menu Languages",
      "transcription": "Transcription",
      "spamProtection": "Spam Protection",
      "phoneProvider": "Phone Provider",
      "messagingSms": "Messaging / SMS",
      "rcs": "RCS",
      "signal": "Signal",
      "hubs": "Hubs",
      "platformRoles": "Roles",
      "bans": "Bans",
      "audit": "Audit",
      "analytics": "Analytics",
      "health": "Health",
      "platform": "Platform"
    },
    "openMenu": "Open navigation menu"
  }
}
```

## Test Plan

### Unit Tests

**admin-nav-visibility.test.ts:**
```typescript
import { describe, expect, it } from 'bun:test'
import { adminNavConfig } from './admin-nav-config'
import { canSee, canSeeGroup } from './admin-nav-visibility'

// Test hub-admin can see operations group
// Test hub-admin cannot see platform group
// Test super-admin can see all groups
// Test each item's permission requirements
```

### E2E Tests

**admin-shell.spec.ts:**
- Hub admin sees this-hub groups, not platform
- Super-admin sees platform group
- Nav item click updates active state
- Deeplink loads correct section
- Mobile drawer opens + closes
- Legacy /admin/settings redirects

**admin-nav-config.spec.ts:**
- Every declared route renders its section
- No 404s for configured slugs

## Migration Checklist

- [ ] Create `admin-shell/` directory
- [ ] Port admin-shell.tsx
- [ ] Port admin-sidebar.tsx
- [ ] Create admin-nav-config.ts
- [ ] Create admin-nav-config.types.ts
- [ ] Create admin-nav-visibility.ts
- [ ] Port advanced-reveal.tsx
- [ ] Port section-layout.tsx
- [ ] Create admin-sections/ directory
- [ ] Create registry.ts
- [ ] Migrate each section component
- [ ] Create admin routes
- [ ] Add i18n strings
- [ ] Add unit tests
- [ ] Add E2E tests
- [ ] Update legacy redirects
- [ ] Verify no regressions

## Dependencies

- v2's auth context must expose: `globalRoles`, `hubRoles`, `allRoleDefs`, `currentHubId`
- v2's API client must have all admin endpoints
- shadcn/ui Sheet, Collapsible, Button, Label components
- TanStack Router file-based routes

## Open Questions

1. Does v2's auth context expose all needed fields for permission checks?
2. Are all admin API endpoints implemented in v2?
3. Should we keep the old `admin-settings/` directory during migration?
4. How do we handle sections that don't exist in v2 yet (analytics, health)?

---

**Next:** Create iOS detailed spec → Create Android detailed spec → Create test plan → Create Phase 7 integration spec
