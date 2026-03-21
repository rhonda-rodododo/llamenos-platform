import type { GeocodingConfigAdmin } from '@protocol/schemas/geocoding'
import type { GeocodingAdapter } from './adapter'
import { NullAdapter } from './null'
import { OpenCageAdapter } from './opencage'
import { GeoapifyAdapter } from './geoapify'

export function createGeocodingAdapter(config: GeocodingConfigAdmin | null | undefined): GeocodingAdapter {
  if (!config || !config.enabled || !config.provider || !config.apiKey) {
    return new NullAdapter()
  }
  switch (config.provider) {
    case 'opencage':
      return new OpenCageAdapter(config.apiKey, config.countries)
    case 'geoapify':
      return new GeoapifyAdapter(config.apiKey, config.countries)
    case 'llamenos-central':
      // Reserved for post-launch federated geocoding network
      return new NullAdapter()
    default:
      return new NullAdapter()
  }
}
