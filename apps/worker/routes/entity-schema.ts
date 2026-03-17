import { z } from 'zod'
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission, requireAnyPermission } from '../middleware/permission-guard'
import {
  createEntityTypeBodySchema,
  updateEntityTypeBodySchema,
  createRelationshipTypeBodySchema,
  updateRelationshipTypeBodySchema,
  caseNumberBodySchema,
  entityTypeDefinitionSchema,
  relationshipTypeDefinitionSchema,
  entityTypeListResponseSchema,
  relationshipTypeListResponseSchema,
  caseNumberResponseSchema,
  templateListResponseSchema,
  templateApplyResponseSchema,
  templateUpdatesResponseSchema,
  rolesFromTemplateResponseSchema,
  enabledResponseSchema,
  createRolesFromTemplateBodySchema,
} from '@protocol/schemas/entity-schema'
import type { EntityTypeDefinition, RelationshipTypeDefinition } from '@protocol/schemas/entity-schema'
import {
  createCmsReportTypeBodySchema,
  updateCmsReportTypeBodySchema,
  reportTypeDefinitionSchema,
  cmsReportTypeListResponseSchema,
} from '@protocol/schemas/report-types'
import type { ReportTypeDefinition } from '@protocol/schemas/report-types'
import { authErrors, notFoundError } from '../openapi/helpers'
import { audit } from '../services/audit'
import { applyTemplate, detectTemplateUpdates } from '../lib/template-engine'
import type { AppliedTemplateRecord } from '../lib/template-engine'
import { loadBundledTemplates } from '../lib/template-loader'
import { isValidPermission } from '@shared/permissions'

const entitySchema = new Hono<AppEnv>()

// --- Case Management Feature Toggle ---

