import { describe, it, expect, vi } from 'vitest'
import {
  isValidE164,
  buildAudioUrlMap,
  checkRateLimit,
  uint8ArrayToBase64URL,
} from '@worker/lib/helpers'

describe('buildAudioUrlMap', () => {
  const origin = 'https://api.example.com'

  it('builds URL map from getIvrAudioList service', async () => {
    const settings = {
      getIvrAudioList: vi.fn().mockResolvedValue({
        recordings: [
          { promptType: 'welcome', language: 'en' },
          { promptType: 'welcome', language: 'es' },
          { promptType: 'goodbye', language: 'en' },
        ],
      }),
    }

    const map = await buildAudioUrlMap(settings, origin)

    expect(settings.getIvrAudioList).toHaveBeenCalledOnce()
    expect(map['welcome:en']).toBe('https://api.example.com/api/ivr-audio/welcome/en')
    expect(map['welcome:es']).toBe('https://api.example.com/api/ivr-audio/welcome/es')
    expect(map['goodbye:en']).toBe('https://api.example.com/api/ivr-audio/goodbye/en')
  })

  it('builds URL map from fetch-based settings', async () => {
    const settings = {
      fetch: vi.fn().mockResolvedValue(
        Response.json({
          recordings: [
            { promptType: 'hold', language: 'fr' },
          ],
        })
      ),
    }

    const map = await buildAudioUrlMap(settings, origin)

    expect(settings.fetch).toHaveBeenCalledOnce()
    expect(map['hold:fr']).toBe('https://api.example.com/api/ivr-audio/hold/fr')
  })

  it('returns empty map when no recordings', async () => {
    const settings = {
      getIvrAudioList: vi.fn().mockResolvedValue({ recordings: [] }),
    }

    const map = await buildAudioUrlMap(settings, origin)
    expect(Object.keys(map)).toHaveLength(0)
  })

  it('uses correct key format: promptType:language', async () => {
    const settings = {
      getIvrAudioList: vi.fn().mockResolvedValue({
        recordings: [
          { promptType: 'captcha_digits', language: 'zh-CN' },
        ],
      }),
    }

    const map = await buildAudioUrlMap(settings, origin)
    expect(map).toHaveProperty('captcha_digits:zh-CN')
  })

  it('overwrites duplicate promptType:language combos (last wins)', async () => {
    const settings = {
      getIvrAudioList: vi.fn().mockResolvedValue({
        recordings: [
          { promptType: 'welcome', language: 'en' },
          { promptType: 'welcome', language: 'en' }, // duplicate
        ],
      }),
    }

    const map = await buildAudioUrlMap(settings, origin)
    // Should have one entry (last write wins)
    expect(Object.keys(map).filter(k => k === 'welcome:en')).toHaveLength(1)
  })
})

describe('checkRateLimit', () => {
  it('returns true when rate limited', async () => {
    const settings = {
      checkRateLimit: vi.fn().mockResolvedValue({ limited: true }),
    }

    const result = await checkRateLimit(settings, 'login:user1', 5)

    expect(result).toBe(true)
    expect(settings.checkRateLimit).toHaveBeenCalledWith({ key: 'login:user1', maxPerMinute: 5 })
  })

  it('returns false when not rate limited', async () => {
    const settings = {
      checkRateLimit: vi.fn().mockResolvedValue({ limited: false }),
    }

    const result = await checkRateLimit(settings, 'api:general', 100)

    expect(result).toBe(false)
    expect(settings.checkRateLimit).toHaveBeenCalledWith({ key: 'api:general', maxPerMinute: 100 })
  })

  it('passes through the key and maxPerMinute correctly', async () => {
    const settings = {
      checkRateLimit: vi.fn().mockResolvedValue({ limited: false }),
    }

    await checkRateLimit(settings, 'webhook:callback', 60)

    expect(settings.checkRateLimit).toHaveBeenCalledWith({
      key: 'webhook:callback',
      maxPerMinute: 60,
    })
  })
})

describe('isValidE164 — additional edge cases', () => {
  it('rejects only a plus sign with no digits', () => {
    expect(isValidE164('+')).toBe(false)
  })

  it('rejects numbers with leading/trailing whitespace', () => {
    expect(isValidE164(' +15551234567')).toBe(false)
    expect(isValidE164('+15551234567 ')).toBe(false)
  })

  it('rejects numbers with internal whitespace', () => {
    expect(isValidE164('+1 555 1234567')).toBe(false)
  })

  it('rejects hex-like strings', () => {
    expect(isValidE164('+1a2b3c4d5e6')).toBe(false)
  })

  it('accepts exactly 7-digit minimum', () => {
    expect(isValidE164('+1234567')).toBe(true)
    expect(isValidE164('+123456')).toBe(false) // 6 digits
  })

  it('accepts exactly 15-digit maximum', () => {
    expect(isValidE164('+123456789012345')).toBe(true)
    expect(isValidE164('+1234567890123456')).toBe(false) // 16 digits
  })
})

describe('uint8ArrayToBase64URL — roundtrip correctness', () => {
  it('encodes known value correctly', () => {
    // "Hello" = [72, 101, 108, 108, 111]
    // Base64 = "SGVsbG8=" → Base64URL = "SGVsbG8"
    const result = uint8ArrayToBase64URL(new Uint8Array([72, 101, 108, 108, 111]))
    expect(result).toBe('SGVsbG8')
  })

  it('encodes single byte correctly', () => {
    // [0] → Base64 "AA==" → Base64URL "AA"
    const result = uint8ArrayToBase64URL(new Uint8Array([0]))
    expect(result).toBe('AA')
  })

  it('encodes two bytes correctly', () => {
    // [0, 0] → Base64 "AAA=" → Base64URL "AAA"
    const result = uint8ArrayToBase64URL(new Uint8Array([0, 0]))
    expect(result).toBe('AAA')
  })

  it('encodes three bytes correctly (no padding)', () => {
    // [0, 0, 0] → Base64 "AAAA" → Base64URL "AAAA"
    const result = uint8ArrayToBase64URL(new Uint8Array([0, 0, 0]))
    expect(result).toBe('AAAA')
  })

  it('handles 32-byte key material', () => {
    const key = new Uint8Array(32)
    key.fill(0xab)
    const result = uint8ArrayToBase64URL(key)
    expect(result.length).toBeGreaterThan(0)
    expect(result).not.toContain('=')
    expect(result).not.toContain('+')
    expect(result).not.toContain('/')
  })
})
