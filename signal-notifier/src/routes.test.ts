import { describe, expect, test, beforeAll, afterAll, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { buildRoutes, type AuthConfig } from './routes'
import { IdentifierStore } from './store'
import { AuditLogger } from './audit'
import { RateLimiter } from './rate-limiter'
import { createTestDb } from './test-helpers'

const TEST_SECRET = 'test-secret-for-routes'
const API_KEY = 'test-api-key'
const TOKEN_SECRET = 'test-token-secret'

function makeRegistrationToken(identifierHash: string, expiresAt?: number): string {
  const payload = Buffer.from(
    JSON.stringify({ identifierHash, expiresAt: expiresAt ?? Date.now() + 60_000 })
  ).toString('base64url')
  const sig = createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex')
  return `${payload}.${sig}`
}

describe('notifier routes (PostgreSQL)', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>
  let store: IdentifierStore
  let audit: AuditLogger
  let auth: AuthConfig

  beforeAll(async () => {
    ctx = await createTestDb('routes')
    store = new IdentifierStore(ctx.db, TEST_SECRET)
    audit = new AuditLogger(ctx.db)
    auth = { apiKey: API_KEY }
  })

  beforeEach(async () => {
    await ctx.truncateAll()
  })

  afterAll(async () => {
    await ctx.cleanup()
  })

  function createApp(authOverride?: AuthConfig, limiter?: { register: RateLimiter; notify: RateLimiter }) {
    return buildRoutes(
      authOverride ?? auth,
      TOKEN_SECRET,
      store,
      { bridgeUrl: 'http://signal-bridge:8080', bridgeApiKey: 'bridge-key', registeredNumber: '+15550000000' },
      audit,
      limiter
    )
  }

  test('GET /check/:hash returns registered=true for known hash', async () => {
    await store.register('hash123', '+15551234567', 'phone')
    const app = createApp()
    const res = await app.fetch(new Request('http://localhost/check/hash123', {
      headers: { authorization: `Bearer ${API_KEY}` },
    }))
    expect(res.status).toBe(200)
    expect((await res.json()).registered).toBe(true)
  })

  test('GET /check/:hash returns registered=false for unknown hash', async () => {
    const app = createApp()
    const res = await app.fetch(new Request('http://localhost/check/unknown', {
      headers: { authorization: `Bearer ${API_KEY}` },
    }))
    expect(res.status).toBe(200)
    expect((await res.json()).registered).toBe(false)
  })

  test('GET /check/:hash requires bearer auth', async () => {
    const app = createApp()
    const res = await app.fetch(new Request('http://localhost/check/hash123'))
    expect(res.status).toBe(401)
  })

  test('bearer token rotation — accepts previous key', async () => {
    const rotatedAuth: AuthConfig = { apiKey: 'new-key', apiKeyPrevious: API_KEY }
    const app = createApp(rotatedAuth)
    const res = await app.fetch(new Request('http://localhost/check/hash123', {
      headers: { authorization: `Bearer ${API_KEY}` },
    }))
    expect(res.status).toBe(200)
  })

  test('bearer token rotation — accepts new key', async () => {
    const rotatedAuth: AuthConfig = { apiKey: 'new-key', apiKeyPrevious: API_KEY }
    const app = createApp(rotatedAuth)
    const res = await app.fetch(new Request('http://localhost/check/hash123', {
      headers: { authorization: `Bearer new-key` },
    }))
    expect(res.status).toBe(200)
  })

  test('bearer token rotation — rejects unknown key', async () => {
    const rotatedAuth: AuthConfig = { apiKey: 'new-key', apiKeyPrevious: API_KEY }
    const app = createApp(rotatedAuth)
    const res = await app.fetch(new Request('http://localhost/check/hash123', {
      headers: { authorization: `Bearer wrong-key` },
    }))
    expect(res.status).toBe(401)
  })

  test('POST /register-client validates request body with Zod', async () => {
    const app = createApp()
    const res = await app.fetch(new Request('http://localhost/register-client', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: '', plaintextIdentifier: '+15551234567', identifierType: 'phone' }),
    }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Invalid request body')
  })

  test('POST /register-client succeeds with valid token', async () => {
    const token = makeRegistrationToken('hash-abc')
    const app = createApp()
    const res = await app.fetch(new Request('http://localhost/register-client', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, plaintextIdentifier: '+15559999999', identifierType: 'phone' }),
    }))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)

    const entry = await store.lookup('hash-abc')
    expect(entry?.plaintext).toBe('+15559999999')
  })

  test('POST /register-client rejects expired token', async () => {
    const token = makeRegistrationToken('hash-expired', Date.now() - 1000)
    const app = createApp()
    const res = await app.fetch(new Request('http://localhost/register-client', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, plaintextIdentifier: '+15559999999', identifierType: 'phone' }),
    }))
    expect(res.status).toBe(401)
  })

  test('POST /notify validates request body', async () => {
    const app = createApp()
    const res = await app.fetch(new Request('http://localhost/notify', {
      method: 'POST',
      headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ identifierHash: '', message: 'hello' }),
    }))
    expect(res.status).toBe(400)
  })

  test('POST /notify returns 404 for unregistered hash', async () => {
    const app = createApp()
    const res = await app.fetch(new Request('http://localhost/notify', {
      method: 'POST',
      headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ identifierHash: 'unknown-hash', message: 'hello' }),
    }))
    expect(res.status).toBe(404)
  })

  test('DELETE /unregister/:hash removes entry', async () => {
    await store.register('hash-del', '+15551111111', 'phone')
    const app = createApp()
    const res = await app.fetch(new Request('http://localhost/unregister/hash-del', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${API_KEY}` },
    }))
    expect(res.status).toBe(200)
    expect(await store.isRegistered('hash-del')).toBe(false)
  })

  test('rate limiting on /register-client', async () => {
    const limiter = { register: new RateLimiter(2, 60_000), notify: new RateLimiter(30, 60_000) }
    const app = createApp(undefined, limiter)
    const token = makeRegistrationToken('hash-rl')
    const makeReq = () => new Request('http://localhost/register-client', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, plaintextIdentifier: '+15551111111', identifierType: 'phone' }),
    })

    const r1 = await app.fetch(makeReq())
    expect(r1.status).toBe(200)
    const r2 = await app.fetch(makeReq())
    expect(r2.status).toBe(200)
    const r3 = await app.fetch(makeReq())
    expect(r3.status).toBe(429)
  })

  test('rate limiting on /notify', async () => {
    await store.register('hash-notify-rl', '+15551234567', 'phone')
    const limiter = { register: new RateLimiter(10, 60_000), notify: new RateLimiter(1, 60_000) }
    const app = createApp(undefined, limiter)
    const makeReq = () => new Request('http://localhost/notify', {
      method: 'POST',
      headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ identifierHash: 'hash-notify-rl', message: 'test' }),
    })

    // First request will get 502 (bridge not available) but not 429
    const r1 = await app.fetch(makeReq())
    expect(r1.status).not.toBe(429)
    // Second request should be rate-limited
    const r2 = await app.fetch(makeReq())
    expect(r2.status).toBe(429)
  })
})
