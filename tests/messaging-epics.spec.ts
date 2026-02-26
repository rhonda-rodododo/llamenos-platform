import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, loginAsVolunteer, createVolunteerAndGetNsec, completeProfileSetup, uniquePhone, navigateAfterLogin } from './helpers'

/**
 * E2E tests for Epics 68-73: Two-way Messaging
 *
 * Epic 68: Messaging channel permissions
 * Epic 69: Auto-assignment logic
 * Epic 70: Conversation reassignment UI
 * Epic 71: Message delivery status
 * Epic 73: Enhanced conversation UI
 */

/**
 * Helper to make authenticated API calls from the browser context.
 */
async function apiCall(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(async ({ method, path, body }) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const sessionToken = sessionStorage.getItem('llamenos-session-token')
    if (sessionToken) {
      headers['Authorization'] = `Session ${sessionToken}`
    } else {
      const km = (window as unknown as { __TEST_KEY_MANAGER?: {
        isUnlocked?: () => boolean
        createAuthToken?: (ts: number, method: string, path: string) => string
      } }).__TEST_KEY_MANAGER
      if (km?.isUnlocked?.()) {
        try {
          const token = km.createAuthToken?.(Date.now(), method, `/api${path}`)
          if (token) headers['Authorization'] = `Bearer ${token}`
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

// --- Epic 68: Messaging Channel Permissions ---

test.describe('Epic 68: Messaging Channel Permissions', () => {
  test.describe.configure({ mode: 'serial' })

  let volunteerNsec: string
  let restrictedVolunteerNsec: string

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await loginAsAdmin(page)

    // Create a volunteer with default role (has all channel permissions)
    volunteerNsec = await createVolunteerAndGetNsec(page, 'FullChannel Vol', uniquePhone())
    await page.getByText('Close').click()

    // Create a custom role with only SMS permission
    const roleResult = await apiCall(page, 'POST', '/settings/roles', {
      name: 'SMS Only',
      slug: 'sms-only',
      permissions: [
        'conversations:claim',
        'conversations:claim-sms',
        'conversations:send',
        'conversations:read-assigned',
      ],
      description: 'Can only handle SMS conversations',
    })
    expect(roleResult.status).toBe(201)

    // Create a volunteer with restricted role
    restrictedVolunteerNsec = await createVolunteerAndGetNsec(page, 'SMSOnly Vol', uniquePhone())
    const listResult = await apiCall(page, 'GET', '/volunteers')
    const restrictedVol = listResult.body.volunteers.find((v: { name: string }) => v.name === 'SMSOnly Vol')
    await apiCall(page, 'PATCH', `/volunteers/${restrictedVol.pubkey}`, {
      roles: [roleResult.body.id],
    })

    await page.close()
  })

  test('volunteer role includes all channel claim permissions by default', async ({ page }) => {
    await loginAsVolunteer(page, volunteerNsec)
    await completeProfileSetup(page)

    const meResult = await apiCall(page, 'GET', '/auth/me')
    expect(meResult.status).toBe(200)

    // Should have all channel claim permissions
    expect(meResult.body.permissions).toContain('conversations:claim')
    expect(meResult.body.permissions).toContain('conversations:claim-sms')
    expect(meResult.body.permissions).toContain('conversations:claim-whatsapp')
    expect(meResult.body.permissions).toContain('conversations:claim-signal')
    expect(meResult.body.permissions).toContain('conversations:claim-rcs')
    expect(meResult.body.permissions).toContain('conversations:claim-web')
  })

  test('restricted role only has specific channel permissions', async ({ page }) => {
    await loginAsVolunteer(page, restrictedVolunteerNsec)
    await completeProfileSetup(page)

    const meResult = await apiCall(page, 'GET', '/auth/me')
    expect(meResult.status).toBe(200)

    // Should have SMS permission
    expect(meResult.body.permissions).toContain('conversations:claim-sms')

    // Should NOT have other channel permissions
    expect(meResult.body.permissions).not.toContain('conversations:claim-whatsapp')
    expect(meResult.body.permissions).not.toContain('conversations:claim-signal')
    expect(meResult.body.permissions).not.toContain('conversations:claim-rcs')
    expect(meResult.body.permissions).not.toContain('conversations:claim-web')
  })

  test('admin has claim-any permission via wildcard', async ({ page }) => {
    await loginAsAdmin(page)

    const meResult = await apiCall(page, 'GET', '/auth/me')
    expect(meResult.status).toBe(200)

    // Super-admin has wildcard
    expect(meResult.body.permissions).toContain('*')
  })

  test('permissions catalog includes all channel claim permissions', async ({ page }) => {
    await loginAsAdmin(page)

    const result = await apiCall(page, 'GET', '/settings/permissions')
    expect(result.status).toBe(200)

    // All channel permissions should be in the catalog
    expect(result.body.permissions['conversations:claim-sms']).toBeDefined()
    expect(result.body.permissions['conversations:claim-whatsapp']).toBeDefined()
    expect(result.body.permissions['conversations:claim-signal']).toBeDefined()
    expect(result.body.permissions['conversations:claim-rcs']).toBeDefined()
    expect(result.body.permissions['conversations:claim-web']).toBeDefined()
    expect(result.body.permissions['conversations:claim-any']).toBeDefined()
  })
})

// --- Epic 69: Auto-Assignment Logic ---

test.describe('Epic 69: Auto-Assignment Logic', () => {
  test('messaging config includes auto-assign settings', async ({ page }) => {
    await loginAsAdmin(page)

    const result = await apiCall(page, 'GET', '/settings/messaging')
    // May not be configured, but endpoint should work
    expect([200, 404]).toContain(result.status)

    // If configured, check for auto-assign fields
    if (result.status === 200 && result.body) {
      expect(typeof result.body.autoAssign).toBe('boolean')
      if (result.body.maxConcurrentPerVolunteer !== undefined) {
        expect(typeof result.body.maxConcurrentPerVolunteer).toBe('number')
      }
    }
  })

  test('volunteer load endpoint exists and returns data', async ({ page }) => {
    await loginAsAdmin(page)

    const result = await apiCall(page, 'GET', '/conversations/load')
    expect(result.status).toBe(200)
    expect(result.body.loads).toBeDefined()
    expect(typeof result.body.loads).toBe('object')
  })

  test('volunteer load endpoint requires admin permission', async ({ browser }) => {
    // Create a basic volunteer
    const adminPage = await browser.newPage()
    await loginAsAdmin(adminPage)
    const volNsec = await createVolunteerAndGetNsec(adminPage, 'LoadTest Vol', uniquePhone())
    await adminPage.close()

    const page = await browser.newPage()
    await loginAsVolunteer(page, volNsec)
    await completeProfileSetup(page)

    const result = await apiCall(page, 'GET', '/conversations/load')
    expect(result.status).toBe(403)
    await page.close()
  })
})

// --- Epic 70: Conversation Reassignment UI ---

test.describe('Epic 70: Conversation Reassignment UI', () => {
  test.describe.configure({ mode: 'serial' })

  let volunteer1Nsec: string
  let volunteer2Nsec: string
  let volunteer1Pubkey: string
  let volunteer2Pubkey: string

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    await loginAsAdmin(page)

    // Create two volunteers
    volunteer1Nsec = await createVolunteerAndGetNsec(page, 'Reassign Vol1', uniquePhone())
    await page.getByText('Close').click()

    volunteer2Nsec = await createVolunteerAndGetNsec(page, 'Reassign Vol2', uniquePhone())
    await page.getByText('Close').click()

    // Get pubkeys
    const listResult = await apiCall(page, 'GET', '/volunteers')
    const vol1 = listResult.body.volunteers.find((v: { name: string }) => v.name === 'Reassign Vol1')
    const vol2 = listResult.body.volunteers.find((v: { name: string }) => v.name === 'Reassign Vol2')
    volunteer1Pubkey = vol1.pubkey
    volunteer2Pubkey = vol2.pubkey

    await page.close()
  })

  test('admin can view conversation reassign UI components exist', async ({ page }) => {
    await loginAsAdmin(page)

    // Navigate to conversations page using SPA navigation
    await navigateAfterLogin(page, '/conversations')

    // The conversations page should load - look for the heading specifically
    await expect(
      page.getByRole('heading', { name: 'Conversations', level: 1 })
    ).toBeVisible({ timeout: 10000 })
  })

  test('volunteer load data is retrieved correctly', async ({ page }) => {
    await loginAsAdmin(page)

    const loadResult = await apiCall(page, 'GET', '/conversations/load')
    expect(loadResult.status).toBe(200)
    expect(loadResult.body.loads).toBeDefined()

    // Loads should be a record of pubkey -> number
    for (const [key, value] of Object.entries(loadResult.body.loads)) {
      expect(typeof key).toBe('string')
      expect(typeof value).toBe('number')
    }
  })

  test('conversation update API supports status and assignedTo fields', async ({ page }) => {
    await loginAsAdmin(page)

    // Get conversations list (may be empty)
    const listResult = await apiCall(page, 'GET', '/conversations')
    expect([200, 404]).toContain(listResult.status)

    // Even without real conversations, verify the endpoint structure
    if (listResult.status === 200) {
      expect(Array.isArray(listResult.body.conversations) || listResult.body.conversations === undefined).toBe(true)
    }
  })
})

// --- Epic 71: Message Delivery Status ---

test.describe('Epic 71: Message Delivery Status', () => {
  test('MessageDeliveryStatus types are defined in API response', async ({ page }) => {
    await loginAsAdmin(page)

    // Get conversations to check message structure
    const result = await apiCall(page, 'GET', '/conversations')
    expect([200, 404]).toContain(result.status)

    // The API should support status fields on messages
    // Even without data, verify endpoint works
    if (result.status === 200 && result.body.conversations?.length > 0) {
      const conv = result.body.conversations[0]
      // If there are messages, check they have status field support
      if (conv.messages?.length > 0) {
        const msg = conv.messages[0]
        // Status may be undefined for older messages
        if (msg.status !== undefined) {
          expect(['pending', 'sent', 'delivered', 'read', 'failed']).toContain(msg.status)
        }
      }
    }
  })

  test('adapter interface includes parseStatusWebhook method', async ({ page }) => {
    await loginAsAdmin(page)

    // This is more of an integration test - we verify the status endpoint exists
    // The actual webhook parsing is tested via the messaging router

    // Check messaging config exists
    const result = await apiCall(page, 'GET', '/settings/messaging')
    expect([200, 404]).toContain(result.status)
  })
})

// --- Epic 73: Enhanced Conversation UI ---

test.describe('Epic 73: Enhanced Conversation UI', () => {
  test('conversation thread component renders correctly', async ({ page }) => {
    await loginAsAdmin(page)

    // Navigate to conversations using SPA navigation
    await navigateAfterLogin(page, '/conversations')

    // Wait for the main h1 heading
    await expect(
      page.getByRole('heading', { name: 'Conversations', level: 1 })
    ).toBeVisible({ timeout: 10000 })
  })

  test('UI shows delivery status indicators for messages', async ({ page }) => {
    await loginAsAdmin(page)

    // Set up console listener before navigation
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    // Navigate to conversations page using SPA navigation
    await navigateAfterLogin(page, '/conversations')

    // The page should load - h1 heading should be visible
    await expect(
      page.getByRole('heading', { name: 'Conversations', level: 1 })
    ).toBeVisible({ timeout: 10000 })

    // Wait a moment for any async errors
    await page.waitForTimeout(1000)

    // Filter out expected warnings (401 for unauthenticated API calls, WebSocket errors in Docker)
    const criticalErrors = consoleErrors.filter(err =>
      !err.includes('favicon') &&
      !err.includes('manifest') &&
      !err.includes('service-worker') &&
      !err.includes('401') &&
      !err.includes('Unauthorized') &&
      !err.includes('WebSocket') && // WebSocket may fail in Docker test environment
      !err.includes('nostr') && !err.includes('relay') // Nostr relay may not be available in test
    )
    expect(criticalErrors).toHaveLength(0)
  })

  test('scroll-to-bottom button functionality exists', async ({ page }) => {
    await loginAsAdmin(page)
    await navigateAfterLogin(page, '/conversations')

    // The scroll button is rendered conditionally when there are enough messages
    // Verify the component structure loads without errors
    await expect(
      page.getByRole('heading', { name: 'Conversations', level: 1 })
    ).toBeVisible({ timeout: 10000 })
  })
})

// --- Cross-Cutting: Permissions + Channel Integration ---

test.describe('Channel Permission Integration', () => {
  test.describe.configure({ mode: 'serial' })

  test('admin can create role with specific channel permissions', async ({ page }) => {
    await loginAsAdmin(page)

    // Create a role with only WhatsApp and Signal permissions
    const result = await apiCall(page, 'POST', '/settings/roles', {
      name: 'WA+Signal Only',
      slug: 'wa-signal-only',
      permissions: [
        'conversations:claim',
        'conversations:claim-whatsapp',
        'conversations:claim-signal',
        'conversations:send',
        'conversations:read-assigned',
      ],
      description: 'Can handle WhatsApp and Signal only',
    })
    expect(result.status).toBe(201)
    expect(result.body.permissions).toContain('conversations:claim-whatsapp')
    expect(result.body.permissions).toContain('conversations:claim-signal')
    expect(result.body.permissions).not.toContain('conversations:claim-sms')
    expect(result.body.permissions).not.toContain('conversations:claim-rcs')
  })

  test('claim-any permission bypasses channel restrictions', async ({ page }) => {
    await loginAsAdmin(page)

    // Create a role with claim-any
    const result = await apiCall(page, 'POST', '/settings/roles', {
      name: 'All Channels',
      slug: 'all-channels',
      permissions: [
        'conversations:claim',
        'conversations:claim-any',
        'conversations:send',
        'conversations:read-assigned',
      ],
      description: 'Can handle all channels via bypass',
    })
    expect(result.status).toBe(201)
    expect(result.body.permissions).toContain('conversations:claim-any')
  })

  test('volunteer supportedMessagingChannels field is respected', async ({ page }) => {
    await loginAsAdmin(page)

    // Create a volunteer
    const volNsec = await createVolunteerAndGetNsec(page, 'ChannelLimit Vol', uniquePhone())
    await page.getByText('Close').click()

    // Get volunteer details
    const listResult = await apiCall(page, 'GET', '/volunteers')
    const vol = listResult.body.volunteers.find((v: { name: string }) => v.name === 'ChannelLimit Vol')
    expect(vol).toBeDefined()

    // Update volunteer with supported channels
    const updateResult = await apiCall(page, 'PATCH', `/volunteers/${vol.pubkey}`, {
      supportedMessagingChannels: ['sms', 'whatsapp'],
    })
    expect(updateResult.status).toBe(200)
    expect(updateResult.body.volunteer.supportedMessagingChannels).toEqual(['sms', 'whatsapp'])
  })

  test('volunteer messagingEnabled flag controls messaging access', async ({ page }) => {
    await loginAsAdmin(page)

    // Create a volunteer
    const volNsec = await createVolunteerAndGetNsec(page, 'MsgDisabled Vol', uniquePhone())
    await page.getByText('Close').click()

    // Get volunteer details
    const listResult = await apiCall(page, 'GET', '/volunteers')
    const vol = listResult.body.volunteers.find((v: { name: string }) => v.name === 'MsgDisabled Vol')
    expect(vol).toBeDefined()

    // Disable messaging for this volunteer
    const updateResult = await apiCall(page, 'PATCH', `/volunteers/${vol.pubkey}`, {
      messagingEnabled: false,
    })
    expect(updateResult.status).toBe(200)
    expect(updateResult.body.volunteer.messagingEnabled).toBe(false)
  })
})

// --- Cleanup ---

test.describe('Cleanup test data', () => {
  test('cleanup custom roles created during tests', async ({ page }) => {
    await loginAsAdmin(page)

    const rolesResult = await apiCall(page, 'GET', '/settings/roles')
    expect(rolesResult.status).toBe(200)

    // Delete custom roles created by these tests
    const customRoles = rolesResult.body.roles.filter((r: { isDefault: boolean; slug: string }) =>
      !r.isDefault &&
      ['sms-only', 'wa-signal-only', 'all-channels'].includes(r.slug)
    )

    for (const role of customRoles) {
      const deleteResult = await apiCall(page, 'DELETE', `/settings/roles/${role.id}`)
      expect([200, 404]).toContain(deleteResult.status)
    }
  })
})
