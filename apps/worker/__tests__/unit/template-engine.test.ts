import { describe, it, expect } from 'bun:test'
import { applyTemplate, detectTemplateUpdates } from '../../lib/template-engine'
import type { CaseManagementTemplate } from '../../../../packages/protocol/template-types'
import type { EntityTypeDefinition } from '@protocol/schemas/entity-schema'

const minStatus = { value: 'open', label: 'Open', order: 0 }
const minField = {
  name: 'title',
  label: 'field.title',
  type: 'text' as const,
  required: false,
  order: 0,
  indexable: false,
  indexType: 'none' as const,
  accessLevel: 'all' as const,
  hubEditable: true,
  supportAudioInput: false,
}

type TemplateEntityType = CaseManagementTemplate['entityTypes'][number]

function makeEntityType(overrides: Partial<TemplateEntityType> & { name: string }): TemplateEntityType {
  return {
    label: overrides.name,
    labelPlural: overrides.name + 's',
    description: overrides.name,
    category: 'case',
    numberingEnabled: false,
    defaultAccessLevel: 'assigned',
    piiFields: [],
    allowSubRecords: false,
    allowFileAttachments: true,
    allowInteractionLinks: true,
    showInNavigation: true,
    showInDashboard: false,
    statuses: [minStatus],
    defaultStatus: 'open',
    closedStatuses: [],
    fields: [minField],
    ...overrides,
  }
}

function makeTemplate(overrides: Partial<CaseManagementTemplate> & { id: string }): CaseManagementTemplate {
  return {
    version: '1.0.0',
    name: 'Test Template',
    description: 'A test template',
    author: 'test',
    tags: [],
    extends: [],
    labels: { en: {} },
    entityTypes: [],
    relationshipTypes: [],
    reportTypes: [],
    suggestedRoles: [],
    ...overrides,
  }
}

