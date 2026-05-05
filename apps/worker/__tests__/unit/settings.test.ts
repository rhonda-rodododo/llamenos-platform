import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SettingsService, ServiceError } from '@worker/services/settings'
import { createMockDb } from './mock-db'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSettingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    spamSettings: {
      voiceCaptchaEnabled: false,
      rateLimitEnabled: true,
      maxCallsPerMinute: 3,
      blockDurationMinutes: 30,
    },
    callSettings: {
      queueTimeoutSeconds: 90,
      voicemailMaxSeconds: 120,
    },
    ivrLanguages: ['en'],
    setupState: null,
    messagingConfig: null,
    ...overrides,
  }
}

function makeHub(overrides: Record<string, unknown> = {}) {
  const now = new Date()
  return {
    id: 'hub-1',
    name: 'Test Hub',
    slug: 'test-hub',
    description: 'A test hub',
    status: 'active',
    phoneNumber: null,
    createdBy: 'admin-pubkey',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function setup() {
  const { db } = createMockDb()
  const service = new SettingsService(db as any)
  return { db, service }
}

// ---------------------------------------------------------------------------
// ServiceError
// ---------------------------------------------------------------------------

describe('ServiceError', () => {
  it('has status and message', () => {
    const err = new ServiceError(404, 'Not found')
    expect(err.status).toBe(404)
    expect(err.message).toBe('Not found')
    expect(err.name).toBe('ServiceError')
    expect(err).toBeInstanceOf(Error)
  })

  it('is thrown as an Error subclass', () => {
    expect(() => {
      throw new ServiceError(403, 'Forbidden')
    }).toThrow('Forbidden')
  })
})

// ---------------------------------------------------------------------------
// checkRateLimit
// ---------------------------------------------------------------------------

describe('SettingsService.checkRateLimit', () => {
  it('throws 400 for empty key', async () => {
    const { service } = setup()
    await expect(
      service.checkRateLimit({ key: '', maxPerMinute: 5 }),
    ).rejects.toThrow(ServiceError)
    await expect(
      service.checkRateLimit({ key: '', maxPerMinute: 5 }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws 400 for key with invalid characters', async () => {
    const { service } = setup()
    await expect(
      service.checkRateLimit({ key: 'bad key!', maxPerMinute: 5 }),
    ).rejects.toMatchObject({ status: 400, message: 'Invalid rate limit key' })
  })

  it('throws 400 for key exceeding 256 chars', async () => {
    const { service } = setup()
    const longKey = 'a'.repeat(257)
    await expect(
      service.checkRateLimit({ key: longKey, maxPerMinute: 5 }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws 400 for non-integer maxPerMinute', async () => {
    const { service } = setup()
    await expect(
      service.checkRateLimit({ key: 'caller:1', maxPerMinute: 1.5 }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('maxPerMinute') })
  })

  it('throws 400 for maxPerMinute < 1', async () => {
    const { service } = setup()
    await expect(
      service.checkRateLimit({ key: 'caller:1', maxPerMinute: 0 }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('throws 400 for maxPerMinute > 1000', async () => {
    const { service } = setup()
    await expect(
      service.checkRateLimit({ key: 'caller:1', maxPerMinute: 1001 }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('returns not limited for first call (no existing record)', async () => {
    const { db, service } = setup()
    // No existing rate limit record
    db.$setSelectResult([])

    const result = await service.checkRateLimit({ key: 'caller:1', maxPerMinute: 3 })
    expect(result).toEqual({ limited: false })
  })

  it('returns not limited when under the limit', async () => {
    const { db, service } = setup()
    const now = Date.now()
    // 1 recent timestamp, limit is 3 → after adding new one: 2 < 3 = not limited
    db.$setSelectResult([{ key: 'caller:1', timestamps: [now - 5000] }])

    const result = await service.checkRateLimit({ key: 'caller:1', maxPerMinute: 3 })
    expect(result).toEqual({ limited: false })
  })

  it('returns limited when at or over the limit', async () => {
    const { db, service } = setup()
    const now = Date.now()
    // 3 recent timestamps + the new one = 4 total, limit is 3
    db.$setSelectResult([
      { key: 'caller:1', timestamps: [now - 5000, now - 10000, now - 15000] },
    ])

    const result = await service.checkRateLimit({ key: 'caller:1', maxPerMinute: 3 })
    // 3 existing + 1 new = 4 >= 3, so limited
    expect(result).toEqual({ limited: true })
  })

  it('filters out timestamps older than 60 seconds', async () => {
    const { db, service } = setup()
    const now = Date.now()
    // Old timestamps (>60s ago) should be filtered; only the new one counts
    db.$setSelectResult([
      {
        key: 'caller:1',
        timestamps: [now - 90_000, now - 120_000],
      },
    ])

    const result = await service.checkRateLimit({ key: 'caller:1', maxPerMinute: 3 })
    // Only 1 timestamp (the new one) counts — not limited
    expect(result).toEqual({ limited: false })
  })

  it('allows alphanumeric keys with colons, underscores, hyphens', async () => {
    const { db, service } = setup()
    db.$setSelectResult([])

    // Should not throw
    await expect(
      service.checkRateLimit({ key: 'hub-1:caller_abc:123', maxPerMinute: 5 }),
    ).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// clearRateLimits
// ---------------------------------------------------------------------------

describe('SettingsService.clearRateLimits', () => {
  it('calls db.delete on the rate limits table', async () => {
    const { db, service } = setup()

    await service.clearRateLimits()

    expect(db.delete).toHaveBeenCalled()
  })

  it('resolves without error', async () => {
    const { db, service } = setup()
    await expect(service.clearRateLimits()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// getSpamSettings
// ---------------------------------------------------------------------------

describe('SettingsService.getSpamSettings', () => {
  it('returns spam settings from DB', async () => {
    const { db, service } = setup()
    const spamSettings = {
      voiceCaptchaEnabled: true,
      rateLimitEnabled: true,
      maxCallsPerMinute: 5,
      blockDurationMinutes: 60,
    }
    db.$setSelectResult([makeSettingsRow({ spamSettings })])

    const result = await service.getSpamSettings()
    expect(result).toEqual(spamSettings)
  })

  it('returns defaults when spamSettings is null in DB', async () => {
    const { db, service } = setup()
    // First select (getSettings): row with null spam settings
    // Then insert for upsert (getSettings upserts if missing)
    db.$setSelectResult([makeSettingsRow({ spamSettings: null })])

    const result = await service.getSpamSettings()
    expect(result).toMatchObject({
      voiceCaptchaEnabled: false,
      rateLimitEnabled: true,
      maxCallsPerMinute: 3,
      blockDurationMinutes: 30,
    })
  })
})

// ---------------------------------------------------------------------------
// updateSpamSettings
// ---------------------------------------------------------------------------

describe('SettingsService.updateSpamSettings', () => {
  it('merges partial updates with existing settings', async () => {
    const { db, service } = setup()
    const existing = {
      voiceCaptchaEnabled: false,
      rateLimitEnabled: true,
      maxCallsPerMinute: 3,
      blockDurationMinutes: 30,
    }
    // Two getSettings calls: one for getSpamSettings, one internally
    db.$setSelectResults([
      [makeSettingsRow({ spamSettings: existing })],
      [makeSettingsRow({ spamSettings: existing })],
    ])

    const result = await service.updateSpamSettings({ maxCallsPerMinute: 10 })
    expect(result.maxCallsPerMinute).toBe(10)
    // Other fields should be preserved
    expect(result.voiceCaptchaEnabled).toBe(false)
    expect(result.blockDurationMinutes).toBe(30)
  })

  it('calls db.update to persist changes', async () => {
    const { db, service } = setup()
    db.$setSelectResult([makeSettingsRow()])

    await service.updateSpamSettings({ voiceCaptchaEnabled: true })

    expect(db.update).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getHubs
// ---------------------------------------------------------------------------

describe('SettingsService.getHubs', () => {
  it('returns empty array when no hubs exist', async () => {
    const { db, service } = setup()
    db.$setSelectResult([])

    const result = await service.getHubs()
    expect(result.hubs).toEqual([])
  })

  it('maps DB rows to Hub shape with ISO timestamps', async () => {
    const { db, service } = setup()
    db.$setSelectResult([makeHub()])

    const result = await service.getHubs()
    expect(result.hubs).toHaveLength(1)
    expect(result.hubs[0].id).toBe('hub-1')
    expect(result.hubs[0].name).toBe('Test Hub')
    expect(result.hubs[0].slug).toBe('test-hub')
    expect(result.hubs[0].status).toBe('active')
    // Timestamps should be ISO strings
    expect(typeof result.hubs[0].createdAt).toBe('string')
    expect(result.hubs[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns multiple hubs', async () => {
    const { db, service } = setup()
    db.$setSelectResult([
      makeHub({ id: 'hub-1', name: 'Hub One', slug: 'hub-one' }),
      makeHub({ id: 'hub-2', name: 'Hub Two', slug: 'hub-two' }),
    ])

    const result = await service.getHubs()
    expect(result.hubs).toHaveLength(2)
    expect(result.hubs.map((h) => h.id)).toEqual(['hub-1', 'hub-2'])
  })
})

// ---------------------------------------------------------------------------
// getHub
// ---------------------------------------------------------------------------

describe('SettingsService.getHub', () => {
  it('returns hub when found', async () => {
    const { db, service } = setup()
    db.$setSelectResult([makeHub()])

    const result = await service.getHub('hub-1')
    expect(result.hub.id).toBe('hub-1')
    expect(result.hub.name).toBe('Test Hub')
  })

  it('throws 404 when hub not found', async () => {
    const { db, service } = setup()
    db.$setSelectResult([])

    await expect(service.getHub('nonexistent')).rejects.toMatchObject({
      status: 404,
    })
  })

  it('throws ServiceError not generic Error', async () => {
    const { db, service } = setup()
    db.$setSelectResult([])

    await expect(service.getHub('nonexistent')).rejects.toBeInstanceOf(ServiceError)
  })
})

// ---------------------------------------------------------------------------
// createHub
// ---------------------------------------------------------------------------

describe('SettingsService.createHub', () => {
  const validHub = {
    id: 'hub-new',
    name: 'New Hub',
    slug: 'new-hub',
    description: 'A new hub',
    status: 'active' as const,
    createdBy: 'admin-pk',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('throws 409 when slug already exists', async () => {
    const { db, service } = setup()
    // Slug check returns existing hub
    db.$setSelectResult([makeHub({ slug: 'new-hub' })])

    await expect(service.createHub(validHub)).rejects.toMatchObject({
      status: 409,
      message: 'Hub slug already exists',
    })
  })

  it('creates hub when slug is unique', async () => {
    const { db, service } = setup()
    // Slug check: not found
    db.$setSelectResult([])
    db.$setInsertResult([])

    const result = await service.createHub(validHub)
    expect(result.hub.id).toBe('hub-new')
    expect(db.insert).toHaveBeenCalled()
  })

  it('creates hub_settings row after creating hub', async () => {
    const { db, service } = setup()
    db.$setSelectResult([])
    db.$setInsertResult([])

    await service.createHub(validHub)
    // insert should be called twice: once for hub, once for hub_settings
    expect(db.insert).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// updateHub
// ---------------------------------------------------------------------------

describe('SettingsService.updateHub', () => {
  it('throws 404 when hub does not exist', async () => {
    const { db, service } = setup()
    db.$setSelectResult([])

    await expect(service.updateHub('nonexistent', { name: 'New Name' })).rejects.toMatchObject({
      status: 404,
    })
  })

  it('calls db.update when hub exists', async () => {
    const { db, service } = setup()
    const hub = makeHub({ name: 'Updated Hub' })
    // updateHub: first select (existence check), then update, then second select (re-read)
    db.$setSelectResults([[hub], [hub]])

    await service.updateHub('hub-1', { name: 'Updated Hub' })

    expect(db.update).toHaveBeenCalled()
  })
})
