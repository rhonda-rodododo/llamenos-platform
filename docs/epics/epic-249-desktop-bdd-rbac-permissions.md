# Epic 249: Desktop BDD Behavioral Recovery — RBAC & Permissions

## Goal

Recover the behavioral depth for role-based access control and permission enforcement that was lost in the BDD migration. The original `roles.spec.ts` was the crown jewel at **679 lines** — the largest and most comprehensive test file. It tested role CRUD via API with Schnorr auth, cross-role permission matrix (admin/volunteer/reporter/custom), multi-role union, wildcard permissions, and UI role assignment. The current `roles-steps.ts` is 120 lines of empty stubs and visibility checks.

## What Was Lost (original roles.spec.ts — 679 lines)

### Role CRUD via API
- List default roles (Super Admin, Hub Admin, Reviewer, Volunteer, Reporter)
- Verify role properties: `isSystem`, `isDefault`, `slug`, `permissions: ["*"]`
- Create custom role with specific permissions → verify slug auto-generated
- Reject duplicate slug (409)
- Reject invalid slug format (400)
- Update permissions on custom role
- Block modification of system roles (403)
- Block deletion of default roles (403)
- Delete custom roles → verify 404 on re-fetch
- Fetch permissions catalog with domain groupings

### Permission Enforcement via API
- Admin: wildcard `*` gives access to all endpoints
- Volunteer: limited permissions from `/auth/me`, 403 on admin endpoints (volunteers, audit, spam, roles, telephony)
- Reporter: very limited (reports:create, reports:read-own, files:upload), 403 on call/note/volunteer endpoints
- Custom "Shift Viewer" role: only `shifts:read` + `bans:read`, 403 on writes and other domains

### Multi-role Users
- Create volunteer+reviewer user → verify union of permissions
- Verify primary role resolution by priority

### UI Integration
- Reporter sees only Reports link
- Admin sees all nav items
- Role selector dropdown in volunteer list
- Role change via dropdown → badge update
- Role options in Add Volunteer and Invite forms

### Custom helper: `apiCall()`
The original test used a `apiCall()` helper that made authenticated API calls from the browser context with Schnorr signature auth, enabling direct HTTP endpoint testing alongside UI testing.

## Current State (Hollow Step Definitions)

### roles-steps.ts (120 lines) — almost entirely empty:
- `the "Super Admin" role should have wildcard permission` → just checks row is visible (no wildcard check)
- `the "Super Admin" role should be a system role` → **EMPTY FUNCTION**
- `the "Super Admin" role should be the default role` → **EMPTY FUNCTION**
- `the deletion should fail with a 403 error` → **EMPTY FUNCTION**
- `a custom role "Temp Role" exists` → stores name in window variable, **doesn't actually create it**
- `I create a custom role "Call Monitor" with permissions` → fills name only, no permission selection
- `I assign the "Reviewer" role to the volunteer` → tries to click first assign button or select, no specific role
- `it should have "reports:create" permission` → filter by text in role row, no actual permission check
- `it should not have "notes:read" permission` → text filter only

### volunteer-steps.ts role-related problems:
- `a volunteer with the "Reviewer" role exists` → creates volunteer but **doesn't assign the role**
- Reporter steps create a volunteer, not a reporter

## Implementation

### Phase 1: API-Based Role Testing Infrastructure

Add to `tests/api-helpers.ts`:

```typescript
/**
 * Authenticated API call helper using Schnorr signature.
 * This is the key infrastructure that the original roles.spec.ts used.
 */
export async function authenticatedApiCall(
  request: APIRequestContext,
  method: string,
  path: string,
  options?: { body?: Record<string, unknown>; nsec?: string },
): Promise<{ status: number; data: unknown }>

// Role CRUD
export async function listRolesViaApi(request: APIRequestContext): Promise<Array<{
  id: string; name: string; slug: string; permissions: string[];
  isSystem: boolean; isDefault: boolean;
}>>

export async function createRoleViaApi(
  request: APIRequestContext,
  opts: { name: string; permissions: string[] },
): Promise<{ id: string; slug: string }>

export async function updateRoleViaApi(
  request: APIRequestContext,
  slug: string,
  opts: { permissions: string[] },
): Promise<void>

export async function deleteRoleViaApi(request: APIRequestContext, slug: string): Promise<void>

export async function getPermissionsCatalog(request: APIRequestContext): Promise<Record<string, string[]>>

export async function getUserPermissions(
  request: APIRequestContext,
  nsec: string,
): Promise<{ role: string; permissions: string[] }>
```

### Phase 2: Rewrite Role Step Definitions

