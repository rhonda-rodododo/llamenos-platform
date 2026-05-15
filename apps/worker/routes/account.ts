/**
 * Account management API routes.
 *
 * POST /api/account/lockdown          — Emergency lockdown (terminate all sessions, signal PUK + hub key rotation).
 * POST /api/account/lockdown/complete — Client reports completion of lockdown key rotations.
 */

import { Hono } from 'hono'
import { validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { lockdownCompleteBodySchema } from '@protocol/schemas/devices'

const accountRoutes = new Hono<AppEnv>()

/**
 * POST /api/account/lockdown
 * Emergency lockdown: terminate all other sessions, return hub IDs for key rotation.
 * Requires elevated auth (fresh PIN or WebAuthn assertion).
 */
accountRoutes.post('/lockdown', async (c) => {
  const pubkey = c.get('pubkey')
  const currentToken = c.get('sessionToken')
  const services = c.get('services')

  // Terminate all sessions except current
  const terminated = await services.identity.terminateOtherSessions(pubkey, currentToken ?? '')

  // Get user's hub memberships
  const hubIds = await services.identity.getUserHubIds(pubkey)

  // Emit security event
  await services.identity.emitSecurityEvent(pubkey, 'account_lockdown', null, {
    sessionsTerminated: terminated,
    hubCount: hubIds.length,
  })

  return c.json({ sessionsTerminated: terminated, hubIds })
})

/**
 * POST /api/account/lockdown/complete
 * Client reports completion of PUK rotation and hub key rotations.
 */
accountRoutes.post('/lockdown/complete',
  validator('json', lockdownCompleteBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const body = c.req.valid('json')
    const services = c.get('services')

    await services.identity.emitSecurityEvent(pubkey, 'account_lockdown_complete', null, {
      pukRotated: body.pukRotated,
      hubKeysRotated: body.hubKeysRotated,
      hubKeysFailed: body.hubKeysFailed,
    })

    return c.json({ ok: true })
  })

export default accountRoutes
