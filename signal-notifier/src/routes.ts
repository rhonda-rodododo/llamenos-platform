import { createHmac, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import type { IdentifierStore } from './store'
import type { BridgeConfig } from './signal-client'
import { sendSignalMessage } from './signal-client'

interface RegisterClientBody {
  token: string
  plaintextIdentifier: string
  identifierType: 'phone' | 'username'
}

interface NotifyBody {
  identifierHash: string
  message: string
  disappearingTimerSeconds?: number
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
 * Build the notifier router.
 * - Bearer token routes: app-server-only (notify, unregister, check)
 * - Token-based route: client-direct registration (/register-client)
 */
export function buildRoutes(
  apiKey: string,
  tokenSecret: string,
  store: IdentifierStore,
  bridgeCfg: BridgeConfig
): Hono {
  const app = new Hono()

  app.post('/register-client', async (c) => {
    let body: RegisterClientBody
    try {
      body = await c.req.json<RegisterClientBody>()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    const { token, plaintextIdentifier, identifierType } = body
    if (!token || !plaintextIdentifier) {
      return c.json({ error: 'token and plaintextIdentifier are required' }, 400)
    }
    if (identifierType !== 'phone' && identifierType !== 'username') {
      return c.json({ error: 'identifierType must be phone or username' }, 400)
    }

    const identifierHash = verifyRegistrationToken(tokenSecret, token)
    if (!identifierHash) {
      return c.json({ error: 'Invalid or expired registration token' }, 401)
    }

    store.register(identifierHash, plaintextIdentifier, identifierType)
    return c.json({ ok: true })
  })

  app.use('*', async (c, next) => {
    const header = c.req.header('authorization')
    if (!apiKey || header !== `Bearer ${apiKey}`) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    await next()
  })

  app.get('/check/:hash', (c) => {
    const hash = c.req.param('hash')
    const registered = store.isRegistered(hash)
    return c.json({ registered })
  })

  app.delete('/unregister/:hash', (c) => {
    const hash = c.req.param('hash')
    store.remove(hash)
    return c.json({ ok: true })
  })

  app.post('/notify', async (c) => {
    let body: NotifyBody
    try {
      body = await c.req.json<NotifyBody>()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    const { identifierHash, message, disappearingTimerSeconds } = body
    if (!identifierHash || !message) {
      return c.json({ error: 'identifierHash and message are required' }, 400)
    }

    const entry = store.lookup(identifierHash)
    if (!entry) {
      return c.json({ error: 'Identifier not found' }, 404)
    }

    const result = await sendSignalMessage(
      bridgeCfg,
      entry.plaintext,
      message,
      disappearingTimerSeconds ?? null
    )
    if (!result.ok) {
      return c.json({ error: result.error }, 502)
    }
    return c.json({ ok: true })
  })

  return app
}
