import { describe, it, expect, beforeEach } from 'vitest'
import { ProviderTemplateService } from '@worker/services/provider-setup/templates'
import { ProviderApiError } from '@worker/services/provider-setup/types'
import { createMockDb } from './mock-db'

function setup() {
  const { db, reset } = createMockDb()
  const service = new ProviderTemplateService(db as any)
  return { db, service, reset }
}

function makeTemplateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    name: 'Twilio Hotline',
    slug: 'twilio-hotline',
    description: 'Standard Twilio setup',
    providerType: 'twilio',
    defaultChannels: ['voice', 'sms'],
    credentialHints: { accountSid: 'Your Account SID', authToken: 'Your Auth Token' },
    recommendedSettings: { a2pRequired: true },
    allowSubAccounts: false,
    isActive: true,
    createdBy: 'admin-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('ProviderTemplateService', () => {
  beforeEach(() => {
    const { reset } = setup()
    reset()
  })

  describe('createTemplate', () => {
    it('creates a template with valid data', async () => {
      const { db, service } = setup()
      db.$setSelectResult([])

      const result = await service.createTemplate({
        name: 'Twilio Hotline',
        slug: 'twilio-hotline',
        description: 'Standard Twilio setup',
        providerType: 'twilio',
        defaultChannels: ['voice', 'sms'],
        credentialHints: { accountSid: 'Your Account SID' },
        recommendedSettings: { a2pRequired: true },
        allowSubAccounts: false,
        isActive: true,
        createdBy: 'admin-1',
      } as any)

      expect(result.name).toBe('Twilio Hotline')
      expect(result.slug).toBe('twilio-hotline')
      expect(result.providerType).toBe('twilio')
      expect(result.defaultChannels).toEqual(['voice', 'sms'])
      expect(result.isActive).toBe(true)
    })

    it('rejects duplicate slug', async () => {
      const { db, service } = setup()
      db.$setSelectResult([makeTemplateRow()])

      await expect(
        service.createTemplate({
          name: 'Duplicate',
          slug: 'twilio-hotline',
          providerType: 'twilio',
          createdBy: 'admin-1',
        } as any),
      ).rejects.toThrow(ProviderApiError)
    })

    it('rejects credential hints that look like secrets', async () => {
      const { db, service } = setup()
      db.$setSelectResult([])

      await expect(
        service.createTemplate({
          name: 'Bad Template',
          slug: 'bad-template',
          providerType: 'twilio',
          createdBy: 'admin-1',
          credentialHints: { authToken: 'sk_live_abc123def456' },
        } as any),
      ).rejects.toThrow('appears to contain a real secret')
    })

    it('rejects long credential hint values', async () => {
      const { db, service } = setup()
      db.$setSelectResult([])

      await expect(
        service.createTemplate({
          name: 'Bad Template',
          slug: 'bad-template-2',
          providerType: 'twilio',
          createdBy: 'admin-1',
          credentialHints: { cert: 'a'.repeat(101) },
        } as any),
      ).rejects.toThrow('appears to contain a real secret')
    })
  })

  describe('updateTemplate', () => {
    it('updates template fields', async () => {
      const { db, service } = setup()
      db.$setSelectResults([[makeTemplateRow()], [makeTemplateRow({ name: 'Updated Name' })]])

      const result = await service.updateTemplate('tpl-1', { name: 'Updated Name' })
      expect(result.name).toBe('Updated Name')
    })

    it('rejects slug change to existing slug', async () => {
      const { db, service } = setup()
      db.$setSelectResults([
        [makeTemplateRow()],
        [makeTemplateRow({ id: 'tpl-2', slug: 'other-slug' })],
      ])

      await expect(
        service.updateTemplate('tpl-1', { slug: 'other-slug' }),
      ).rejects.toThrow('already exists')
    })

    it('returns 404 for non-existent template', async () => {
      const { db, service } = setup()
      db.$setSelectResult([])

      await expect(service.updateTemplate('missing', { name: 'X' })).rejects.toThrow(
        'Template not found',
      )
    })
  })

  describe('deactivateTemplate', () => {
    it('sets isActive to false', async () => {
      const { db, service } = setup()
      db.$setSelectResults([[makeTemplateRow()], [makeTemplateRow({ isActive: false })]])

      const result = await service.deactivateTemplate('tpl-1')
      expect(result.isActive).toBe(false)
    })
  })

  describe('listTemplates', () => {
    it('returns only active templates by default', async () => {
      const { db, service } = setup()
      db.$setSelectResult([
        makeTemplateRow(),
        makeTemplateRow({ id: 'tpl-2', slug: 'inactive', isActive: false }),
      ])

      const results = await service.listTemplates()
      expect(results).toHaveLength(2)
    })

    it('returns all templates when activeOnly is false', async () => {
      const { db, service } = setup()
      db.$setSelectResult([
        makeTemplateRow(),
        makeTemplateRow({ id: 'tpl-2', slug: 'inactive', isActive: false }),
      ])

      const results = await service.listTemplates(false)
      expect(results).toHaveLength(2)
    })
  })

  describe('getTemplate', () => {
    it('returns template by id', async () => {
      const { db, service } = setup()
      db.$setSelectResult([makeTemplateRow()])

      const result = await service.getTemplate('tpl-1')
      expect(result).not.toBeNull()
      expect(result?.id).toBe('tpl-1')
    })

    it('returns null for missing template', async () => {
      const { db, service } = setup()
      db.$setSelectResult([])

      const result = await service.getTemplate('missing')
      expect(result).toBeNull()
    })
  })

  describe('getTemplateBySlug', () => {
    it('returns template by slug', async () => {
      const { db, service } = setup()
      db.$setSelectResult([makeTemplateRow()])

      const result = await service.getTemplateBySlug('twilio-hotline')
      expect(result).not.toBeNull()
      expect(result?.slug).toBe('twilio-hotline')
    })
  })
})
