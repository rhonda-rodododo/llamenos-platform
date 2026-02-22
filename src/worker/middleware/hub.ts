import type { Context, Next } from 'hono'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
import { permissionGranted, resolveHubPermissions } from '../../shared/permissions'

/**
 * Hub middleware: extracts hubId from URL params, validates the user
 * has access to the hub, and sets hub context on the request.
 */
export async function hubContext(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const hubId = c.req.param('hubId')
  if (!hubId) {
    return c.json({ error: 'Hub ID required' }, 400)
  }

  const volunteer = c.get('volunteer')
  const allRoles = c.get('allRoles')

  // Verify hub exists
  const dos = getDOs(c.env)
  const hubRes = await dos.settings.fetch(new Request(`http://do/settings/hub/${hubId}`))
  if (!hubRes.ok) {
    return c.json({ error: 'Hub not found' }, 404)
  }

  // Resolve hub-scoped permissions
  const hubPermissions = resolveHubPermissions(
    volunteer.roles,
    volunteer.hubRoles || [],
    allRoles,
    hubId,
  )

  // Must have at least one permission in this hub (or be super admin)
  if (hubPermissions.length === 0) {
    return c.json({ error: 'Access denied' }, 403)
  }

  c.set('hubId', hubId)
  c.set('hubPermissions', hubPermissions)

  await next()
}

/**
 * Check if user has a specific permission in the current hub context.
 */
export function checkHubPermission(hubPermissions: string[], required: string): boolean {
  return permissionGranted(hubPermissions, required)
}

/**
 * Middleware that requires the user to have specific permissions in the current hub.
 * Must be used after hubContext middleware.
 */
export function requireHubPermission(...required: string[]) {
  return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
    const hubPermissions = c.get('hubPermissions')
    if (!hubPermissions) {
      return c.json({ error: 'Hub context required' }, 400)
    }
    for (const perm of required) {
      if (!permissionGranted(hubPermissions, perm)) {
        return c.json({ error: 'Insufficient permissions' }, 403)
      }
    }
    await next()
  }
}
