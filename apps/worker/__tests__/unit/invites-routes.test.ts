/**
 * Unit tests for apps/worker/routes/invites.ts
 *
 * Tests invite creation, redemption, validation, revocation,
 * privilege escalation prevention.
 */
import { describe, it, expect, beforeEach, mock, jest } from 'bun:test'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types/infra'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockVerifyAuthToken = jest.fn()
const mockCheckRateLimit = jest.fn().mockResolvedValue(false)
const mockHashIP = jest.fn().mockReturnValue('hashed')
const mockAudit = jest.fn().mockResolvedValue(undefined)

mock.module('@worker/lib/auth', () => ({
  verifyAuthToken: (...args: unknown[]) => mockVerifyAuthToken(...args),
}))

mock.module('@worker/lib/helpers', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}))

mock.module('@worker/lib/crypto', () => ({
  hashIP: (...args: unknown[]) => mockHashIP(...args),
}))

mock.module('@worker/services/audit', () => ({
  audit: (...args: unknown[]) => mockAudit(...args),
}))

mock.module('@worker/middleware/auth', () => ({
  auth: jest.fn().mockImplementation(async (_c: unknown, next: () => Promise<void>) => next()),
}))

mock.module('@worker/middleware/permission-guard', () => ({
  requirePermission: (..._perms: string[]) =>
    async (_c: unknown, next: () => Promise<void>) => next(),
}))

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

mock.module('@worker/lib/entity-router', () => ({
  createEntityRouter: () => new Hono(),
}))

import invitesRoutes from '@worker/routes/invites'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const allRoles = [
  { id: 'role-volunteer', name: 'Volunteer', slug: 'volunteer', permissions: ['calls:answer', 'notes:create'] },
  { id: 'role-super-admin', name: 'Super Admin', slug: 'super-admin', permissions: ['*'] },
  { id: 'role-hub-admin', name: 'Hub Admin', slug: 'hub-admin', permissions: ['users:*', 'settings:*', 'invites:*'] },
]

function createApp(permissions: string[] = ['invites:read', 'invites:create', 'invites:revoke']) {
  const app = new Hono<AppEnv>()
  const services = {
    identity: {
      validateInvite: jest.fn().mockResolvedValue({ valid: true, name: 'Test Invite' }),
      redeemInvite: jest.fn().mockResolvedValue({ ok: true }),
      createInvite: jest.fn().mockResolvedValue({ code: 'INV-123', name: 'New Invite' }),
      revokeInvite: jest.fn().mockResolvedValue(undefined),
      getInvites: jest.fn().mockResolvedValue({ invites: [] }),
    },
    settings: {
      checkRateLimit: jest.fn().mockResolvedValue({ limited: false }),
    },
    audit: {},
  }

  app.use('*', async (c, next) => {
    c.set('services', services as never)
    c.set('pubkey', 'creator-pk' as never)
    c.set('permissions', permissions as never)
    c.set('allRoles', allRoles as never)
    c.set('user', { pubkey: 'creator-pk', roles: ['role-hub-admin'] } as never)
    await next()
  })

  app.route('/invites', invitesRoutes)

  return { app, services }
}

const defaultEnv = { HMAC_SECRET: 'test' } as never

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('invites routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockVerifyAuthToken.mockResolvedValue(true)
    mockCheckRateLimit.mockResolvedValue(false)
  })

  describe('GET /invites/validate/:code', () => {
    it('validates an invite code', async () => {
      const { app } = createApp()

      const res = await app.request('/invites/validate/INV-123', {}, defaultEnv)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.valid).toBe(true)
    })

    it('rate limits validation attempts', async () => {
      mockCheckRateLimit.mockResolvedValue(true)
      const { app } = createApp()

      const res = await app.request('/invites/validate/INV-123', {}, defaultEnv)
      expect(res.status).toBe(429)
    })
  })

  describe('POST /invites/redeem', () => {
    it('redeems a valid invite', async () => {
      const { app } = createApp()

      const res = await app.request('/invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'INV-123',
          pubkey: 'new-user',
          timestamp: Date.now(),
          token: 'valid-sig',
        }),
      }, defaultEnv)

      expect(res.status).toBe(200)
    })

    it('rejects invalid signature', async () => {
      mockVerifyAuthToken.mockResolvedValue(false)
      const { app } = createApp()

      const res = await app.request('/invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'INV-123',
          pubkey: 'new-user',
          timestamp: Date.now(),
          token: 'bad-sig',
        }),
      }, defaultEnv)

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error).toBe('Invalid signature')
    })

    it('rate limits redemption attempts', async () => {
      // Signature check happens first, then rate limit
      mockVerifyAuthToken.mockResolvedValue(true)
      mockCheckRateLimit.mockResolvedValue(true)
      const { app } = createApp()

      const res = await app.request('/invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'INV-123',
          pubkey: 'new-user',
          timestamp: Date.now(),
          token: 'valid-sig',
        }),
      }, defaultEnv)

      expect(res.status).toBe(429)
    })
  })

  describe('POST /invites (create)', () => {
    it('creates an invite without roleIds', async () => {
      const { app, services } = createApp()

      const res = await app.request('/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Invite' }),
      }, defaultEnv)

      expect(res.status).toBe(201)
      expect(services.identity.createInvite).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Invite', createdBy: 'creator-pk' }),
      )
    })

    it('prevents privilege escalation — cannot grant roles you do not have', async () => {
      // Hub admin does NOT have '*' permission, so they can't grant super-admin
      const { app } = createApp(['invites:create', 'invites:read', 'users:*', 'settings:*'])

      const res = await app.request('/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Escalation Attempt',
          roleIds: ['role-super-admin'],
        }),
      }, defaultEnv)

      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error).toContain('Cannot grant role')
    })

    it('super admin can grant any role', async () => {
      const { app } = createApp(['*'])

      const res = await app.request('/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Admin Invite',
          roleIds: ['role-super-admin'],
        }),
      }, defaultEnv)

      expect(res.status).toBe(201)
    })

    it('rejects unknown role IDs', async () => {
      const { app } = createApp(['invites:create', 'calls:answer'])

      const res = await app.request('/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bad Invite',
          roleIds: ['role-nonexistent'],
        }),
      }, defaultEnv)

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('Unknown role')
    })
  })

  describe('DELETE /invites/:code', () => {
    it('revokes an invite', async () => {
      const { app, services } = createApp()

      const res = await app.request('/invites/INV-123', { method: 'DELETE' }, defaultEnv)
      expect(res.status).toBe(200)
      expect(services.identity.revokeInvite).toHaveBeenCalledWith('INV-123')
    })

    it('audits revocation', async () => {
      const { app } = createApp()

      await app.request('/invites/INV-123', { method: 'DELETE' }, defaultEnv)
      expect(mockAudit).toHaveBeenCalledWith(
        expect.anything(),
        'inviteRevoked',
        'creator-pk',
        expect.objectContaining({ code: 'INV-123' }),
      )
    })
  })
})
