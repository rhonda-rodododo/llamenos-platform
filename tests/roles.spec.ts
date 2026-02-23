import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, loginAsVolunteer, createVolunteerAndGetNsec, completeProfileSetup, uniquePhone, resetTestState } from './helpers'

/**
 * Helper to make authenticated API calls from the browser context.
 * Uses the browser's key-manager (exposed as window.__TEST_KEY_MANAGER) for
 * Schnorr signature auth, or falls back to session token auth.
 */
async function apiCall(page: import('@playwright/test').Page, method: string, path: string, body?: unknown) {
  return page.evaluate(async ({ method, path, body }) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    // Try session token first (WebAuthn sessions)
    const sessionToken = sessionStorage.getItem('llamenos-session-token')
    if (sessionToken) {
      headers['Authorization'] = `Session ${sessionToken}`
    } else {
      // Use the test key manager exposed by main.tsx
      const km = (window as any).__TEST_KEY_MANAGER
      if (km?.isUnlocked?.()) {
        try {
          const token = km.createAuthToken(Date.now())
          headers['Authorization'] = `Bearer ${token}`
        } catch { /* key locked or unavailable */ }
      }
    }

    const res = await fetch(`/api${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  }, { method, path, body })
}

// --- Role CRUD via API ---

test.describe('Role Management API', () => {
  test.describe.configure({ mode: 'serial' })

  let customRoleId: string

  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('lists default roles', async ({ page }) => {
    const result = await apiCall(page, 'GET', '/settings/roles')
    expect(result.status).toBe(200)
    expect(result.body.roles).toBeDefined()
    expect(result.body.roles.length).toBeGreaterThanOrEqual(5)

    const roleNames = result.body.roles.map((r: { name: string }) => r.name)
    expect(roleNames).toContain('Super Admin')
    expect(roleNames).toContain('Hub Admin')
    expect(roleNames).toContain('Reviewer')
    expect(roleNames).toContain('Volunteer')
    expect(roleNames).toContain('Reporter')

    // Verify Super Admin has wildcard permission
    const superAdmin = result.body.roles.find((r: { slug: string }) => r.slug === 'super-admin')
    expect(superAdmin.permissions).toContain('*')
    expect(superAdmin.isSystem).toBe(true)
    expect(superAdmin.isDefault).toBe(true)
  })

  test('creates a custom role', async ({ page }) => {
    const result = await apiCall(page, 'POST', '/settings/roles', {
      name: 'Call Monitor',
      slug: 'call-monitor',
      permissions: ['calls:read-active', 'calls:read-history', 'calls:read-presence'],
      description: 'Can view call activity but not answer calls',
    })
    expect(result.status).toBe(201)
    expect(result.body.name).toBe('Call Monitor')
    expect(result.body.slug).toBe('call-monitor')
    expect(result.body.permissions).toEqual(['calls:read-active', 'calls:read-history', 'calls:read-presence'])
    expect(result.body.isDefault).toBe(false)
    expect(result.body.isSystem).toBe(false)
    expect(result.body.id).toMatch(/^role-/)
    customRoleId = result.body.id
  })

  test('rejects duplicate slug', async ({ page }) => {
    const result = await apiCall(page, 'POST', '/settings/roles', {
      name: 'Call Monitor Dupe',
      slug: 'call-monitor',
      permissions: ['calls:read-active'],
      description: 'Duplicate slug test',
    })
    expect(result.status).toBe(409)
  })

  test('rejects invalid slug format', async ({ page }) => {
    const result = await apiCall(page, 'POST', '/settings/roles', {
      name: 'Bad Slug',
      slug: 'BAD SLUG!!!',
      permissions: ['calls:read-active'],
      description: 'Invalid slug test',
    })
    expect(result.status).toBe(400)
  })

  test('updates a custom role permissions', async ({ page }) => {
    expect(customRoleId).toBeDefined()

    const result = await apiCall(page, 'PATCH', `/settings/roles/${customRoleId}`, {
      permissions: ['calls:read-active', 'calls:read-history', 'calls:read-presence', 'calls:answer'],
      description: 'Can now also answer calls',
    })
    expect(result.status).toBe(200)
    expect(result.body.permissions).toContain('calls:answer')
    expect(result.body.description).toBe('Can now also answer calls')
  })

  test('cannot modify system role (Super Admin)', async ({ page }) => {
    const result = await apiCall(page, 'PATCH', '/settings/roles/role-super-admin', {
      name: 'Hacked Admin',
      permissions: [],
    })
    expect(result.status).toBe(403)
    expect(result.body.error).toContain('system')
  })

  test('cannot delete default roles', async ({ page }) => {
    // Try to delete each default role
    const defaultRoleIds = ['role-super-admin', 'role-hub-admin', 'role-reviewer', 'role-volunteer', 'role-reporter']
    for (const id of defaultRoleIds) {
      const result = await apiCall(page, 'DELETE', `/settings/roles/${id}`)
      expect(result.status).toBe(403)
    }
  })

  test('deletes a custom role', async ({ page }) => {
    expect(customRoleId).toBeDefined()

    const result = await apiCall(page, 'DELETE', `/settings/roles/${customRoleId}`)
    expect(result.status).toBe(200)

    // Verify it's gone
    const listResult = await apiCall(page, 'GET', '/settings/roles')
    const roleIds = listResult.body.roles.map((r: { id: string }) => r.id)
    expect(roleIds).not.toContain(customRoleId)
  })

  test('deleting non-existent role returns 404', async ({ page }) => {
    const result = await apiCall(page, 'DELETE', '/settings/roles/role-does-not-exist')
    expect(result.status).toBe(404)
  })

  test('fetches permissions catalog', async ({ page }) => {
    const result = await apiCall(page, 'GET', '/settings/permissions')
    expect(result.status).toBe(200)
    expect(result.body.permissions).toBeDefined()
    expect(result.body.byDomain).toBeDefined()

    // Check some expected permissions exist
    expect(result.body.permissions['calls:answer']).toBeDefined()
    expect(result.body.permissions['notes:create']).toBeDefined()
    expect(result.body.permissions['settings:manage']).toBeDefined()

    // Check domains are grouped
    expect(result.body.byDomain['calls']).toBeDefined()
    expect(result.body.byDomain['notes']).toBeDefined()
    expect(result.body.byDomain['settings']).toBeDefined()
  })
})

// --- Permission Enforcement ---

test.describe('Permission Enforcement', () => {
  test.describe.configure({ mode: 'serial' })

  let volunteerNsec: string
  let reporterNsec: string

  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await loginAsAdmin(page)

    // Create a volunteer (default role: volunteer)
    volunteerNsec = await createVolunteerAndGetNsec(page, 'PBAC Vol', uniquePhone())
    await page.getByText('Close').click()

    // Create a reporter: create as volunteer, then change role to reporter
    reporterNsec = await createVolunteerAndGetNsec(page, 'PBAC Reporter', uniquePhone())
    const listResult = await apiCall(page, 'GET', '/volunteers')
    const reporter = listResult.body.volunteers.find((v: { name: string }) => v.name === 'PBAC Reporter')
    expect(reporter).toBeDefined()
    await apiCall(page, 'PATCH', `/volunteers/${reporter.pubkey}`, {
      roles: ['role-reporter'],
    })

    await page.close()
  })

  test('admin (super-admin) can access all endpoints', async ({ page }) => {
    await loginAsAdmin(page)

    // Verify admin has wildcard permissions
    const meResult = await apiCall(page, 'GET', '/auth/me')
    expect(meResult.status).toBe(200)
    expect(meResult.body.permissions).toContain('*')

    // Can access admin-only endpoints
    const volunteerResult = await apiCall(page, 'GET', '/volunteers')
    expect(volunteerResult.status).toBe(200)

    const auditResult = await apiCall(page, 'GET', '/audit')
    expect(auditResult.status).toBe(200)

    const spamResult = await apiCall(page, 'GET', '/settings/spam')
    expect(spamResult.status).toBe(200)

    const rolesResult = await apiCall(page, 'GET', '/settings/roles')
    expect(rolesResult.status).toBe(200)
  })

  test('volunteer role gets correct permissions from /auth/me', async ({ page }) => {
    await loginAsVolunteer(page, volunteerNsec)
    await completeProfileSetup(page)

    const meResult = await apiCall(page, 'GET', '/auth/me')
    expect(meResult.status).toBe(200)

    // Should have volunteer permissions
    expect(meResult.body.permissions).toContain('calls:answer')
    expect(meResult.body.permissions).toContain('notes:create')
    expect(meResult.body.permissions).toContain('notes:read-own')
    expect(meResult.body.permissions).toContain('shifts:read-own')

    // Should NOT have admin permissions
    expect(meResult.body.permissions).not.toContain('*')
    expect(meResult.body.permissions).not.toContain('volunteers:read')
    expect(meResult.body.permissions).not.toContain('settings:manage')
    expect(meResult.body.permissions).not.toContain('audit:read')
  })

  test('volunteer cannot access admin endpoints (403)', async ({ page }) => {
    await loginAsVolunteer(page, volunteerNsec)
    await completeProfileSetup(page)

    // Volunteers don't have volunteers:read
    const volunteerResult = await apiCall(page, 'GET', '/volunteers')
    expect(volunteerResult.status).toBe(403)

    // Volunteers don't have audit:read
    const auditResult = await apiCall(page, 'GET', '/audit')
    expect(auditResult.status).toBe(403)

    // Volunteers don't have settings:manage-spam
    const spamResult = await apiCall(page, 'GET', '/settings/spam')
    expect(spamResult.status).toBe(403)

    // Volunteers don't have system:manage-roles
    const rolesCreateResult = await apiCall(page, 'POST', '/settings/roles', {
      name: 'Hack Role',
      slug: 'hack-role',
      permissions: ['*'],
      description: 'Attempt to escalate privileges',
    })
    expect(rolesCreateResult.status).toBe(403)

    // Volunteers don't have settings:manage-telephony
    const telResult = await apiCall(page, 'GET', '/settings/telephony-provider')
    expect(telResult.status).toBe(403)
  })

  test('reporter role has very limited permissions', async ({ page }) => {
    await loginAsVolunteer(page, reporterNsec)
    await completeProfileSetup(page)

    const meResult = await apiCall(page, 'GET', '/auth/me')
    expect(meResult.status).toBe(200)

    // Reporter should have report permissions
    expect(meResult.body.permissions).toContain('reports:create')
    expect(meResult.body.permissions).toContain('reports:read-own')
    expect(meResult.body.permissions).toContain('files:upload')
    expect(meResult.body.permissions).toContain('files:download-own')

    // Reporter should NOT have call or volunteer management permissions
    expect(meResult.body.permissions).not.toContain('calls:answer')
    expect(meResult.body.permissions).not.toContain('notes:create')
    expect(meResult.body.permissions).not.toContain('volunteers:read')
  })

  test('reporter cannot access call-related endpoints', async ({ page }) => {
    await loginAsVolunteer(page, reporterNsec)
    await completeProfileSetup(page)

    // Reporter doesn't have notes:read-own
    const notesResult = await apiCall(page, 'GET', '/notes')
    expect(notesResult.status).toBe(403)

    // Reporter doesn't have calls:read-history
    const callHistoryResult = await apiCall(page, 'GET', '/calls/history')
    expect(callHistoryResult.status).toBe(403)

    // Reporter doesn't have volunteers:read
    const volResult = await apiCall(page, 'GET', '/volunteers')
    expect(volResult.status).toBe(403)
  })
})

// --- Multi-Role Users ---

test.describe('Multi-role users', () => {
  test.describe.configure({ mode: 'serial' })

  let multiRoleNsec: string

  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await loginAsAdmin(page)

    // Create a volunteer
    multiRoleNsec = await createVolunteerAndGetNsec(page, 'Multi-Role User', uniquePhone())

    // Assign both volunteer AND reviewer roles
    const listResult = await apiCall(page, 'GET', '/volunteers')
    const multiUser = listResult.body.volunteers.find((v: { name: string }) => v.name === 'Multi-Role User')
    expect(multiUser).toBeDefined()

    await apiCall(page, 'PATCH', `/volunteers/${multiUser.pubkey}`, {
      roles: ['role-volunteer', 'role-reviewer'],
    })

    await page.close()
  })

  test('multi-role user gets union of all role permissions', async ({ page }) => {
    await loginAsVolunteer(page, multiRoleNsec)
    await completeProfileSetup(page)

    const meResult = await apiCall(page, 'GET', '/auth/me')
    expect(meResult.status).toBe(200)

    // Should have volunteer permissions
    expect(meResult.body.permissions).toContain('calls:answer')
    expect(meResult.body.permissions).toContain('notes:create')
    expect(meResult.body.permissions).toContain('notes:read-own')

    // Should also have reviewer permissions
    expect(meResult.body.permissions).toContain('notes:read-assigned')
    expect(meResult.body.permissions).toContain('reports:read-assigned')
    expect(meResult.body.permissions).toContain('reports:assign')
    expect(meResult.body.permissions).toContain('reports:update')
    expect(meResult.body.permissions).toContain('reports:send-message')

    // Should have both role IDs
    expect(meResult.body.roles).toContain('role-volunteer')
    expect(meResult.body.roles).toContain('role-reviewer')

    // Primary role should be the higher-privilege one (reviewer < volunteer in priority)
    // Reviewer is priority 2, volunteer is priority 3 — so reviewer is primary
    expect(meResult.body.primaryRole.slug).toBe('reviewer')
  })
})

// --- Custom Role Enforcement ---

test.describe('Custom role with specific permissions', () => {
  test.describe.configure({ mode: 'serial' })

  let customNsec: string
  let customRoleId: string

  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await loginAsAdmin(page)

    // Create a custom role with very specific permissions
    const roleResult = await apiCall(page, 'POST', '/settings/roles', {
      name: 'Shift Viewer',
      slug: 'shift-viewer',
      permissions: ['shifts:read', 'bans:read'],
      description: 'Can only view shifts and bans',
    })
    expect(roleResult.status).toBe(201)
    customRoleId = roleResult.body.id

    // Create a volunteer
    customNsec = await createVolunteerAndGetNsec(page, 'Shift Viewer User', uniquePhone())

    // Assign custom role
    const listResult = await apiCall(page, 'GET', '/volunteers')
    const customUser = listResult.body.volunteers.find((v: { name: string }) => v.name === 'Shift Viewer User')
    expect(customUser).toBeDefined()

    await apiCall(page, 'PATCH', `/volunteers/${customUser.pubkey}`, {
      roles: [customRoleId],
    })

    await page.close()
  })

  test('user with custom role gets only those permissions', async ({ page }) => {
    await loginAsVolunteer(page, customNsec)
    await completeProfileSetup(page)

    const meResult = await apiCall(page, 'GET', '/auth/me')
    expect(meResult.status).toBe(200)

    // Should have custom role permissions
    expect(meResult.body.permissions).toContain('shifts:read')
    expect(meResult.body.permissions).toContain('bans:read')

    // Should NOT have any other permissions
    expect(meResult.body.permissions).not.toContain('calls:answer')
    expect(meResult.body.permissions).not.toContain('notes:create')
    expect(meResult.body.permissions).not.toContain('volunteers:read')
    expect(meResult.body.permissions).not.toContain('settings:manage')
  })

  test('custom role user can access shifts endpoint', async ({ page }) => {
    await loginAsVolunteer(page, customNsec)
    await completeProfileSetup(page)

    // Should be able to read shifts
    const shiftsResult = await apiCall(page, 'GET', '/shifts')
    expect(shiftsResult.status).toBe(200)

    // Should be able to read bans
    const bansResult = await apiCall(page, 'GET', '/bans')
    expect(bansResult.status).toBe(200)
  })

  test('custom role user cannot access endpoints outside permissions', async ({ page }) => {
    await loginAsVolunteer(page, customNsec)
    await completeProfileSetup(page)

    // Cannot access volunteers
    const volResult = await apiCall(page, 'GET', '/volunteers')
    expect(volResult.status).toBe(403)

    // Cannot access audit
    const auditResult = await apiCall(page, 'GET', '/audit')
    expect(auditResult.status).toBe(403)

    // Cannot create shifts (only has shifts:read, not shifts:create)
    const createShiftResult = await apiCall(page, 'POST', '/shifts', {
      name: 'Unauthorized Shift',
      startTime: '09:00',
      endTime: '17:00',
      days: [1, 2, 3],
      volunteerPubkeys: [],
    })
    expect(createShiftResult.status).toBe(403)

    // Cannot create bans (only has bans:read, not bans:create)
    const createBanResult = await apiCall(page, 'POST', '/bans', {
      phone: '+15551234567',
      reason: 'Unauthorized ban',
    })
    expect(createBanResult.status).toBe(403)

    // Cannot access notes
    const notesResult = await apiCall(page, 'GET', '/notes')
    expect(notesResult.status).toBe(403)
  })
})

// --- Role-based UI navigation ---

test.describe('Role-based UI visibility', () => {
  let reporterNsec: string

  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await loginAsAdmin(page)
    reporterNsec = await createVolunteerAndGetNsec(page, 'UI Reporter', uniquePhone())
    const listResult = await apiCall(page, 'GET', '/volunteers')
    const reporter = listResult.body.volunteers.find((v: { name: string }) => v.name === 'UI Reporter')
    await apiCall(page, 'PATCH', `/volunteers/${reporter.pubkey}`, {
      roles: ['role-reporter'],
    })
    await page.close()
  })

  test('reporter sees reports UI, not call/volunteer management', async ({ page }) => {
    await loginAsVolunteer(page, reporterNsec)
    await completeProfileSetup(page)

    // Reporter should see Reports link
    await expect(page.getByRole('link', { name: 'Reports' })).toBeVisible()

    // Reporter should NOT see volunteer management links
    await expect(page.getByRole('link', { name: 'Volunteers' })).not.toBeVisible()
    await expect(page.getByRole('link', { name: 'Shifts' })).not.toBeVisible()
    await expect(page.getByRole('link', { name: 'Ban List' })).not.toBeVisible()
    await expect(page.getByRole('link', { name: 'Audit Log' })).not.toBeVisible()
    await expect(page.getByRole('link', { name: 'Hub Settings' })).not.toBeVisible()

    // Reporter should NOT see call-related links
    await expect(page.getByRole('link', { name: 'Notes' })).not.toBeVisible()
    await expect(page.getByRole('link', { name: 'Call History' })).not.toBeVisible()
  })

  test('admin sees all navigation items', async ({ page }) => {
    await loginAsAdmin(page)

    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Notes' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Volunteers' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Shifts' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ban List' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Call History' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Audit Log' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Hub Settings' })).toBeVisible()
  })
})

// --- Domain wildcard permissions ---

test.describe('Wildcard permission resolution', () => {
  test.describe.configure({ mode: 'serial' })

  let wildcardNsec: string

  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await loginAsAdmin(page)

    // Create a custom role with domain wildcard (bans:*)
    const roleResult = await apiCall(page, 'POST', '/settings/roles', {
      name: 'Ban Manager',
      slug: 'ban-manager',
      permissions: ['bans:*'],
      description: 'Full access to ban management',
    })
    expect(roleResult.status).toBe(201)

    // Create user and assign the custom role
    wildcardNsec = await createVolunteerAndGetNsec(page, 'Ban Manager User', uniquePhone())
    const listResult = await apiCall(page, 'GET', '/volunteers')
    const user = listResult.body.volunteers.find((v: { name: string }) => v.name === 'Ban Manager User')
    await apiCall(page, 'PATCH', `/volunteers/${user.pubkey}`, {
      roles: [roleResult.body.id],
    })

    await page.close()
  })

  test('domain wildcard grants all permissions in that domain', async ({ page }) => {
    await loginAsVolunteer(page, wildcardNsec)
    await completeProfileSetup(page)

    // bans:* should allow bans:read, bans:create, bans:delete, bans:bulk-create
    const readResult = await apiCall(page, 'GET', '/bans')
    expect(readResult.status).toBe(200)

    const createResult = await apiCall(page, 'POST', '/bans', {
      phone: '+15559876543',
      reason: 'Wildcard test ban',
    })
    // Expect 200 (success) — the ban is created
    expect(createResult.status).toBe(200)

    // But should not have access to other domains
    const volResult = await apiCall(page, 'GET', '/volunteers')
    expect(volResult.status).toBe(403)

    const auditResult = await apiCall(page, 'GET', '/audit')
    expect(auditResult.status).toBe(403)
  })
})

// --- Role Assignment UI ---

test.describe('Role Assignment UI', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test('role selector dropdown in volunteer list shows all default roles', async ({ page }) => {
    await loginAsAdmin(page)
    await createVolunteerAndGetNsec(page, 'RoleUI Vol', uniquePhone())
    await page.getByText('Close').click()

    // Find the role selector trigger (the Select with aria-label "Change role")
    const roleSelector = page.getByRole('combobox', { name: /change role/i }).first()
    await expect(roleSelector).toBeVisible()
    await roleSelector.click()

    // All 5 default roles should be visible in the dropdown
    await expect(page.getByRole('option', { name: 'Super Admin' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Hub Admin' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Reviewer' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Volunteer' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Reporter' })).toBeVisible()

    // Close the dropdown by pressing Escape
    await page.keyboard.press('Escape')
  })

  test('changing a volunteer role from Volunteer to Hub Admin via dropdown', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Volunteers' }).click()
    await expect(page.getByText('RoleUI Vol')).toBeVisible()

    // Find the specific row containing "RoleUI Vol" text — use the row-level container
    const volText = page.getByText('RoleUI Vol')
    const volRow = page.locator('.divide-y > div').filter({ has: volText })
    const roleSelector = volRow.getByRole('combobox', { name: /change role/i })
    await roleSelector.click()

    // Select Hub Admin
    await page.getByRole('option', { name: 'Hub Admin' }).click()

    // Verify the badge now shows Hub Admin
    await expect(volRow.locator('[data-slot="badge"]').filter({ hasText: 'Hub Admin' })).toBeVisible()
  })

  test('Hub Admin badge displays correctly after role change', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Volunteers' }).click()

    const volText = page.getByText('RoleUI Vol')
    const volRow = page.locator('.divide-y > div').filter({ has: volText })

    // The badge should show "Hub Admin"
    await expect(volRow.locator('[data-slot="badge"]').filter({ hasText: 'Hub Admin' })).toBeVisible()
  })

  test('Add Volunteer form shows all available roles', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Volunteers' }).click()
    await page.getByRole('button', { name: /add volunteer/i }).click()

    // Click the role dropdown
    const roleDropdown = page.locator('#vol-role')
    await roleDropdown.click()

    // All default roles should be present
    await expect(page.getByRole('option', { name: 'Super Admin' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Hub Admin' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Reviewer' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Volunteer' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Reporter' })).toBeVisible()

    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /cancel/i }).click()
  })

  test('Invite form shows all available roles', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Volunteers' }).click()
    await page.getByRole('button', { name: /invite volunteer/i }).click()

    // Click the role dropdown
    const roleDropdown = page.locator('#invite-role')
    await roleDropdown.click()

    // All default roles should be present
    await expect(page.getByRole('option', { name: 'Super Admin' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Hub Admin' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Reviewer' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Volunteer' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Reporter' })).toBeVisible()

    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /cancel/i }).click()
  })
})