Replace `tests/steps/admin/roles-steps.ts` — behavioral API-driven assertions:

**Key changes:**
- `I request the roles list` → call `listRolesViaApi()`, store result for later assertions
- `I should see at least 5 roles` → assert `roles.length >= 5` from API response
- `the "Super Admin" role should have wildcard permission` → assert `roles.find(r => r.name === 'Super Admin').permissions.includes('*')`
- `the "Super Admin" role should be a system role` → assert `role.isSystem === true`
- `I create a custom role "Call Monitor" with permissions` → call `createRoleViaApi()` with real permissions array, then verify in UI
- `the deletion should fail with a 403 error` → call `deleteRoleViaApi()` and assert status 403
- `a custom role "Temp Role" exists` → actually create via API
- `I assign the "Reviewer" role to the volunteer` → use the role dropdown, select specific role, verify badge changes

### Phase 3: Cross-Role Permission Enforcement Steps

New step definitions for permission matrix testing:

```typescript
// In tests/steps/admin/permission-steps.ts
When('I check admin API access', async ({ request }) => {
  const endpoints = ['/api/volunteers', '/api/audit', '/api/settings/spam', '/api/roles']
  for (const endpoint of endpoints) {
    const res = await request.get(endpoint)
    expect(res.ok()).toBe(true)
  }
})

When('the volunteer attempts to access admin endpoints', async ({ request }) => {
  // Make API calls with volunteer credentials
  const endpoints = ['/api/volunteers', '/api/audit', '/api/settings/spam']
  for (const endpoint of endpoints) {
    const res = await authenticatedApiCall(request, 'GET', endpoint, { nsec: volNsec })
    expect(res.status).toBe(403)
  }
})

When('the reporter attempts to access call-related endpoints', async ({ request }) => {
  const endpoints = ['/api/calls', '/api/notes', '/api/volunteers']
  for (const endpoint of endpoints) {
    const res = await authenticatedApiCall(request, 'GET', endpoint, { nsec: reporterNsec })
    expect(res.status).toBe(403)
  }
})
```

### Phase 4: Expand Feature File Scenarios

The existing `roles.feature` already has 26 good scenarios. The step definitions just need to actually implement them. However, add a few missing ones:

```gherkin
  Scenario: Custom role restricts API access
    Given a volunteer has a custom "Shift Viewer" role with "shifts:read,bans:read" permissions
    When the volunteer attempts to create a shift
    Then the API should return 403

  Scenario: Wildcard domain permission grants all domain actions
    Given a role with "bans:*" wildcard permission
    When the user with that role tries to read bans
    Then the API should return 200
    When the user tries to create a ban
    Then the API should return 200
    When the user tries to read volunteers
    Then the API should return 403

  Scenario: Role deletion removes permissions
    Given a volunteer has a custom "Temp Access" role
    When I delete the "Temp Access" role
    Then the volunteer should lose those permissions
```

### Phase 5: Volunteer Role Assignment in UI

Fix the volunteer-steps.ts role-related steps to actually assign roles:

```typescript
Given('a volunteer with the "Reviewer" role exists', async ({ page, request }) => {
  // Create volunteer via API
  const vol = await createVolunteerViaApi(request)
  // Assign role via API (faster than UI)
  await request.put(`/api/volunteers/${vol.pubkey}/roles`, {
    data: { roleIds: ['role-reviewer'] }
  })
  // Store for later use
  await page.evaluate((n) => {
    (window as any).__test_vol_nsec = n
  }, vol.nsec)
})
```

## Files Changed

| File | Action |
|------|--------|
| `tests/api-helpers.ts` | Add role CRUD, permission catalog, authenticated API call |
| `tests/steps/admin/roles-steps.ts` | Full rewrite — API-driven behavioral assertions |
| `tests/steps/admin/permission-steps.ts` | New — cross-role permission enforcement steps |
| `tests/steps/auth/volunteer-steps.ts` | Fix role assignment, reporter creation |
| `packages/test-specs/features/admin/roles.feature` | Add custom role API access, wildcard domain scenarios |

## Verification

1. All 26 existing role scenarios actually test real behavior (not just visibility)
2. Role CRUD verified via API (list, create, update, delete with correct status codes)
3. Permission enforcement: admin=200, volunteer=403 on admin endpoints, reporter=403 on call endpoints
4. Custom role creation produces correct slug auto-generation
5. System role deletion returns 403
6. Multi-role users get union of permissions (verified via API)
7. UI role dropdown changes are reflected in API state
8. Zero empty step function bodies
9. `bun run test` passes
