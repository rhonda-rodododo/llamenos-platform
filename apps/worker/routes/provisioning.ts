import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { auth } from '../middleware/auth'
import { rateLimit } from '../middleware/rate-limit'
import { publicErrors, authErrors } from '../openapi/helpers'
import { okResponseSchema } from '@protocol/schemas/common'
import { createRoomBodySchema, roomPayloadBodySchema, provisionRoomResponseSchema, provisionRoomStatusResponseSchema } from '@protocol/schemas/provisioning'

const provisioning = new Hono<AppEnv>()

/**
 * Device provisioning relay — enables Signal-style device linking.
 *
 * Protocol:
 * 1. New device: POST /rooms → creates room with ephemeral pubkey
 * 2. New device: displays QR/code with { roomId, token }
 * 3. Primary device (authenticated): POST /rooms/:id/payload → sends encrypted nsec
 * 4. New device: GET /rooms/:id → polls for encrypted payload
 */

// Per-room brute-force protection: max 3 token presentations per room per 10-minute window.
const PROVISION_ROOM_MAX_GUESSES = 3
const PROVISION_ROOM_WINDOW_MS = 10 * 60 * 1000

// Create provisioning room (public — new device has no auth yet)
provisioning.post('/rooms',
  describeRoute({
    tags: ['Provisioning'],
    summary: 'Create a device provisioning room',
    responses: {
      200: {
        description: 'Room created with ID and token',
        content: {
          'application/json': {
            schema: resolver(provisionRoomResponseSchema),
          },
        },
      },
      429: { description: 'Rate limit exceeded' },
      ...publicErrors,
    },
  }),
  rateLimit('strict'),
  validator('json', createRoomBodySchema),
  async (c) => {
    const services = c.get('services')
    const body = c.req.valid('json')
    const result = await services.identity.createProvisionRoom(body.ephemeralPubkey)
    return c.json(result)
  })

// Get room status (public — new device polls this, rate limited)
provisioning.get('/rooms/:id',
  describeRoute({
    tags: ['Provisioning'],
    summary: 'Poll provisioning room status',
    responses: {
      ...publicErrors,
      200: {
        description: 'Room status and optional encrypted payload',
        content: {
          'application/json': {
            schema: resolver(provisionRoomStatusResponseSchema),
          },
        },
      },
      400: { description: 'Missing token' },
      429: { description: 'Rate limited' },
    },
  }),
  rateLimit('strict'),
  async (c) => {
    const services = c.get('services')
    const id = c.req.param('id')
    const token = c.req.query('token')
    if (!token) return c.json({ error: 'Missing token' }, 400)

    // Per-room brute-force protection: cap token presentations per room to prevent
    // enumeration attacks even from different IPs.
    const roomLimit = await services.settings.checkApiRateLimit(
      `provision:room:${id}`,
      PROVISION_ROOM_MAX_GUESSES,
      PROVISION_ROOM_WINDOW_MS,
    )
    if (roomLimit.limited) {
      c.header('Retry-After', String(roomLimit.retryAfterSeconds))
      return c.json({ error: 'Rate limited' }, 429)
    }

    const result = await services.identity.getProvisionRoom(id, token)
    return c.json(result)
  })

// Send encrypted payload (authenticated — primary device)
provisioning.post('/rooms/:id/payload', auth, rateLimit('write'),
  describeRoute({
    tags: ['Provisioning'],
    summary: 'Send encrypted provisioning payload to room',
    responses: {
      200: {
        description: 'Payload delivered',
        content: {
          'application/json': {
            schema: resolver(okResponseSchema),
          },
        },
      },
      429: { description: 'Rate limit exceeded' },
      ...authErrors,
    },
  }),
  validator('json', roomPayloadBodySchema),
  async (c) => {
    const services = c.get('services')
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    await services.identity.setProvisionPayload(id, { ...body, senderPubkey: pubkey })
    return c.json({ ok: true })
  })

export default provisioning
