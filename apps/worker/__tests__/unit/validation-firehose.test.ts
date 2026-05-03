/**
 * OpenAPI request validation tests for firehose routes.
 *
 * Tests the newly added validator() middleware for firehose connection
 * create and update routes.
 */
import { describe, it, expect } from 'bun:test'
import firehoseRoutes from '../../routes/firehose'
import {
  createTestApp,
  sendJSON,
} from '../helpers/openapi-validation'

function createApp() {
  return createTestApp({
    prefix: '/firehose',
    routes: firehoseRoutes,
    authenticated: true,
  })
}

describe('firehose route validation', () => {
  // -----------------------------------------------------------------------
  // POST /firehose (create connection)
  // -----------------------------------------------------------------------
  describe('POST /firehose', () => {
    const VALID_CONNECTION = {
      reportTypeId: 'report-type-1',
    }

    it('rejects empty body', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/firehose', {})
      expect(res.status).toBe(400)
    })

    it('rejects missing reportTypeId', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/firehose', {
        displayName: 'Test Connection',
      })
      expect(res.status).toBe(400)
    })

    it('rejects extractionIntervalSec below minimum (30)', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/firehose', {
        ...VALID_CONNECTION,
        extractionIntervalSec: 10,
      })
      expect(res.status).toBe(400)
    })

    it('rejects extractionIntervalSec above maximum (300)', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/firehose', {
        ...VALID_CONNECTION,
        extractionIntervalSec: 600,
      })
      expect(res.status).toBe(400)
    })

    it('rejects bufferTtlDays below minimum (1)', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/firehose', {
        ...VALID_CONNECTION,
        bufferTtlDays: 0,
      })
      expect(res.status).toBe(400)
    })

    it('rejects bufferTtlDays above maximum (30)', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/firehose', {
        ...VALID_CONNECTION,
        bufferTtlDays: 31,
      })
      expect(res.status).toBe(400)
    })

    it('rejects invalid inferenceEndpoint URL', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/firehose', {
        ...VALID_CONNECTION,
        inferenceEndpoint: 'not-a-url',
      })
      expect(res.status).toBe(400)
    })

    it('rejects systemPromptSuffix that is too long', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/firehose', {
        ...VALID_CONNECTION,
        systemPromptSuffix: 'x'.repeat(2001),
      })
      expect(res.status).toBe(400)
    })

    it('rejects geoContextCountryCodes with wrong length', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/firehose', {
        ...VALID_CONNECTION,
        geoContextCountryCodes: ['USA'],
      })
      expect(res.status).toBe(400)
    })

    it('accepts valid connection creation', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/firehose', VALID_CONNECTION)
      expect(res.status).not.toBe(400)
    })

    it('accepts connection with all optional fields', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/firehose', {
        ...VALID_CONNECTION,
        displayName: 'Full Connection',
        geoContext: 'Atlanta, GA',
        geoContextCountryCodes: ['US'],
        inferenceEndpoint: 'https://api.example.com/v1',
        extractionIntervalSec: 60,
        systemPromptSuffix: 'Extra context',
        bufferTtlDays: 7,
        notifyViaSignal: true,
      })
      expect(res.status).not.toBe(400)
    })
  })

  // -----------------------------------------------------------------------
  // PATCH /firehose/:id (update connection)
  // -----------------------------------------------------------------------
  describe('PATCH /firehose/:id', () => {
    it('rejects invalid status enum', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/firehose/conn-1', {
        status: 'deleted',
      }, 'PATCH')
      expect(res.status).toBe(400)
    })

    it('accepts valid status values', async () => {
      const app = createApp()
      for (const status of ['active', 'paused', 'disabled']) {
        const res = await sendJSON(app, '/firehose/conn-1', { status }, 'PATCH')
        expect(res.status).not.toBe(400)
      }
    })

    it('accepts empty body (all fields optional)', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/firehose/conn-1', {}, 'PATCH')
      expect(res.status).not.toBe(400)
    })

    it('rejects extractionIntervalSec out of range', async () => {
      const app = createApp()
      const res = await sendJSON(app, '/firehose/conn-1', {
        extractionIntervalSec: 5,
      }, 'PATCH')
      expect(res.status).toBe(400)
    })
  })
})
