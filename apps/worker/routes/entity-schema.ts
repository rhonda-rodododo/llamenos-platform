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
import type { EntityTypeDefinition, RelationshipTypeDefinition } from '../schemas/entity-schema'
import { authErrors, notFoundError } from '../openapi/helpers'
import { audit } from '../services/audit'
import { applyTemplate, detectTemplateUpdates } from '../lib/template-engine'
import type { AppliedTemplateRecord } from '../lib/template-engine'
import { loadBundledTemplates } from '../lib/template-loader'

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

// --- Templates (Epic 317) ---

entitySchema.get('/templates',
  describeRoute({
    tags: ['Case Management'],
    summary: 'List available case management templates',
    responses: {
      200: { description: 'Template catalog' },
      ...authErrors,
    },
  }),
  requirePermission('settings:read'),
  async (c) => {
    const templates = await loadBundledTemplates()
    return c.json({
      templates: templates.map(t => ({
        id: t.id,
        version: t.version,
        name: t.name,
        description: t.description,
        tags: t.tags,
        entityTypeCount: t.entityTypes.length,
        extends: t.extends,
      })),
    })
  },
)

entitySchema.get('/templates/:id',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Get full template details',
    responses: {
      200: { description: 'Template details' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('settings:read'),
  async (c) => {
    const id = c.req.param('id')
    const templates = await loadBundledTemplates()
    const template = templates.find(t => t.id === id)
    if (!template) return c.json({ error: 'Template not found' }, 404)
    return c.json(template)
  },
)

entitySchema.post('/templates/apply',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Apply a template to the current hub',
    responses: {
      201: { description: 'Template applied' },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:manage-types'),
  async (c) => {
    const { templateId } = await c.req.json<{ templateId: string }>()
    const dos = getDOs(c.env)

    // Load template
    const templates = await loadBundledTemplates()
    const template = templates.find(t => t.id === templateId)
    if (!template) return c.json({ error: 'Template not found' }, 404)

    // Get existing entity types
    const existingRes = await dos.settings.fetch(new Request('http://do/settings/entity-types'))
    const { entityTypes: existing } = await existingRes.json() as { entityTypes: EntityTypeDefinition[] }

    // Apply template
    const allTemplatesMap = new Map(templates.map(t => [t.id, t]))
    const result = applyTemplate(template, '', allTemplatesMap, existing)

    // Merge: replace matching names, add new
    const merged = [...existing]
    for (const newET of result.entityTypes) {
      const idx = merged.findIndex(e => e.name === newET.name)
      if (idx >= 0) merged[idx] = newET
      else merged.push(newET)
    }

    // Save entity types (bulk replacement)
    await dos.settings.fetch(new Request('http://do/settings/entity-types', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityTypes: merged }),
    }))

    // Save relationship types (append)
    const existingRelRes = await dos.settings.fetch(new Request('http://do/settings/relationship-types'))
    const { relationshipTypes: existingRels } = await existingRelRes.json() as { relationshipTypes: RelationshipTypeDefinition[] }
    await dos.settings.fetch(new Request('http://do/settings/relationship-types', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relationshipTypes: [...existingRels, ...result.relationshipTypes] }),
    }))

    // Track applied template
    const appliedRes = await dos.settings.fetch(new Request('http://do/settings/applied-templates'))
    const { appliedTemplates = [] } = await appliedRes.json() as { appliedTemplates: unknown[] }
    appliedTemplates.push(result.appliedRecord)
    await dos.settings.fetch(new Request('http://do/settings/applied-templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appliedTemplates }),
    }))

    // Enable case management
    await dos.settings.fetch(new Request('http://do/settings/case-management', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    }))

    await audit(dos.records, 'templateApplied', c.get('pubkey'), {
      templateId,
      templateVersion: template.version,
      entityTypesCreated: result.entityTypes.length,
      relationshipTypesCreated: result.relationshipTypes.length,
    })

    return c.json({
      applied: true,
      entityTypes: result.entityTypes.length,
      relationshipTypes: result.relationshipTypes.length,
      suggestedRoles: template.suggestedRoles,
    }, 201)
  },
)

entitySchema.get('/templates/updates',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Check for available template updates',
    responses: {
      200: { description: 'Available updates' },
      ...authErrors,
    },
  }),
  requirePermission('settings:read'),
  async (c) => {
    const dos = getDOs(c.env)
    const appliedRes = await dos.settings.fetch(new Request('http://do/settings/applied-templates'))
    const { appliedTemplates = [] } = await appliedRes.json() as { appliedTemplates: AppliedTemplateRecord[] }
    const available = await loadBundledTemplates()
    const updates = detectTemplateUpdates(appliedTemplates, available)
    return c.json({ updates })
  },
)

export default entitySchema
