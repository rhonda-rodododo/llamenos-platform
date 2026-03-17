import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import { z } from 'zod'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import { audit } from '../services/audit'
import { validateExternalUrl } from '../lib/ssrf-guard'
import { setupStateSchema, setupCompleteBodySchema } from '@protocol/schemas/settings'
import { authErrors } from '../openapi/helpers'

const testSignalBodySchema = z.object({
  bridgeUrl: z.string().min(1, 'Bridge URL is required'),
  bridgeApiKey: z.string().optional(),
})

const testWhatsAppBodySchema = z.object({
  phoneNumberId: z.string().min(1, 'Phone Number ID is required'),
  accessToken: z.string().min(1, 'Access Token is required'),
})

const setup = new Hono<AppEnv>()

// Get setup state (admin only — gated for defense-in-depth)
setup.get('/state', requirePermission('settings:manage-setup'),
  describeRoute({
    tags: ['Setup'],
    summary: 'Get setup wizard state',
    responses: {
      200: { description: 'Current setup state' },
      ...authErrors,
    },
  }),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getSetupState()
    return c.json(result)
  })

// Update setup state (admin only)
setup.patch('/state', requirePermission('settings:manage-setup'),
  describeRoute({
    tags: ['Setup'],
    summary: 'Update setup wizard state',
    responses: {
      200: { description: 'Setup state updated' },
      ...authErrors,
    },
  }),
  validator('json', setupStateSchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.updateSetupState(body as Record<string, unknown> as Parameters<typeof services.settings.updateSetupState>[0])
    await audit(services.audit, 'setupStateUpdated', pubkey, body as Record<string, unknown>)
    return c.json(result)
  })

// Complete setup (admin only) — also creates default hub if none exists
setup.post('/complete', requirePermission('settings:manage-setup'),
  describeRoute({
    tags: ['Setup'],
    summary: 'Complete setup wizard',
    responses: {
      200: { description: 'Setup completed' },
      ...authErrors,
    },
  }),
  validator('json', setupCompleteBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')

    // Create default hub if none exists
    try {
      const { hubs } = await services.settings.getHubs()
      if (hubs.length === 0) {
        const hotlineName = c.env.HOTLINE_NAME || 'Hotline'
        const defaultHub = {
          id: crypto.randomUUID(),
          name: hotlineName,
          slug: hotlineName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          status: 'active' as const,
          phoneNumber: c.env.TWILIO_PHONE_NUMBER || '',
          description: '',
          createdBy: pubkey,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        await services.settings.createHub(defaultHub)
        // Assign admin to the default hub with all roles
        await services.identity.setHubRole({ pubkey, hubId: defaultHub.id, roleIds: ['role-super-admin'] })
      }
    } catch {
      // Non-fatal — hub creation failing shouldn't block setup completion
    }

    const result = await services.settings.updateSetupState({ setupCompleted: true, demoMode: body.demoMode ?? false })

    await audit(services.audit, 'setupCompleted', pubkey, { demoMode: body.demoMode ?? false })
    return c.json(result)
  })

// Test Signal bridge connection
setup.post('/test/signal', requirePermission('settings:manage-messaging'),
  describeRoute({
    tags: ['Setup'],
    summary: 'Test Signal bridge connection',
    responses: {
      200: { description: 'Connection test result' },
      ...authErrors,
    },
  }),
  validator('json', testSignalBodySchema),
  async (c) => {
    const body = c.req.valid('json')

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
setup.post('/test/whatsapp', requirePermission('settings:manage-messaging'),
  describeRoute({
    tags: ['Setup'],
    summary: 'Test WhatsApp API connection',
    responses: {
      200: { description: 'Connection test result' },
      ...authErrors,
    },
  }),
  validator('json', testWhatsAppBodySchema),
  async (c) => {
    const body = c.req.valid('json')

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
