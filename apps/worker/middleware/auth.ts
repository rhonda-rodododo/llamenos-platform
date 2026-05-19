import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../types'
import { authenticateRequest, parseAuthHeader, parseSessionHeader, validateToken } from '../lib/auth'
import { resolvePermissions, permissionGranted } from '@shared/permissions'
import { createLogger } from '../lib/logger'
import { incError } from '../lib/error-counter'

const log = createLogger('auth')

export const auth = createMiddleware<AppEnv>(async (c, next) => {
  const services = c.get('services')
  const requestId = c.get('requestId')
  const reqLog = requestId ? log.child({ requestId }) : log

  let authResult = await authenticateRequest(c.req.raw, services.identity)

  // Store session token if session-based auth was used
  const authHeader = c.req.header('Authorization') ?? null
  const sessionToken = parseSessionHeader(authHeader)
  if (sessionToken) {
    c.set('sessionToken', sessionToken)
  }

  // Dev-mode signature bypass: explicit opt-in via DEV_AUTH_BYPASS=true env var.
  // Only active when ENVIRONMENT=development AND DEV_AUTH_BYPASS=true.
  // Handles mobile E2E tests where cross-architecture crypto may fail verification.
  // Still validates token format and freshness — only bypasses signature verification.
  // Does NOT auto-register unknown pubkeys — unregistered keys still get 401.
  if (!authResult && c.env.ENVIRONMENT === 'development' && c.env.DEV_AUTH_BYPASS === 'true') {
    const devAuthHeader = c.req.header('Authorization') ?? null
    const authPayload = parseAuthHeader(devAuthHeader)
    if (authPayload?.pubkey && validateToken(authPayload)) {
      const user = await services.identity.getUserInternal(authPayload.pubkey)
      if (user && user.active !== false) {
        authResult = { pubkey: authPayload.pubkey, user }
        reqLog.warn('DEV_AUTH_BYPASS active — signature verification skipped', {
          pubkeyPrefix: authPayload.pubkey.slice(0, 8),
        })
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
  const permissions = resolvePermissions(authResult.user.roles, allRoles)

  c.set('pubkey', authResult.pubkey)
  c.set('user', authResult.user)
  c.set('permissions', permissions)
  c.set('allRoles', allRoles)

  // WebAuthn enforcement: if enabled, require passkey registration
  const webauthnSettings = await services.identity.getWebAuthnSettings()
  const isAdmin = permissionGranted(permissions, 'settings:manage')
  const webauthnRequired = isAdmin ? webauthnSettings.requireForAdmins : webauthnSettings.requireForUsers

  if (webauthnRequired) {
    const { credentials } = await services.identity.getWebAuthnCredentials(authResult.pubkey)
    if (credentials.length === 0) {
      // Allow access to: GET /auth/me, WebAuthn routes, logout
      // Block everything else so the user can register a passkey
      const path = new URL(c.req.url).pathname
      const allowedPaths = ['/api/auth/me', '/api/auth/me/logout', '/api/webauthn']
      const isAllowed = allowedPaths.some(p => path.startsWith(p))
      if (!isAllowed) {
        return c.json({ error: 'WebAuthn registration required', code: 'WEBAUTHN_REQUIRED' }, 403)
      }
    }
  }

  await next()
})
