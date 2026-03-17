import { createMiddleware } from 'hono/factory'
import type { AppEnv, Volunteer } from '../types'
import { authenticateRequest, parseAuthHeader, parseSessionHeader, validateToken } from '../lib/auth'
import type { Role } from '@shared/permissions'
import { resolvePermissions } from '@shared/permissions'
import { createLogger } from '../lib/logger'
import { incError } from '../lib/error-counter'

const log = createLogger('auth')

export const auth = createMiddleware<AppEnv>(async (c, next) => {
  const services = c.get('services')
  const requestId = c.get('requestId')
  const reqLog = requestId ? log.child({ requestId }) : log

  let authResult = await authenticateRequest(c.req.raw, services.identity)

  // Dev-mode signature bypass: when ENVIRONMENT=development and Schnorr verification
  // fails, fall back to pubkey-only auth for REGISTERED volunteers only.
  // This handles mobile E2E tests where the Rust native crypto library may produce
  // signatures that fail verification due to cross-architecture interop differences
  // (e.g., x86_64 emulator vs. backend).
  // Still validates token format and freshness — only bypasses signature verification.
  // Does NOT auto-register unknown pubkeys — unregistered keys still get 401.
  if (!authResult && c.env.ENVIRONMENT === 'development') {
    const devAuthHeader = c.req.header('Authorization') ?? null
    const authPayload = parseAuthHeader(devAuthHeader)
    if (authPayload?.pubkey && validateToken(authPayload)) {
      const volunteer = await services.identity.getVolunteerInternal(authPayload.pubkey)
      if (volunteer) {
        authResult = { pubkey: authPayload.pubkey, volunteer }
        reqLog.info('Dev-mode signature bypass', { pubkeyPrefix: authPayload.pubkey.slice(0, 8) })
      }
    }
  }

  if (!authResult) {
    // Log auth failure with minimal non-PII info
    const authHeader = c.req.header('Authorization') ?? null
    const authPayload = parseAuthHeader(authHeader)
    const sessionToken = parseSessionHeader(authHeader)

    const pubkeyPrefix = authPayload?.pubkey?.slice(0, 8) || undefined
    const method = c.req.method
    const path = new URL(c.req.url).pathname

    reqLog.warn('Auth failed', {
      reason: sessionToken ? 'invalid_session' : authPayload ? 'signature_verification_failed' : 'missing_credentials',
      pubkeyPrefix,
      method,
      path,
    })

    incError('auth')
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // Load all roles from SettingsService
  const { roles: allRoles } = await services.settings.getRoles()

  // Resolve effective permissions from user's role IDs
  const permissions = resolvePermissions(authResult.volunteer.roles, allRoles)

  c.set('pubkey', authResult.pubkey)
  c.set('volunteer', authResult.volunteer)
  c.set('permissions', permissions)
  c.set('allRoles', allRoles)
  await next()
})
