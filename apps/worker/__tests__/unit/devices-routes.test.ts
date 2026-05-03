/**
 * Unit tests for apps/worker/routes/devices.ts
 *
 * Tests device registration, listing, deregistration, VoIP tokens.
 */
import { describe, it, expect, beforeEach, mock, jest } from 'bun:test'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types/infra'

mock.module('hono-openapi', () => ({
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
      listDevices: jest.fn().mockResolvedValue([]),
      registerDevice: jest.fn().mockResolvedValue(undefined),
      deleteDeviceById: jest.fn().mockResolvedValue(true),
      deleteAllDevices: jest.fn().mockResolvedValue(undefined),
      registerVoipToken: jest.fn().mockResolvedValue(undefined),
      deleteVoipToken: jest.fn().mockResolvedValue(undefined),
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
  beforeEach(() => jest.clearAllMocks())

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
