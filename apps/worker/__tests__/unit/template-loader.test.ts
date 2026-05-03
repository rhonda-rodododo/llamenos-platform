import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CaseManagementTemplate } from '../../../../packages/protocol/template-types'

function makeTemplate(id: string): CaseManagementTemplate {
  return {
    id,
    version: '1.0.0',
    name: id,
    description: `Template for ${id}`,
    author: 'test',
    tags: [id],
    extends: [],
    labels: {},
    entityTypes: [],
    relationshipTypes: [],
    reportTypes: [],
    suggestedRoles: [],
  }
}

describe('template-loader', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function loadTemplates(importFn: (path: string) => Promise<unknown>) {
    const { loadBundledTemplates } = await import('@worker/lib/template-loader')
    return loadBundledTemplates(importFn)
  }

  it('loads templates from dynamic imports', async () => {
    const template = makeTemplate('general-hotline')
    const importFn = vi.fn().mockImplementation((path: string) => {
      if (path.includes('general-hotline')) return Promise.resolve({ default: template })
      return Promise.reject(new Error('Module not found'))
    })
    const templates = await loadTemplates(importFn)
    expect(templates).toHaveLength(1)
    expect(templates[0].id).toBe('general-hotline')
    expect(importFn).toHaveBeenCalledWith('../../../packages/protocol/templates/general-hotline.json')
  })

  it('caches templates on second call', async () => {
    const template = makeTemplate('general-hotline')
    const importFn = vi.fn().mockResolvedValue({ default: template })
    const { loadBundledTemplates } = await import('@worker/lib/template-loader')
    const first = await loadBundledTemplates(importFn)
    const second = await loadBundledTemplates(importFn)
    expect(first).toBe(second)
    expect(importFn).toHaveBeenCalledTimes(13)
  })

  it('silently skips missing template files', async () => {
    const template = makeTemplate('general-hotline')
    const importFn = vi.fn().mockImplementation((path: string) => {
      if (path.includes('general-hotline')) return Promise.resolve({ default: template })
      return Promise.reject(new Error('Module not found'))
    })
    const templates = await loadTemplates(importFn)
    expect(templates).toHaveLength(1)
    expect(templates[0].id).toBe('general-hotline')
  })

  it('handles modules without a default export (uses mod directly)', async () => {
    const template = makeTemplate('jail-support')
    const importFn = vi.fn().mockImplementation((path: string) => {
      if (path.includes('jail-support')) return Promise.resolve(template)
      return Promise.reject(new Error('Module not found'))
    })
    const templates = await loadTemplates(importFn)
    expect(templates.some((t) => t.id === 'jail-support')).toBe(true)
  })

  it('returns multiple templates when multiple files exist', async () => {
    const t1 = makeTemplate('general-hotline')
    const t2 = makeTemplate('jail-support')
    const importFn = vi.fn().mockImplementation((path: string) => {
      if (path.includes('general-hotline')) return Promise.resolve({ default: t1 })
      if (path.includes('jail-support')) return Promise.resolve({ default: t2 })
      return Promise.reject(new Error('Module not found'))
    })
    const templates = await loadTemplates(importFn)
    expect(templates).toHaveLength(2)
    expect(templates.map((t) => t.id).sort()).toEqual(['general-hotline', 'jail-support'])
  })

  it('returns empty array when all template files are missing', async () => {
    const importFn = vi.fn().mockRejectedValue(new Error('Module not found'))
    const templates = await loadTemplates(importFn)
    expect(templates).toEqual([])
  })
})
