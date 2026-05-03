/**
 * OpenAPI request validation tests for invite routes.
 *
 * Invites are a public entry point (redeem) — validates UUID format,
 * pubkey format, and auth token presence.
 *
 * POST /invites (create) uses internal auth middleware, so we test
 * that schema directly via Zod parse.
 */
import { describe, it, expect } from 'vitest'
import invitesRoutes from '../../routes/invites'
import {
  createTestApp,
  sendJSON,
  VALID_PUBKEY,
  VALID_UUID,
} from '../helpers/openapi-validation'
import { createInviteBodySchema } from '@protocol/schemas/invites'

function createApp() {
  return createTestApp({
    prefix: '/invites',
    routes: invitesRoutes,
    // Public routes — no auth for validation testing
  })
}

describe('invites route validation', () => {
  // -----------------------------------------------------------------------
  // POST /invites/redeem (public route)
  // -----------------------------------------------------------------------
  describe('POST /invites/redeem', () => {
    const VALID_REDEEM = {
      code: VALID_UUID,
      pubkey: VALID_PUBKEY,
      timestamp: Date.now(),
      token: 'auth-token',
    }

    it('rejects empty body', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/invites/redeem', {})
      expect(res.status).toBe(400)
    })

    it('rejects invalid UUID code', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/invites/redeem', {
        ...VALID_REDEEM,
        code: 'not-a-uuid',
      })
      expect(res.status).toBe(400)
    })

    it('rejects invalid pubkey', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/invites/redeem', {
        ...VALID_REDEEM,
        pubkey: 'short',
      })
      expect(res.status).toBe(400)
    })

    it('rejects missing token', async () => {
      const app = createApp()
      const { token: _, ...body } = VALID_REDEEM
      const res = await sendJSON(app, '/invites/redeem', body)
      expect(res.status).toBe(400)
    })

    it('rejects empty token', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/invites/redeem', {
        ...VALID_REDEEM,
        token: '',
      })
      expect(res.status).toBe(400)
    })

    it('rejects timestamp as string', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/invites/redeem', {
        ...VALID_REDEEM,
        timestamp: '2024-01-01',
      })
      expect(res.status).toBe(400)
    })

    it('accepts valid redeem body', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/invites/redeem', VALID_REDEEM)
      expect(res.status).not.toBe(400)
    })
  })

  // -----------------------------------------------------------------------
  // createInviteBodySchema (direct schema test — route has internal auth)
  // -----------------------------------------------------------------------
  describe('createInviteBodySchema', () => {
    const VALID_INVITE = {
      name: 'New Volunteer',
      phone: '+12125551234',
      roleIds: ['role-volunteer'],
    }

    it('rejects empty body', () => {
      const result = createInviteBodySchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('rejects empty name', () => {
      const result = createInviteBodySchema.safeParse({ ...VALID_INVITE, name: '' })
      expect(result.success).toBe(false)
    })

    it('rejects name that is too long', () => {
      const result = createInviteBodySchema.safeParse({ ...VALID_INVITE, name: 'x'.repeat(201) })
      expect(result.success).toBe(false)
    })

    it('rejects empty roleIds array', () => {
      const result = createInviteBodySchema.safeParse({ ...VALID_INVITE, roleIds: [] })
      expect(result.success).toBe(false)
    })

    it('rejects missing roleIds', () => {
      const result = createInviteBodySchema.safeParse({ name: 'Test', phone: '+1234' })
      expect(result.success).toBe(false)
    })

    it('accepts valid invite creation', () => {
      const result = createInviteBodySchema.safeParse(VALID_INVITE)
      expect(result.success).toBe(true)
    })
  })
})
