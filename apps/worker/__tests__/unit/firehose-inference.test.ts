import { describe, it, expect, vi } from 'vitest'
import { FirehoseInferenceClient } from '@worker/services/firehose-inference'

describe('FirehoseInferenceClient', () => {
  function setup() {
    const client = new FirehoseInferenceClient('http://localhost:8000/v1', 'test-model')
    const mockCreate = vi.fn()
    ;(client as any).client = { chat: { completions: { create: mockCreate } } }
    return { client, mockCreate }
  }

  describe('buildJsonSchemaFromFields', () => {
    it('builds schema with text fields', () => {
      const { client } = setup()
      const schema = client.buildJsonSchemaFromFields([
        { name: 'description', label: 'Description', type: 'text', required: true, options: [] },
      ])

      expect(schema.type).toBe('object')
      expect(schema.properties.description.type).toBe('string')
      expect(schema.required).toContain('description')
    })

    it('builds schema with select field using enum', () => {
      const { client } = setup()
      const schema = client.buildJsonSchemaFromFields([
        { name: 'category', label: 'Category', type: 'select', required: false, options: ['A', 'B'] },
      ])

      expect(schema.properties.category.enum).toEqual(['A', 'B'])
    })

    it('builds schema with number field as string', () => {
      const { client } = setup()
      const schema = client.buildJsonSchemaFromFields([
        { name: 'count', label: 'Count', type: 'number', required: false, options: [] },
      ])

      expect(schema.properties.count.type).toBe('string')
      expect(schema.properties.count.description).toContain('numeric')
    })

    it('builds schema with checkbox field as yes/no', () => {
      const { client } = setup()
      const schema = client.buildJsonSchemaFromFields([
        { name: 'urgent', label: 'Urgent', type: 'checkbox', required: false, options: [] },
      ])

      expect(schema.properties.urgent.type).toBe('string')
      expect(schema.properties.urgent.description).toContain('yes or no')
    })

    it('builds schema with multiselect field', () => {
      const { client } = setup()
      const schema = client.buildJsonSchemaFromFields([
        { name: 'tags', label: 'Tags', type: 'multiselect', required: false, options: ['x', 'y'] },
      ])

      expect(schema.properties.tags.type).toBe('string')
      expect(schema.properties.tags.description).toContain('comma-separated')
    })

    it('handles empty fields', () => {
      const { client } = setup()
      const schema = client.buildJsonSchemaFromFields([])

      expect(schema.type).toBe('object')
      expect(Object.keys(schema.properties)).toHaveLength(0)
      expect(schema.required).toHaveLength(0)
    })
  })

  describe('extractReport', () => {
    it('extracts fields from LLM response', async () => {
      const { client, mockCreate } = setup()
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ field1: 'value1', confidence: 0.9 }) } }],
      })

      const result = await client.extractReport(
        [{ id: 'm1', senderUsername: 'u1', content: 'hello', timestamp: '2024-01-01T00:00:00Z' }],
        { type: 'object', properties: { field1: { type: 'string', description: 'test' } }, required: [] },
      )

      expect(result.fields.field1).toBe('value1')
      expect(result.confidence).toBe(0.9)
    })

    it('throws when LLM returns no content', async () => {
      const { client, mockCreate } = setup()
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null }, finish_reason: 'length' }],
      })

      await expect(client.extractReport([], { type: 'object', properties: {}, required: [] }))
        .rejects.toThrow('No extraction response from LLM')
    })

    it('throws when LLM returns invalid JSON', async () => {
      const { client, mockCreate } = setup()
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'not json' } }],
      })

      await expect(client.extractReport([], { type: 'object', properties: {}, required: [] }))
        .rejects.toThrow('LLM returned invalid JSON')
    })

    it('defaults confidence to 0.5 when missing', async () => {
      const { client, mockCreate } = setup()
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ field1: 'value1' }) } }],
      })

      const result = await client.extractReport([], { type: 'object', properties: {}, required: [] })
      expect(result.confidence).toBe(0.5)
    })
  })

  describe('detectIncidentBoundaries', () => {
    it('returns LLM clusters when valid', async () => {
      const { client, mockCreate } = setup()
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ clusters: [{ id: 'c1', messageIds: ['m1'], confidence: 0.8 }] }) } }],
      })

      const messages = [{ id: 'm1', senderUsername: 'u1', content: 'hello', timestamp: '2024-01-01T00:00:00Z' }]
      const result = await client.detectIncidentBoundaries(messages, [])

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('c1')
    })

    it('falls back to heuristic clusters on invalid JSON', async () => {
      const { client, mockCreate } = setup()
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'bad json' } }],
      })

      const candidates = [{ id: 'h1', messages: [], confidence: 0.7 }]
      const result = await client.detectIncidentBoundaries([], candidates)
      expect(result).toEqual(candidates)
    })

    it('falls back when clusters array missing', async () => {
      const { client, mockCreate } = setup()
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({}) } }],
      })

      const candidates = [{ id: 'h1', messages: [], confidence: 0.7 }]
      const result = await client.detectIncidentBoundaries([], candidates)
      expect(result).toEqual(candidates)
    })
  })

  describe('healthCheck', () => {
    it('returns ok when models list succeeds', async () => {
      const { client } = setup()
      ;(client as any).client = { models: { list: vi.fn().mockResolvedValue({}) } }

      const result = await client.healthCheck()
      expect(result.ok).toBe(true)
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    })

    it('returns error when models list fails', async () => {
      const { client } = setup()
      ;(client as any).client = { models: { list: vi.fn().mockRejectedValue(new Error('timeout')) } }

      const result = await client.healthCheck()
      expect(result.ok).toBe(false)
      expect(result.error).toBe('timeout')
    })
  })
})
