/**
 * Device registration API routes.
 *
 * GET    /api/devices         — List current user's registered devices.
 * POST   /api/devices/register — Register/update device (push token + Phase 6 crypto keys).
 * DELETE /api/devices/:id     — Deregister a specific device (triggers PUK rotation).
 * DELETE /api/devices         — Remove all devices for current user (logout).
 */

import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { authErrors } from '../openapi/helpers'
import { registerDeviceBodySchema, voipTokenBodySchema, deviceListResponseSchema } from '@protocol/schemas/devices'

const devicesRoutes = new Hono<AppEnv>()

/**
 * GET /api/devices
 * List all registered devices for the authenticated user.
 */
devicesRoutes.get('/',
  describeRoute({
    tags: ['Devices'],
    summary: 'List registered devices',
    responses: {
      200: {
        description: 'List of registered devices',
        content: {
          'application/json': {
            schema: resolver(deviceListResponseSchema),
          },
        },
      },
      ...authErrors,
    },
  }),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    const deviceList = await services.identity.listDevices(pubkey)
    return c.json({
      devices: deviceList.map(d => ({
        id: d.id,
        platform: d.platform,
        wakeKeyPublic: d.wakeKeyPublic,
        ed25519Pubkey: d.ed25519Pubkey,
        x25519Pubkey: d.x25519Pubkey,
        registeredAt: d.registeredAt.toISOString(),
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      })),
    })
  })

/**
 * POST /api/devices/register
 * Register or update a device push token for the authenticated volunteer.
 * Also accepts Phase 6 per-device crypto keys (ed25519Pubkey, x25519Pubkey).
 */
devicesRoutes.post('/register',
  describeRoute({
    tags: ['Devices'],
    summary: 'Register or update device push token and crypto keys',
    responses: {
      204: { description: 'Device registered' },
      500: { description: 'Failed to register device' },
      ...authErrors,
    },
  }),
  validator('json', registerDeviceBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')

    await services.identity.registerDevice(pubkey, {
      platform: body.platform,
      pushToken: body.pushToken,
      wakeKeyPublic: body.wakeKeyPublic,
      ed25519Pubkey: body.ed25519Pubkey,
      x25519Pubkey: body.x25519Pubkey,
    })

    return c.body(null, 204)
  })

/**
 * DELETE /api/devices/:id
 * Deregister a specific device. Device must belong to the authenticated user.
 * Callers should trigger PUK rotation after deregistering a device.
 */
devicesRoutes.delete('/:id',
  describeRoute({
    tags: ['Devices'],
    summary: 'Deregister a specific device',
    responses: {
      204: { description: 'Device deregistered' },
      404: { description: 'Device not found or not owned by caller' },
      ...authErrors,
    },
  }),
  async (c) => {
    const pubkey = c.get('pubkey')
    const deviceId = c.req.param('id')
    const services = c.get('services')

    const deleted = await services.identity.deleteDeviceById(pubkey, deviceId)
    if (!deleted) return c.json({ error: 'Device not found' }, 404)
    return c.body(null, 204)
  })

/**
 * POST /api/devices/voip-token
 * Register a VoIP-specific push token (PushKit on iOS, FCM on Android).
 * Stored separately from regular push tokens — used for high-priority call dispatch.
 */
devicesRoutes.post('/voip-token',
  describeRoute({
    tags: ['Devices'],
    summary: 'Register VoIP push token',
    responses: {
      204: { description: 'VoIP token registered' },
      500: { description: 'Failed to register VoIP token' },
      ...authErrors,
    },
  }),
  validator('json', voipTokenBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')

    await services.identity.registerVoipToken(pubkey, {
      platform: body.platform,
      voipToken: body.voipToken,
    })

    return c.body(null, 204)
  })

/**
 * DELETE /api/devices/voip-token
 * Unregister VoIP push token for the current user.
 */
devicesRoutes.delete('/voip-token',
  describeRoute({
    tags: ['Devices'],
    summary: 'Unregister VoIP push token',
    responses: {
      204: { description: 'VoIP token removed' },
      ...authErrors,
    },
  }),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')

    await services.identity.deleteVoipToken(pubkey)

    return c.body(null, 204)
  })

/**
 * DELETE /api/devices
 * Remove all registered devices for the current user (called on logout).
 */
devicesRoutes.delete('/',
  describeRoute({
    tags: ['Devices'],
    summary: 'Remove all registered devices',
    responses: {
      204: { description: 'All devices removed' },
      ...authErrors,
    },
  }),
  async (c) => {
    const pubkey = c.get('pubkey')
    const services = c.get('services')

    await services.identity.deleteAllDevices(pubkey)

    return c.body(null, 204)
  })

export default devicesRoutes
