import { describe, expect, test } from 'vitest'
import { buildRoutes } from './routes'
import { IdentifierStore } from './store'
import { unlinkSync } from 'node:fs'

const TEST_SECRET = 'test-secret-for-routes'
const API_KEY = 'test-api-key'
const TOKEN_SECRET = 'test-token-secret'

function createTestStore(suffix: string): IdentifierStore {
  const path = `./test-routes-${suffix}.db`
  return new IdentifierStore(path, TEST_SECRET)
}

function cleanupStore(store: IdentifierStore, suffix: string): void {
  store.close()
  try { unlinkSync(`./test-routes-${suffix}.db`) } catch {}
}

describe('notifier routes', () => {
  test('GET /check/:hash returns registered=true for known hash', async () => {
    const store = createTestStore('check-known')
    store.register('hash123', '+15551234567', 'phone')

    const app = buildRoutes(API_KEY, TOKEN_SECRET, store, {
      bridgeUrl: 'http://signal-bridge:8080',
      bridgeApiKey: 'bridge-key',
      registeredNumber: '+15550000000',
    })

    const req = new Request('http://localhost/check/hash123', {
      headers: { authorization: `Bearer ${API_KEY}` },
    })
    const res = await app.fetch(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.registered).toBe(true)
    cleanupStore(store, 'check-known')
  })

  test('GET /check/:hash returns registered=false for unknown hash', async () => {
    const store = createTestStore('check-unknown')

    const app = buildRoutes(API_KEY, TOKEN_SECRET, store, {
      bridgeUrl: 'http://signal-bridge:8080',
      bridgeApiKey: 'bridge-key',
      registeredNumber: '+15550000000',
    })

    const req = new Request('http://localhost/check/unknown', {
      headers: { authorization: `Bearer ${API_KEY}` },
    })
    const res = await app.fetch(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.registered).toBe(false)
    cleanupStore(store, 'check-unknown')
  })

  test('GET /check/:hash requires bearer auth', async () => {
    const store = createTestStore('check-auth')

    const app = buildRoutes(API_KEY, TOKEN_SECRET, store, {
      bridgeUrl: 'http://signal-bridge:8080',
      bridgeApiKey: 'bridge-key',
      registeredNumber: '+15550000000',
    })

    const req = new Request('http://localhost/check/hash123')
    const res = await app.fetch(req)

    expect(res.status).toBe(401)
    cleanupStore(store, 'check-auth')
  })
})
