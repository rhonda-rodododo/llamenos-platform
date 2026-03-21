import type { GeocodingAdapter, LocationResult } from './adapter'

export class NullAdapter implements GeocodingAdapter {
  async autocomplete(_query: string, _opts?: { limit?: number }): Promise<LocationResult[]> {
    return []
  }

  async geocode(_address: string): Promise<LocationResult | null> {
    return null
  }

  async reverse(_lat: number, _lon: number): Promise<LocationResult | null> {
    return null
  }
}
