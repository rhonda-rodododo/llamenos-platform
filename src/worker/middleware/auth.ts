import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'
import { authenticateRequest } from '../lib/auth'
import { getDOs } from '../lib/do-access'

export const auth = createMiddleware<AppEnv>(async (c, next) => {
  const dos = getDOs(c.env)
  const authResult = await authenticateRequest(c.req.raw, dos.identity)
  if (!authResult) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  c.set('pubkey', authResult.pubkey)
  c.set('volunteer', authResult.volunteer)
  c.set('isAdmin', authResult.volunteer.role === 'admin')
  c.set('role', authResult.volunteer.role)
  await next()
})
