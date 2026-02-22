import { test, expect } from '@playwright/test'
import { loginAsAdmin, resetTestState } from './helpers'

// Helper type for the authed fetch on window
declare global {
  interface Window {
    __authedFetch: (url: string, options?: RequestInit) => Promise<Response>
  }
}

test.describe('Multi-hub architecture', () => {
  // Tests must run in order — later tests create hubs that affect UI state
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async ({ request }) => {
    await resetTestState(request)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    // Inject authed fetch helper that uses keyManager for auth headers
    await page.evaluate(() => {
      window.__authedFetch = async (url: string, options: RequestInit = {}) => {
        const km = (window as any).__TEST_KEY_MANAGER
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(options.headers as Record<string, string> || {}),
        }
        if (km?.isUnlocked()) {
          const token = km.createAuthToken(Date.now())
          headers['Authorization'] = `Bearer ${token}`
        }
        return fetch(url, { ...options, headers })
      }
    })
  })

  // --- UI tests first (before any hub-creating API tests) ---

  test('config returns hubs array', async ({ page }) => {
    // The config endpoint is public — no auth needed
    const config = await page.evaluate(async () => {
      const res = await fetch('/api/config')
      return res.json()
    })
    expect(config).toHaveProperty('hubs')
    expect(Array.isArray(config.hubs)).toBe(true)
  })

  test('hub switcher hidden when single hub', async ({ page }) => {
    // With the default single hub, the hub switcher should not be visible
    await expect(page.getByLabel(/switch hub/i)).not.toBeVisible()
  })

  test('existing pages still work with hub context', async ({ page }) => {
    // Verify all main pages load correctly with hub context active
    await page.getByRole('link', { name: 'Volunteers' }).click()
    await expect(page.getByRole('heading', { name: 'Volunteers' })).toBeVisible()

    await page.getByRole('link', { name: 'Shifts' }).click()
    await expect(page.getByRole('heading', { name: /shift schedule/i })).toBeVisible()

    await page.getByRole('link', { name: 'Ban List' }).click()
    await expect(page.getByRole('heading', { name: /ban list/i })).toBeVisible()

    await page.getByRole('link', { name: 'Audit Log' }).click()
    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible()

    await page.getByRole('link', { name: 'Dashboard' }).click()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  // --- API tests (these create additional hubs) ---

  test('hub CRUD operations via API', async ({ page }) => {
    // Create a hub
    const created = await page.evaluate(async () => {
      const res = await window.__authedFetch('/api/hubs', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Hub', description: 'E2E test hub' }),
      })
      if (!res.ok) return { error: await res.text(), status: res.status }
      return res.json()
    })
    expect(created).toHaveProperty('hub')
    expect(created.hub.name).toBe('Test Hub')
    expect(created.hub.slug).toBe('test-hub')
    expect(created.hub.status).toBe('active')
    expect(created.hub.id).toBeTruthy()

    // List hubs — should include the new one
    const listData = await page.evaluate(async () => {
      const res = await window.__authedFetch('/api/hubs')
      return res.json()
    })
    expect(listData.hubs.some((h: { id: string }) => h.id === created.hub.id)).toBe(true)

    // Get hub details
    const fetched = await page.evaluate(async (hubId: string) => {
      const res = await window.__authedFetch(`/api/hubs/${hubId}`)
      return res.json()
    }, created.hub.id)
    expect(fetched.hub.name).toBe('Test Hub')

    // Update hub
    const updated = await page.evaluate(async (hubId: string) => {
      const res = await window.__authedFetch(`/api/hubs/${hubId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Hub' }),
      })
      return res.json()
    }, created.hub.id)
    expect(updated.hub.name).toBe('Updated Hub')
  })

  test('hub-scoped routes use per-hub DOs', async ({ page }) => {
    // Create a hub
    const created = await page.evaluate(async () => {
      const res = await window.__authedFetch('/api/hubs', {
        method: 'POST',
        body: JSON.stringify({ name: 'Scoped Hub' }),
      })
      return res.json()
    })
    const hubId = created.hub.id

    // Access hub-scoped audit log
    const auditData = await page.evaluate(async (hId: string) => {
      const res = await window.__authedFetch(`/api/hubs/${hId}/audit`)
      return { ok: res.ok, data: res.ok ? await res.json() : await res.text() }
    }, hubId)
    expect(auditData.ok).toBe(true)
    expect(auditData.data).toHaveProperty('entries')

    // Access hub-scoped shifts
    const shiftsData = await page.evaluate(async (hId: string) => {
      const res = await window.__authedFetch(`/api/hubs/${hId}/shifts`)
      return { ok: res.ok, data: res.ok ? await res.json() : await res.text() }
    }, hubId)
    expect(shiftsData.ok).toBe(true)
    expect(shiftsData.data).toHaveProperty('shifts')

    // Access hub-scoped bans
    const bansData = await page.evaluate(async (hId: string) => {
      const res = await window.__authedFetch(`/api/hubs/${hId}/bans`)
      return { ok: res.ok, data: res.ok ? await res.json() : await res.text() }
    }, hubId)
    expect(bansData.ok).toBe(true)
    expect(bansData.data).toHaveProperty('bans')

    // Hub-scoped data should be independent from global
    // The new hub should have empty bans (no global data leaking)
    expect(bansData.data.bans).toHaveLength(0)
  })

  test('hub member management', async ({ page }) => {
    // Create a hub
    const created = await page.evaluate(async () => {
      const res = await window.__authedFetch('/api/hubs', {
        method: 'POST',
        body: JSON.stringify({ name: 'Member Hub' }),
      })
      return res.json()
    })
    const hubId = created.hub.id

    // Get admin's pubkey from the key manager
    const adminPubkey = await page.evaluate(() => {
      const km = (window as any).__TEST_KEY_MANAGER
      return km.getPublicKeyHex()
    })

    // Add admin as member to the new hub with a different role
    const addResult = await page.evaluate(async ({ hId, pk }: { hId: string; pk: string }) => {
      const res = await window.__authedFetch(`/api/hubs/${hId}/members`, {
        method: 'POST',
        body: JSON.stringify({ pubkey: pk, roleIds: ['role-volunteer'] }),
      })
      return { ok: res.ok, status: res.status, data: res.ok ? await res.json() : await res.text() }
    }, { hId: hubId, pk: adminPubkey })
    expect(addResult.ok).toBe(true)

    // Remove member from hub
    const removeResult = await page.evaluate(async ({ hId, pk }: { hId: string; pk: string }) => {
      const res = await window.__authedFetch(`/api/hubs/${hId}/members/${pk}`, {
        method: 'DELETE',
      })
      return { ok: res.ok }
    }, { hId: hubId, pk: adminPubkey })
    expect(removeResult.ok).toBe(true)
  })

  test('hub-scoped data is isolated', async ({ page }) => {
    // Create two hubs
    const hub1 = await page.evaluate(async () => {
      const res = await window.__authedFetch('/api/hubs', {
        method: 'POST',
        body: JSON.stringify({ name: 'Hub A' }),
      })
      return (await res.json()).hub
    })

    const hub2 = await page.evaluate(async () => {
      const res = await window.__authedFetch('/api/hubs', {
        method: 'POST',
        body: JSON.stringify({ name: 'Hub B' }),
      })
      return (await res.json()).hub
    })

    // Create a ban in hub A
    await page.evaluate(async (hubId: string) => {
      await window.__authedFetch(`/api/hubs/${hubId}/bans`, {
        method: 'POST',
        body: JSON.stringify({ phone: '+15559990001', reason: 'Hub A test ban' }),
      })
    }, hub1.id)

    // Hub A should have the ban
    const hub1Bans = await page.evaluate(async (hubId: string) => {
      const res = await window.__authedFetch(`/api/hubs/${hubId}/bans`)
      return res.json()
    }, hub1.id)
    expect(hub1Bans.bans.length).toBeGreaterThan(0)
    expect(hub1Bans.bans.some((b: { phone: string }) => b.phone === '+15559990001')).toBe(true)

    // Hub B should NOT have the ban (isolated)
    const hub2Bans = await page.evaluate(async (hubId: string) => {
      const res = await window.__authedFetch(`/api/hubs/${hubId}/bans`)
      return res.json()
    }, hub2.id)
    expect(hub2Bans.bans.some((b: { phone: string }) => b.phone === '+15559990001')).toBe(false)
  })
})
