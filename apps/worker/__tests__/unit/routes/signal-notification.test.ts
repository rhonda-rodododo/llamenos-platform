/**
 * Unit tests for routes/signal-notification.ts
 *
 * Tests: contact registration/retrieval/deletion, HMAC key endpoint,
 * security preferences, digest run (admin-only).
 */
import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types'
import signalNotificationRoutes from '@worker/routes/signal-notification'

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function makeApp(opts: {
  permissions?: string[]
  pubkey?: string
  services?: Record<string, unknown>
} = {}) {
  const {
    permissions = ['*'],
    pubkey = 'a'.repeat(64),
    services = {},
  } = opts

  const auditLog = vi.fn().mockResolvedValue(undefined)

  const mockSignalContacts = {
    findByUser: vi.fn(),
    upsert: vi.fn().mockResolvedValue(undefined),
    deleteByUser: vi.fn().mockResolvedValue(undefined),
    getPerUserHmacKey: vi.fn().mockReturnValue('deadbeef'.repeat(8)),
  }

  const mockSecurityPrefs = {
    get: vi.fn(),
    update: vi.fn(),
  }

  const mockUserNotifications = {
    issueRegistrationToken: vi.fn().mockReturnValue('tok-abc'),
    getSidecarUrl: vi.fn().mockReturnValue('https://sidecar.example.com'),
    unregisterFromSidecar: vi.fn().mockResolvedValue(undefined),
  }

  const mockDigestCron = {
    runDigests: vi.fn().mockResolvedValue({ processed: 5, errors: 0 }),
  }

  const app = new Hono<AppEnv>()
  app.use('*', async (c, next) => {
    c.set('pubkey', pubkey)
    c.set('permissions', permissions)
    c.set('services', {
      audit: { log: auditLog },
      signalContacts: mockSignalContacts,
      securityPrefs: mockSecurityPrefs,
      userNotifications: mockUserNotifications,
      digestCron: mockDigestCron,
      ...(services as Record<string, unknown>),
    } as unknown as AppEnv['Variables']['services'])
    c.set('requestId', 'test-req')
    await next()
  })
  app.route('/', signalNotificationRoutes)

  return {
    app,
    auditLog,
    mockSignalContacts,
    mockSecurityPrefs,
    mockUserNotifications,
    mockDigestCron,
  }
}

const baseContact = {
  identifierHash: 'hash-abc',
  identifierCiphertext: 'cipher-abc',
  identifierEnvelope: 'envelope-abc',
  identifierType: 'phone',
  verifiedAt: null,
  updatedAt: new Date(),
}

const basePrefs = {
  notificationChannel: 'signal',
  disappearingTimerDays: 7,
  digestCadence: 'weekly',
  alertOnNewDevice: true,
  alertOnPasskeyChange: true,
  alertOnPinChange: false,
  updatedAt: new Date(),
}

// ---------------------------------------------------------------------------
// GET /contact
// ---------------------------------------------------------------------------

describe('GET /contact', () => {
  it('returns contact when one exists', async () => {
    const { app, mockSignalContacts } = makeApp()
    mockSignalContacts.findByUser.mockResolvedValue(baseContact)

    const res = await app.request('/contact')
    expect(res.status).toBe(200)
    const json = await res.json() as Record<string, unknown>
    expect(json.identifierHash).toBe('hash-abc')
    expect(json.identifierType).toBe('phone')
    expect(json.verifiedAt).toBeNull()
    expect(typeof json.updatedAt).toBe('string')
  })

  it('returns 404 when no contact registered', async () => {
    const { app, mockSignalContacts } = makeApp()
    mockSignalContacts.findByUser.mockResolvedValue(null)

    const res = await app.request('/contact')
    expect(res.status).toBe(404)
  })

  it('calls findByUser with correct pubkey', async () => {
    const { app, mockSignalContacts } = makeApp({ pubkey: 'b'.repeat(64) })
    mockSignalContacts.findByUser.mockResolvedValue(baseContact)

    await app.request('/contact')
    expect(mockSignalContacts.findByUser).toHaveBeenCalledWith('b'.repeat(64))
  })
})

// ---------------------------------------------------------------------------
// PUT /contact
// ---------------------------------------------------------------------------

describe('PUT /contact', () => {
  const validBody = {
    identifierHash: 'a'.repeat(64),
    identifierCiphertext: 'cipher-xyz',
    identifierEnvelope: [{ recipientPubkey: 'a'.repeat(64), encryptedKey: 'key-hex' }],
    identifierType: 'phone',
  }

  it('upserts contact and returns ok', async () => {
    const { app, mockSignalContacts } = makeApp()

    const res = await app.request('/contact', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })

    expect(res.status).toBe(200)
    const json = await res.json() as Record<string, unknown>
    expect(json.ok).toBe(true)
    expect(mockSignalContacts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userPubkey: 'a'.repeat(64),
        identifierHash: 'a'.repeat(64),
      }),
    )
  })

  it('returns 400 when required fields missing', async () => {
    const { app } = makeApp()

    const res = await app.request('/contact', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifierHash: 'hash-only' }),
    })

    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// POST /contact/sidecar-token
// ---------------------------------------------------------------------------

