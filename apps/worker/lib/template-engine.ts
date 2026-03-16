/**
 * Template application engine.
 *
 * Applies case management templates to a hub by converting template
 * entity types and relationship types into EntityTypeDefinition and
 * RelationshipTypeDefinition records stored in SettingsDO.
 */
import type { CaseManagementTemplate } from '../../../packages/protocol/template-types'
import type { EntityTypeDefinition, RelationshipTypeDefinition, EntityFieldDefinition } from '@protocol/schemas/entity-schema'
import type { ReportTypeDefinition, ReportFieldDefinition } from '@protocol/schemas/report-types'

export interface AppliedTemplateRecord {
  templateId: string
  templateVersion: string
  appliedAt: string
  entityTypeIds: string[]
  relationshipTypeIds: string[]
  reportTypeIds: string[]
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
  existingReportTypes: ReportTypeDefinition[] = [],
): {
  entityTypes: EntityTypeDefinition[]
  relationshipTypes: RelationshipTypeDefinition[]
  reportTypes: ReportTypeDefinition[]
  appliedRecord: AppliedTemplateRecord
} {
  // 1. Resolve extends chain (depth-first)
  // Guard against undefined arrays — template JSON may omit optional fields
  // that Zod would default to [] if parsed, but dynamic imports skip Zod.
  const resolvedEntityTypes = new Map<string, CaseManagementTemplate['entityTypes'][0]>()
  const resolvedRelationships: CaseManagementTemplate['relationshipTypes'] = []

  for (const parentId of (template.extends ?? [])) {
    const parent = allTemplates.get(parentId)
    if (!parent) continue
    for (const et of parent.entityTypes ?? []) {
      resolvedEntityTypes.set(et.name, et)
    }
    resolvedRelationships.push(...(parent.relationshipTypes ?? []))
  }

  // 2. Apply this template's types (overrides parents for same name)
  for (const et of template.entityTypes ?? []) {
    resolvedEntityTypes.set(et.name, et)
  }
  resolvedRelationships.push(...(template.relationshipTypes ?? []))

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

  // Resolve label reference strings from template labels section
  // Template labels are keyed by locale, e.g. template.labels.en["arrest_case.label"] = "Arrest Case"
  const defaultLabels = template.labels.en ?? {}
  const resolveLabel = (ref: string): string => defaultLabels[ref] ?? ref

  for (const [, templateET] of resolvedEntityTypes) {
    const existingId = entityNameToId.get(templateET.name)
    const id = existingId || crypto.randomUUID()
    entityNameToId.set(templateET.name, id)

    const entityType: EntityTypeDefinition = {
      id,
      hubId,
      name: templateET.name,
      label: resolveLabel(templateET.label),
      labelPlural: resolveLabel(templateET.labelPlural),
      description: resolveLabel(templateET.description),
      icon: templateET.icon,
      color: templateET.color,
      category: templateET.category,
      templateId: template.id,
      templateVersion: template.version,
      fields: templateET.fields.map((f, i): EntityFieldDefinition => ({
        id: crypto.randomUUID(),
        name: f.name,
        label: resolveLabel(f.label),
        type: f.type,
        required: f.required ?? false,
        options: f.options,
        section: f.section ? resolveLabel(f.section) : f.section,
        helpText: f.helpText ? resolveLabel(f.helpText) : f.helpText,
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
      })),
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

  // 5. Convert report types (Epic 343)
  // CaseManagementTemplate already includes reportTypes via Zod schema
  type TemplateReportType = CaseManagementTemplate['reportTypes'][number]
  type TemplateField = CaseManagementTemplate['reportTypes'][number]['fields'][number]

  const createdReportTypes: ReportTypeDefinition[] = []

  // Resolve parent template report types (same depth-first pattern as entity types)
  const resolvedReportTypes = new Map<string, TemplateReportType>()
  for (const parentId of (template.extends ?? [])) {
    const parent = allTemplates.get(parentId)
    if (!parent) continue
    for (const rt of (parent.reportTypes ?? [])) {
      resolvedReportTypes.set(rt.name, rt)
    }
  }
  for (const rt of (template.reportTypes ?? [])) {
    resolvedReportTypes.set(rt.name, rt)
  }

  for (const [, templateRT] of resolvedReportTypes) {
    const existingRT = existingReportTypes.find(e => e.name === templateRT.name)
    const id = existingRT?.id || crypto.randomUUID()

    const reportType: ReportTypeDefinition = {
      id,
      hubId,
      name: templateRT.name,
      label: resolveLabel(templateRT.label),
      labelPlural: resolveLabel(templateRT.labelPlural),
      description: resolveLabel(templateRT.description ?? ''),
      icon: templateRT.icon,
      color: templateRT.color,
      category: 'report',
      templateId: template.id,
      templateVersion: template.version,
      fields: templateRT.fields.map((f: TemplateField, i: number): ReportFieldDefinition => ({
        id: crypto.randomUUID(),
        name: f.name,
        label: resolveLabel(f.label),
        type: f.type,
        required: f.required ?? false,
        options: f.options,
        section: f.section ? resolveLabel(f.section) : undefined,
        helpText: f.helpText ? resolveLabel(f.helpText) : undefined,
        order: f.order ?? i,
        indexable: f.indexable ?? false,
        indexType: f.indexType ?? 'none',
        accessLevel: f.accessLevel ?? 'all',
        visibleToVolunteers: true,
        editableByVolunteers: true,
        showWhen: f.showWhen,
        templateId: template.id,
        hubEditable: f.hubEditable ?? true,
        supportAudioInput: f.supportAudioInput ?? false,
        createdAt: now,
      })),
      statuses: templateRT.statuses,
      defaultStatus: templateRT.defaultStatus,
      closedStatuses: templateRT.closedStatuses ?? [],
      numberPrefix: templateRT.numberPrefix,
      numberingEnabled: templateRT.numberingEnabled ?? false,
      allowFileAttachments: templateRT.allowFileAttachments ?? true,
      allowCaseConversion: templateRT.allowCaseConversion ?? false,
      mobileOptimized: templateRT.mobileOptimized ?? false,
      isArchived: false,
      isSystem: false,
      createdAt: existingRT?.createdAt ?? now,
      updatedAt: now,
    }

    createdReportTypes.push(reportType)
  }

  return {
    entityTypes: createdEntityTypes,
    relationshipTypes: createdRelationshipTypes,
    reportTypes: createdReportTypes,
    appliedRecord: {
      templateId: template.id,
      templateVersion: template.version,
      appliedAt: now,
      entityTypeIds: createdEntityTypes.map(e => e.id),
      relationshipTypeIds: createdRelationshipTypes.map(r => r.id),
      reportTypeIds: createdReportTypes.map(r => r.id),
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
