import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'
import { authenticateRequest } from '../lib/auth'
import { getDOs } from '../lib/do-access'
import type { Role } from '../../shared/permissions'
import { resolvePermissions } from '../../shared/permissions'

export const auth = createMiddleware<AppEnv>(async (c, next) => {
  const dos = getDOs(c.env)
  const authResult = await authenticateRequest(c.req.raw, dos.identity)
  if (!authResult) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // Load all roles from SettingsDO (cached per-request)
  const rolesRes = await dos.settings.fetch(new Request('http://do/settings/roles'))
  const allRoles: Role[] = rolesRes.ok ? ((await rolesRes.json()) as any).roles : []

  // Resolve effective permissions from user's role IDs
  const permissions = resolvePermissions(authResult.volunteer.roles, allRoles)

  c.set('pubkey', authResult.pubkey)
  c.set('volunteer', authResult.volunteer)
  c.set('permissions', permissions)
  c.set('allRoles', allRoles)
  await next()
})
