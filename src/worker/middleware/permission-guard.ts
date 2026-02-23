import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'
import { permissionGranted } from '../../shared/permissions'

/**
 * Middleware that requires the authenticated user to have ALL specified permissions.
 * Replaces adminGuard and roleGuard with fine-grained permission checks.
 *
 * Usage:
 *   app.get('/api/audit', requirePermission('audit:read'), handler)
 *   app.post('/api/shifts', requirePermission('shifts:create'), handler)
 *   app.get('/api/settings/spam', requirePermission('settings:read', 'settings:manage-spam'), handler)
 */
export function requirePermission(...required: string[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const permissions = c.get('permissions')
    for (const perm of required) {
      if (!permissionGranted(permissions, perm)) {
        return c.json({ error: 'Forbidden', required: perm }, 403)
      }
    }
    await next()
  })
}

/**
 * Check if the current user has a specific permission.
 * Useful for inline checks within route handlers.
 */
export function checkPermission(permissions: string[], required: string): boolean {
  return permissionGranted(permissions, required)
}