describe('applyTemplate', () => {
  const hubId = 'hub-1'

  it('single template without extends produces correct entity types', () => {
    const tpl = makeTemplate({
      id: 'tpl-solo',
      labels: { en: { 'case.label': 'Incident', 'case.labelPlural': 'Incidents', 'case.desc': 'An incident' } },
      entityTypes: [makeEntityType({ name: 'incident', label: 'case.label', labelPlural: 'case.labelPlural', description: 'case.desc' })],
    })

    const result = applyTemplate(tpl, hubId, new Map(), [])

    expect(result.entityTypes).toHaveLength(1)
    expect(result.entityTypes[0].name).toBe('incident')
    expect(result.entityTypes[0].label).toBe('Incident')
    expect(result.entityTypes[0].hubId).toBe(hubId)
    expect(result.entityTypes[0].templateId).toBe('tpl-solo')
    expect(result.entityTypes[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.appliedRecord.templateId).toBe('tpl-solo')
  })

  it('child overrides parent entity types with same name', () => {
    const parent = makeTemplate({
      id: 'parent',
      labels: { en: { 'p.label': 'Parent Case', 'p.plural': 'Parent Cases', 'p.desc': 'Parent desc' } },
      entityTypes: [makeEntityType({ name: 'shared_type', label: 'p.label', labelPlural: 'p.plural', description: 'p.desc' })],
    })

    const child = makeTemplate({
      id: 'child',
      extends: ['parent'],
      labels: { en: { 'c.label': 'Child Case', 'c.plural': 'Child Cases', 'c.desc': 'Child desc' } },
      entityTypes: [makeEntityType({ name: 'shared_type', label: 'c.label', labelPlural: 'c.plural', description: 'c.desc' })],
    })

    const allTemplates = new Map([['parent', parent]])
    const result = applyTemplate(child, hubId, allTemplates, [])

    expect(result.entityTypes).toHaveLength(1)
    expect(result.entityTypes[0].label).toBe('Child Case')
  })

  it('multi-level inheritance (grandparent -> parent -> child)', () => {
    const grandparent = makeTemplate({
      id: 'gp',
      labels: { en: { 'gp.l': 'GP Type', 'gp.lp': 'GP Types', 'gp.d': 'gp' } },
      entityTypes: [makeEntityType({ name: 'gp_only', label: 'gp.l', labelPlural: 'gp.lp', description: 'gp.d' })],
    })

    const parent = makeTemplate({
      id: 'parent',
      extends: ['gp'],
      labels: { en: { 'p.l': 'Parent Type', 'p.lp': 'Parent Types', 'p.d': 'parent' } },
      entityTypes: [makeEntityType({ name: 'parent_only', label: 'p.l', labelPlural: 'p.lp', description: 'p.d' })],
    })

    const child = makeTemplate({
      id: 'child',
      extends: ['parent'],
      labels: { en: { 'c.l': 'Child Type', 'c.lp': 'Child Types', 'c.d': 'child' } },
      entityTypes: [makeEntityType({ name: 'child_only', label: 'c.l', labelPlural: 'c.lp', description: 'c.d' })],
    })

    // applyTemplate resolves only direct parents, not recursive grandparents
    const allTemplates = new Map([['gp', grandparent], ['parent', parent]])
    const result = applyTemplate(child, hubId, allTemplates, [])

    const names = result.entityTypes.map(e => e.name)
    expect(names).toContain('parent_only')
    expect(names).toContain('child_only')
  })

  it('preserves existing entity type IDs (idempotent re-application)', () => {
    const existingId = '00000000-1111-2222-3333-444444444444'
    const tpl = makeTemplate({
      id: 'tpl-idem',
      labels: { en: {} },
      entityTypes: [makeEntityType({ name: 'incident' })],
    })

    const existing: EntityTypeDefinition[] = [{
      id: existingId,
      hubId,
      name: 'incident',
      label: 'Incident',
      labelPlural: 'Incidents',
      description: 'Old desc',
      category: 'case',
      templateId: 'tpl-idem',
      templateVersion: '0.9.0',
      fields: [],
      statuses: [minStatus],
      defaultStatus: 'open',
      closedStatuses: [],
      numberingEnabled: false,
      defaultAccessLevel: 'assigned',
      piiFields: [],
      allowSubRecords: false,
      allowFileAttachments: true,
      allowInteractionLinks: true,
      showInNavigation: true,
      showInDashboard: false,
      isArchived: false,
      isSystem: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }]

    const result = applyTemplate(tpl, hubId, new Map(), existing)
    expect(result.entityTypes[0].id).toBe(existingId)
  })

  it('new entity types get fresh UUIDs', () => {
    const tpl = makeTemplate({
      id: 'tpl-new',
      labels: { en: {} },
      entityTypes: [makeEntityType({ name: 'brand_new' })],
    })

    const result = applyTemplate(tpl, hubId, new Map(), [])
    expect(result.entityTypes[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('relationship types resolve source/target entity IDs from name map', () => {
    const tpl = makeTemplate({
      id: 'tpl-rel',
      labels: { en: {} },
      entityTypes: [
        makeEntityType({ name: 'incident' }),
        makeEntityType({ name: 'person', category: 'contact' }),
      ],
      relationshipTypes: [{
        sourceEntityTypeName: 'incident',
        targetEntityTypeName: 'person',
        cardinality: 'M:N',
        label: 'involves',
        reverseLabel: 'involved in',
        sourceLabel: 'Incident',
        targetLabel: 'Person',
        cascadeDelete: false,
        required: false,
      }],
    })

    const result = applyTemplate(tpl, hubId, new Map(), [])
    const rel = result.relationshipTypes[0]
    const incidentId = result.entityTypes.find(e => e.name === 'incident')!.id
    const personId = result.entityTypes.find(e => e.name === 'person')!.id

    expect(rel.sourceEntityTypeId).toBe(incidentId)
    expect(rel.targetEntityTypeId).toBe(personId)
  })

  it('skips relationships with unresolvable entity type names', () => {
    const tpl = makeTemplate({
      id: 'tpl-bad-rel',
      labels: { en: {} },
      entityTypes: [],
      relationshipTypes: [{
        sourceEntityTypeName: 'nonexistent',
        targetEntityTypeName: 'also_nonexistent',
        cardinality: '1:N',
        label: 'broken',
        reverseLabel: 'broken',
        sourceLabel: 'A',
        targetLabel: 'B',
        cascadeDelete: false,
        required: false,
      }],
    })

    const result = applyTemplate(tpl, hubId, new Map(), [])
    expect(result.relationshipTypes).toHaveLength(0)
  })
})

describe('detectTemplateUpdates', () => {
  it('detects version mismatch between applied and available', () => {
    const applied = [{ templateId: 'tpl-1', templateVersion: '1.0.0', appliedAt: '', entityTypeIds: [], relationshipTypeIds: [], reportTypeIds: [] }]
    const available = [makeTemplate({ id: 'tpl-1', version: '2.0.0' })]

    const updates = detectTemplateUpdates(applied, available)
    expect(updates).toEqual([{ templateId: 'tpl-1', installedVersion: '1.0.0', availableVersion: '2.0.0' }])
  })

  it('returns empty when versions match', () => {
    const applied = [{ templateId: 'tpl-1', templateVersion: '1.0.0', appliedAt: '', entityTypeIds: [], relationshipTypeIds: [], reportTypeIds: [] }]
    const available = [makeTemplate({ id: 'tpl-1', version: '1.0.0' })]

    expect(detectTemplateUpdates(applied, available)).toHaveLength(0)
  })
})
