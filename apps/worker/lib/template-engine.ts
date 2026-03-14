/**
 * Template application engine.
 *
 * Applies case management templates to a hub by converting template
 * entity types and relationship types into EntityTypeDefinition and
 * RelationshipTypeDefinition records stored in SettingsDO.
 */
import type { CaseManagementTemplate } from '../../../packages/protocol/template-types'
import type { EntityTypeDefinition, RelationshipTypeDefinition, EntityFieldDefinition } from '../schemas/entity-schema'

export interface AppliedTemplateRecord {
  templateId: string
  templateVersion: string
  appliedAt: string
  entityTypeIds: string[]
  relationshipTypeIds: string[]
}

/**
 * Apply a template to a hub, creating entity types and relationship types.
 * If the template extends others, parent types are resolved first (depth-first).
 *
 * Returns the created entity types, relationship types, and a tracking record.
 */
export function applyTemplate(
  template: CaseManagementTemplate,
  hubId: string,
  allTemplates: Map<string, CaseManagementTemplate>,
  existingEntityTypes: EntityTypeDefinition[],
): {
  entityTypes: EntityTypeDefinition[]
  relationshipTypes: RelationshipTypeDefinition[]
  appliedRecord: AppliedTemplateRecord
} {
  // 1. Resolve extends chain (depth-first)
  const resolvedEntityTypes = new Map<string, CaseManagementTemplate['entityTypes'][0]>()
  const resolvedRelationships: CaseManagementTemplate['relationshipTypes'] = []

  for (const parentId of template.extends) {
    const parent = allTemplates.get(parentId)
    if (!parent) continue
    for (const et of parent.entityTypes) {
      resolvedEntityTypes.set(et.name, et)
    }
    resolvedRelationships.push(...parent.relationshipTypes)
  }

  // 2. Apply this template's types (overrides parents for same name)
  for (const et of template.entityTypes) {
    resolvedEntityTypes.set(et.name, et)
  }
  resolvedRelationships.push(...template.relationshipTypes)

  // 3. Convert to EntityTypeDefinitions
  const entityNameToId = new Map<string, string>()
  // Pre-populate with existing entity type names → IDs for idempotent re-application
  for (const existing of existingEntityTypes) {
    entityNameToId.set(existing.name, existing.id)
  }
  // "contact" is a built-in sentinel
  entityNameToId.set('contact', 'contact')

  const createdEntityTypes: EntityTypeDefinition[] = []
  const now = new Date().toISOString()

  for (const [, templateET] of resolvedEntityTypes) {
    const existingId = entityNameToId.get(templateET.name)
    const id = existingId || crypto.randomUUID()
    entityNameToId.set(templateET.name, id)

    const entityType: EntityTypeDefinition = {
      id,
      hubId,
      name: templateET.name,
      label: templateET.label,
      labelPlural: templateET.labelPlural,
      description: templateET.description,
      icon: templateET.icon,
      color: templateET.color,
      category: templateET.category,
      templateId: template.id,
      templateVersion: template.version,
      fields: templateET.fields.map((f: typeof templateET.fields[number], i: number) => ({
        id: crypto.randomUUID(),
        name: f.name,
        label: f.label,
        type: f.type,
        required: f.required ?? false,
        options: f.options,
        section: f.section,
        helpText: f.helpText,
        order: f.order ?? i,
        indexable: f.indexable ?? false,
        indexType: f.indexType ?? 'none',
        accessLevel: f.accessLevel ?? 'all',
        visibleToVolunteers: true,
        editableByVolunteers: true,
        showWhen: f.showWhen,
        templateId: template.id,
        hubEditable: f.hubEditable ?? true,
        createdAt: now,
      } as EntityFieldDefinition)),
      statuses: templateET.statuses,
      defaultStatus: templateET.defaultStatus,
      closedStatuses: templateET.closedStatuses,
      severities: templateET.severities,
      defaultSeverity: templateET.defaultSeverity,
      categories: templateET.categories,
      contactRoles: templateET.contactRoles,
      numberPrefix: templateET.numberPrefix,
      numberingEnabled: templateET.numberingEnabled ?? false,
      defaultAccessLevel: templateET.defaultAccessLevel ?? 'assigned',
      piiFields: templateET.piiFields ?? [],
      allowSubRecords: templateET.allowSubRecords ?? false,
      allowFileAttachments: templateET.allowFileAttachments ?? true,
      allowInteractionLinks: templateET.allowInteractionLinks ?? true,
      showInNavigation: templateET.showInNavigation ?? true,
      showInDashboard: templateET.showInDashboard ?? false,
      isArchived: false,
      isSystem: false,
      createdAt: existingId
        ? (existingEntityTypes.find(e => e.id === existingId)?.createdAt ?? now)
        : now,
      updatedAt: now,
    }

    createdEntityTypes.push(entityType)
  }

  // 4. Convert relationship types
  const createdRelationshipTypes: RelationshipTypeDefinition[] = []
  for (const rt of resolvedRelationships) {
    const sourceId = entityNameToId.get(rt.sourceEntityTypeName)
    const targetId = entityNameToId.get(rt.targetEntityTypeName)
    if (!sourceId || !targetId) continue

    createdRelationshipTypes.push({
      id: crypto.randomUUID(),
      hubId,
      sourceEntityTypeId: sourceId,
      targetEntityTypeId: targetId,
      cardinality: rt.cardinality,
      label: rt.label,
      reverseLabel: rt.reverseLabel,
      sourceLabel: rt.sourceLabel,
      targetLabel: rt.targetLabel,
      roles: rt.roles,
      defaultRole: rt.defaultRole,
      cascadeDelete: rt.cascadeDelete ?? false,
      required: rt.required ?? false,
      templateId: template.id,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    })
  }

  return {
    entityTypes: createdEntityTypes,
    relationshipTypes: createdRelationshipTypes,
    appliedRecord: {
      templateId: template.id,
      templateVersion: template.version,
      appliedAt: now,
      entityTypeIds: createdEntityTypes.map(e => e.id),
      relationshipTypeIds: createdRelationshipTypes.map(r => r.id),
    },
  }
}

/**
 * Detect available template updates by comparing installed vs available versions.
 */
export function detectTemplateUpdates(
  appliedTemplates: AppliedTemplateRecord[],
  availableTemplates: CaseManagementTemplate[],
): Array<{ templateId: string; installedVersion: string; availableVersion: string }> {
  const updates: Array<{ templateId: string; installedVersion: string; availableVersion: string }> = []

  for (const applied of appliedTemplates) {
    const available = availableTemplates.find(t => t.id === applied.templateId)
    if (!available) continue
    if (available.version !== applied.templateVersion) {
      updates.push({
        templateId: applied.templateId,
        installedVersion: applied.templateVersion,
        availableVersion: available.version,
      })
    }
  }

  return updates
}
