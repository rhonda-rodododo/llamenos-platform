import { describe, it, expect } from 'vitest'
import { NullAdapter } from '../../geocoding/null'
import { OpenCageAdapter } from '../../geocoding/opencage'
import { GeoapifyAdapter } from '../../geocoding/geoapify'
import { createGeocodingAdapter } from '../../geocoding/factory'

describe('NullAdapter', () => {
  const adapter = new NullAdapter()

  it('autocomplete returns empty array', async () => {
    const results = await adapter.autocomplete('123 Main St')
    expect(results).toEqual([])
  })

  it('geocode returns null', async () => {
    const result = await adapter.geocode('123 Main St')
    expect(result).toBeNull()
  })

  it('reverse returns null', async () => {
    const result = await adapter.reverse(40.7128, -74.0060)
    expect(result).toBeNull()
  })
})

describe('OpenCageAdapter', () => {
  const apiKey = 'test-key'
  const adapter = new OpenCageAdapter(apiKey, ['US'])

  it('autocomplete returns mapped LocationResults', async () => {
    const mockFetch = async (_url: string) => ({
      ok: true,
      json: async () => ({
        results: [{
          formatted: '742 Evergreen Terrace, Springfield, IL 62701, United States',
          geometry: { lat: 39.7817, lng: -89.6502 },
          components: { country_code: 'us' },
        }],
      }),
    })
    const results = await adapter.autocomplete('742 Evergreen', { limit: 5 }, mockFetch as typeof fetch)
    expect(results).toHaveLength(1)
    expect(results[0].address).toBe('742 Evergreen Terrace, Springfield, IL 62701, United States')
    expect(results[0].lat).toBe(39.7817)
    expect(results[0].lon).toBe(-89.6502)
    expect(results[0].countryCode).toBe('US')
  })

  it('reverse returns mapped LocationResult', async () => {
    const mockFetch = async (_url: string) => ({
      ok: true,
      json: async () => ({
        results: [{
          formatted: '742 Evergreen Terrace, Springfield, IL',
          geometry: { lat: 39.7817, lng: -89.6502 },
          components: { country_code: 'us' },
        }],
      }),
    })
    const result = await adapter.reverse(39.7817, -89.6502, mockFetch as typeof fetch)
    expect(result).not.toBeNull()
    expect(result!.address).toBe('742 Evergreen Terrace, Springfield, IL')
  })

  it('returns null when provider returns no results', async () => {
    const mockFetch = async (_url: string) => ({
      ok: true,
      json: async () => ({ results: [] }),
    })
    const result = await adapter.geocode('nowhere special', mockFetch as typeof fetch)
    expect(result).toBeNull()
  })

  it('builds URL with countrycode parameter', async () => {
    let capturedUrl = ''
    const mockFetch = async (url: string) => {
      capturedUrl = url
      return { ok: true, json: async () => ({ results: [] }) }
    }
    await adapter.autocomplete('test', {}, mockFetch as typeof fetch)
    expect(capturedUrl).toContain('countrycode=us')
    expect(capturedUrl).toContain('key=test-key')
  })
})

describe('GeoapifyAdapter', () => {
  const adapter = new GeoapifyAdapter('test-key', ['US', 'MX'])

  const mockResult = {
    features: [{
      properties: {
        formatted: '742 Evergreen Terrace, Springfield',
        lat: 39.7817,
        lon: -89.6502,
        country_code: 'us',
      },
    }],
  }

  it('autocomplete maps GeoJSON features to LocationResult', async () => {
    const mockFetch = async (_url: string) => ({ ok: true, json: async () => mockResult })
    const results = await adapter.autocomplete('742 Evergreen', {}, mockFetch as typeof fetch)
    expect(results[0].address).toBe('742 Evergreen Terrace, Springfield')
    expect(results[0].lat).toBe(39.7817)
    expect(results[0].lon).toBe(-89.6502)
    expect(results[0].countryCode).toBe('US')
  })

  it('reverse geocodes coordinates', async () => {
    const mockFetch = async (_url: string) => ({ ok: true, json: async () => mockResult })
    const result = await adapter.reverse(39.7817, -89.6502, mockFetch as typeof fetch)
    expect(result?.address).toBe('742 Evergreen Terrace, Springfield')
  })

  it('builds URL with filter=countrycode parameter', async () => {
    let capturedUrl = ''
    const mockFetch = async (url: string) => {
      capturedUrl = url
      return { ok: true, json: async () => ({ features: [] }) }
    }
    await adapter.autocomplete('test', {}, mockFetch as typeof fetch)
    expect(capturedUrl).toContain('filter=countrycode%3Aus%2Cmx')
    expect(capturedUrl).toContain('apiKey=test-key')
  })
})

describe('createGeocodingAdapter', () => {
  it('returns NullAdapter when disabled', () => {
    const adapter = createGeocodingAdapter({ provider: 'opencage', apiKey: 'k', countries: ['US'], enabled: false })
    expect(adapter).toBeInstanceOf(NullAdapter)
  })

  it('returns NullAdapter when provider is null', () => {
    const adapter = createGeocodingAdapter({ provider: null, apiKey: '', countries: [], enabled: true })
    expect(adapter).toBeInstanceOf(NullAdapter)
  })

  it('returns OpenCageAdapter for opencage provider', () => {
    const adapter = createGeocodingAdapter({ provider: 'opencage', apiKey: 'key', countries: ['US'], enabled: true })
    expect(adapter).toBeInstanceOf(OpenCageAdapter)
  })

  it('returns GeoapifyAdapter for geoapify provider', () => {
    const adapter = createGeocodingAdapter({ provider: 'geoapify', apiKey: 'key', countries: ['DE'], enabled: true })
    expect(adapter).toBeInstanceOf(GeoapifyAdapter)
  })

  it('returns NullAdapter for llamenos-central (placeholder)', () => {
    const adapter = createGeocodingAdapter({ provider: 'llamenos-central', apiKey: '', countries: [], enabled: true })
    expect(adapter).toBeInstanceOf(NullAdapter)
  })
})
