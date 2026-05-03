import { createHmac, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import type { IdentifierStore } from './store'
import type { BridgeConfig } from './signal-client'
import { sendSignalMessage } from './signal-client'
import { RateLimiter } from './rate-limiter'
import type { AuditLogger } from './audit'

const RegisterClientSchema = z.object({
  token: z.string().min(1),
  plaintextIdentifier: z.string().min(1),
  identifierType: z.enum(['phone', 'username']),
})

const NotifySchema = z.object({
  identifierHash: z.string().min(1),
  message: z.string().min(1).max(4096),
  disappearingTimerSeconds: z.number().int().positive().optional(),
})

export interface AuthConfig {
  apiKey: string
  apiKeyPrevious?: string
}

/** Verify a registration token issued by the app server. Returns identifierHash on success. */
function verifyRegistrationToken(tokenSecret: string, token: string): string | null {
  const dotIdx = token.lastIndexOf('.')
  if (dotIdx === -1) return null
  const payload = token.slice(0, dotIdx)
  const providedSig = token.slice(dotIdx + 1)

  const expectedSig = createHmac('sha256', tokenSecret).update(payload).digest('hex')
  const aBuf = Buffer.from(providedSig, 'utf8')
  const bBuf = Buffer.from(expectedSig, 'utf8')
  if (aBuf.length !== bBuf.length || !timingSafeEqual(aBuf, bBuf)) return null

  let parsed: { identifierHash: string; expiresAt: number }
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!parsed.identifierHash || parsed.expiresAt < Date.now()) return null
  return parsed.identifierHash
}

/**
 * Check bearer token against current key and optionally the previous key (rotation support).
 */
function verifyBearer(authHeader: string | undefined, auth: AuthConfig): boolean {
  if (!authHeader) return false
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return false

  // Check current key
  const currentBuf = Buffer.from(auth.apiKey, 'utf8')
  const tokenBuf = Buffer.from(token, 'utf8')
  if (currentBuf.length === tokenBuf.length && timingSafeEqual(currentBuf, tokenBuf)) {
    return true
  }

  // Check previous key (rotation support)
  if (auth.apiKeyPrevious) {
    const prevBuf = Buffer.from(auth.apiKeyPrevious, 'utf8')
    if (prevBuf.length === tokenBuf.length && timingSafeEqual(prevBuf, tokenBuf)) {
      return true
    }
  }

  return false
}

/**
 * Build the notifier router.
 * - Bearer token routes: app-server-only (notify, unregister, check)
 * - Token-based route: client-direct registration (/register-client)
 */
export function buildRoutes(
  auth: AuthConfig,
  tokenSecret: string,
  store: IdentifierStore,
  bridgeCfg: BridgeConfig,
  audit: AuditLogger,
  rateLimiter?: { register: RateLimiter; notify: RateLimiter }
): Hono {
  const app = new Hono()
  const registerLimiter = rateLimiter?.register ?? new RateLimiter(10, 60_000)
  const notifyLimiter = rateLimiter?.notify ?? new RateLimiter(30, 60_000)

  app.post('/register-client', async (c) => {
    const clientIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown'

    if (!registerLimiter.check(clientIp)) {
      await audit.log({ action: 'rate_limited', success: false, metadata: `register:${clientIp}` })
      return c.json({ error: 'Rate limit exceeded' }, 429)
    }

    const parseResult = RegisterClientSchema.safeParse(await c.req.json().catch(() => null))
    if (!parseResult.success) {
      return c.json({ error: 'Invalid request body', details: parseResult.error.issues }, 400)
    }

    const { token, plaintextIdentifier, identifierType } = parseResult.data

    const identifierHash = verifyRegistrationToken(tokenSecret, token)
    if (!identifierHash) {
      return c.json({ error: 'Invalid or expired registration token' }, 401)
    }

    await store.register(identifierHash, plaintextIdentifier, identifierType)
    await audit.log({ action: 'register', identifierHash, success: true })
    return c.json({ ok: true })
  })

  // Bearer auth middleware for all remaining routes
  app.use('*', async (c, next) => {
    if (!verifyBearer(c.req.header('authorization'), auth)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    await next()
  })

  app.get('/check/:hash', async (c) => {
    const hash = c.req.param('hash')
    const registered = await store.isRegistered(hash)
    return c.json({ registered })
  })

  app.delete('/unregister/:hash', async (c) => {
    const hash = c.req.param('hash')
    await store.remove(hash)
    await audit.log({ action: 'unregister', identifierHash: hash, success: true })
    return c.json({ ok: true })
  })

  app.post('/notify', async (c) => {
    const clientIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown'

    if (!notifyLimiter.check(clientIp)) {
      await audit.log({ action: 'rate_limited', success: false, metadata: `notify:${clientIp}` })
      return c.json({ error: 'Rate limit exceeded' }, 429)
    }

    const parseResult = NotifySchema.safeParse(await c.req.json().catch(() => null))
    if (!parseResult.success) {
      return c.json({ error: 'Invalid request body', details: parseResult.error.issues }, 400)
    }

    const { identifierHash, message, disappearingTimerSeconds } = parseResult.data

    const entry = await store.lookup(identifierHash)
    if (!entry) {
      await audit.log({ action: 'notify_failed', identifierHash, success: false, errorMessage: 'not_found' })
      return c.json({ error: 'Identifier not found' }, 404)
    }

    const result = await sendSignalMessage(
      bridgeCfg,
      entry.plaintext,
      message,
      disappearingTimerSeconds ?? null
    )
    if (!result.ok) {
      await audit.log({ action: 'notify_failed', identifierHash, success: false, errorMessage: result.error })
      return c.json({ error: result.error }, 502)
    }

    await audit.log({ action: 'notify', identifierHash, success: true })
    return c.json({ ok: true })
  })

  return app
}
