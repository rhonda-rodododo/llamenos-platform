/**
 * Unit tests for POST /account/lockdown — elevated auth requirement.
 */
import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types/infra'
import accountRoutes from '@worker/routes/account'

vi.mock('hono-openapi', () => ({
  describeRoute: () => async (_c: unknown, next: () => Promise<void>) => next(),
  resolver: (s: unknown) => s,
  validator: (_type: string, _schema: unknown) => {
    return async (c: { req: { json: () => Promise<unknown>; valid: (t: string) => unknown } }, next: () => Promise<void>) => {
      try {
        const body = await c.req.json()
        const orig = c.req.valid.bind(c.req)
        c.req.valid = (t: string) => t === 'json' ? body : orig(t)
      } catch { /* ignore */ }
      await next()
    }
  },
}))

function makeApp(opts: { sessionToken?: string; pubkey?: string } = {}) {
  const { sessionToken, pubkey = 'test-pubkey' } = opts
  const app = new Hono<AppEnv>()
  const services = {
    identity: {
      terminateOtherSessions: vi.fn().mockResolvedValue(3),
      getUserHubIds: vi.fn().mockResolvedValue(['hub-1', 'hub-2']),
      emitSecurityEvent: vi.fn().mockResolvedValue(undefined),
    },
  }

  app.use('*', async (c, next) => {
    c.set('pubkey', pubkey as never)
    c.set('services', services as never)
    if (sessionToken !== undefined) {
      c.set('sessionToken', sessionToken as never)
    }
    await next()
  })

  app.route('/account', accountRoutes)
  return { app, services }
}

describe('POST /account/lockdown — elevated auth', () => {
  it('rejects requests authenticated via session token', async () => {
    const { app } = makeApp({ sessionToken: 'old-session-token' })

    const res = await app.request('/account/lockdown', { method: 'POST' })
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string; code: string }
    expect(body.code).toBe('ELEVATED_AUTH_REQUIRED')
  })

  it('allows requests authenticated via Schnorr (no session token set)', async () => {
    const { app, services } = makeApp({ sessionToken: undefined })

    const res = await app.request('/account/lockdown', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(services.identity.terminateOtherSessions).toHaveBeenCalledWith('test-pubkey', '')
  })

  it('lockdown/complete does not require elevated auth', async () => {
    const { app } = makeApp({ sessionToken: 'some-session' })

    const res = await app.request('/account/lockdown/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pukRotated: true, hubKeysRotated: ['hub-1'], hubKeysFailed: [] }),
    })
    // Should not be blocked by elevated auth
    expect(res.status).toBe(200)
  })
})