entitySchema.get('/case-management',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Get case management enabled status',
    responses: {
      200: {
        description: 'Case management status',
        content: { 'application/json': { schema: resolver(enabledResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:read'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getCaseManagementEnabled()
    return c.json(result)
  },
)

entitySchema.put('/case-management',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Enable or disable case management',
    responses: {
      200: {
        description: 'Case management status updated',
        content: { 'application/json': { schema: resolver(enabledResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-cms'),
  validator('json', enabledResponseSchema),
  async (c) => {
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.setCaseManagementEnabled(body)
    await audit(services.audit, 'caseManagementToggled', c.get('pubkey'), body)
    return c.json(result)
  },
)

// --- Auto-Assignment (Epic 342) ---

entitySchema.get('/auto-assignment',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Get auto-assignment setting',
    responses: {
      200: {
        description: 'Auto-assignment status',
        content: { 'application/json': { schema: resolver(enabledResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:read'),
  async (c) => {
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''
    const hubSettings = await services.settings.getHubSettings(hubId)
    return c.json({ enabled: (hubSettings.autoAssignment as boolean) ?? false })
  },
)

entitySchema.put('/auto-assignment',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Toggle auto-assignment for new cases',
    responses: {
      200: {
        description: 'Auto-assignment updated',
        content: { 'application/json': { schema: resolver(enabledResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('cases:manage'),
  validator('json', z.object({ enabled: z.boolean() })),
  async (c) => {
    const body = c.req.valid('json')
    const services = c.get('services')
    const hubId = c.get('hubId') ?? ''
    await services.settings.updateHubSettings(hubId, { autoAssignment: body.enabled })
    await audit(services.audit, 'autoAssignmentToggled', c.get('pubkey'), body)
    return c.json({ enabled: body.enabled })
  },
)

// --- Cross-Hub Sharing (Epic 328) ---

entitySchema.get('/cross-hub',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Get cross-hub sharing status',
    responses: {
      200: {
        description: 'Cross-hub sharing status',
        content: { 'application/json': { schema: resolver(enabledResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:read'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getCrossHubSharingEnabled()
    return c.json(result)
  },
)

entitySchema.put('/cross-hub',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Enable or disable cross-hub sharing',
    responses: {
      200: {
        description: 'Cross-hub sharing status updated',
        content: { 'application/json': { schema: resolver(enabledResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage-cms'),
  validator('json', enabledResponseSchema),
  async (c) => {
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.setCrossHubSharingEnabled(body)
    await audit(services.audit, 'crossHubSharingToggled', c.get('pubkey'), body)
    return c.json(result)
  },
)

// --- Entity Types ---

entitySchema.get('/entity-types',
  describeRoute({
    tags: ['Case Management'],
    summary: 'List entity type definitions',
    responses: {
      200: {
        description: 'Entity types list',
        content: { 'application/json': { schema: resolver(entityTypeListResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  // Entity type definitions are needed by any user who can interact with cases
  requireAnyPermission('settings:read', 'cases:read-own', 'cases:read-assigned', 'cases:create'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getEntityTypes()
    return c.json(result)
  },
)

entitySchema.post('/entity-types',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Create a new entity type definition',
    responses: {
      201: {
        description: 'Entity type created',
        content: { 'application/json': { schema: resolver(entityTypeDefinitionSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('cases:manage-types'),
  validator('json', createEntityTypeBodySchema),
  async (c) => {
    const body = c.req.valid('json')
    const services = c.get('services')
    const created = await services.settings.createEntityType(body as Record<string, unknown>)
    await audit(services.audit, 'entityTypeCreated', c.get('pubkey'), { entityTypeId: created.id, name: created.name })
    return c.json(created, 201)
  },
)

entitySchema.patch('/entity-types/:id',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Update an entity type definition',
    responses: {
      200: {
        description: 'Entity type updated',
        content: { 'application/json': { schema: resolver(entityTypeDefinitionSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:manage-types'),
  validator('json', updateEntityTypeBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.updateEntityType(id, body as Record<string, unknown>)
    await audit(services.audit, 'entityTypeUpdated', c.get('pubkey'), { entityTypeId: id })
    return c.json(result)
  },
)

entitySchema.delete('/entity-types/:id',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Delete an entity type definition',
    responses: {
      200: {
        description: 'Entity type deleted',
        content: { 'application/json': { schema: resolver(entityTypeDefinitionSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:manage-types'),
  async (c) => {
    const id = c.req.param('id')
    const services = c.get('services')
    const result = await services.settings.deleteEntityType(id)
    await audit(services.audit, 'entityTypeDeleted', c.get('pubkey'), { entityTypeId: id })
    return c.json(result)
  },
)

// --- Relationship Types ---

entitySchema.get('/relationship-types',
  describeRoute({
    tags: ['Case Management'],
    summary: 'List relationship type definitions',
    responses: {
      200: {
        description: 'Relationship types list',
        content: { 'application/json': { schema: resolver(relationshipTypeListResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:read'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getRelationshipTypes()
    return c.json(result)
  },
)

entitySchema.post('/relationship-types',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Create a new relationship type definition',
    responses: {
      201: {
        description: 'Relationship type created',
        content: { 'application/json': { schema: resolver(relationshipTypeDefinitionSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('cases:manage-types'),
  validator('json', createRelationshipTypeBodySchema),
  async (c) => {
    const body = c.req.valid('json')
    const services = c.get('services')
    const created = await services.settings.createRelationshipType(body as Record<string, unknown>)
    await audit(services.audit, 'relationshipTypeCreated', c.get('pubkey'), { relationshipTypeId: created.id })
    return c.json(created, 201)
  },
)

entitySchema.patch('/relationship-types/:id',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Update a relationship type definition',
    responses: {
      200: {
        description: 'Relationship type updated',
        content: { 'application/json': { schema: resolver(relationshipTypeDefinitionSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:manage-types'),
  validator('json', updateRelationshipTypeBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.updateRelationshipType(id, body as Record<string, unknown>)
    await audit(services.audit, 'relationshipTypeUpdated', c.get('pubkey'), { relationshipTypeId: id })
    return c.json(result)
  },
)

entitySchema.delete('/relationship-types/:id',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Delete a relationship type definition',
    responses: {
      200: {
        description: 'Relationship type deleted',
        content: { 'application/json': { schema: resolver(relationshipTypeDefinitionSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:manage-types'),
  async (c) => {
    const id = c.req.param('id')
    const services = c.get('services')
    const result = await services.settings.deleteRelationshipType(id)
    await audit(services.audit, 'relationshipTypeDeleted', c.get('pubkey'), { relationshipTypeId: id })
    return c.json(result)
  },
)

// --- Case Number Generation ---

entitySchema.post('/case-number',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Generate next case number for a prefix',
    responses: {
      200: {
        description: 'Generated case number',
        content: { 'application/json': { schema: resolver(caseNumberResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('cases:create'),
  validator('json', caseNumberBodySchema),
  async (c) => {
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.generateCaseNumber(body)
    return c.json(result)
  },
)

// --- Templates (Epic 317) ---

entitySchema.get('/templates',
  describeRoute({
    tags: ['Case Management'],
    summary: 'List available case management templates',
    responses: {
      200: {
        description: 'Template catalog',
        content: { 'application/json': { schema: resolver(templateListResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:read'),
  async (c) => {
    const services = c.get('services')
    const templates = await loadBundledTemplates()
    // Fetch applied templates to include appliedTemplateIds in response
    const { appliedTemplates = [] } = await services.settings.getAppliedTemplates() as { appliedTemplates: AppliedTemplateRecord[] }
    const appliedIds = appliedTemplates.map(at => at.templateId)
    return c.json({
      templates: templates.map(t => ({
        id: t.id,
        version: t.version,
        name: t.name,
        description: t.description,
        tags: t.tags,
        entityTypeCount: t.entityTypes.length,
        reportTypeCount: t.reportTypes?.length ?? 0,
        totalFieldCount: t.entityTypes.reduce((sum, et) => sum + (et.fields?.length ?? 0), 0),
        suggestedRoleCount: t.suggestedRoles?.length ?? 0,
        extends: t.extends,
      })),
      appliedTemplateIds: appliedIds,
    })
  },
)

entitySchema.get('/templates/:id',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Get full template details',
    responses: {
      200: {
        description: 'Template details',
        content: { 'application/json': { schema: resolver(z.unknown()) } },
      },
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
      201: {
        description: 'Template applied',
        content: { 'application/json': { schema: resolver(templateApplyResponseSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:manage-types'),
  validator('json', z.object({ templateId: z.string() })),
  async (c) => {
    const { templateId } = c.req.valid('json')
    const services = c.get('services')

    // Load template
    const templates = await loadBundledTemplates()
    const template = templates.find(t => t.id === templateId)
    if (!template) return c.json({ error: 'Template not found' }, 404)

    // Get existing entity types
    const { entityTypes: existing } = await services.settings.getEntityTypes()

    // Get existing CMS report types
    const { reportTypes: existingReportTypes } = await services.settings.getCmsReportTypes()

    // Apply template
    const allTemplatesMap = new Map(templates.map(t => [t.id, t]))
    const result = applyTemplate(template, '', allTemplatesMap, existing, existingReportTypes)

    // Merge entity types: replace matching names, add new
    const merged = [...existing]
    for (const newET of result.entityTypes) {
      const idx = merged.findIndex(e => e.name === newET.name)
      if (idx >= 0) merged[idx] = newET
      else merged.push(newET)
    }

    // Save entity types (bulk replacement)
    await services.settings.bulkSetEntityTypes({ entityTypes: merged })

    // Save relationship types (append)
    const { relationshipTypes: existingRels } = await services.settings.getRelationshipTypes()
    await services.settings.bulkSetRelationshipTypes({
      relationshipTypes: [...existingRels, ...result.relationshipTypes],
    })

    // Merge CMS report types: replace matching names, add new (Epic 343)
    if (result.reportTypes.length > 0) {
      const mergedReportTypes = [...existingReportTypes]
      for (const newRT of result.reportTypes) {
        const idx = mergedReportTypes.findIndex(r => r.name === newRT.name)
        if (idx >= 0) mergedReportTypes[idx] = newRT
        else mergedReportTypes.push(newRT)
      }
      await services.settings.bulkSetCmsReportTypes({ reportTypes: mergedReportTypes })
    }

    // Track applied template
    const { appliedTemplates = [] } = await services.settings.getAppliedTemplates() as { appliedTemplates: unknown[] }
    appliedTemplates.push(result.appliedRecord)
    await services.settings.setAppliedTemplates({ appliedTemplates })

    // Enable case management
    await services.settings.setCaseManagementEnabled({ enabled: true })

    await audit(services.audit, 'templateApplied', c.get('pubkey'), {
      templateId,
      templateVersion: template.version,
      entityTypesCreated: result.entityTypes.length,
      relationshipTypesCreated: result.relationshipTypes.length,
      reportTypesCreated: result.reportTypes.length,
    })

    return c.json({
      applied: true,
      entityTypes: result.entityTypes.length,
      relationshipTypes: result.relationshipTypes.length,
      reportTypes: result.reportTypes.length,
      suggestedRoles: template.suggestedRoles,
    }, 201)
  },
)

entitySchema.get('/templates/updates',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Check for available template updates',
    responses: {
      200: {
        description: 'Available updates',
        content: { 'application/json': { schema: resolver(templateUpdatesResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:read'),
  async (c) => {
    const services = c.get('services')
    const { appliedTemplates = [] } = await services.settings.getAppliedTemplates() as { appliedTemplates: AppliedTemplateRecord[] }
    const available = await loadBundledTemplates()
    const updates = detectTemplateUpdates(appliedTemplates, available)
    return c.json({ updates })
  },
)

// --- Create roles from template suggestions (Epic 321) ---

entitySchema.post('/roles/from-template',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Create custom roles from template suggested roles',
    responses: {
      201: {
        description: 'Roles created from template',
        content: { 'application/json': { schema: resolver(rolesFromTemplateResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('system:manage-roles'),
  validator('json', createRolesFromTemplateBodySchema),
  async (c) => {
    const { roles } = c.req.valid('json')
    const services = c.get('services')
    const pubkey = c.get('pubkey')

    // Validate all permissions in all roles before creating any
    for (const suggested of roles) {
      const invalidPerms = suggested.permissions.filter(p => !isValidPermission(p))
      if (invalidPerms.length > 0) {
        return c.json({
          error: `Invalid permissions: ${invalidPerms.join(', ')}`,
          role: suggested.name,
        }, 400)
      }
    }

    // Fetch existing roles to skip duplicates by slug
    const { roles: existingRoles } = await services.settings.getRoles()
    const existingSlugs = new Set(existingRoles.map(r => r.slug))

    const created: Array<{ id: string; name: string }> = []

    for (const suggested of roles) {
      // Skip roles that already exist by slug
      if (existingSlugs.has(suggested.slug)) continue

      const role = await services.settings.createRole({
        name: suggested.name,
        slug: suggested.slug,
        description: suggested.description,
        permissions: suggested.permissions,
      })

      created.push({ id: role.id, name: role.name })
      existingSlugs.add(suggested.slug)

      await audit(services.audit, 'roleCreatedFromTemplate', pubkey, {
        roleId: role.id,
        roleName: role.name,
      })
    }

    return c.json({ created, count: created.length }, 201)
  },
)

// --- CMS Report Type Definitions (Epic 343) ---

entitySchema.get('/report-types',
  describeRoute({
    tags: ['Case Management'],
    summary: 'List CMS report type definitions',
    responses: {
      200: {
        description: 'Report types list',
        content: { 'application/json': { schema: resolver(cmsReportTypeListResponseSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('settings:read'),
  async (c) => {
    const services = c.get('services')
    const result = await services.settings.getCmsReportTypes()
    return c.json(result)
  },
)

entitySchema.post('/report-types',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Create a new CMS report type definition',
    responses: {
      201: {
        description: 'Report type created',
        content: { 'application/json': { schema: resolver(reportTypeDefinitionSchema) } },
      },
      ...authErrors,
    },
  }),
  requirePermission('cases:manage-types'),
  validator('json', createCmsReportTypeBodySchema),
  async (c) => {
    const body = c.req.valid('json')
    const services = c.get('services')
    const created = await services.settings.createCmsReportType(body as Record<string, unknown>)
    await audit(services.audit, 'reportTypeCreated', c.get('pubkey'), { reportTypeId: created.id, name: created.name })
    return c.json(created, 201)
  },
)

entitySchema.get('/report-types/:id',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Get a CMS report type definition',
    responses: {
      200: {
        description: 'Report type details',
        content: { 'application/json': { schema: resolver(reportTypeDefinitionSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('settings:read'),
  async (c) => {
    const id = c.req.param('id')
    const services = c.get('services')
    const result = await services.settings.getCmsReportTypeById(id)
    return c.json(result)
  },
)

entitySchema.patch('/report-types/:id',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Update a CMS report type definition',
    responses: {
      200: {
        description: 'Report type updated',
        content: { 'application/json': { schema: resolver(reportTypeDefinitionSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:manage-types'),
  validator('json', updateCmsReportTypeBodySchema),
  async (c) => {
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const services = c.get('services')
    const result = await services.settings.updateCmsReportType(id, body as Record<string, unknown>)
    await audit(services.audit, 'reportTypeUpdated', c.get('pubkey'), { reportTypeId: id })
    return c.json(result)
  },
)

entitySchema.delete('/report-types/:id',
  describeRoute({
    tags: ['Case Management'],
    summary: 'Archive a CMS report type definition',
    responses: {
      200: {
        description: 'Report type archived',
        content: { 'application/json': { schema: resolver(reportTypeDefinitionSchema) } },
      },
      ...authErrors,
      ...notFoundError,
    },
  }),
  requirePermission('cases:manage-types'),
  async (c) => {
    const id = c.req.param('id')
    const services = c.get('services')
    const result = await services.settings.deleteCmsReportType(id)
    await audit(services.audit, 'reportTypeArchived', c.get('pubkey'), { reportTypeId: id })
    return c.json(result)
  },
)

export default entitySchema
