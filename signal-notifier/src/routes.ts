import { Hono } from 'hono'
import type { IdentifierStore } from './store'
import type { BridgeConfig } from './signal-client'
import { sendSignalMessage } from './signal-client'

interface RegisterBody {
  identifierHash: string
  plaintextIdentifier: string
  identifierType: 'phone' | 'username'
}

interface NotifyBody {
  identifierHash: string
  message: string
  disappearingTimerSeconds?: number
}

/**
 * Build the notifier router. All endpoints require Bearer token auth.
 * The app server is the only caller — clients never reach the sidecar directly.
 */
export function buildRoutes(
  apiKey: string,
  store: IdentifierStore,
  bridgeCfg: BridgeConfig
): Hono {
  const app = new Hono()

  // Bearer token auth middleware (all endpoints)
  app.use('*', async (c, next) => {
    const header = c.req.header('authorization')
    if (!apiKey || header !== `Bearer ${apiKey}`) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    await next()
  })

  // Register a hash → plaintext mapping
  app.post('/register', async (c) => {
    let body: RegisterBody
    try {
      body = await c.req.json<RegisterBody>()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    const { identifierHash, plaintextIdentifier, identifierType } = body
    if (!identifierHash || !plaintextIdentifier) {
      return c.json({ error: 'identifierHash and plaintextIdentifier are required' }, 400)
    }
    if (identifierType !== 'phone' && identifierType !== 'username') {
      return c.json({ error: 'identifierType must be phone or username' }, 400)
    }
    store.register(identifierHash, plaintextIdentifier, identifierType)
    return c.json({ ok: true })
  })

  // Delete a hash → plaintext mapping
  app.delete('/unregister/:hash', (c) => {
    const hash = c.req.param('hash')
    store.remove(hash)
    return c.json({ ok: true })
  })

  // Send a notification to a registered hash
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

  // Health check (no auth required — override middleware for this path)
  return app
}