describe('POST /contact/sidecar-token', () => {
  it('returns token and sidecar URL when contact exists', async () => {
    const { app, mockSignalContacts, mockUserNotifications } = makeApp()
    mockSignalContacts.findByUser.mockResolvedValue(baseContact)

    const res = await app.request('/contact/sidecar-token', { method: 'POST' })
    expect(res.status).toBe(200)
    const json = await res.json() as Record<string, unknown>
    expect(json.token).toBe('tok-abc')
    expect(json.sidecarUrl).toBe('https://sidecar.example.com')
    expect(mockUserNotifications.issueRegistrationToken).toHaveBeenCalledWith('hash-abc')
  })

  it('returns 400 when no contact registered', async () => {
    const { app, mockSignalContacts } = makeApp()
    mockSignalContacts.findByUser.mockResolvedValue(null)

    const res = await app.request('/contact/sidecar-token', { method: 'POST' })
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// DELETE /contact
// ---------------------------------------------------------------------------

describe('DELETE /contact', () => {
  it('unregisters from sidecar and deletes contact', async () => {
    const { app, mockSignalContacts, mockUserNotifications } = makeApp()
    mockSignalContacts.findByUser.mockResolvedValue(baseContact)

    const res = await app.request('/contact', { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect(mockUserNotifications.unregisterFromSidecar).toHaveBeenCalledWith('hash-abc')
    expect(mockSignalContacts.deleteByUser).toHaveBeenCalledWith('a'.repeat(64))
  })

  it('still deletes when no contact exists (no sidecar call)', async () => {
    const { app, mockSignalContacts, mockUserNotifications } = makeApp()
    mockSignalContacts.findByUser.mockResolvedValue(null)

    const res = await app.request('/contact', { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect(mockUserNotifications.unregisterFromSidecar).not.toHaveBeenCalled()
    expect(mockSignalContacts.deleteByUser).toHaveBeenCalledWith('a'.repeat(64))
  })
})

// ---------------------------------------------------------------------------
// GET /hmac-key
// ---------------------------------------------------------------------------

describe('GET /hmac-key', () => {
  it('returns HMAC key for the user', async () => {
    const { app, mockSignalContacts } = makeApp()

    const res = await app.request('/hmac-key')
    expect(res.status).toBe(200)
    const json = await res.json() as Record<string, unknown>
    expect(json.hmacKey).toBe('deadbeef'.repeat(8))
    expect(mockSignalContacts.getPerUserHmacKey).toHaveBeenCalledWith('a'.repeat(64))
  })
})

// ---------------------------------------------------------------------------
// GET /security-prefs
// ---------------------------------------------------------------------------

describe('GET /security-prefs', () => {
  it('returns security preferences', async () => {
    const { app, mockSecurityPrefs } = makeApp()
    mockSecurityPrefs.get.mockResolvedValue(basePrefs)

    const res = await app.request('/security-prefs')
    expect(res.status).toBe(200)
    const json = await res.json() as Record<string, unknown>
    expect(json.notificationChannel).toBe('signal')
    expect(json.alertOnNewDevice).toBe(true)
    expect(typeof json.updatedAt).toBe('string')
    expect(mockSecurityPrefs.get).toHaveBeenCalledWith('a'.repeat(64))
  })
})

// ---------------------------------------------------------------------------
// PATCH /security-prefs
// ---------------------------------------------------------------------------

describe('PATCH /security-prefs', () => {
  it('updates security preferences and returns updated values', async () => {
    const { app, mockSecurityPrefs } = makeApp()
    const updated = { ...basePrefs, alertOnNewDevice: false }
    mockSecurityPrefs.update.mockResolvedValue(updated)

    const res = await app.request('/security-prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertOnNewDevice: false }),
    })

    expect(res.status).toBe(200)
    const json = await res.json() as Record<string, unknown>
    expect(json.alertOnNewDevice).toBe(false)
    expect(mockSecurityPrefs.update).toHaveBeenCalledWith(
      'a'.repeat(64),
      expect.objectContaining({ alertOnNewDevice: false }),
    )
  })

  it('returns 400 when body is invalid', async () => {
    const { app } = makeApp()

    const res = await app.request('/security-prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ digestCadence: 'invalid-cadence' }),
    })

    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// POST /digest/run
// ---------------------------------------------------------------------------

describe('POST /digest/run', () => {
  it('runs digest for admin with system:admin permission', async () => {
    const { app, mockDigestCron } = makeApp({ permissions: ['system:admin'] })

    const res = await app.request('/digest/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cadence: 'daily' }),
    })

    expect(res.status).toBe(200)
    const json = await res.json() as Record<string, unknown>
    expect(json.processed).toBe(5)
    expect(mockDigestCron.runDigests).toHaveBeenCalledWith('daily')
  })

  it('defaults cadence to weekly when not specified', async () => {
    const { app, mockDigestCron } = makeApp({ permissions: ['system:admin'] })

    await app.request('/digest/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(mockDigestCron.runDigests).toHaveBeenCalledWith('weekly')
  })

  it('returns 400 when invalid cadence value provided', async () => {
    const { app } = makeApp({ permissions: ['system:admin'] })

    const res = await app.request('/digest/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cadence: 'monthly' }),
    })

    expect(res.status).toBe(400)
  })

  it('returns 403 without system:admin permission', async () => {
    const { app } = makeApp({ permissions: ['notes:read-own'] })

    const res = await app.request('/digest/run', { method: 'POST' })
    expect(res.status).toBe(403)
  })

  it('returns 403 with only wildcard user when system:admin missing', async () => {
    // Wildcard '*' doesn't include 'system:admin' in this route's check
    // (it checks permissions.includes('system:admin') specifically)
    const { app } = makeApp({ permissions: ['*'] })
    // '*' is NOT in the includes check — this route checks for exact 'system:admin'
    // But wait — let's check the actual route logic. It checks:
    //   if (!permissions.includes('system:admin')) return 403
    // So '*' won't match. This should return 403.
    const res = await app.request('/digest/run', { method: 'POST' })
    // The route checks permissions.includes('system:admin') directly,
    // not via requirePermission middleware, so '*' is NOT matched
    expect(res.status).toBe(403)
  })
})
