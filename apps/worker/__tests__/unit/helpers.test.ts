import { describe, it, expect } from 'vitest'
import {
  isValidE164,
  json,
  error,
  uint8ArrayToBase64URL,
  telephonyResponse,
} from '@worker/lib/helpers'

describe('isValidE164', () => {
  it('accepts valid E.164 numbers', () => {
    expect(isValidE164('+15551234567')).toBe(true)
    expect(isValidE164('+442071234567')).toBe(true)
    expect(isValidE164('+8613912345678')).toBe(true)
    expect(isValidE164('+1234567')).toBe(true) // minimum 7 digits
  })

  it('rejects numbers without + prefix', () => {
    expect(isValidE164('15551234567')).toBe(false)
    expect(isValidE164('5551234567')).toBe(false)
  })

  it('rejects numbers with non-digit characters', () => {
    expect(isValidE164('+1-555-123-4567')).toBe(false)
    expect(isValidE164('+1 555 123 4567')).toBe(false)
    expect(isValidE164('+1(555)1234567')).toBe(false)
  })

  it('rejects numbers that are too short', () => {
    expect(isValidE164('+123456')).toBe(false) // 6 digits
    expect(isValidE164('+1')).toBe(false)
    expect(isValidE164('+')).toBe(false)
  })

  it('rejects numbers that are too long', () => {
    expect(isValidE164('+1234567890123456')).toBe(false) // 16 digits
  })

  it('accepts numbers at boundary lengths', () => {
    expect(isValidE164('+1234567')).toBe(true) // 7 digits (minimum)
    expect(isValidE164('+123456789012345')).toBe(true) // 15 digits (maximum)
  })

  it('rejects empty string', () => {
    expect(isValidE164('')).toBe(false)
  })

  it('rejects strings with letters', () => {
    expect(isValidE164('+1555abc1234')).toBe(false)
  })
})

describe('json', () => {
  it('returns Response with JSON content and 200 status', async () => {
    const res = json({ message: 'ok' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ message: 'ok' })
  })

  it('accepts custom status code', async () => {
    const res = json({ data: [] }, 201)
    expect(res.status).toBe(201)
  })

  it('serializes arrays', async () => {
    const res = json([1, 2, 3])
    const body = await res.json()
    expect(body).toEqual([1, 2, 3])
  })

  it('serializes nested objects', async () => {
    const data = { a: { b: { c: 1 } } }
    const res = json(data)
    const body = await res.json()
    expect(body).toEqual(data)
  })

  it('serializes null', async () => {
    const res = json(null)
    const body = await res.json()
    expect(body).toBeNull()
  })
})

describe('error', () => {
  it('returns error response with 400 status by default', async () => {
    const res = error('Bad request')
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Bad request')
  })

  it('accepts custom status code', async () => {
    const res = error('Not found', 404)
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Not found')
  })

  it('returns 403 for forbidden', async () => {
    const res = error('Forbidden', 403)
    expect(res.status).toBe(403)
  })

  it('returns 500 for server error', async () => {
    const res = error('Internal server error', 500)
    expect(res.status).toBe(500)
  })
})

describe('uint8ArrayToBase64URL', () => {
  it('encodes empty array', () => {
    const result = uint8ArrayToBase64URL(new Uint8Array([]))
    expect(result).toBe('')
  })

  it('encodes bytes to base64url (no padding)', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
    const result = uint8ArrayToBase64URL(bytes)
    expect(result).not.toContain('=')
    expect(result).not.toContain('+')
    expect(result).not.toContain('/')
  })

  it('replaces + with - and / with _', () => {
    // These bytes when base64 encoded would contain + and /
    const bytes = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc])
    const result = uint8ArrayToBase64URL(bytes)
    expect(result).not.toContain('+')
    expect(result).not.toContain('/')
  })

  it('strips trailing = padding', () => {
    const bytes = new Uint8Array([1]) // would have == padding
    const result = uint8ArrayToBase64URL(bytes)
    expect(result).not.toContain('=')
  })

  it('produces consistent output', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    expect(uint8ArrayToBase64URL(bytes)).toBe(uint8ArrayToBase64URL(bytes))
  })
})

describe('telephonyResponse', () => {
  it('creates Response with correct content type', () => {
    const res = telephonyResponse({
      contentType: 'application/xml',
      body: '<Response><Say>Hello</Say></Response>',
    })
    expect(res.headers.get('Content-Type')).toBe('application/xml')
  })

  it('includes the body text', async () => {
    const body = '<Response><Reject/></Response>'
    const res = telephonyResponse({ contentType: 'application/xml', body })
    expect(await res.text()).toBe(body)
  })

  it('handles TwiML content type', () => {
    const res = telephonyResponse({
      contentType: 'text/xml',
      body: '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    })
    expect(res.headers.get('Content-Type')).toBe('text/xml')
  })
})
