/**
 * OpenAPI request validation tests for user routes.
 *
 * Validates user creation (admin), user updates, and Epic 340 profile
 * extension fields (specializations, maxCaseAssignments, teamId, supervisorPubkey).
 */
import { describe, it, expect } from 'vitest'
import usersRoutes from '../../routes/users'
import {
  createTestApp,
  sendJSON,
  VALID_PUBKEY,
  VALID_PUBKEY_2,
} from '../helpers/openapi-validation'

function createApp() {
  return createTestApp({
    prefix: '/users',
    routes: usersRoutes,
    authenticated: true,
  })
}

describe('users route validation', () => {
  // -----------------------------------------------------------------------
  // POST /users (create user — admin)
  // -----------------------------------------------------------------------
  describe('POST /users', () => {
    const VALID_USER = {
      pubkey: VALID_PUBKEY_2,
      name: 'New Volunteer',
      phone: '+12125551234',
    }

    it('rejects empty body', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/users', {})
      expect(res.status).toBe(400)
    })

    it('rejects missing pubkey', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/users', {
        name: 'Test',
        phone: '+1234',
      })
      expect(res.status).toBe(400)
    })

    it('rejects invalid pubkey', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/users', {
        ...VALID_USER,
        pubkey: 'short',
      })
      expect(res.status).toBe(400)
    })

    it('rejects empty name', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/users', {
        ...VALID_USER,
        name: '',
      })
      expect(res.status).toBe(400)
    })

    it('rejects name that is too long', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/users', {
        ...VALID_USER,
        name: 'x'.repeat(201),
      })
      expect(res.status).toBe(400)
    })

    it('rejects negative maxCaseAssignments', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/users', {
        ...VALID_USER,
        maxCaseAssignments: -1,
      })
      expect(res.status).toBe(400)
    })

    it('rejects fractional maxCaseAssignments', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/users', {
        ...VALID_USER,
        maxCaseAssignments: 2.5,
      })
      expect(res.status).toBe(400)
    })

    it('rejects invalid supervisorPubkey', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/users', {
        ...VALID_USER,
        supervisorPubkey: 'invalid',
      })
      expect(res.status).toBe(400)
    })

    it('rejects specialization string that is too long', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/users', {
        ...VALID_USER,
        specializations: ['x'.repeat(101)],
      })
      expect(res.status).toBe(400)
    })

    it('accepts valid user creation', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/users', VALID_USER)
      expect(res.status).not.toBe(400)
    })

    it('accepts user with all Epic 340 fields', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/users', {
        ...VALID_USER,
        specializations: ['immigration', 'legal_observer'],
        maxCaseAssignments: 10,
        teamId: 'team-alpha',
        supervisorPubkey: VALID_PUBKEY,
      })
      expect(res.status).not.toBe(400)
    })
  })

  // -----------------------------------------------------------------------
  // PATCH /users/:pubkey (admin update user)
  // -----------------------------------------------------------------------
  describe('PATCH /users/:pubkey', () => {
    it('rejects invalid callPreference enum', async () => {
      const app = createApp()
      const res = await sendJSON(app, `/users/${VALID_PUBKEY_2}`, {
        callPreference: 'invalid',
      }, 'PATCH')
      expect(res.status).toBe(400)
    })

    it('accepts valid admin update', async () => {
      const app = createApp()
      const res = await sendJSON(app, `/users/${VALID_PUBKEY_2}`, {
        name: 'Updated Name',
        active: false,
        roles: ['role-volunteer'],
      }, 'PATCH')
      expect(res.status).not.toBe(400)
    })

    it('accepts empty body (all fields optional)', async () => {
      const app = createApp()
      const res = await sendJSON(app, `/users/${VALID_PUBKEY_2}`, {}, 'PATCH')
      expect(res.status).not.toBe(400)
    })
  })
})
