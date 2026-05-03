/**
 * Unit tests for apps/worker/middleware/auth.ts
 *
 * Tests the auth middleware: token validation, expired tokens,
 * missing auth header, role resolution, dev-mode bypass.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types/infra'

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the middleware
// ---------------------------------------------------------------------------

const mockAuthenticateRequest = vi.fn()
const mockParseAuthHeader = vi.fn()
const mockParseSessionHeader = vi.fn()
const mockValidateToken = vi.fn()

vi.mock('@worker/lib/auth', () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  parseAuthHeader: (...args: unknown[]) => mockParseAuthHeader(...args),
  parseSessionHeader: (...args: unknown[]) => mockParseSessionHeader(...args),
  validateToken: (...args: unknown[]) => mockValidateToken(...args),
}))

vi.mock('@worker/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }),
}))

vi.mock('@worker/lib/error-counter', () => ({
  incError: vi.fn(),
}))

// Import after mocks
import { auth } from '@worker/middleware/auth'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    pubkey: 'aabbccdd11223344',
    name: 'Test User',
    roles: ['role-volunteer'],
    active: true,
    ...overrides,
  }
}

const defaultRoles = [
  { id: 'role-volunteer', permissions: ['calls:answer', 'notes:create'], slug: 'volunteer' },
  { id: 'role-super-admin', permissions: ['*'], slug: 'super-admin' },
]

function makeServices(overrides: Record<string, unknown> = {}) {
  return {
    identity: {
      getUserInternal: vi.fn(),
      ...overrides,
    },
    settings: {
      getRoles: vi.fn().mockResolvedValue({ roles: defaultRoles }),
    },
  }
}

/** Default env bindings for tests */
const defaultEnv = { ENVIRONMENT: 'production', HMAC_SECRET: 'test' } as Record<string, string>

/**
 * Create a Hono app with auth middleware.
 * Hono populates c.env from the third arg of app.request().
 */
function createApp() {
  const app = new Hono<AppEnv>()
  const services = makeServices()

  app.use('*', async (c, next) => {
    c.set('services', services as never)
    c.set('requestId', 'test-req-1')
    await next()
  })
  app.use('*', auth)
  app.get('/test', (c) => c.json({ ok: true, pubkey: c.get('pubkey'), permissions: c.get('permissions') }))

  return { app, services }
}

function req(app: Hono<AppEnv>, path: string, headers?: Record<string, string>, env?: Record<string, string>) {
  return app.request(path, headers ? { headers } : {}, { ...defaultEnv, ...env } as never)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParseAuthHeader.mockReturnValue(null)
    mockParseSessionHeader.mockReturnValue(null)
  })

  it('returns 401 when no auth header is present', async () => {
    mockAuthenticateRequest.mockResolvedValue(null)
    const { app } = createApp()

    const res = await req(app, '/test')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 401 for invalid auth token', async () => {
    mockAuthenticateRequest.mockResolvedValue(null)
    const { app } = createApp()

    const res = await req(app, '/test', { Authorization: 'Bearer invalid' })
    expect(res.status).toBe(401)
  })

  it('authenticates valid request and sets context', async () => {
    const user = makeUser()
    mockAuthenticateRequest.mockResolvedValue({ pubkey: user.pubkey, user })
    const { app } = createApp()

    const res = await req(app, '/test')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pubkey).toBe(user.pubkey)
  })

  it('resolves permissions from user roles', async () => {
    const user = makeUser({ roles: ['role-volunteer'] })
    mockAuthenticateRequest.mockResolvedValue({ pubkey: user.pubkey, user })
    const { app } = createApp()

    const res = await req(app, '/test')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.permissions).toContain('calls:answer')
    expect(body.permissions).toContain('notes:create')
  })

  it('resolves wildcard permissions for super admin', async () => {
    const user = makeUser({ roles: ['role-super-admin'] })
    mockAuthenticateRequest.mockResolvedValue({ pubkey: user.pubkey, user })
    const { app } = createApp()

    const res = await req(app, '/test')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.permissions).toContain('*')
  })

  describe('dev-mode signature bypass', () => {
    it('falls back to dev bypass when ENVIRONMENT=development and auth fails', async () => {
      mockAuthenticateRequest.mockResolvedValue(null)
      const user = makeUser()
      mockParseAuthHeader.mockReturnValue({ pubkey: user.pubkey, timestamp: Date.now(), token: 'abc' })
      mockValidateToken.mockReturnValue(true)

      const { app, services } = createApp()
      ;(services.identity.getUserInternal as ReturnType<typeof vi.fn>).mockResolvedValue(user)

      const res = await req(app, '/test',
        { Authorization: 'Bearer {"pubkey":"aabbccdd11223344","timestamp":1234,"token":"abc"}' },
        { ENVIRONMENT: 'development' },
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.pubkey).toBe(user.pubkey)
    })

    it('does NOT use dev bypass in production', async () => {
      mockAuthenticateRequest.mockResolvedValue(null)
      const { app } = createApp()

      const res = await req(app, '/test',
        { Authorization: 'Bearer {"pubkey":"abc","timestamp":1234,"token":"def"}' },
        { ENVIRONMENT: 'production' },
      )
      expect(res.status).toBe(401)
    })

    it('dev bypass rejects inactive users', async () => {
      mockAuthenticateRequest.mockResolvedValue(null)
      const user = makeUser({ active: false })
      mockParseAuthHeader.mockReturnValue({ pubkey: user.pubkey, timestamp: Date.now(), token: 'abc' })
      mockValidateToken.mockReturnValue(true)

      const { app, services } = createApp()
      ;(services.identity.getUserInternal as ReturnType<typeof vi.fn>).mockResolvedValue(user)

      const res = await req(app, '/test',
        { Authorization: 'Bearer {"pubkey":"aabbccdd11223344","timestamp":1234,"token":"abc"}' },
        { ENVIRONMENT: 'development' },
      )
      expect(res.status).toBe(401)
    })

    it('dev bypass rejects unregistered pubkeys', async () => {
      mockAuthenticateRequest.mockResolvedValue(null)
      mockParseAuthHeader.mockReturnValue({ pubkey: 'unknown', timestamp: Date.now(), token: 'abc' })
      mockValidateToken.mockReturnValue(true)

      const { app, services } = createApp()
      ;(services.identity.getUserInternal as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const res = await req(app, '/test',
        { Authorization: 'Bearer {"pubkey":"unknown","timestamp":1234,"token":"abc"}' },
        { ENVIRONMENT: 'development' },
      )
      expect(res.status).toBe(401)
    })

    it('dev bypass still validates token freshness', async () => {
      mockAuthenticateRequest.mockResolvedValue(null)
      mockParseAuthHeader.mockReturnValue({ pubkey: 'abc', timestamp: Date.now(), token: 'abc' })
      mockValidateToken.mockReturnValue(false) // Token is stale

      const { app } = createApp()

      const res = await req(app, '/test',
        { Authorization: 'Bearer {"pubkey":"abc","timestamp":1234,"token":"abc"}' },
        { ENVIRONMENT: 'development' },
      )
      expect(res.status).toBe(401)
    })
  })

  it('increments auth error counter on failure', async () => {
    mockAuthenticateRequest.mockResolvedValue(null)
    const { app } = createApp()

    const res = await req(app, '/test')
    expect(res.status).toBe(401)
    const { incError } = await import('@worker/lib/error-counter')
    expect(incError).toHaveBeenCalledWith('auth')
  })
})
