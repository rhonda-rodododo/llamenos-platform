import type { GeocodingAdapter, LocationResult } from './adapter'

const BASE_URL = 'https://api.opencagedata.com/geocode/v1/json'

export class OpenCageAdapter implements GeocodingAdapter {
  private readonly apiKey: string
  private readonly countrycodes: string   // comma-separated lowercase ISO codes

  constructor(apiKey: string, countries: string[]) {
    this.apiKey = apiKey
    this.countrycodes = countries.map(c => c.toLowerCase()).join(',')
  }

  async autocomplete(
    query: string,
    opts: { limit?: number } = {},
    fetchFn: typeof fetch = fetch,
  ): Promise<LocationResult[]> {
    const results = await this.query(query, opts.limit ?? 5, fetchFn)
    return results
  }

  async geocode(address: string, fetchFn: typeof fetch = fetch): Promise<LocationResult | null> {
    const results = await this.query(address, 1, fetchFn)
    return results[0] ?? null
  }

  async reverse(lat: number, lon: number, fetchFn: typeof fetch = fetch): Promise<LocationResult | null> {
    const results = await this.query(`${lat}+${lon}`, 1, fetchFn)
    return results[0] ?? null
  }

  private async query(q: string, limit: number, fetchFn: typeof fetch): Promise<LocationResult[]> {
    const url = new URL(BASE_URL)
    url.searchParams.set('q', q)
    url.searchParams.set('key', this.apiKey)
    url.searchParams.set('limit', String(limit))
    if (this.countrycodes) url.searchParams.set('countrycode', this.countrycodes)
    url.searchParams.set('no_annotations', '1')

    const response = await fetchFn(url.toString())
    if (!response.ok) return []
    const data = await response.json() as { results: Array<{
      formatted: string
      geometry: { lat: number; lng: number }
      components?: { country_code?: string }
    }> }
    return data.results.map(r => ({
      address: r.formatted,
      lat: r.geometry.lat,
      lon: r.geometry.lng,
      countryCode: r.components?.country_code?.toUpperCase(),
    }))
  }
}
