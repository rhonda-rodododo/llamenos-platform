/**
 * Unit tests for blind index query parsing and matching.
 *
 * Covers: parseBlindIndexFilters, matchesBlindIndexFilters.
 */

import { describe, it, expect } from 'vitest'
import { parseBlindIndexFilters, matchesBlindIndexFilters } from './blind-index-query'

// ---------------------------------------------------------------------------
// parseBlindIndexFilters
// ---------------------------------------------------------------------------

describe('parseBlindIndexFilters', () => {
  it('returns empty map when no matching params', () => {
    const params = new URLSearchParams({ name: 'alice', page: '1' })
    expect(parseBlindIndexFilters(params).size).toBe(0)
  })

  it('extracts params ending in "Hash"', () => {
    const params = new URLSearchParams({ statusHash: 'abc123', name: 'bob' })
    const filters = parseBlindIndexFilters(params)
    expect(filters.has('statusHash')).toBe(true)
    expect(filters.get('statusHash')).toEqual(['abc123'])
  })

  it('extracts "nameToken" literal', () => {
    const params = new URLSearchParams({ nameToken: 'tok1' })
    const filters = parseBlindIndexFilters(params)
    expect(filters.has('nameToken')).toBe(true)
  })

  it('extracts params starting with "field_"', () => {
    const params = new URLSearchParams({ field_status: 'val1' })
    const filters = parseBlindIndexFilters(params)
    expect(filters.has('field_status')).toBe(true)
  })

  it('extracts _day, _week, _month suffixes', () => {
    const params = new URLSearchParams({
      createdAt_day: 'h1',
      updatedAt_week: 'h2',
      closedAt_month: 'h3',
    })
    const filters = parseBlindIndexFilters(params)
    expect(filters.has('createdAt_day')).toBe(true)
    expect(filters.has('updatedAt_week')).toBe(true)
    expect(filters.has('closedAt_month')).toBe(true)
  })

  it('splits comma-separated values into array for OR queries', () => {
    const params = new URLSearchParams({ statusHash: 'hash1,hash2,hash3' })
    const filters = parseBlindIndexFilters(params)
    expect(filters.get('statusHash')).toEqual(['hash1', 'hash2', 'hash3'])
  })

  it('trims whitespace from split values', () => {
    const params = new URLSearchParams({ statusHash: 'hash1, hash2 , hash3' })
    const filters = parseBlindIndexFilters(params)
    expect(filters.get('statusHash')).toEqual(['hash1', 'hash2', 'hash3'])
  })

  it('filters out empty values from comma-split', () => {
    const params = new URLSearchParams({ statusHash: 'hash1,,hash2' })
    const filters = parseBlindIndexFilters(params)
    expect(filters.get('statusHash')).toEqual(['hash1', 'hash2'])
  })

  it('handles multiple blind index params simultaneously', () => {
    const params = new URLSearchParams({ statusHash: 'abc', severityHash: 'def' })
    const filters = parseBlindIndexFilters(params)
    expect(filters.size).toBe(2)
  })

  it('does not include non-blind-index params', () => {
    const params = new URLSearchParams({
      statusHash: 'abc',
      hubId: '123', // not a blind index param
      page: '2',
    })
    const filters = parseBlindIndexFilters(params)
    expect(filters.has('hubId')).toBe(false)
    expect(filters.has('page')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// matchesBlindIndexFilters
// ---------------------------------------------------------------------------

describe('matchesBlindIndexFilters', () => {
  it('returns true when no filters (no filter = match all)', () => {
    const filters = new Map<string, string[]>()
    expect(matchesBlindIndexFilters({ statusHash: 'abc' }, filters)).toBe(true)
  })

  it('returns true when all exact filters match', () => {
    const filters = new Map([['statusHash', ['abc123']], ['severityHash', ['def456']]])
    const indexes = { statusHash: 'abc123', severityHash: 'def456' }
    expect(matchesBlindIndexFilters(indexes, filters)).toBe(true)
  })

  it('returns false when one filter does not match', () => {
    const filters = new Map([['statusHash', ['abc123']], ['severityHash', ['def456']]])
    const indexes = { statusHash: 'abc123', severityHash: 'wrong' }
    expect(matchesBlindIndexFilters(indexes, filters)).toBe(false)
  })

  it('returns false when a required index is missing from record', () => {
    const filters = new Map([['statusHash', ['abc123']]])
    expect(matchesBlindIndexFilters({}, filters)).toBe(false)
  })

  it('OR logic: matches if any filter value equals the record value', () => {
    const filters = new Map([['statusHash', ['val1', 'val2', 'val3']]])
    expect(matchesBlindIndexFilters({ statusHash: 'val2' }, filters)).toBe(true)
    expect(matchesBlindIndexFilters({ statusHash: 'val99' }, filters)).toBe(false)
  })

  it('array record value: matches if any filter value is in the array', () => {
    const filters = new Map([['tags', ['tagA', 'tagB']]])
    const indexes = { tags: ['tagB', 'tagC'] }
    expect(matchesBlindIndexFilters(indexes, filters)).toBe(true)
  })

  it('array record value: no match when filter values not in array', () => {
    const filters = new Map([['tags', ['tagX']]])
    const indexes = { tags: ['tagA', 'tagB'] }
    expect(matchesBlindIndexFilters(indexes, filters)).toBe(false)
  })

  it('AND logic: all filters must match', () => {
    const filters = new Map([
      ['statusHash', ['open']],
      ['severityHash', ['high']],
    ])
    // Only one matches
    expect(matchesBlindIndexFilters({ statusHash: 'open', severityHash: 'low' }, filters)).toBe(false)
    // Both match
    expect(matchesBlindIndexFilters({ statusHash: 'open', severityHash: 'high' }, filters)).toBe(true)
  })

  it('returns false when record index is null', () => {
    const filters = new Map([['statusHash', ['abc']]])
    expect(matchesBlindIndexFilters({ statusHash: null as unknown as string }, filters)).toBe(false)
  })
})
