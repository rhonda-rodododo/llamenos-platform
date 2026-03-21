import type { LocationResult } from '@protocol/schemas/geocoding'

export type { LocationResult }

export interface GeocodingAdapter {
  autocomplete(query: string, opts?: { limit?: number }): Promise<LocationResult[]>
  geocode(address: string): Promise<LocationResult | null>
  reverse(lat: number, lon: number): Promise<LocationResult | null>
}
