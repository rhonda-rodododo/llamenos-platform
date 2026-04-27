/**
 * PUK (Pre-User Key) distribution routes — Phase 6 key management.
 *
 * POST /api/puk/envelopes           — Distribute PUK seed envelopes after rotation.
 * GET  /api/puk/envelopes/:deviceId — Fetch the latest PUK envelope for a device.
 */
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import type { AppEnv } from '../types'
import { authErrors } from '../openapi/helpers'

const pukRoutes = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const pukEnvelopeItemSchema = z.object({
  deviceId: z.string().min(1),
  generation: z.number().int().nonnegative(),
  /**
   * HPKE-encrypted PUK seed envelope.
   * Encoding: base64url(kem_output || ciphertext)
   */
  envelope: z.string().min(1),
})

const distributePukBodySchema = z.object({
  envelopes: z.array(pukEnvelopeItemSchema).min(1, 'At least one envelope required'),
})

const pukEnvelopeResponseSchema = z.object({
  id: z.string(),
  userPubkey: z.string(),
  deviceId: z.string(),
  generation: z.number(),
  envelope: z.string(),
  createdAt: z.string(),
})

const distributeResponseSchema = z.object({
  distributed: z.number(),
  envelopes: z.array(pukEnvelopeResponseSchema),
})

// ---------------------------------------------------------------------------
// POST /api/puk/envelopes
// ---------------------------------------------------------------------------

pukRoutes.post('/envelopes',
  describeRoute({
    tags: ['PUK'],
    summary: 'Distribute PUK seed envelopes to devices',
    description: [
      'Called after a PUK epoch rotation.',
      'The caller provides one HPKE-encrypted envelope per registered device.',
      'Each device decrypts its own envelope using its X25519 private key.',
      'The server stores envelopes keyed by (deviceId, generation).',
    ].join(' '),
    responses: {
      201: {
        description: 'Envelopes stored',
        content: {
          'application/json': {
            schema: resolver(distributeResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  validator('json', distributePukBodySchema),
  async (c) => {
    const userPubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')

    const stored = await services.cryptoKeys.distributePukEnvelopes(
      userPubkey,
      body.envelopes,
    )

    return c.json({ distributed: stored.length, envelopes: stored }, 201)
  },
)

// ---------------------------------------------------------------------------
// GET /api/puk/envelopes/:deviceId
// ---------------------------------------------------------------------------

pukRoutes.get('/envelopes/:deviceId',
  describeRoute({
    tags: ['PUK'],
    summary: 'Fetch the latest PUK envelope for a specific device',
    description: [
      'Returns the highest-generation PUK envelope stored for this device.',
      'Only the device owner (authenticated user) may fetch their own envelopes.',
    ].join(' '),
    responses: {
      200: {
        description: 'PUK envelope for the device',
        content: {
          'application/json': {
            schema: resolver(pukEnvelopeResponseSchema),
          },
        },
      },
      404: { description: 'No envelope found for this device' },
      ...authErrors,
    },
  }),
  async (c) => {
    const userPubkey = c.get('pubkey')
    const deviceId = c.req.param('deviceId')
    const services = c.get('services')

    const envelope = await services.cryptoKeys.getPukEnvelopeForDevice(
      userPubkey,
      deviceId,
    )

    if (!envelope) {
      return c.json({ error: 'No PUK envelope found for this device' }, 404)
    }

    return c.json(envelope)
  },
)

export default pukRoutes
