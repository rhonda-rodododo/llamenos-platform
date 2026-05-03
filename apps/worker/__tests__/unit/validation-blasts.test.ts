/**
 * OpenAPI request validation tests for blast routes.
 *
 * Validates blast creation, scheduling, subscriber imports, and
 * blast settings updates.
 */
import { describe, it, expect } from 'vitest'
import blastsRoutes from '../../routes/blasts'
import {
  createTestApp,
  sendJSON,
} from '../helpers/openapi-validation'

function createApp() {
  return createTestApp({
    prefix: '/blasts',
    routes: blastsRoutes,
    authenticated: true,
  })
}

describe('blasts route validation', () => {
  // -----------------------------------------------------------------------
  // POST /blasts (create blast)
  // -----------------------------------------------------------------------
  describe('POST /blasts', () => {
    const VALID_BLAST = {
      name: 'Emergency Alert',
      content: { body: 'Urgent message to all subscribers' },
      channels: ['sms'],
    }

    it('rejects empty body', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts', {})
      expect(res.status).toBe(400)
    })

    it('rejects empty name', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts', {
        ...VALID_BLAST,
        name: '',
      })
      expect(res.status).toBe(400)
    })

    it('rejects missing content.body', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts', {
        ...VALID_BLAST,
        content: {},
      })
      expect(res.status).toBe(400)
    })

    it('rejects empty content.body', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts', {
        ...VALID_BLAST,
        content: { body: '' },
      })
      expect(res.status).toBe(400)
    })

    it('rejects content.body that is too long', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts', {
        ...VALID_BLAST,
        content: { body: 'x'.repeat(1601) },
      })
      expect(res.status).toBe(400)
    })

    it('rejects empty channels array', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts', {
        ...VALID_BLAST,
        channels: [],
      })
      expect(res.status).toBe(400)
    })

    it('rejects invalid channel', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts', {
        ...VALID_BLAST,
        channels: ['email'],
      })
      expect(res.status).toBe(400)
    })

    it('accepts valid blast with all channels', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts', {
        ...VALID_BLAST,
        channels: ['sms', 'whatsapp', 'signal'],
      })
      expect(res.status).not.toBe(400)
    })

    it('accepts blast with scheduled date', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts', {
        ...VALID_BLAST,
        scheduledAt: '2026-06-01T12:00:00Z',
      })
      expect(res.status).not.toBe(400)
    })
  })

  // -----------------------------------------------------------------------
  // POST /blasts/:id/schedule (schedule blast)
  // -----------------------------------------------------------------------
  describe('POST /blasts/:id/schedule', () => {
    it('rejects empty body', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts/blast-1/schedule', {})
      expect(res.status).toBe(400)
    })

    it('rejects invalid datetime format', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts/blast-1/schedule', {
        scheduledAt: 'not-a-date',
      })
      expect(res.status).toBe(400)
    })

    it('accepts valid ISO datetime', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts/blast-1/schedule', {
        scheduledAt: '2026-06-01T12:00:00Z',
      })
      expect(res.status).not.toBe(400)
    })
  })

  // -----------------------------------------------------------------------
  // POST /blasts/subscribers/import (import subscribers)
  // -----------------------------------------------------------------------
  describe('POST /blasts/subscribers/import', () => {
    it('rejects empty body', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts/subscribers/import', {})
      expect(res.status).toBe(400)
    })

    it('rejects empty subscribers array', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts/subscribers/import', {
        subscribers: [],
      })
      expect(res.status).toBe(400)
    })

    it('rejects subscriber without identifier', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts/subscribers/import', {
        subscribers: [{ channel: 'sms' }],
      })
      expect(res.status).toBe(400)
    })

    it('rejects subscriber with invalid channel', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts/subscribers/import', {
        subscribers: [{
          identifier: '+12125551234',
          channel: 'email',
        }],
      })
      expect(res.status).toBe(400)
    })

    it('accepts valid subscriber import', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts/subscribers/import', {
        subscribers: [{
          identifier: '+12125551234',
          channel: 'sms',
          tags: ['vip'],
          language: 'en',
        }],
      })
      expect(res.status).not.toBe(400)
    })
  })

  // -----------------------------------------------------------------------
  // PATCH /blasts/settings (update blast settings)
  // -----------------------------------------------------------------------
  describe('PATCH /blasts/settings', () => {
    it('rejects maxBlastsPerDay less than 1', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts/settings', {
        maxBlastsPerDay: 0,
      }, 'PATCH')
      expect(res.status).toBe(400)
    })

    it('rejects maxBlastsPerDay greater than 100', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts/settings', {
        maxBlastsPerDay: 101,
      }, 'PATCH')
      expect(res.status).toBe(400)
    })

    it('accepts valid settings update', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts/settings', {
        subscribeKeyword: 'JOIN',
        maxBlastsPerDay: 10,
        doubleOptIn: true,
      }, 'PATCH')
      expect(res.status).not.toBe(400)
    })

    it('accepts empty body (all fields optional)', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/blasts/settings', {}, 'PATCH')
      expect(res.status).not.toBe(400)
    })
  })
})
