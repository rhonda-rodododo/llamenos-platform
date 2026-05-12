import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubGlobal('__BUILD_VERSION__', '1.0.0-test')
vi.stubGlobal('__BUILD_COMMIT__', 'abc123')
vi.stubGlobal('__BUILD_TIME__', '2024-01-01T00:00:00Z')

import { Hono } from 'hono'
import type { AppEnv } from '@worker/types'
import configRoute from '@worker/routes/config'
import * as serverIdentity from '@worker/lib/server-identity'

function createTestApp(opts: {
  env?: Record<string, string | undefined>
  services?: Record<string, unknown>
} = {}) {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    // @ts-expect-error setting env for tests
    c.env = {
      HOTLINE_NAME: 'Test Hotline',
      TWILIO_PHONE_NUMBER: '+15551234567',
      DEMO_MODE: 'false',
      GLITCHTIP_DSN: 'https://example.com/dsn',
      SERVER_SECRET: 'a'.repeat(64),
      ...opts.env,
    }
    if (opts.services) {
      c.set('services', opts.services as unknown as AppEnv['Variables']['services'])
    }
    await next()
  })

  app.route('/', configRoute)
  return app
}

function createMockServices(overrides: { settings?: Record<string, unknown>; identity?: Record<string, unknown> } = {}) {
  return {
    settings: {
      getEnabledChannels: vi.fn().mockResolvedValue({
        voice: true, sms: true, whatsapp: true, signal: true, rcs: true, telegram: true, reports: true,
      }),
      getTelephonyProvider: vi.fn().mockResolvedValue({ phoneNumber: '+15559876543' }),
      getSetupState: vi.fn().mockResolvedValue({ setupCompleted: true }),
      getHubs: vi.fn().mockResolvedValue({
        hubs: [
          { id: 'hub-1', name: 'Main Hub', status: 'active' as const },
          { id: 'hub-2', name: 'Inactive Hub', status: 'inactive' as const },
        ],
      }),
      ...(overrides.settings || {}),
    },
    identity: {
      hasAdmin: vi.fn().mockResolvedValue({ hasAdmin: true }),
      ...(overrides.identity || {}),
    },
  }
}

