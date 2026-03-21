import type { GeocodingAdapter, LocationResult } from './adapter'

const AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete'
const GEOCODE_URL = 'https://api.geoapify.com/v1/geocode/search'
const REVERSE_URL = 'https://api.geoapify.com/v1/geocode/reverse'

interface GeoapifyFeature {
  properties: {
    formatted: string
    lat: number
    lon: number
    country_code?: string
  }
}

export class GeoapifyAdapter implements GeocodingAdapter {
  private readonly apiKey: string
  private readonly countryFilter: string   // e.g. "countrycode:us,mx"

  constructor(apiKey: string, countries: string[]) {
    this.apiKey = apiKey
    this.countryFilter = countries.length > 0
      ? `countrycode:${countries.map(c => c.toLowerCase()).join(',')}`
      : ''
  }

  async autocomplete(
    query: string,
    opts: { limit?: number } = {},
    fetchFn: typeof fetch = fetch,
  ): Promise<LocationResult[]> {
    const url = new URL(AUTOCOMPLETE_URL)
    url.searchParams.set('text', query)
    url.searchParams.set('apiKey', this.apiKey)
    url.searchParams.set('limit', String(opts.limit ?? 5))
    if (this.countryFilter) url.searchParams.set('filter', this.countryFilter)
    return this.fetchFeatures(url, fetchFn)
  }

  async geocode(address: string, fetchFn: typeof fetch = fetch): Promise<LocationResult | null> {
    const url = new URL(GEOCODE_URL)
    url.searchParams.set('text', address)
    url.searchParams.set('apiKey', this.apiKey)
    url.searchParams.set('limit', '1')
    if (this.countryFilter) url.searchParams.set('filter', this.countryFilter)
    const results = await this.fetchFeatures(url, fetchFn)
    return results[0] ?? null
  }

  async reverse(lat: number, lon: number, fetchFn: typeof fetch = fetch): Promise<LocationResult | null> {
    const url = new URL(REVERSE_URL)
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lon))
    url.searchParams.set('apiKey', this.apiKey)
    const results = await this.fetchFeatures(url, fetchFn)
    return results[0] ?? null
  }

  private async fetchFeatures(url: URL, fetchFn: typeof fetch): Promise<LocationResult[]> {
    const response = await fetchFn(url.toString())
    if (!response.ok) return []
    const data = await response.json() as { features: GeoapifyFeature[] }
    return (data.features ?? []).map(f => ({
      address: f.properties.formatted,
      lat: f.properties.lat,
      lon: f.properties.lon,
      countryCode: f.properties.country_code?.toUpperCase(),
    }))
  }
}
