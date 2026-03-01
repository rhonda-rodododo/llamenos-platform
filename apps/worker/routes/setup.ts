import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'
import { validateExternalUrl } from '../lib/ssrf-guard'

const setup = new Hono<AppEnv>()

// Get setup state (any authenticated user — used for redirect logic)
setup.get('/state', async (c) => {
  const dos = getDOs(c.env)
  const res = await dos.settings.fetch(new Request('http://do/settings/setup'))
  return new Response(res.body, res)
})

// Update setup state (admin only)
setup.patch('/state', requirePermission('settings:manage'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json()
  const res = await dos.settings.fetch(new Request('http://do/settings/setup', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }))
  if (res.ok) await audit(dos.records, 'setupStateUpdated', pubkey, body as Record<string, unknown>)
  return new Response(res.body, res)
})

// Complete setup (admin only) — also creates default hub if none exists
setup.post('/complete', requirePermission('settings:manage'), async (c) => {
  const dos = getDOs(c.env)
  const pubkey = c.get('pubkey')
  const body = await c.req.json().catch(() => ({})) as { demoMode?: boolean }

  // Create default hub if none exists
  try {
    const hubsRes = await dos.settings.fetch(new Request('http://do/settings/hubs'))
    const hubsData = hubsRes.ok ? await hubsRes.json() as { hubs: unknown[] } : { hubs: [] }
    if (hubsData.hubs.length === 0) {
      const hotlineName = c.env.HOTLINE_NAME || 'Hotline'
      const defaultHub = {
        id: crypto.randomUUID(),
        name: hotlineName,
        slug: hotlineName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        status: 'active',
        phoneNumber: c.env.TWILIO_PHONE_NUMBER || '',
        createdBy: pubkey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await dos.settings.fetch(new Request('http://do/settings/hubs', {
        method: 'POST',
        body: JSON.stringify(defaultHub),
      }))
      // Assign admin to the default hub with all roles
      await dos.identity.fetch(new Request('http://do/identity/hub-role', {
        method: 'POST',
        body: JSON.stringify({ pubkey, hubId: defaultHub.id, roleIds: ['role-super-admin'] }),
      }))
    }
  } catch {
    // Non-fatal — hub creation failing shouldn't block setup completion
  }

  const res = await dos.settings.fetch(new Request('http://do/settings/setup', {
    method: 'PATCH',
    body: JSON.stringify({ setupCompleted: true, demoMode: body.demoMode ?? false }),
  }))

  if (res.ok) await audit(dos.records, 'setupCompleted', pubkey, { demoMode: body.demoMode ?? false })
  return new Response(res.body, res)
})

// Test Signal bridge connection
setup.post('/test/signal', requirePermission('settings:manage-messaging'), async (c) => {
  const body = await c.req.json() as { bridgeUrl: string; bridgeApiKey: string }

  if (!body.bridgeUrl) {
    return c.json({ ok: false, error: 'Bridge URL is required' }, 400)
  }

  const bridgeError = validateExternalUrl(body.bridgeUrl, 'Bridge URL')
  if (bridgeError) {
    return c.json({ ok: false, error: bridgeError }, 400)
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const headers: Record<string, string> = {}
    if (body.bridgeApiKey) headers['Authorization'] = `Bearer ${body.bridgeApiKey}`

    const res = await fetch(`${body.bridgeUrl}/v1/about`, {
      headers,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (res.ok) {
      return c.json({ ok: true })
    }
    return c.json({ ok: false, error: `Bridge returned ${res.status}` }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed'
    return c.json({ ok: false, error: message }, 400)
  }
})

// Test WhatsApp connection (direct Meta API)
setup.post('/test/whatsapp', requirePermission('settings:manage-messaging'), async (c) => {
  const body = await c.req.json() as { phoneNumberId: string; accessToken: string }

  if (!body.phoneNumberId || !body.accessToken) {
    return c.json({ ok: false, error: 'Phone Number ID and Access Token are required' }, 400)
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${encodeURIComponent(body.phoneNumberId)}`,
      {
        headers: { 'Authorization': `Bearer ${body.accessToken}` },
        signal: controller.signal,
      }
    )
    clearTimeout(timeout)

    if (res.ok) {
      return c.json({ ok: true })
    }
    return c.json({ ok: false, error: `WhatsApp API returned ${res.status}` }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed'
    return c.json({ ok: false, error: message }, 400)
  }
})

export default setup
