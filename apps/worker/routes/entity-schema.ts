import { Hono } from 'hono'
import { describeRoute, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { getDOs } from '../lib/do-access'
import { requirePermission } from '../middleware/permission-guard'
import {
  createEntityTypeBodySchema,
  updateEntityTypeBodySchema,
  createRelationshipTypeBodySchema,
  updateRelationshipTypeBodySchema,
  caseNumberBodySchema,
} from '../schemas/entity-schema'
import { authErrors, notFoundError } from '../openapi/helpers'
import { audit } from '../services/audit'

const entitySchema = new Hono<AppEnv>()

// --- Case Management Feature Toggle ---

entitySchema.get('/case-management',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Get case management enabled status',
    responses: {
      200: { description: 'Case management status' },
      ...authErrors,
    },
  }),
  async (c) => {
    const dos = getDOs(c.env)
    const res = await dos.settings.fetch(new Request('http://do/settings/case-management'))
    return new Response(res.body, res)
  },
)

entitySchema.put('/case-management',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Enable or disable case management',
    responses: {
      200: { description: 'Case management status updated' },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage'),
  async (c) => {
    const dos = getDOs(c.env)
    const body = await c.req.json<{ enabled: boolean }>()
    const res = await dos.settings.fetch(new Request('http://do/settings/case-management', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
    await audit(dos.records, 'caseManagementToggled', c.get('pubkey'), body)
    return new Response(res.body, res)
  },
)

// --- Entity Types ---

entitySchema.get('/entity-types',
  describeRoute({
    tags: ['Case Management'],
    summary: 'List entity type definitions',
    responses: {
      200: { description: 'Entity types list' },
      ...authErrors,
    },
  }),
  requirePermission('settings:read'),
  async (c) => {
    const dos = getDOs(c.env)
    const res = await dos.settings.fetch(new Request('http://do/settings/entity-types'))
    return new Response(res.body, res)
  },
)

entitySchema.post('/entity-types',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Create a new entity type definition',
    responses: {
      201: { description: 'Entity type created' },
      ...authErrors,
    },
  }),
  requirePermission('cases:manage-types'),
  validator('json', createEntityTypeBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request('http://do/settings/entity-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
    if (!res.ok) return new Response(res.body, res)
    const created = await res.json() as { id: string; name: string }
    await audit(dos.records, 'entityTypeCreated', c.get('pubkey'), { entityTypeId: created.id, name: created.name })
    return c.json(created, 201)
  },
)

entitySchema.patch('/entity-types/:id',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Update an entity type definition',
    responses: {
      200: { description: 'Entity type updated' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:manage-types'),
  validator('json', updateEntityTypeBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const dos = getDOs(c.env)
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request(`http://do/settings/entity-types/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
    if (!res.ok) return new Response(res.body, res)
    await audit(dos.records, 'entityTypeUpdated', c.get('pubkey'), { entityTypeId: id })
    return new Response(res.body, res)
  },
)

entitySchema.delete('/entity-types/:id',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Delete an entity type definition',
    responses: {
      200: { description: 'Entity type deleted' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:manage-types'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getDOs(c.env)
    const res = await dos.settings.fetch(new Request(`http://do/settings/entity-types/${id}`, {
      method: 'DELETE',
    }))
    if (!res.ok) return new Response(res.body, res)
    await audit(dos.records, 'entityTypeDeleted', c.get('pubkey'), { entityTypeId: id })
    return new Response(res.body, res)
  },
)

// --- Relationship Types ---

entitySchema.get('/relationship-types',
  describeRoute({
    tags: ['Case Management'],
    summary: 'List relationship type definitions',
    responses: {
      200: { description: 'Relationship types list' },
      ...authErrors,
    },
  }),
  requirePermission('settings:read'),
  async (c) => {
    const dos = getDOs(c.env)
    const res = await dos.settings.fetch(new Request('http://do/settings/relationship-types'))
    return new Response(res.body, res)
  },
)

entitySchema.post('/relationship-types',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Create a new relationship type definition',
    responses: {
      201: { description: 'Relationship type created' },
      ...authErrors,
    },
  }),
  requirePermission('cases:manage-types'),
  validator('json', createRelationshipTypeBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request('http://do/settings/relationship-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
    if (!res.ok) return new Response(res.body, res)
    const created = await res.json() as { id: string }
    await audit(dos.records, 'relationshipTypeCreated', c.get('pubkey'), { relationshipTypeId: created.id })
    return c.json(created, 201)
  },
)

entitySchema.patch('/relationship-types/:id',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Update a relationship type definition',
    responses: {
      200: { description: 'Relationship type updated' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:manage-types'),
  validator('json', updateRelationshipTypeBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const dos = getDOs(c.env)
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request(`http://do/settings/relationship-types/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
    if (!res.ok) return new Response(res.body, res)
    await audit(dos.records, 'relationshipTypeUpdated', c.get('pubkey'), { relationshipTypeId: id })
    return new Response(res.body, res)
  },
)

entitySchema.delete('/relationship-types/:id',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Delete a relationship type definition',
    responses: {
      200: { description: 'Relationship type deleted' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:manage-types'),
  async (c) => {
    const id = c.req.param('id')
    const dos = getDOs(c.env)
    const res = await dos.settings.fetch(new Request(`http://do/settings/relationship-types/${id}`, {
      method: 'DELETE',
    }))
    if (!res.ok) return new Response(res.body, res)
    await audit(dos.records, 'relationshipTypeDeleted', c.get('pubkey'), { relationshipTypeId: id })
    return new Response(res.body, res)
  },
)

// --- Case Number Generation ---

entitySchema.post('/case-number',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Generate next case number for a prefix',
    responses: {
      200: { description: 'Generated case number' },
      ...authErrors,
    },
  }),
  requirePermission('cases:create'),
  validator('json', caseNumberBodySchema),
  async (c) => {
    const dos = getDOs(c.env)
    const body = c.req.valid('json')
    const res = await dos.settings.fetch(new Request('http://do/settings/case-number', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
    return new Response(res.body, res)
  },
)

export default entitySchema
