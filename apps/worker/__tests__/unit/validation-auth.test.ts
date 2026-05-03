/**
 * OpenAPI request validation tests for auth routes.
 *
 * Verifies that validator('json', schema) correctly rejects invalid input
 * and accepts valid input for all auth endpoints.
 *
 * /me/* routes apply their own internal auth middleware, so we test those
 * schemas directly via Zod parse to verify validation rules.
 */
import { describe, it, expect } from 'bun:test'
import authRoutes from '../../routes/auth'
import {
  createTestApp,
  sendJSON,
  VALID_PUBKEY,
} from '../helpers/openapi-validation'
import {
  profileUpdateBodySchema,
  availabilityBodySchema,
  transcriptionToggleBodySchema,
} from '@protocol/schemas/auth'

// Auth routes: /login and /bootstrap are public (no auth middleware).
// /me/* routes apply their own auth middleware internally (auth.use('/me', authMiddleware))
// which runs before the validator — so we can only test validation on public endpoints.
// For /me/* routes, we test them separately with a bypass approach.

function createApp() {
  return createTestApp({
    prefix: '/auth',
    routes: authRoutes,
    // Public routes — no auth needed for validation testing
  })
}

describe('auth route validation', () => {
  // -----------------------------------------------------------------------
  // POST /auth/login
  // -----------------------------------------------------------------------
  describe('POST /auth/login', () => {
    const VALID_LOGIN = {
      pubkey: VALID_PUBKEY,
      timestamp: Date.now(),
      token: 'some-signed-token',
    }

    it('rejects empty body', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/auth/login', {})
      expect(res.status).toBe(400)
    })

    it('rejects missing pubkey', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/auth/login', {
        timestamp: Date.now(),
        token: 'abc',
      })
      expect(res.status).toBe(400)
    })

    it('rejects invalid pubkey (not 64 hex chars)', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/auth/login', {
        ...VALID_LOGIN,
        pubkey: 'short',
      })
      expect(res.status).toBe(400)
    })

    it('rejects pubkey with uppercase hex (schema requires lowercase)', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/auth/login', {
        ...VALID_LOGIN,
        pubkey: 'A'.repeat(64),
      })
      expect(res.status).toBe(400)
    })

    it('rejects non-hex pubkey of correct length', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/auth/login', {
        ...VALID_LOGIN,
        pubkey: 'g'.repeat(64),
      })
      expect(res.status).toBe(400)
    })

    it('rejects timestamp as string instead of number', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/auth/login', {
        ...VALID_LOGIN,
        timestamp: 'not-a-number',
      })
      expect(res.status).toBe(400)
    })

    it('rejects empty token string', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/auth/login', {
        ...VALID_LOGIN,
        token: '',
      })
      expect(res.status).toBe(400)
    })

    it('rejects missing token', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/auth/login', {
        pubkey: VALID_PUBKEY,
        timestamp: Date.now(),
      })
      expect(res.status).toBe(400)
    })

    it('accepts valid login body (reaches handler)', async () => {
      const app = createApp()
      // With valid body, the validator passes and we reach the handler.
      // Handler may return 401 (no real auth) but NOT 400 (validation).
      const res = await sendJSON(app, '/auth/login', VALID_LOGIN)
      expect(res.status).not.toBe(400)
    })

    it('allows extra fields (looseObject)', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/auth/login', {
        ...VALID_LOGIN,
        extraField: 'should be ignored',
      })
      // looseObject means extra fields are stripped, not rejected
      expect(res.status).not.toBe(400)
    })
  })

  // -----------------------------------------------------------------------
  // POST /auth/bootstrap
  // -----------------------------------------------------------------------
  describe('POST /auth/bootstrap', () => {
    const VALID_BOOTSTRAP = {
      pubkey: VALID_PUBKEY,
      timestamp: Date.now(),
      token: 'bootstrap-token',
    }

    it('rejects empty body', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/auth/bootstrap', {})
      expect(res.status).toBe(400)
    })

    it('rejects missing pubkey', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/auth/bootstrap', {
        timestamp: Date.now(),
        token: 'abc',
      })
      expect(res.status).toBe(400)
    })

    it('rejects pubkey that is too short', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/auth/bootstrap', {
        ...VALID_BOOTSTRAP,
        pubkey: 'abc123',
      })
      expect(res.status).toBe(400)
    })

    it('accepts valid bootstrap body', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/auth/bootstrap', VALID_BOOTSTRAP)
      expect(res.status).not.toBe(400)
    })
  })

  // -----------------------------------------------------------------------
  // profileUpdateBodySchema (direct schema test — /me/* has internal auth)
  // -----------------------------------------------------------------------
  describe('profileUpdateBodySchema', () => {
    it('rejects name that is too long', () => {
      const result = profileUpdateBodySchema.safeParse({ name: 'x'.repeat(201) })
      expect(result.success).toBe(false)
    })

    it('rejects empty name string', () => {
      const result = profileUpdateBodySchema.safeParse({ name: '' })
      expect(result.success).toBe(false)
    })

    it('rejects invalid callPreference enum', () => {
      const result = profileUpdateBodySchema.safeParse({ callPreference: 'carrier-pigeon' })
      expect(result.success).toBe(false)
    })

    it('rejects spokenLanguages with items that are too long', () => {
      const result = profileUpdateBodySchema.safeParse({ spokenLanguages: ['this-is-way-too-long'] })
      expect(result.success).toBe(false)
    })

    it('accepts valid profile update', () => {
      const result = profileUpdateBodySchema.safeParse({
        name: 'Alice',
        callPreference: 'browser',
        spokenLanguages: ['en', 'es'],
      })
      expect(result.success).toBe(true)
    })

    it('accepts empty body (all fields optional)', () => {
      const result = profileUpdateBodySchema.safeParse({})
      expect(result.success).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // availabilityBodySchema (direct schema test)
  // -----------------------------------------------------------------------
  describe('availabilityBodySchema', () => {
    it('rejects missing onBreak field', () => {
      const result = availabilityBodySchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('rejects onBreak as string', () => {
      const result = availabilityBodySchema.safeParse({ onBreak: 'yes' })
      expect(result.success).toBe(false)
    })

    it('accepts valid availability', () => {
      const result = availabilityBodySchema.safeParse({ onBreak: true })
      expect(result.success).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // transcriptionToggleBodySchema (direct schema test)
  // -----------------------------------------------------------------------
  describe('transcriptionToggleBodySchema', () => {
    it('rejects missing enabled field', () => {
      const result = transcriptionToggleBodySchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('rejects enabled as number', () => {
      const result = transcriptionToggleBodySchema.safeParse({ enabled: 1 })
      expect(result.success).toBe(false)
    })

    it('accepts valid transcription toggle', () => {
      const result = transcriptionToggleBodySchema.safeParse({ enabled: false })
      expect(result.success).toBe(true)
    })
  })
})
