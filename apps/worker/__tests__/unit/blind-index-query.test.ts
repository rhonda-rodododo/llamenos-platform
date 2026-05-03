import { describe, it, expect } from 'bun:test'
import { parseBlindIndexFilters, matchesBlindIndexFilters } from '@worker/lib/blind-index-query'

describe('parseBlindIndexFilters', () => {
  it('extracts params ending in Hash', () => {
    const params = new URLSearchParams('statusHash=abc123&severityHash=def456')
    const filters = parseBlindIndexFilters(params)
    expect(filters.get('statusHash')).toEqual(['abc123'])
    expect(filters.get('severityHash')).toEqual(['def456'])
  })

  it('extracts params starting with field_', () => {
    const params = new URLSearchParams('field_type=xyz789')
    const filters = parseBlindIndexFilters(params)
    expect(filters.get('field_type')).toEqual(['xyz789'])
  })

  it('extracts temporal params (_day, _week, _month)', () => {
    const params = new URLSearchParams('created_day=aaa&updated_week=bbb&created_month=ccc')
    const filters = parseBlindIndexFilters(params)
    expect(filters.get('created_day')).toEqual(['aaa'])
    expect(filters.get('updated_week')).toEqual(['bbb'])
    expect(filters.get('created_month')).toEqual(['ccc'])
  })

  it('extracts nameToken', () => {
    const params = new URLSearchParams('nameToken=tok1')
    const filters = parseBlindIndexFilters(params)
    expect(filters.get('nameToken')).toEqual(['tok1'])
  })

  it('splits comma-separated values into an OR list', () => {
    const params = new URLSearchParams('statusHash=abc,def,ghi')
    const filters = parseBlindIndexFilters(params)
    expect(filters.get('statusHash')).toEqual(['abc', 'def', 'ghi'])
  })

  it('ignores non-index params', () => {
    const params = new URLSearchParams('page=1&limit=20&q=search')
    const filters = parseBlindIndexFilters(params)
    expect(filters.size).toBe(0)
  })

  it('returns empty map for empty params', () => {
    expect(parseBlindIndexFilters(new URLSearchParams()).size).toBe(0)
  })
})

describe('matchesBlindIndexFilters', () => {
  it('returns true when all filters match (AND logic)', () => {
    const record = { statusHash: 'status-abc', severityHash: 'sev-xyz' }
    const filters = new Map([
      ['statusHash', ['status-abc']],
      ['severityHash', ['sev-xyz']],
    ])
    expect(matchesBlindIndexFilters(record, filters)).toBe(true)
  })

  it('returns false when one filter does not match', () => {
    const record = { statusHash: 'status-abc', severityHash: 'sev-xyz' }
    const filters = new Map([
      ['statusHash', ['status-abc']],
      ['severityHash', ['sev-WRONG']],
    ])
    expect(matchesBlindIndexFilters(record, filters)).toBe(false)
  })

  it('returns true for empty filter set', () => {
    expect(matchesBlindIndexFilters({ statusHash: 'abc' }, new Map())).toBe(true)
  })

  it('returns false when filter key is missing from record', () => {
    const filters = new Map([['statusHash', ['abc']]])
    expect(matchesBlindIndexFilters({}, filters)).toBe(false)
  })

  it('matches any value in comma-separated OR list (exact index)', () => {
    const record = { statusHash: 'march-tok' }
    const filters = new Map([['statusHash', ['jan-tok', 'march-tok', 'dec-tok']]])
    expect(matchesBlindIndexFilters(record, filters)).toBe(true)
  })

  it('matches trigram/multi-value index via any token', () => {
    const record = { nameToken: ['tok-a', 'tok-b', 'tok-c'] }
    const filters = new Map([['nameToken', ['tok-b']]])
    expect(matchesBlindIndexFilters(record, filters)).toBe(true)
  })

  it('returns false when no token matches in trigram index', () => {
    const record = { nameToken: ['tok-a', 'tok-b'] }
    const filters = new Map([['nameToken', ['tok-zzz']]])
    expect(matchesBlindIndexFilters(record, filters)).toBe(false)
  })
})
