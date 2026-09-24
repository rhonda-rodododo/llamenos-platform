/**
 * Unit tests for apps/worker/routes/devices.ts
 *
 * Tests device registration, listing, deregistration, VoIP tokens.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types/infra'

vi.mock('hono-openapi', () => ({
  describeRoute: () => async (_c: unknown, next: () => Promise<void>) => next(),
  resolver: (s: unknown) => s,
  validator: (_type: string, _schema: unknown) => {
    return async (c: { req: { json: () => Promise<unknown>; valid: (t: string) => unknown } }, next: () => Promise<void>) => {
      try { const body = await c.req.json(); const orig = c.req.valid.bind(c.req); c.req.valid = (t: string) => t === 'json' ? body : orig(t) } catch {}
      await next()
    }
  },
}))

import devicesRoutes from '@worker/routes/devices'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createApp(pubkey = 'user-pk-1') {
  const app = new Hono<AppEnv>()
  const services = {
    identity: {
      listDevices: vi.fn().mockResolvedValue([]),
      registerDevice: vi.fn().mockResolvedValue(undefined),
      deleteDeviceById: vi.fn().mockResolvedValue(true),
      deleteAllDevices: vi.fn().mockResolvedValue(undefined),
      registerVoipToken: vi.fn().mockResolvedValue(undefined),
      deleteVoipToken: vi.fn().mockResolvedValue(undefined),
      emitSecurityEvent: vi.fn().mockResolvedValue(undefined),
      renameDevice: vi.fn().mockResolvedValue(true),
      revokeDevice: vi.fn().mockResolvedValue({ hubIds: [] }),
      verifyDevice: vi.fn().mockResolvedValue({ id: 'ver-1' }),
    },
  }

  app.use('*', async (c, next) => {
    c.set('pubkey', pubkey as never)
    c.set('services', services as never)
    await next()
  })

  app.route('/devices', devicesRoutes)

  return { app, services }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('devices routes', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('GET /devices', () => {
    it('returns empty list when no devices', async () => {
      const { app } = createApp()
      const res = await app.request('/devices')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.devices).toEqual([])
    })

    it('returns formatted device list', async () => {
      const { app, services } = createApp()
      services.identity.listDevices.mockResolvedValue([
        {
          id: 'dev-1',
          platform: 'ios',
          wakeKeyPublic: 'wake-key',
          ed25519Pubkey: 'ed-key',
          x25519Pubkey: 'x-key',
          registeredAt: new Date('2026-01-01T00:00:00Z'),
          lastSeenAt: new Date('2026-01-02T00:00:00Z'),
        },
      ])

      const res = await app.request('/devices')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.devices).toHaveLength(1)
      expect(body.devices[0].id).toBe('dev-1')
      expect(body.devices[0].platform).toBe('ios')
      expect(body.devices[0].registeredAt).toBe('2026-01-01T00:00:00.000Z')
      expect(body.devices[0].lastSeenAt).toBe('2026-01-02T00:00:00.000Z')
    })

    it('handles null lastSeenAt', async () => {
      const { app, services } = createApp()
      services.identity.listDevices.mockResolvedValue([
        {
          id: 'dev-2',
          platform: 'android',
          wakeKeyPublic: '',
          ed25519Pubkey: '',
          x25519Pubkey: '',
          registeredAt: new Date('2026-01-01'),
          lastSeenAt: null,
        },
      ])

      const res = await app.request('/devices')
      const body = await res.json()
      expect(body.devices[0].lastSeenAt).toBeNull()
    })

    it('only lists devices for authenticated user', async () => {
      const { app, services } = createApp('my-pk')
      await app.request('/devices')
      expect(services.identity.listDevices).toHaveBeenCalledWith('my-pk')
    })
  })

  describe('POST /devices/register', () => {
    it('registers a device', async () => {
      const { app, services } = createApp()

      const res = await app.request('/devices/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'ios',
          pushToken: 'token-123',
          wakeKeyPublic: 'wake-pk',
          ed25519Pubkey: 'ed-pk',
          x25519Pubkey: 'x-pk',
        }),
      })

      expect(res.status).toBe(204)
      expect(services.identity.registerDevice).toHaveBeenCalledWith('user-pk-1', {
        platform: 'ios',
        pushToken: 'token-123',
        wakeKeyPublic: 'wake-pk',
        ed25519Pubkey: 'ed-pk',
        x25519Pubkey: 'x-pk',
      })
    })
  })

  // #960 — a UnifiedPush endpoint is fetched by the server with every wake
  // signal. Off-origin endpoints (ntfy.sh is the ntfy app's default) would leak
  // who is woken, and when, to a third party.
  describe('POST /devices/register — UnifiedPush endpoint origin (#960)', () => {
    const TRUSTED = 'https://push.hotline.example.org'

    async function register(pushToken: string, env: Record<string, string | undefined>) {
      const { app, services } = createApp()
      const res = await app.request('/devices/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'android', pushToken, wakeKeyPublic: 'wake-pk' }),
      }, env)
      return { res, services, body: res.status === 204 ? null : await res.json() }
    }

    it('accepts an endpoint on the configured origin', async () => {
      const { res, services } = await register(`${TRUSTED}/up-abc123`, { NTFY_URL: TRUSTED })
      expect(res.status).toBe(204)
      expect(services.identity.registerDevice).toHaveBeenCalledOnce()
    })

    it('accepts an endpoint on NTFY_PUBLIC_URL when NTFY_URL is the internal address', async () => {
      const { res } = await register(`${TRUSTED}/up-abc123`, {
        NTFY_URL: 'http://ntfy:80',
        NTFY_PUBLIC_URL: TRUSTED,
      })
      expect(res.status).toBe(204)
    })

    it('rejects the public ntfy.sh default with a stable code and stores nothing', async () => {
      const { res, body, services } = await register('https://ntfy.sh/up-abc123', { NTFY_URL: TRUSTED })
      expect(res.status).toBe(422)
      expect(body.code).toBe('PUSH_ENDPOINT_UNTRUSTED')
      expect(body.expectedOrigin).toBe(TRUSTED)
      expect(services.identity.registerDevice).not.toHaveBeenCalled()
    })

    it.each([
      ['look-alike suffix host (prefix match would accept)', `${TRUSTED}.evil.example/up-abc`],
      ['userinfo trick (host is evil.example)', 'https://push.hotline.example.org@evil.example/up-abc'],
      ['userinfo on the trusted host', 'https://user:pw@push.hotline.example.org/up-abc'],
      ['http downgrade', 'http://push.hotline.example.org/up-abc'],
      ['different port', 'https://push.hotline.example.org:8443/up-abc'],
      ['sibling subdomain', 'https://evil.push.hotline.example.org/up-abc'],
      ['scheme without slashes', 'https:evil.example/up-abc'],
    ])('rejects %s', async (_label, token) => {
      const { res, body, services } = await register(token, { NTFY_URL: TRUSTED })
      expect(res.status).toBe(422)
      expect(body.code).toBe('PUSH_ENDPOINT_UNTRUSTED')
      expect(services.identity.registerDevice).not.toHaveBeenCalled()
    })

    it('fails closed when no relay is configured: URL endpoints are rejected', async () => {
      const { res, body, services } = await register('https://ntfy.sh/up-abc123', {})
      expect(res.status).toBe(422)
      expect(body.code).toBe('PUSH_RELAY_NOT_CONFIGURED')
      expect(services.identity.registerDevice).not.toHaveBeenCalled()
    })

    it('still accepts opaque (non-URL) tokens such as APNs tokens when no relay is configured', async () => {
      const { res } = await register('a1b2c3d4e5f6', {})
      expect(res.status).toBe(204)
    })

    it('never echoes the offending endpoint in the response', async () => {
      const { body } = await register('https://ntfy.sh/up-secret-topic-xyz', { NTFY_URL: TRUSTED })
      expect(JSON.stringify(body)).not.toContain('up-secret-topic-xyz')
    })
  })

  describe('POST /devices/voip-token — UnifiedPush endpoint origin (#960)', () => {
    const TRUSTED = 'https://push.hotline.example.org'

    async function registerVoip(voipToken: string, env: Record<string, string | undefined>, platform = 'android') {
      const { app, services } = createApp()
      const res = await app.request('/devices/voip-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, voipToken }),
      }, env)
      return { res, services, body: res.status === 204 ? null : await res.json() }
    }

    it('accepts an Android VoIP endpoint on the configured origin', async () => {
      const { res, services } = await registerVoip(`${TRUSTED}/up-voip`, { NTFY_URL: TRUSTED })
      expect(res.status).toBe(204)
      expect(services.identity.registerVoipToken).toHaveBeenCalledOnce()
    })

    it('rejects an Android VoIP endpoint on ntfy.sh', async () => {
      const { res, body, services } = await registerVoip('https://ntfy.sh/up-voip', { NTFY_URL: TRUSTED })
      expect(res.status).toBe(422)
      expect(body.code).toBe('PUSH_ENDPOINT_UNTRUSTED')
      expect(services.identity.registerVoipToken).not.toHaveBeenCalled()
    })

    it('rejects a look-alike host', async () => {
      const { res, services } = await registerVoip(`${TRUSTED}.evil.example/up-voip`, { NTFY_URL: TRUSTED })
      expect(res.status).toBe(422)
      expect(services.identity.registerVoipToken).not.toHaveBeenCalled()
    })

    it('still accepts an opaque PushKit token', async () => {
      const { res } = await registerVoip('ab12cd34ef56', {}, 'ios')
      expect(res.status).toBe(204)
    })
  })

  describe('DELETE /devices/:id', () => {
    it('deletes a device', async () => {
      const { app, services } = createApp()

      const res = await app.request('/devices/dev-1', { method: 'DELETE' })
      expect(res.status).toBe(204)
      expect(services.identity.deleteDeviceById).toHaveBeenCalledWith('user-pk-1', 'dev-1')
    })

    it('returns 404 for non-existent device', async () => {
      const { app, services } = createApp()
      services.identity.deleteDeviceById.mockResolvedValue(false)

      const res = await app.request('/devices/nonexistent', { method: 'DELETE' })
      expect(res.status).toBe(404)
    })

    it('enforces ownership (passes pubkey to service)', async () => {
      const { app, services } = createApp('owner-pk')
      await app.request('/devices/dev-1', { method: 'DELETE' })
      expect(services.identity.deleteDeviceById).toHaveBeenCalledWith('owner-pk', 'dev-1')
    })
  })

  describe('POST /devices/voip-token', () => {
    it('registers VoIP token', async () => {
      const { app, services } = createApp()

      const res = await app.request('/devices/voip-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'ios', voipToken: 'voip-123' }),
      })

      expect(res.status).toBe(204)
      expect(services.identity.registerVoipToken).toHaveBeenCalledWith('user-pk-1', {
        platform: 'ios',
        voipToken: 'voip-123',
      })
    })
  })

  describe('DELETE /devices/voip-token', () => {
    it('removes VoIP token', async () => {
      const { app, services } = createApp()

      const res = await app.request('/devices/voip-token', { method: 'DELETE' })
      expect(res.status).toBe(204)
      expect(services.identity.deleteVoipToken).toHaveBeenCalledWith('user-pk-1')
    })
  })

  describe('DELETE /devices', () => {
    it('removes all devices', async () => {
      const { app, services } = createApp()

      const res = await app.request('/devices', { method: 'DELETE' })
      expect(res.status).toBe(204)
      expect(services.identity.deleteAllDevices).toHaveBeenCalledWith('user-pk-1')
    })
  })
})