describe('config route', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('GET /', () => {
    it('returns full application config', async () => {
      const services = createMockServices()
      const app = createTestApp({ services })

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.hotlineName).toBe('Test Hotline')
      expect(body.hotlineNumber).toBe('+15559876543')
      expect(body.channels.voice).toBe(true)
      expect(body.channels.sms).toBe(true)
      expect(body.setupCompleted).toBe(true)
      expect(body.demoMode).toBe(false)
      expect(body.needsBootstrap).toBe(false)
      expect(body.hubs).toHaveLength(1)
      expect(body.hubs[0].id).toBe('hub-1')
      expect(body.defaultHubId).toBe('hub-1')
      expect(body.wsRelayUrl).toBe('/ws')
      expect(body.apiVersion).toBeDefined()
      expect(body.minApiVersion).toBeDefined()
      expect(body.sentryDsn).toBe('https://example.com/dsn')
      expect(body.serverPubkey).toBeDefined()
    })

    it('falls back to env phone number when telephony provider fails', async () => {
      const services = createMockServices({
        settings: {
          getTelephonyProvider: vi.fn().mockRejectedValue(new Error('DB error')),
        },
      })
      const app = createTestApp({ services })

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.hotlineNumber).toBe('+15551234567')
    })

    it('defaults channels to all-disabled when getEnabledChannels fails', async () => {
      const services = createMockServices({
        settings: {
          getEnabledChannels: vi.fn().mockRejectedValue(new Error('DB error')),
        },
      })
      const app = createTestApp({ services })

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.channels).toEqual({
        voice: false, sms: false, whatsapp: false, signal: false, rcs: false, telegram: false, reports: false,
      })
    })

    it('defaults setupCompleted to true and demoMode from env when getSetupState fails', async () => {
      const services = createMockServices({
        settings: {
          getSetupState: vi.fn().mockRejectedValue(new Error('DB error')),
        },
      })
      const app = createTestApp({
        services,
        env: { DEMO_MODE: 'true', DEMO_RESET_CRON: '0 */4 * * *' },
      })

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.setupCompleted).toBe(true)
      expect(body.demoMode).toBe(true)
      expect(body.demoResetSchedule).toBe('0 */4 * * *')
    })

    it('defaults needsBootstrap to false when hasAdmin fails', async () => {
      const services = createMockServices({
        identity: {
          hasAdmin: vi.fn().mockRejectedValue(new Error('DB error')),
        },
      })
      const app = createTestApp({ services })

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.needsBootstrap).toBe(false)
    })

    it('returns empty hubs when getHubs fails', async () => {
      const services = createMockServices({
        settings: {
          getHubs: vi.fn().mockRejectedValue(new Error('DB error')),
        },
      })
      const app = createTestApp({ services })

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.hubs).toEqual([])
      expect(body.defaultHubId).toBeUndefined()
    })

    it('does not set defaultHubId when multiple active hubs exist', async () => {
      const services = createMockServices({
        settings: {
          getHubs: vi.fn().mockResolvedValue({
            hubs: [
              { id: 'hub-1', name: 'Hub 1', status: 'active' as const },
              { id: 'hub-2', name: 'Hub 2', status: 'active' as const },
            ],
          }),
        },
      })
      const app = createTestApp({ services })

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.hubs).toHaveLength(2)
      expect(body.defaultHubId).toBeUndefined()
    })

    it('filters out inactive hubs', async () => {
      const services = createMockServices()
      const app = createTestApp({ services })

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.hubs).toHaveLength(1)
      expect(body.hubs[0].status).toBe('active')
    })

    it('returns /ws for relay url when server secret is configured', async () => {
      const services = createMockServices()
      const app = createTestApp({ services })

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.wsRelayUrl).toBe('/ws')
      expect(body.wsRelayUrl).toBe('/ws') // legacy alias
    })

    it('returns undefined relay url when no server secret configured', async () => {
      const services = createMockServices()
      const app = createTestApp({
        services,
        env: { SERVER_SECRET: undefined },
      })

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.wsRelayUrl).toBeUndefined()
      expect(body.wsRelayUrl).toBeUndefined()
    })

    it('omits sentryDsn when GLITCHTIP_DSN not set', async () => {
      const services = createMockServices()
      const app = createTestApp({
        services,
        env: { GLITCHTIP_DSN: undefined },
      })

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.sentryDsn).toBeUndefined()
    })

    it('returns undefined serverPubkey when SERVER_SECRET not set', async () => {
      const services = createMockServices()
      const app = createTestApp({
        services,
        env: { SERVER_SECRET: undefined },
      })

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.serverPubkey).toBeUndefined()
    })

    it('handles invalid SERVER_SECRET gracefully without crashing', async () => {
      const services = createMockServices()
      const app = createTestApp({
        services,
        env: { SERVER_SECRET: 'not-valid-hex' },
      })

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.serverPubkey).toBeUndefined()
    })

    it('derives serverPubkey from valid SERVER_SECRET', async () => {
      const deriveSpy = vi.spyOn(serverIdentity, 'deriveServerKeypair').mockReturnValue({
        secretKey: new Uint8Array(32),
        pubkeyHex: 'testpubkeyhex123',
      })
      const services = createMockServices()
      const app = createTestApp({
        services,
        env: { SERVER_SECRET: 'a'.repeat(64) },
      })

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.serverPubkey).toBe('testpubkeyhex123')
      // Legacy alias should also be present
      expect(body.serverPubkey).toBe('testpubkeyhex123')
      deriveSpy.mockRestore()
    })

    it('uses demoMode from setupState when env does not force it', async () => {
      const services = createMockServices({
        settings: {
          getSetupState: vi.fn().mockResolvedValue({ setupCompleted: true, demoMode: true }),
        },
      })
      const app = createTestApp({
        services,
        env: { DEMO_MODE: 'false' },
      })

      const res = await app.request('/')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.demoMode).toBe(true)
    })
  })

  describe('GET /verify', () => {
    it('returns build verification info', async () => {
      const app = createTestApp()

      const res = await app.request('/verify')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.version).toBeDefined()
      expect(body.commit).toBeDefined()
      expect(body.buildTime).toBeDefined()
      expect(body.verificationUrl).toContain('github.com')
      expect(body.trustAnchor).toBeDefined()
    })
  })
})
