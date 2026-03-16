import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { getScopedDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import { listBlastsQuerySchema, createBlastBodySchema, updateBlastBodySchema, scheduleBlastBodySchema, importSubscribersBodySchema, updateBlastSettingsBodySchema } from '@protocol/schemas/blasts'
import { authErrors } from '../openapi/helpers'

const blasts = new Hono<AppEnv>()

// Forward all blast routes to BlastDO
// These are hub-scoped and require authentication (handled by middleware in app.ts)
// Each endpoint also requires specific blast permissions

// --- Subscribers ---
blasts.get('/subscribers',
  describeRoute({
    tags: ['Blasts'],
    summary: 'List blast subscribers',
    responses: {
      200: { description: 'List of subscribers' },
      ...authErrors,
    },
  }),
  requirePermission('blasts:manage'),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const url = new URL(c.req.url)
    const res = await dos.blasts.fetch(new Request(`http://do/subscribers${url.search}`))
    return new Response(res.body, { status: res.status, headers: res.headers })
  },
)

blasts.delete('/subscribers/:id',
  describeRoute({
    tags: ['Blasts'],
    summary: 'Remove a subscriber',
    responses: {
      200: { description: 'Subscriber removed' },
      ...authErrors,
    },
  }),
  requirePermission('blasts:manage'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.blasts.fetch(new Request(`http://do/subscribers/${id}`, { method: 'DELETE' }))
    return new Response(res.body, { status: res.status, headers: res.headers })
  },
)

blasts.get('/subscribers/stats',
  describeRoute({
    tags: ['Blasts'],
    summary: 'Get subscriber statistics',
    responses: {
      200: { description: 'Subscriber stats' },
      ...authErrors,
    },
  }),
  requirePermission('blasts:read'),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.blasts.fetch(new Request('http://do/subscribers/stats'))
    return new Response(res.body, { status: res.status, headers: res.headers })
  },
)

blasts.post('/subscribers/import',
  describeRoute({
    tags: ['Blasts'],
    summary: 'Import subscribers in bulk',
    responses: {
      200: { description: 'Import results' },
      ...authErrors,
    },
  }),
  requirePermission('blasts:manage'),
  validator('json', importSubscribersBodySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')
    const res = await dos.blasts.fetch(new Request('http://do/subscribers/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
    return new Response(res.body, { status: res.status, headers: res.headers })
  },
)

// --- Blasts ---
blasts.get('/',
  describeRoute({
    tags: ['Blasts'],
    summary: 'List blasts',
    responses: {
      200: { description: 'Paginated list of blasts' },
      ...authErrors,
    },
  }),
  requirePermission('blasts:read'),
  validator('query', listBlastsQuerySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const query = c.req.valid('query')
    const params = new URLSearchParams()
    params.set('page', String(query.page))
    params.set('limit', String(query.limit))
    if (query.status) params.set('status', query.status)
    const res = await dos.blasts.fetch(new Request(`http://do/blasts?${params}`))
    return new Response(res.body, { status: res.status, headers: res.headers })
  },
)

blasts.post('/',
  describeRoute({
    tags: ['Blasts'],
    summary: 'Create a new blast',
    responses: {
      201: { description: 'Blast created' },
      ...authErrors,
    },
  }),
  requirePermission('blasts:send'),
  validator('json', createBlastBodySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')
    const res = await dos.blasts.fetch(new Request('http://do/blasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
    return new Response(res.body, { status: res.status, headers: res.headers })
  },
)

blasts.get('/:id',
  describeRoute({
    tags: ['Blasts'],
    summary: 'Get a single blast',
    responses: {
      200: { description: 'Blast details' },
      ...authErrors,
    },
  }),
  requirePermission('blasts:read'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.blasts.fetch(new Request(`http://do/blasts/${id}`))
    return new Response(res.body, { status: res.status, headers: res.headers })
  },
)

blasts.patch('/:id',
  describeRoute({
    tags: ['Blasts'],
    summary: 'Update a blast',
    responses: {
      200: { description: 'Blast updated' },
      ...authErrors,
    },
  }),
  requirePermission('blasts:send'),
  validator('json', updateBlastBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')
    const res = await dos.blasts.fetch(new Request(`http://do/blasts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
    return new Response(res.body, { status: res.status, headers: res.headers })
  },
)

blasts.delete('/:id',
  describeRoute({
    tags: ['Blasts'],
    summary: 'Delete a blast',
    responses: {
      200: { description: 'Blast deleted' },
      ...authErrors,
    },
  }),
  requirePermission('blasts:manage'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.blasts.fetch(new Request(`http://do/blasts/${id}`, { method: 'DELETE' }))
    return new Response(res.body, { status: res.status, headers: res.headers })
  },
)

blasts.post('/:id/send',
  describeRoute({
    tags: ['Blasts'],
    summary: 'Send a blast immediately',
    responses: {
      200: { description: 'Blast sent' },
      ...authErrors,
    },
  }),
  requirePermission('blasts:send'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.blasts.fetch(new Request(`http://do/blasts/${id}/send`, { method: 'POST' }))
    return new Response(res.body, { status: res.status, headers: res.headers })
  },
)

blasts.post('/:id/schedule',
  describeRoute({
    tags: ['Blasts'],
    summary: 'Schedule a blast for later delivery',
    responses: {
      200: { description: 'Blast scheduled' },
      ...authErrors,
    },
  }),
  requirePermission('blasts:schedule'),
  validator('json', scheduleBlastBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')
    const res = await dos.blasts.fetch(new Request(`http://do/blasts/${id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
    return new Response(res.body, { status: res.status, headers: res.headers })
  },
)

blasts.post('/:id/cancel',
  describeRoute({
    tags: ['Blasts'],
    summary: 'Cancel a scheduled blast',
    responses: {
      200: { description: 'Blast cancelled' },
      ...authErrors,
    },
  }),
  requirePermission('blasts:schedule'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.blasts.fetch(new Request(`http://do/blasts/${id}/cancel`, { method: 'POST' }))
    return new Response(res.body, { status: res.status, headers: res.headers })
  },
)

// --- Settings ---
blasts.get('/settings',
  describeRoute({
    tags: ['Blasts'],
    summary: 'Get blast settings',
    responses: {
      200: { description: 'Blast settings' },
      ...authErrors,
    },
  }),
  requirePermission('blasts:read'),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const res = await dos.blasts.fetch(new Request('http://do/blast-settings'))
    return new Response(res.body, { status: res.status, headers: res.headers })
  },
)

blasts.patch('/settings',
  describeRoute({
    tags: ['Blasts'],
    summary: 'Update blast settings',
    responses: {
      200: { description: 'Blast settings updated' },
      ...authErrors,
    },
  }),
  requirePermission('blasts:manage'),
  validator('json', updateBlastSettingsBodySchema),
  async (c) => {
    const dos = getScopedDOs(c.env, c.get('hubId'))
    const body = c.req.valid('json')
    const res = await dos.blasts.fetch(new Request('http://do/blast-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
    return new Response(res.body, { status: res.status, headers: res.headers })
  },
)

export default blasts
