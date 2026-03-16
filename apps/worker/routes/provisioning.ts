import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
import { auth } from '../middleware/auth'
import { checkRateLimit } from '../lib/helpers'
import { hashIP } from '../lib/crypto'
import { publicErrors, authErrors } from '../openapi/helpers'
import { createRoomBodySchema, roomPayloadBodySchema } from '@protocol/schemas/provisioning'

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

// Create provisioning room (public — new device has no auth yet)
provisioning.post('/rooms',
  describeRoute({
    tags: ['Provisioning'],
    summary: 'Create a device provisioning room',
    responses: {
      200: { description: 'Room created with ID and token' },
      ...publicErrors,
    },
  }),
  validator('json', createRoomBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const body = c.req.valid('json')
    return dos.identity.fetch(new Request('http://do/provision/rooms', {
      method: 'POST',
      body: JSON.stringify({ ephemeralPubkey: body.ephemeralPubkey }),
    }))
  })

// Get room status (public — new device polls this, rate limited)
provisioning.get('/rooms/:id',
  describeRoute({
    tags: ['Provisioning'],
    summary: 'Poll provisioning room status',
    responses: {
      ...publicErrors,
      200: { description: 'Room status and optional encrypted payload' },
      400: { description: 'Missing token' },
      429: { description: 'Rate limited' },
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    const clientIp = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
    const limited = await checkRateLimit(dos.settings, `provision:${hashIP(clientIp, c.env.HMAC_SECRET)}`, 30)
    if (limited) return c.json({ error: 'Rate limited' }, 429)
    const id = c.req.param('id')
    const token = c.req.query('token')
    if (!token) return c.json({ error: 'Missing token' }, 400)
    return dos.identity.fetch(new Request(`http://do/provision/rooms/${id}?token=${token}`))
  })

// Send encrypted payload (authenticated — primary device)
provisioning.post('/rooms/:id/payload', auth,
  describeRoute({
    tags: ['Provisioning'],
    summary: 'Send encrypted provisioning payload to room',
    responses: {
      200: { description: 'Payload delivered' },
      ...authErrors,
    },
  }),
  validator('json', roomPayloadBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const id = c.req.param('id')
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    return dos.identity.fetch(new Request(`http://do/provision/rooms/${id}/payload`, {
      method: 'POST',
      body: JSON.stringify({ ...body, senderPubkey: pubkey }),
    }))
  })

export default provisioning
