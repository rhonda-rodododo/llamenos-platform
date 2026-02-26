/**
 * Device registration API routes (Epic 86).
 *
 * POST /api/devices/register — Register/update device push token.
 * DELETE /api/devices — Remove all devices for current user.
 */

import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'

const devicesRoutes = new Hono<AppEnv>()

/**
 * POST /api/devices/register
 * Register or update a device push token for the authenticated volunteer.
 */
devicesRoutes.post('/register', async (c) => {
  const pubkey = c.get('pubkey')
  const body = await c.req.json<{
    platform: 'ios' | 'android'
    pushToken: string
    wakeKeyPublic: string
  }>()

  if (!body.platform || !body.pushToken || !body.wakeKeyPublic) {
    return c.json({ error: 'Missing required fields: platform, pushToken, wakeKeyPublic' }, 400)
  }

  if (body.platform !== 'ios' && body.platform !== 'android') {
    return c.json({ error: 'platform must be "ios" or "android"' }, 400)
  }

  // Validate wakeKeyPublic is a valid hex secp256k1 compressed pubkey (66 chars = 02/03 + 32 bytes)
  if (!/^0[23][0-9a-f]{64}$/i.test(body.wakeKeyPublic)) {
    return c.json({ error: 'Invalid wakeKeyPublic: must be 33-byte compressed secp256k1 pubkey in hex' }, 400)
  }

  const dos = getDOs(c.env)
  const res = await dos.identity.fetch(
    new Request(`http://do/devices/${pubkey}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: body.platform,
        pushToken: body.pushToken,
        wakeKeyPublic: body.wakeKeyPublic,
      }),
    }),
  )

  if (!res.ok) {
    return c.json({ error: 'Failed to register device' }, 500)
  }

  return c.body(null, 204)
})

/**
 * POST /api/devices/voip-token
 * Register a VoIP-specific push token (PushKit on iOS, FCM on Android).
 * Stored separately from regular push tokens — used for high-priority call dispatch.
 */
devicesRoutes.post('/voip-token', async (c) => {
  const pubkey = c.get('pubkey')
  const body = await c.req.json<{
    platform: 'ios' | 'android'
    voipToken: string
  }>()

  if (!body.platform || !body.voipToken) {
    return c.json({ error: 'Missing required fields: platform, voipToken' }, 400)
  }

  const dos = getDOs(c.env)
  const res = await dos.identity.fetch(
    new Request(`http://do/devices/${pubkey}/voip-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: body.platform,
        voipToken: body.voipToken,
      }),
    }),
  )

  if (!res.ok) {
    return c.json({ error: 'Failed to register VoIP token' }, 500)
  }

  return c.body(null, 204)
})

/**
 * DELETE /api/devices/voip-token
 * Unregister VoIP push token for the current user.
 */
devicesRoutes.delete('/voip-token', async (c) => {
  const pubkey = c.get('pubkey')
  const dos = getDOs(c.env)

  await dos.identity.fetch(
    new Request(`http://do/devices/${pubkey}/voip-token`, { method: 'DELETE' }),
  )

  return c.body(null, 204)
})

/**
 * DELETE /api/devices
 * Remove all registered devices for the current user (called on logout).
 */
devicesRoutes.delete('/', async (c) => {
  const pubkey = c.get('pubkey')
  const dos = getDOs(c.env)

  await dos.identity.fetch(
    new Request(`http://do/devices/${pubkey}`, { method: 'DELETE' }),
  )

  return c.body(null, 204)
})

export default devicesRoutes
