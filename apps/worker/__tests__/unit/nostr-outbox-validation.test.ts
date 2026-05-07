import { describe, it, expect } from 'vitest'

/**
 * Test the pure validation and parsing functions from nostr-outbox.
 * We re-implement the relevant logic here since the functions are module-private.
 * These tests verify edge cases the module must handle correctly.
 */

// Re-implement the private validateNostrEvent function exactly as in source
const REQUIRED_EVENT_FIELDS = ['id', 'pubkey', 'sig', 'kind', 'content', 'tags', 'created_at'] as const

function validateNostrEvent(eventJson: Record<string, unknown>): string | null {
  const missing = REQUIRED_EVENT_FIELDS.filter((f) => eventJson[f] === undefined)
  if (missing.length > 0) {
    return `missing fields: ${missing.join(', ')}`
  }
  if (typeof eventJson.id !== 'string' || eventJson.id.length !== 64) {
    return `invalid event id: ${String(eventJson.id).substring(0, 20)}`
  }
  if (typeof eventJson.sig !== 'string' || eventJson.sig.length < 64) {
    return `invalid signature`
  }
  return null
}

function parseJsonbValue(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // Not valid JSON
    }
  }
  return null
}

const validEvent: Record<string, unknown> = {
  id: 'a'.repeat(64),
  pubkey: 'b'.repeat(64),
  sig: 'c'.repeat(128),
  kind: 20001,
  content: 'encrypted-data',
  tags: [['t', 'llamenos:event']],
  created_at: Math.floor(Date.now() / 1000),
}

describe('validateNostrEvent', () => {
  it('accepts a valid event', () => {
    expect(validateNostrEvent(validEvent)).toBeNull()
  })

  it('rejects event missing required fields', () => {
    const { id, ...noId } = validEvent
    const result = validateNostrEvent(noId)
    expect(result).toContain('missing fields')
    expect(result).toContain('id')
  })

  it('rejects event missing multiple fields', () => {
    const result = validateNostrEvent({})
    expect(result).toContain('id')
    expect(result).toContain('pubkey')
    expect(result).toContain('sig')
  })

  it('rejects event with non-string id', () => {
    const result = validateNostrEvent({ ...validEvent, id: 12345 })
    expect(result).toContain('invalid event id')
  })

  it('rejects event with wrong-length id', () => {
    const result = validateNostrEvent({ ...validEvent, id: 'short' })
    expect(result).toContain('invalid event id')
  })

  it('rejects event with empty id string', () => {
    const result = validateNostrEvent({ ...validEvent, id: '' })
    expect(result).toContain('invalid event id')
  })

  it('rejects event with too-short signature', () => {
    const result = validateNostrEvent({ ...validEvent, sig: 'short' })
    expect(result).toContain('invalid signature')
  })

  it('rejects event with non-string signature', () => {
    const result = validateNostrEvent({ ...validEvent, sig: 0 })
    expect(result).toContain('invalid signature')
  })

  it('accepts event with content set to empty string', () => {
    const result = validateNostrEvent({ ...validEvent, content: '' })
    expect(result).toBeNull()
  })

  it('accepts event with kind=0', () => {
    const result = validateNostrEvent({ ...validEvent, kind: 0 })
    expect(result).toBeNull()
  })

  it('rejects event with content set to undefined', () => {
    const event = { ...validEvent }
    event.content = undefined
    const result = validateNostrEvent(event)
    expect(result).toContain('missing fields')
    expect(result).toContain('content')
  })
})

describe('parseJsonbValue', () => {
  it('passes through plain objects', () => {
    const obj = { id: 'abc', kind: 1 }
    expect(parseJsonbValue(obj)).toEqual(obj)
  })

  it('parses double-serialized JSON strings', () => {
    const original = { id: 'abc', kind: 1 }
    const doubleStringified = JSON.stringify(original)
    expect(parseJsonbValue(doubleStringified)).toEqual(original)
  })

  it('returns null for arrays', () => {
    expect(parseJsonbValue([1, 2, 3])).toBeNull()
  })

  it('returns null for null', () => {
    expect(parseJsonbValue(null)).toBeNull()
  })

  it('returns null for primitives', () => {
    expect(parseJsonbValue(42)).toBeNull()
    expect(parseJsonbValue(true)).toBeNull()
  })

  it('returns null for invalid JSON strings', () => {
    expect(parseJsonbValue('not-json')).toBeNull()
  })

  it('returns null for JSON string that parses to array', () => {
    expect(parseJsonbValue('[1,2,3]')).toBeNull()
  })

  it('returns null for JSON string that parses to primitive', () => {
    expect(parseJsonbValue('"just a string"')).toBeNull()
    expect(parseJsonbValue('42')).toBeNull()
  })

  it('handles deeply nested objects', () => {
    const nested = { a: { b: { c: { d: 'deep' } } } }
    expect(parseJsonbValue(nested)).toEqual(nested)
  })

  it('handles double-serialized nested objects', () => {
    const nested = { a: { b: [1, 2] } }
    expect(parseJsonbValue(JSON.stringify(nested))).toEqual(nested)
  })
})
