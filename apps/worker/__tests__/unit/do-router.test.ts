import { describe, it, expect } from 'vitest'
import { DORouter } from '@worker/lib/do-router'

describe('DORouter', () => {
  describe('route matching', () => {
    it('matches exact static paths', async () => {
      const router = new DORouter()
      let called = false
      router.get('volunteers', async () => {
        called = true
        return new Response('ok')
      })

      const req = new Request('http://do/volunteers')
      const res = await router.handle(req)
      expect(called).toBe(true)
      expect(res.status).toBe(200)
    })

    it('matches multi-segment paths', async () => {
      const router = new DORouter()
      router.get('settings/spam', async () => new Response('spam settings'))

      const req = new Request('http://do/settings/spam')
      const res = await router.handle(req)
      expect(await res.text()).toBe('spam settings')
    })

    it('extracts path parameters', async () => {
      const router = new DORouter()
      let capturedParams: Record<string, string> = {}
      router.get('volunteer/:pubkey', async (_req, params) => {
        capturedParams = params
        return new Response('found')
      })

      const req = new Request('http://do/volunteer/abc123')
      await router.handle(req)
      expect(capturedParams.pubkey).toBe('abc123')
    })

    it('extracts multiple path parameters', async () => {
      const router = new DORouter()
      let capturedParams: Record<string, string> = {}
      router.get('hubs/:hubId/settings/:key', async (_req, params) => {
        capturedParams = params
        return new Response('ok')
      })

      const req = new Request('http://do/hubs/hub-123/settings/telephony')
      await router.handle(req)
      expect(capturedParams.hubId).toBe('hub-123')
      expect(capturedParams.key).toBe('telephony')
    })

    it('decodes URL-encoded path parameters', async () => {
      const router = new DORouter()
      let capturedParams: Record<string, string> = {}
      router.get('volunteer/:pubkey', async (_req, params) => {
        capturedParams = params
        return new Response('ok')
      })

      const req = new Request('http://do/volunteer/hello%20world')
      await router.handle(req)
      expect(capturedParams.pubkey).toBe('hello world')
    })

    it('returns 404 for unmatched path', async () => {
      const router = new DORouter()
      router.get('volunteers', async () => new Response('ok'))

      const req = new Request('http://do/unknown')
      const res = await router.handle(req)
      expect(res.status).toBe(404)
      expect(await res.text()).toBe('Not Found')
    })

    it('returns 404 when path segment count differs', async () => {
      const router = new DORouter()
      router.get('volunteers', async () => new Response('ok'))

      const req = new Request('http://do/volunteers/extra')
      const res = await router.handle(req)
      expect(res.status).toBe(404)
    })

    it('returns 404 when static segment does not match', async () => {
      const router = new DORouter()
      router.get('settings/spam', async () => new Response('ok'))

      const req = new Request('http://do/settings/calls')
      const res = await router.handle(req)
      expect(res.status).toBe(404)
    })
  })

  describe('method routing', () => {
    it('matches GET requests', async () => {
      const router = new DORouter()
      router.get('data', async () => new Response('get'))
      router.post('data', async () => new Response('post'))

      const req = new Request('http://do/data', { method: 'GET' })
      const res = await router.handle(req)
      expect(await res.text()).toBe('get')
    })

    it('matches POST requests', async () => {
      const router = new DORouter()
      router.get('data', async () => new Response('get'))
      router.post('data', async () => new Response('post'))

      const req = new Request('http://do/data', { method: 'POST' })
      const res = await router.handle(req)
      expect(await res.text()).toBe('post')
    })

    it('matches PATCH requests', async () => {
      const router = new DORouter()
      router.patch('data/:id', async () => new Response('patched'))

      const req = new Request('http://do/data/123', { method: 'PATCH' })
      const res = await router.handle(req)
      expect(await res.text()).toBe('patched')
    })

    it('matches PUT requests', async () => {
      const router = new DORouter()
      router.put('data/:id', async () => new Response('put'))

      const req = new Request('http://do/data/123', { method: 'PUT' })
      const res = await router.handle(req)
      expect(await res.text()).toBe('put')
    })

    it('matches DELETE requests', async () => {
      const router = new DORouter()
      router.delete('data/:id', async () => new Response('deleted'))

      const req = new Request('http://do/data/123', { method: 'DELETE' })
      const res = await router.handle(req)
      expect(await res.text()).toBe('deleted')
    })

    it('returns 404 for wrong method', async () => {
      const router = new DORouter()
      router.get('data', async () => new Response('get'))

      const req = new Request('http://do/data', { method: 'POST' })
      const res = await router.handle(req)
      expect(res.status).toBe(404)
    })
  })

  describe('all() method', () => {
    it('matches any HTTP method', async () => {
      const router = new DORouter()
      router.all('catchall', async (req) => new Response(req.method))

      for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
        const req = new Request('http://do/catchall', { method })
        const res = await router.handle(req)
        expect(await res.text()).toBe(method)
      }
    })
  })

  describe('route priority', () => {
    it('first matching route wins', async () => {
      const router = new DORouter()
      router.get('data', async () => new Response('first'))
      router.get('data', async () => new Response('second'))

      const req = new Request('http://do/data')
      const res = await router.handle(req)
      expect(await res.text()).toBe('first')
    })

    it('static segment preferred over param when registered first', async () => {
      const router = new DORouter()
      router.get('volunteer/list', async () => new Response('list'))
      router.get('volunteer/:id', async () => new Response('by-id'))

      const listReq = new Request('http://do/volunteer/list')
      const listRes = await router.handle(listReq)
      expect(await listRes.text()).toBe('list')
    })
  })

  describe('edge cases', () => {
    it('handles root path', async () => {
      const router = new DORouter()
      // Root path with no segments — DORouter splits on '/' and filters Boolean
      // An empty pattern '' would split to [] matching path []
      // But in practice DOs use paths like '/volunteers' not '/'
      const req = new Request('http://do/')
      const res = await router.handle(req)
      expect(res.status).toBe(404)
    })

    it('handles path with trailing slash', async () => {
      const router = new DORouter()
      router.get('data', async () => new Response('ok'))

      // Trailing slash: pathname = '/data/' splits to ['data', ''] filtered to ['data']
      // Actually filter(Boolean) removes empty strings
      const req = new Request('http://do/data/')
      const res = await router.handle(req)
      // Depending on whether trailing slash is normalized, this may or may not match
      // With filter(Boolean), '/data/' => ['data'] which should match
      expect(await res.text()).toBe('ok')
    })

    it('passes the original request to handler', async () => {
      const router = new DORouter()
      let receivedBody = ''
      router.post('data', async (req) => {
        receivedBody = await req.text()
        return new Response('ok')
      })

      const req = new Request('http://do/data', {
        method: 'POST',
        body: JSON.stringify({ test: true }),
      })
      await router.handle(req)
      expect(receivedBody).toBe('{"test":true}')
    })

    it('handler can return synchronous Response', async () => {
      const router = new DORouter()
      router.get('sync', () => new Response('sync'))

      const req = new Request('http://do/sync')
      const res = await router.handle(req)
      expect(await res.text()).toBe('sync')
    })
  })
})
