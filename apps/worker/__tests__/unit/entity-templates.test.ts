import { describe, it, expect, beforeEach } from 'bun:test'
import { EntityTemplatesService } from '../../services/entity-templates'

function makeService() {
  return new EntityTemplatesService()
}

describe('EntityTemplatesService', () => {
  describe('listBuiltinTemplates', () => {
    it('returns 4 builtin templates', () => {
      const service = makeService()
      const templates = service.listBuiltinTemplates()
      expect(templates).toHaveLength(4)
    })

    it('includes an event template with category=event', () => {
      const service = makeService()
      const templates = service.listBuiltinTemplates()
      const event = templates.find(t => t.category === 'event')
      expect(event).toBeDefined()
      expect(event!.id).toBe('builtin:event')
    })

    it('event template has start_date field with indexType=date', () => {
      const service = makeService()
      const templates = service.listBuiltinTemplates()
      const event = templates.find(t => t.category === 'event')!
      const startDate = event.fields.find(f => f.name === 'start_date')
      expect(startDate).toBeDefined()
      expect(startDate!.indexType).toBe('date')
      expect(startDate!.indexable).toBe(true)
    })

    it('event template has location field with indexType=location', () => {
      const service = makeService()
      const templates = service.listBuiltinTemplates()
      const event = templates.find(t => t.category === 'event')!
      const location = event.fields.find(f => f.name === 'location')
      expect(location).toBeDefined()
      expect(location!.indexType).toBe('location')
      expect(location!.type).toBe('location')
    })

    it('case template has category=case', () => {
      const service = makeService()
      const templates = service.listBuiltinTemplates()
      const caseTemplate = templates.find(t => t.category === 'case')
      expect(caseTemplate).toBeDefined()
      expect(caseTemplate!.id).toBe('builtin:case')
    })

    it('all templates have at least one status', () => {
      const service = makeService()
      const templates = service.listBuiltinTemplates()
      for (const t of templates) {
        expect(t.statuses.length).toBeGreaterThan(0)
      }
    })
  })
})
