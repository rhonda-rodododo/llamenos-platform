/**
 * Unit tests for apps/worker/middleware/api-version.ts
 *
 * Tests API version negotiation: version header parsing,
 * exempt paths, upgrade required responses, response headers.
 */
import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '@worker/types/infra'

// Mock api-versions module to control version numbers
vi.mock('@worker/lib/api-versions', () => ({
  CURRENT_API_VERSION: 3,
  MIN_API_VERSION: 2,
  checkClientVersion: (v: number) => v < 2 ? { upgrade: true, minVersion: 2, currentVersion: 3 } : null,
}))

import { apiVersion } from '@worker/middleware/api-version'

function createApp() {
  const app = new Hono<AppEnv>()
  app.use('*', apiVersion)
  app.get('/test', (c) => c.json({ ok: true }))
  app.get('/config', (c) => c.json({ ok: true }))
  app.get('/config/verify', (c) => c.json({ ok: true }))
  app.get('/health', (c) => c.json({ ok: true }))
  app.get('/health/ready', (c) => c.json({ ok: true }))
  app.get('/metrics', (c) => c.json({ ok: true }))
  return app
}

describe('apiVersion middleware', () => {
  it('always sets version response headers', async () => {
    const app = createApp()
    const res = await app.request('/test')
    expect(res.headers.get('X-Min-Version')).toBe('2')
    expect(res.headers.get('X-Current-Version')).toBe('3')
  })

  it('allows request when no X-API-Version header', async () => {
    const app = createApp()
    const res = await app.request('/test')
    expect(res.status).toBe(200)
  })

  it('allows request when client version >= min', async () => {
    const app = createApp()
    const res = await app.request('/test', {
      headers: { 'X-API-Version': '2' },
    })
    expect(res.status).toBe(200)
  })

  it('allows request when client version > current', async () => {
    const app = createApp()
    const res = await app.request('/test', {
      headers: { 'X-API-Version': '99' },
    })
    expect(res.status).toBe(200)
  })

  it('returns 426 when client version < min', async () => {
    const app = createApp()
    const res = await app.request('/test', {
      headers: { 'X-API-Version': '1' },
    })
    expect(res.status).toBe(426)
    const body = await res.json()
    expect(body.error).toBe('Upgrade Required')
    expect(body.minVersion).toBe(2)
    expect(body.currentVersion).toBe(3)
  })

  it('ignores non-numeric version header', async () => {
    const app = createApp()
    const res = await app.request('/test', {
      headers: { 'X-API-Version': 'abc' },
    })
    expect(res.status).toBe(200)
  })

  describe('exempt paths', () => {
    it.each(['/config', '/config/verify', '/health', '/health/ready', '/metrics'])(
      'exempts %s from version enforcement',
      async (path) => {
        const app = createApp()
        const res = await app.request(path, {
          headers: { 'X-API-Version': '1' },  // too old
        })
        expect(res.status).toBe(200)
      },
    )

    it('does NOT exempt /configuration (partial path match)', async () => {
      const app = createApp()
      app.get('/configuration', (c) => c.json({ ok: true }))
      const res = await app.request('/configuration', {
        headers: { 'X-API-Version': '1' },
      })
      expect(res.status).toBe(426)
    })
  })

  it('sets version headers even on exempt paths', async () => {
    const app = createApp()
    const res = await app.request('/config')
    expect(res.headers.get('X-Min-Version')).toBe('2')
    expect(res.headers.get('X-Current-Version')).toBe('3')
  })
})
