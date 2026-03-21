# Geocoding & Location Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add address autocomplete, forward/reverse geocoding, GPS capture on mobile, triage enrichment for inbound messages, and `location` custom field type across all platforms — with a proxied GeocodingAdapter (OpenCage or Geoapify) so API keys never reach clients.

**Architecture:** GeocodingAdapter interface (mirrors TelephonyAdapter) with OpenCage/Geoapify/Null implementations, proxied via POST-only worker routes to prevent coordinate logging. Location values are precision-capped client-side before being stored in existing E2EE encrypted payloads. Mobile platforms use platform GPS services then call the worker's `/api/geocoding/reverse` endpoint.

**Tech Stack:** Bun/Hono/Drizzle (worker), Zod 4 (schemas), Vitest (unit tests), Playwright-BDD (integration), SwiftUI/CLLocationManager (iOS), Jetpack Compose/FusedLocationProviderClient (Android), React/shadcn (desktop)

---

## File Map

### New files
| File | Purpose |
|---|---|
| `packages/protocol/schemas/geocoding.ts` | `locationPrecisionSchema`, `locationResultSchema`, `geocodingConfigSchema`, `geocodingConfigAdminSchema`, `geocodingTestResponseSchema` |
| `apps/worker/geocoding/adapter.ts` | `GeocodingAdapter` interface + `LocationResult` type |
| `apps/worker/geocoding/null.ts` | `NullAdapter` — no-op for unconfigured state |
| `apps/worker/geocoding/opencage.ts` | `OpenCageAdapter` |
| `apps/worker/geocoding/geoapify.ts` | `GeoapifyAdapter` |
| `apps/worker/geocoding/factory.ts` | `createGeocodingAdapter(config)` factory |
| `apps/worker/routes/geocoding.ts` | `POST /api/geocoding/{autocomplete,geocode,reverse}` |
| `apps/worker/__tests__/unit/geocoding-adapter.test.ts` | Unit tests for all adapters |
| `src/client/components/ui/location-field.tsx` | Desktop `LocationField` component (autocomplete + open-in-maps) |
| `src/client/components/ui/location-triage-panel.tsx` | Triage enrichment panel (extract hint → geocode → attach) |
| `apps/ios/Sources/Services/LocationService.swift` | iOS `CLLocationManager` wrapper + `reverse()` call |
| `apps/android/app/src/main/java/org/llamenos/hotline/service/LocationService.kt` | Android `FusedLocationProviderClient` wrapper |

### Modified files
| File | Change |
|---|---|
| `packages/protocol/schemas/index.ts` | `export * from './geocoding'` |
| `packages/protocol/schemas/events.ts` | Move `locationPrecisionSchema` → re-export; flatten `eventDetailsSchema.location` (`name`→`address`, remove nested `coordinates`, `lng`→`lon`) |
| `packages/protocol/schemas/entity-schema.ts` | Add `'location'` to `type` enum; add `locationOptions` field |
| `packages/protocol/schemas/settings.ts` | Add `'location'` to `customFieldDefinitionSchema.type` enum |
| `apps/worker/db/schema/settings.ts` | Add `geocodingConfig: jsonb(...)` column to `systemSettings` |
| `apps/worker/services/settings.ts` | Add `getGeocodingConfig()`, `updateGeocodingConfig()` |
| `apps/worker/routes/settings.ts` | Add `GET/PUT /api/settings/geocoding` + `GET /api/settings/geocoding/test` |
| `apps/worker/app.ts` | Register `geocodingRoutes` |
| `packages/protocol/templates/ice-rapid-response.json` | `location` field → `type: "location"`, `locationOptions.maxPrecision: "neighborhood"` |
| `packages/protocol/templates/jail-support.json` | `arrest_location`, `location` (3×) → `type: "location"`, `maxPrecision: "block"` |
| `packages/protocol/templates/stop-the-sweeps.json` | `sweep_location`, `location`, `relocation_destination` → `type: "location"`, `maxPrecision: "neighborhood"` |
| `packages/protocol/templates/street-medic.json` | `encounter_location` → `type: "location"`, `maxPrecision: "exact"` |
| `packages/protocol/templates/missing-persons.json` | `last_known_location` → `type: "location"`, `maxPrecision: "block"` |
| `packages/protocol/templates/hate-crime-reporting.json` | `geographic_area` → `type: "location"`, `maxPrecision: "neighborhood"` |

---

## Task 1: Protocol Schemas

**Files:**
- Create: `packages/protocol/schemas/geocoding.ts`
- Modify: `packages/protocol/schemas/index.ts`
- Modify: `packages/protocol/schemas/events.ts`
- Modify: `packages/protocol/schemas/entity-schema.ts`
- Modify: `packages/protocol/schemas/settings.ts`

- [ ] **Create `packages/protocol/schemas/geocoding.ts`**

```typescript
import { z } from 'zod'

export const locationPrecisionSchema = z.enum([
  'none', 'city', 'neighborhood', 'block', 'exact',
])
export type LocationPrecision = z.infer<typeof locationPrecisionSchema>

export const locationResultSchema = z.object({
  address: z.string(),
  displayName: z.string().optional(),
  lat: z.number(),
  lon: z.number(),
  countryCode: z.string().optional(),
})
export type LocationResult = z.infer<typeof locationResultSchema>

export const geocodingConfigSchema = z.object({
  provider: z.enum(['opencage', 'geoapify', 'llamenos-central']).nullable(),
  countries: z.array(z.string()),
  enabled: z.boolean(),
})
export type GeocodingConfig = z.infer<typeof geocodingConfigSchema>

export const geocodingConfigAdminSchema = geocodingConfigSchema.extend({
  apiKey: z.string(),
})
export type GeocodingConfigAdmin = z.infer<typeof geocodingConfigAdminSchema>

export const geocodingTestResponseSchema = z.object({
  ok: z.boolean(),
  latency: z.number(),
})
export type GeocodingTestResponse = z.infer<typeof geocodingTestResponseSchema>
```

- [ ] **Add to `packages/protocol/schemas/index.ts`** — append:

```typescript
export * from './geocoding'
```

- [ ] **Update `packages/protocol/schemas/events.ts`** — remove `locationPrecisionSchema` definition, replace with re-export, and flatten `eventDetailsSchema.location`:

Replace the existing `locationPrecisionSchema` block at the top of the file:
```typescript
// Before:
export const locationPrecisionSchema = z.enum([
  'none', 'city', 'neighborhood', 'block', 'exact',
])
export type LocationPrecision = z.infer<typeof locationPrecisionSchema>

// After (re-export from geocoding.ts):
export { locationPrecisionSchema } from './geocoding'
export type { LocationPrecision } from './geocoding'
```

Replace `eventDetailsSchema.location` (currently uses `name`, nested `coordinates.lat/lng`):
```typescript
// Before:
location: z.object({
  name: z.string(),
  coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
  area: z.string().optional(),
  jurisdiction: z.string().optional(),
}).optional(),

// After:
location: z.object({
  address: z.string(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  area: z.string().optional(),
  jurisdiction: z.string().optional(),
}).optional(),
```

- [ ] **Update `packages/protocol/schemas/entity-schema.ts`** — add `'location'` to `type` enum and add `locationOptions` field to `entityFieldDefinitionSchema`:

```typescript
// Change:
  type: z.enum([
    'text', 'number', 'select', 'multiselect', 'checkbox',
    'textarea', 'date', 'file',
  ]),
// To:
  type: z.enum([
    'text', 'number', 'select', 'multiselect', 'checkbox',
    'textarea', 'date', 'file', 'location',
  ]),
```

Add `locationOptions` field after the existing `options` field:
```typescript
  locationOptions: z.object({
    maxPrecision: z.enum(['none', 'city', 'neighborhood', 'block', 'exact']).optional().default('exact'),
    allowGps: z.boolean().optional().default(true),
    allowAutocomplete: z.boolean().optional().default(true),
  }).optional(),
```

- [ ] **Update `packages/protocol/schemas/settings.ts`** — add `'location'` to the `type` enum in `customFieldDefinitionSchema`:

```typescript
// Change:
  type: z.enum(['text', 'number', 'select', 'checkbox', 'textarea', 'file']),
// To:
  type: z.enum(['text', 'number', 'select', 'checkbox', 'textarea', 'file', 'location']),
```

- [ ] **Run typecheck to verify schemas compile**

```bash
bun run typecheck
```
Expected: no errors

- [ ] **Run codegen to verify Swift/Kotlin output includes new types**

```bash
bun run codegen
```
Expected: `LocationResult`, `GeocodingConfig`, `GeocodingConfigAdmin`, `GeocodingTestResponse` appear in `packages/protocol/generated/typescript/`, `swift/`, `kotlin/`

- [ ] **Commit**

```bash
git add packages/protocol/schemas/geocoding.ts packages/protocol/schemas/index.ts packages/protocol/schemas/events.ts packages/protocol/schemas/entity-schema.ts packages/protocol/schemas/settings.ts
git commit -m "feat(protocol): add geocoding schemas and location field type"
```

---

## Task 2: DB Schema + Migration

**Files:**
- Modify: `apps/worker/db/schema/settings.ts`

- [ ] **Add `geocodingConfig` column to `systemSettings` in `apps/worker/db/schema/settings.ts`**

In the `systemSettings` table definition, add after `ttlOverrides`:
```typescript
  geocodingConfig: jsonb('geocoding_config').notNull().default({}),
```

- [ ] **Generate Drizzle migration**

```bash
bun drizzle-kit generate
```
Expected: new migration file created in `drizzle/migrations/`

- [ ] **Start backing services if not running**

```bash
docker compose -f deploy/docker/docker-compose.dev.yml up -d
```

- [ ] **Apply migration**

```bash
bun migrate:up
```
Expected: migration applied, `geocoding_config` column added to `system_settings`

- [ ] **Commit**

```bash
git add apps/worker/db/schema/settings.ts drizzle/migrations/
git commit -m "feat(db): add geocodingConfig column to system_settings"
```

---

## Task 3: GeocodingAdapter Interface + NullAdapter

**Files:**
- Create: `apps/worker/geocoding/adapter.ts`
- Create: `apps/worker/geocoding/null.ts`
- Create: `apps/worker/__tests__/unit/geocoding-adapter.test.ts`

- [ ] **Write failing test for NullAdapter** in `apps/worker/__tests__/unit/geocoding-adapter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { NullAdapter } from '../../geocoding/null'

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
```

- [ ] **Run test to confirm it fails**

```bash
bun vitest run apps/worker/__tests__/unit/geocoding-adapter.test.ts
```
Expected: FAIL — `../../geocoding/null` not found

- [ ] **Create `apps/worker/geocoding/adapter.ts`**

```typescript
import type { LocationResult } from '@protocol/schemas/geocoding'

export type { LocationResult }

export interface GeocodingAdapter {
  autocomplete(query: string, opts?: { limit?: number }): Promise<LocationResult[]>
  geocode(address: string): Promise<LocationResult | null>
  reverse(lat: number, lon: number): Promise<LocationResult | null>
}
```

- [ ] **Create `apps/worker/geocoding/null.ts`**

```typescript
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
```

- [ ] **Run test to confirm it passes**

```bash
bun vitest run apps/worker/__tests__/unit/geocoding-adapter.test.ts
```
Expected: PASS (3 tests)

- [ ] **Commit**

```bash
git add apps/worker/geocoding/adapter.ts apps/worker/geocoding/null.ts apps/worker/__tests__/unit/geocoding-adapter.test.ts
git commit -m "feat(geocoding): add GeocodingAdapter interface and NullAdapter"
```

---

## Task 4: OpenCage Adapter

**Files:**
- Create: `apps/worker/geocoding/opencage.ts`

OpenCage API docs: `https://opencagedata.com/api` — forward geocoding: `GET https://api.opencagedata.com/geocode/v1/json?q=<address>&key=<key>&countrycode=<codes>&limit=<n>`. Reverse: same endpoint, `q=<lat>+<lon>`.

Response shape (relevant fields):
```json
{
  "results": [
    {
      "formatted": "742 Evergreen Terrace, Springfield, IL 62701, United States",
      "geometry": { "lat": 39.7817, "lng": -89.6502 },
      "components": { "country_code": "us" },
      "annotations": {}
    }
  ]
}
```

- [ ] **Write failing tests for OpenCageAdapter** — append to `apps/worker/__tests__/unit/geocoding-adapter.test.ts`:

```typescript
import { OpenCageAdapter } from '../../geocoding/opencage'

describe('OpenCageAdapter', () => {
  const apiKey = 'test-key'
  const adapter = new OpenCageAdapter(apiKey, ['US'])

  it('autocomplete returns mapped LocationResults', async () => {
    const mockFetch = async (url: string) => ({
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
```

- [ ] **Run test to confirm it fails**

```bash
bun vitest run apps/worker/__tests__/unit/geocoding-adapter.test.ts
```
Expected: FAIL — `../../geocoding/opencage` not found

- [ ] **Create `apps/worker/geocoding/opencage.ts`**

```typescript
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
```

- [ ] **Run tests to confirm they pass**

```bash
bun vitest run apps/worker/__tests__/unit/geocoding-adapter.test.ts
```
Expected: PASS (all tests including OpenCage suite)

- [ ] **Commit**

```bash
git add apps/worker/geocoding/opencage.ts apps/worker/__tests__/unit/geocoding-adapter.test.ts
git commit -m "feat(geocoding): add OpenCageAdapter with mocked-fetch testability"
```

---

## Task 5: Geoapify Adapter

**Files:**
- Create: `apps/worker/geocoding/geoapify.ts`

Geoapify autocomplete: `GET https://api.geoapify.com/v1/geocode/autocomplete?text=<q>&apiKey=<key>&filter=countrycode:<codes>&limit=<n>`
Geocode: `GET https://api.geoapify.com/v1/geocode/search?text=<q>&apiKey=<key>&filter=countrycode:<codes>`
Reverse: `GET https://api.geoapify.com/v1/geocode/reverse?lat=<lat>&lon=<lon>&apiKey=<key>`

Response shape (GeoJSON):
```json
{
  "features": [{
    "properties": {
      "formatted": "742 Evergreen Terrace, Springfield",
      "lat": 39.7817,
      "lon": -89.6502,
      "country_code": "us"
    }
  }]
}
```

- [ ] **Write failing tests** — append to `apps/worker/__tests__/unit/geocoding-adapter.test.ts`:

```typescript
import { GeoapifyAdapter } from '../../geocoding/geoapify'

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
```

- [ ] **Run test to confirm it fails**

```bash
bun vitest run apps/worker/__tests__/unit/geocoding-adapter.test.ts
```
Expected: FAIL — `../../geocoding/geoapify` not found

- [ ] **Create `apps/worker/geocoding/geoapify.ts`**

```typescript
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
```

- [ ] **Run tests to confirm they pass**

```bash
bun vitest run apps/worker/__tests__/unit/geocoding-adapter.test.ts
```
Expected: PASS (all suites)

- [ ] **Commit**

```bash
git add apps/worker/geocoding/geoapify.ts apps/worker/__tests__/unit/geocoding-adapter.test.ts
git commit -m "feat(geocoding): add GeoapifyAdapter"
```

---

## Task 6: Factory + Settings Service Methods

**Files:**
- Create: `apps/worker/geocoding/factory.ts`
- Modify: `apps/worker/services/settings.ts`

- [ ] **Write failing test for factory** — append to `apps/worker/__tests__/unit/geocoding-adapter.test.ts`:

```typescript
import { createGeocodingAdapter } from '../../geocoding/factory'
import { NullAdapter } from '../../geocoding/null'
import { OpenCageAdapter } from '../../geocoding/opencage'
import { GeoapifyAdapter } from '../../geocoding/geoapify'

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
```

- [ ] **Run test to confirm it fails**

```bash
bun vitest run apps/worker/__tests__/unit/geocoding-adapter.test.ts
```
Expected: FAIL — `../../geocoding/factory` not found

- [ ] **Create `apps/worker/geocoding/factory.ts`**

```typescript
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
```

- [ ] **Run test to confirm it passes**

```bash
bun vitest run apps/worker/__tests__/unit/geocoding-adapter.test.ts
```
Expected: PASS (all suites)

- [ ] **Add geocoding config methods to `apps/worker/services/settings.ts`**

Find the class body and add these methods (near other config getters like `getTranscriptionSettings`):

```typescript
async getGeocodingConfig(): Promise<{ provider: string | null; countries: string[]; enabled: boolean }> {
  const settings = await this.getSystemSettings()
  const config = settings.geocodingConfig as Record<string, unknown> | null
  if (!config || typeof config !== 'object' || !('provider' in config)) {
    return { provider: null, countries: [], enabled: false }
  }
  return {
    provider: (config.provider as string) ?? null,
    countries: Array.isArray(config.countries) ? config.countries as string[] : [],
    enabled: Boolean(config.enabled),
  }
}

async getGeocodingConfigAdmin(): Promise<{ provider: string | null; apiKey: string; countries: string[]; enabled: boolean }> {
  const settings = await this.getSystemSettings()
  const config = settings.geocodingConfig as Record<string, unknown> | null
  if (!config || typeof config !== 'object') {
    return { provider: null, apiKey: '', countries: [], enabled: false }
  }
  return {
    provider: (config.provider as string) ?? null,
    apiKey: (config.apiKey as string) ?? '',
    countries: Array.isArray(config.countries) ? config.countries as string[] : [],
    enabled: Boolean(config.enabled),
  }
}

async updateGeocodingConfig(data: { provider: string | null; apiKey: string; countries: string[]; enabled: boolean }): Promise<void> {
  await this.db.update(systemSettings).set({ geocodingConfig: data }).where(eq(systemSettings.id, 1))
}
```

- [ ] **Run typecheck**

```bash
bun run typecheck
```
Expected: no errors

- [ ] **Commit**

```bash
git add apps/worker/geocoding/factory.ts apps/worker/__tests__/unit/geocoding-adapter.test.ts apps/worker/services/settings.ts
git commit -m "feat(geocoding): factory + settings service methods"
```

---

## Task 7: Geocoding Routes

**Files:**
- Create: `apps/worker/routes/geocoding.ts`
- Modify: `apps/worker/app.ts`

The geocoding routes require authentication. Use `requirePermission('notes:read-own')` as the volunteer-minimum gate (same pattern as notes routes — any authenticated volunteer can geocode). Rate limiting uses `checkRateLimit` from `../lib/helpers`.

- [ ] **Create `apps/worker/routes/geocoding.ts`**

```typescript
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import type { AppEnv } from '../types'
import { requirePermission } from '../middleware/permission-guard'
import { checkRateLimit } from '../lib/helpers'
import {
  locationResultSchema,
} from '@protocol/schemas/geocoding'
import { z } from 'zod'
import { createGeocodingAdapter } from '../geocoding/factory'
import { authErrors } from '../openapi/helpers'

const geocoding = new Hono<AppEnv>()

// All geocoding endpoints require at least volunteer-level access
geocoding.use('*', requirePermission('notes:read-own'))

const autocompleteBodySchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(10).optional().default(5),
})

const geocodeBodySchema = z.object({
  address: z.string().min(1).max(500),
})

const reverseBodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
})

geocoding.post('/autocomplete',
  describeRoute({
    tags: ['Geocoding'],
    summary: 'Autocomplete address query',
    responses: {
      200: { description: 'Address suggestions', content: { 'application/json': { schema: resolver(z.array(locationResultSchema)) } } },
      ...authErrors,
    },
  }),
  validator('json', autocompleteBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const limited = await checkRateLimit(c.get('services').settings, `geocoding:auto:${pubkey}`, 60)
    if (limited) return c.json({ error: 'Rate limited' }, 429)

    const { query, limit } = c.req.valid('json')
    const config = await c.get('services').settings.getGeocodingConfigAdmin()
    const adapter = createGeocodingAdapter(config)
    const results = await adapter.autocomplete(query, { limit })
    return c.json(results)
  },
)

geocoding.post('/geocode',
  describeRoute({
    tags: ['Geocoding'],
    summary: 'Forward geocode an address to coordinates',
    responses: {
      200: { description: 'Geocoded result or null', content: { 'application/json': { schema: resolver(locationResultSchema.nullable()) } } },
      ...authErrors,
    },
  }),
  validator('json', geocodeBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const limited = await checkRateLimit(c.get('services').settings, `geocoding:fwd:${pubkey}`, 20)
    if (limited) return c.json({ error: 'Rate limited' }, 429)

    const { address } = c.req.valid('json')
    const config = await c.get('services').settings.getGeocodingConfigAdmin()
    const adapter = createGeocodingAdapter(config)
    const result = await adapter.geocode(address)
    return c.json(result)
  },
)

geocoding.post('/reverse',
  describeRoute({
    tags: ['Geocoding'],
    summary: 'Reverse geocode coordinates to address',
    responses: {
      200: { description: 'Resolved address or null', content: { 'application/json': { schema: resolver(locationResultSchema.nullable()) } } },
      ...authErrors,
    },
  }),
  validator('json', reverseBodySchema),
  async (c) => {
    const pubkey = c.get('pubkey')
    const limited = await checkRateLimit(c.get('services').settings, `geocoding:rev:${pubkey}`, 20)
    if (limited) return c.json({ error: 'Rate limited' }, 429)

    const { lat, lon } = c.req.valid('json')
    const config = await c.get('services').settings.getGeocodingConfigAdmin()
    const adapter = createGeocodingAdapter(config)
    const result = await adapter.reverse(lat, lon)
    return c.json(result)
  },
)

export default geocoding
```

- [ ] **Register route in `apps/worker/app.ts`** — add import and route:

```typescript
// Add import alongside other route imports:
import geocodingRoutes from './routes/geocoding'

// Add after authenticated routes (after the auth middleware block):
api.route('/geocoding', geocodingRoutes)
```

- [ ] **Run typecheck**

```bash
bun run typecheck
```
Expected: no errors

- [ ] **Start the dev server and smoke test the routes exist**

```bash
bun run dev:server &
sleep 2
curl -s -X POST http://localhost:8788/api/geocoding/autocomplete \
  -H 'Content-Type: application/json' \
  -d '{"query":"test"}' | head -c 100
```
Expected: `401 Unauthorized` or `{"error":"Unauthorized"}` (not 404 — route is registered)

- [ ] **Commit**

```bash
git add apps/worker/routes/geocoding.ts apps/worker/app.ts
git commit -m "feat(geocoding): add POST /api/geocoding/{autocomplete,geocode,reverse} routes"
```

---

## Task 8: Admin Settings Routes for Geocoding

**Files:**
- Modify: `apps/worker/routes/settings.ts`

- [ ] **Add geocoding config schemas to imports in `apps/worker/routes/settings.ts`**

```typescript
// Add to existing @protocol/schemas/settings import block or add new import:
import {
  geocodingConfigSchema,
  geocodingConfigAdminSchema,
  geocodingTestResponseSchema,
} from '@protocol/schemas/geocoding'
```

- [ ] **Add three routes to `apps/worker/routes/settings.ts`** — append before the `export default settings` line:

```typescript
// --- Geocoding config: readable by authenticated users, writable by settings:manage ---
settings.get('/geocoding',
  describeRoute({
    tags: ['Settings'],
    summary: 'Get geocoding configuration (API key omitted)',
    responses: {
      200: { description: 'Geocoding config', content: { 'application/json': { schema: resolver(geocodingConfigSchema) } } },
      ...authErrors,
    },
  }),
  async (c) => {
    const config = await c.get('services').settings.getGeocodingConfig()
    return c.json(config)
  },
)

settings.put('/geocoding',
  describeRoute({
    tags: ['Settings'],
    summary: 'Update geocoding configuration (admin only)',
    responses: {
      200: { description: 'Config updated', content: { 'application/json': { schema: resolver(geocodingConfigSchema) } } },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage'),
  validator('json', geocodingConfigAdminSchema),
  async (c) => {
    const body = c.req.valid('json')
    const pubkey = c.get('pubkey')
    const services = c.get('services')
    await services.settings.updateGeocodingConfig(body)
    await audit(services.audit, 'settings.geocoding.updated', pubkey, { provider: body.provider, enabled: body.enabled })
    return c.json({ provider: body.provider, countries: body.countries, enabled: body.enabled })
  },
)

settings.get('/geocoding/test',
  describeRoute({
    tags: ['Settings'],
    summary: 'Test geocoding connectivity (admin only)',
    responses: {
      200: { description: 'Test result', content: { 'application/json': { schema: resolver(geocodingTestResponseSchema) } } },
      ...authErrors,
    },
  }),
  requirePermission('settings:manage'),
  async (c) => {
    const config = await c.get('services').settings.getGeocodingConfigAdmin()
    const { createGeocodingAdapter } = await import('../geocoding/factory')
    const adapter = createGeocodingAdapter(config)
    const start = Date.now()
    try {
      await adapter.autocomplete('test', { limit: 1 })
      return c.json({ ok: true, latency: Date.now() - start })
    } catch {
      return c.json({ ok: false, latency: Date.now() - start })
    }
  },
)
```

- [ ] **Run typecheck**

```bash
bun run typecheck
```
Expected: no errors

- [ ] **Commit**

```bash
git add apps/worker/routes/settings.ts
git commit -m "feat(settings): add GET/PUT /api/settings/geocoding and connectivity test route"
```

---

## Task 9: eventDetailsSchema Unification + Template Upgrades

**Files:**
- Already modified in Task 1 (`events.ts`)
- Modify: 6 template JSON files

- [ ] **Audit BDD test fixtures for old field names** — search for references to the old `eventDetails` shape:

```bash
grep -rn '"name"\|"coordinates"\|"lng"' tests/ packages/protocol/templates/ --include="*.ts" --include="*.json" | grep -v node_modules | grep -v ".git"
```

Fix any test fixtures that reference `name:`, `coordinates:`, or `lng:` inside event details payloads to use `address:`, `lat:`, `lon:`.

- [ ] **Update `packages/protocol/templates/ice-rapid-response.json`** — find the field with `"name": "location"` and `"type": "text"` under `ice_operation` entity/report, change to:

```json
{
  "name": "location",
  "label": "Location",
  "type": "location",
  "required": true,
  "locationOptions": {
    "maxPrecision": "neighborhood",
    "allowGps": true,
    "allowAutocomplete": true
  }
}
```

- [ ] **Update `packages/protocol/templates/jail-support.json`** — 4 location fields (`arrest_location` on `arrest_case` entity; `location` on `mass_arrest_event`; `location` on `lo_arrest_report`; `location` on `lo_misconduct_report`). Change each `"type": "text"` to `"type": "location"` and add:

```json
"locationOptions": { "maxPrecision": "block", "allowGps": true, "allowAutocomplete": true }
```

- [ ] **Update `packages/protocol/templates/stop-the-sweeps.json`** — find `sweep_location`, `location` (on sweep_event), and `relocation_destination`. Set `"type": "location"` with:

```json
"locationOptions": { "maxPrecision": "neighborhood", "allowGps": true, "allowAutocomplete": true }
```

- [ ] **Update `packages/protocol/templates/street-medic.json`** — find `encounter_location`. Set `"type": "location"` with:

```json
"locationOptions": { "maxPrecision": "exact", "allowGps": true, "allowAutocomplete": true }
```

- [ ] **Update `packages/protocol/templates/missing-persons.json`** — find `last_known_location`. Set `"type": "location"` with:

```json
"locationOptions": { "maxPrecision": "block", "allowGps": true, "allowAutocomplete": true }
```

- [ ] **Update `packages/protocol/templates/hate-crime-reporting.json`** — find `geographic_area`. Set `"type": "location"` with:

```json
"locationOptions": { "maxPrecision": "neighborhood", "allowGps": true, "allowAutocomplete": true }
```

- [ ] **Run typecheck + codegen**

```bash
bun run typecheck && bun run codegen
```
Expected: no errors

- [ ] **Commit**

```bash
git add packages/protocol/templates/ packages/protocol/schemas/events.ts
git commit -m "feat(templates): upgrade 6 template location fields to fieldType='location'"
```

---

## Task 10: Desktop LocationField Component

**Files:**
- Create: `src/client/components/ui/location-field.tsx`

The component calls the worker's `/api/geocoding/autocomplete` route. The worker is accessed through the existing `api` client (check `src/client/lib/api.ts` for the fetch helper). Precision capping happens here: before calling `onChange`, strip coordinates and `displayName` if `maxPrecision` is below `'exact'`.

- [ ] **Create `src/client/components/ui/location-field.tsx`**

```tsx
import { useState, useCallback, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MapPin, ExternalLink } from 'lucide-react'
import type { LocationResult } from '@protocol/schemas/geocoding'

type LocationPrecision = 'none' | 'city' | 'neighborhood' | 'block' | 'exact'

export interface LocationFieldValue {
  address: string
  displayName?: string
  lat?: number
  lon?: number
}

interface LocationFieldProps {
  value: LocationFieldValue | null
  onChange: (value: LocationFieldValue | null) => void
  maxPrecision?: LocationPrecision
  allowAutocomplete?: boolean
  placeholder?: string
  disabled?: boolean
}

const PRECISION_RANK: Record<LocationPrecision, number> = {
  none: 0, city: 1, neighborhood: 2, block: 3, exact: 4,
}

function capToPrecision(result: LocationResult, maxPrecision: LocationPrecision): LocationFieldValue {
  const rank = PRECISION_RANK[maxPrecision]
  return {
    address: result.address,
    displayName: rank >= PRECISION_RANK.exact ? result.displayName : undefined,
    lat: rank >= PRECISION_RANK.block ? result.lat : undefined,
    lon: rank >= PRECISION_RANK.block ? result.lon : undefined,
  }
}

function openInMaps(value: LocationFieldValue) {
  const label = encodeURIComponent(value.address)
  if (value.lat != null && value.lon != null) {
    window.open(
      `https://www.openstreetmap.org/?mlat=${value.lat}&mlon=${value.lon}&zoom=15`,
      '_blank',
      'noopener,noreferrer',
    )
  } else {
    window.open(
      `https://www.openstreetmap.org/search?query=${label}`,
      '_blank',
      'noopener,noreferrer',
    )
  }
}

export function LocationField({
  value,
  onChange,
  maxPrecision = 'exact',
  allowAutocomplete = true,
  placeholder = 'Search for an address…',
  disabled = false,
}: LocationFieldProps) {
  const [query, setQuery] = useState(value?.address ?? '')
  const [suggestions, setSuggestions] = useState<LocationResult[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 3) { setSuggestions([]); return }
    setLoading(true)
    try {
      const res = await fetch('/api/geocoding/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 5 }),
        credentials: 'include',
      })
      if (res.ok) setSuggestions(await res.json() as LocationResult[])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    if (!allowAutocomplete) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(q), 300)
  }

  function selectSuggestion(result: LocationResult) {
    setSuggestions([])
    setQuery(result.address)
    onChange(capToPrecision(result, maxPrecision))
  }

  function clearValue() {
    setQuery('')
    setSuggestions([])
    onChange(null)
  }

  return (
    <div className="relative space-y-1">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={query}
            onChange={handleInputChange}
            placeholder={placeholder}
            disabled={disabled}
            className="pr-8"
          />
          {loading && (
            <span className="absolute right-2 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          )}
        </div>
        {value && (
          <Button variant="ghost" size="icon" onClick={() => openInMaps(value)} title="Open in maps">
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
        {value && !disabled && (
          <Button variant="ghost" size="icon" onClick={clearValue} title="Clear">
            ×
          </Button>
        )}
      </div>

      {suggestions.length > 0 && (
        <ul className="absolute z-50 w-full rounded-md border bg-popover shadow-md">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => selectSuggestion(s)}
              >
                <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                {s.address}
              </button>
            </li>
          ))}
        </ul>
      )}

      {value && !suggestions.length && (
        <p className="text-xs text-muted-foreground">
          {value.address}
          {value.lat != null && value.lon != null && ` (${value.lat.toFixed(4)}, ${value.lon.toFixed(4)})`}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Run typecheck**

```bash
bun run typecheck
```
Expected: no errors

- [ ] **Commit**

```bash
git add src/client/components/ui/location-field.tsx
git commit -m "feat(desktop): add LocationField component with autocomplete and open-in-maps"
```

---

## Task 11: Desktop Triage Enrichment Panel + Admin Settings UI

**Files:**
- Create: `src/client/components/ui/location-triage-panel.tsx`
- Create: `src/client/components/settings/geocoding-settings.tsx` (admin settings UI)

Location hint regex — matches common patterns in English:
- Intersections: `corner of X and Y`, `X & Y St`, `X and Y`
- Street addresses: `\d+\s+[\w\s]+(St|Ave|Blvd|Rd|Dr|Ln|Way|Ct|Pl)`

- [ ] **Create `src/client/components/ui/location-triage-panel.tsx`**

```tsx
import { useState } from 'react'
import { LocationField } from '@/components/ui/location-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { LocationFieldValue } from '@/components/ui/location-field'

const LOCATION_HINT_PATTERNS = [
  /corner of ([\w\s]+?) and ([\w\s]+)/i,
  /([\w\s]+?) (?:&|and) ([\w\s]+?) (?:St|Ave|Blvd|Rd|Dr|Ln|Way|Ct|Pl)/i,
  /\d{1,5}\s+[\w\s]+ (?:St|Ave|Blvd|Rd|Drive|Lane|Way|Court|Place|Boulevard)/i,
]

export function extractLocationHint(text: string): string | null {
  for (const pattern of LOCATION_HINT_PATTERNS) {
    const match = text.match(pattern)
    if (match) return match[0]
  }
  return null
}

interface LocationTriagePanelProps {
  messageText: string
  onConfirm: (value: LocationFieldValue) => void
  onCancel: () => void
}

export function LocationTriagePanel({ messageText, onConfirm, onCancel }: LocationTriagePanelProps) {
  const hint = extractLocationHint(messageText)
  const [location, setLocation] = useState<LocationFieldValue | null>(
    hint ? { address: hint } : null,
  )

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-sm">Add Location</CardTitle>
        {hint && (
          <p className="text-xs text-muted-foreground">
            Detected: <span className="font-medium">{hint}</span>
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <LocationField
          value={location}
          onChange={setLocation}
          placeholder={hint ?? 'Search for an address…'}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" disabled={!location} onClick={() => location && onConfirm(location)}>
            Confirm Location
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Create `src/client/components/settings/geocoding-settings.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { GeocodingConfigAdmin } from '@protocol/schemas/geocoding'

export function GeocodingSettings() {
  const [config, setConfig] = useState<GeocodingConfigAdmin>({
    provider: null, apiKey: '', countries: [], enabled: false,
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; latency: number } | null>(null)

  useEffect(() => {
    fetch('/api/settings/geocoding', { credentials: 'include' })
      .then(r => r.json())
      .then((data: Omit<GeocodingConfigAdmin, 'apiKey'>) => setConfig(c => ({ ...c, ...data })))
  }, [])

  async function save() {
    setSaving(true)
    try {
      await fetch('/api/settings/geocoding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(config),
      })
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/settings/geocoding/test', { credentials: 'include' })
      setTestResult(await res.json())
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Geocoding</CardTitle>
        <CardDescription>
          Address autocomplete and reverse geocoding for location fields.
          API keys are stored server-side and never sent to clients.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="geocoding-enabled"
            checked={config.enabled}
            onCheckedChange={enabled => setConfig(c => ({ ...c, enabled }))}
          />
          <Label htmlFor="geocoding-enabled">Enable geocoding</Label>
        </div>

        <div className="space-y-2">
          <Label>Provider</Label>
          <Select
            value={config.provider ?? ''}
            onValueChange={v => setConfig(c => ({ ...c, provider: v as GeocodingConfigAdmin['provider'] }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="opencage">OpenCage (EU, GDPR-compliant)</SelectItem>
              <SelectItem value="geoapify">Geoapify (EU, GDPR-compliant)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>API Key</Label>
          <Input
            type="password"
            value={config.apiKey}
            onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))}
            placeholder="Enter API key…"
          />
        </div>

        <div className="space-y-2">
          <Label>Country Restriction (ISO codes, comma-separated)</Label>
          <Input
            value={config.countries.join(', ')}
            onChange={e => setConfig(c => ({
              ...c,
              countries: e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
            }))}
            placeholder="US, MX, DE"
          />
          <p className="text-xs text-muted-foreground">
            Restricts geocoding results to these countries. Leave blank for worldwide.
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="outline" onClick={test} disabled={testing || !config.enabled}>
            {testing ? 'Testing…' : 'Test Connection'}
          </Button>
        </div>

        {testResult && (
          <p className={`text-sm ${testResult.ok ? 'text-green-600' : 'text-destructive'}`}>
            {testResult.ok ? `Connected (${testResult.latency}ms)` : `Connection failed (${testResult.latency}ms)`}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Run typecheck**

```bash
bun run typecheck
```
Expected: no errors

- [ ] **Commit**

```bash
git add src/client/components/ui/location-triage-panel.tsx src/client/components/settings/geocoding-settings.tsx
git commit -m "feat(desktop): add triage enrichment panel and geocoding admin settings UI"
```

---

## Task 12: iOS LocationService

**Files:**
- Create: `apps/ios/Sources/Services/LocationService.swift`

The iOS app already has `APIService.swift` for HTTP calls. Use it to call `POST /api/geocoding/reverse`. `CLLocationManager` requires `NSLocationWhenInUseUsageDescription` in `Info.plist` (check `apps/ios/` for `project.yml` or `Info.plist` to add the key if missing).

- [ ] **Check `Info.plist` or `project.yml` for location permission key**

```bash
grep -r "NSLocationWhenInUse\|location" apps/ios/ --include="*.plist" --include="*.yml" | head -10
```

If `NSLocationWhenInUseUsageDescription` is missing, add it to the appropriate plist or `project.yml` target info section.

- [ ] **Create `apps/ios/Sources/Services/LocationService.swift`**

```swift
import CoreLocation
import Foundation

/// Captures a one-shot device location and resolves it to a human-readable address
/// via the worker's reverse geocoding endpoint.
///
/// Usage:
///   let service = LocationService(apiService: apiService)
///   let result = try await service.captureAndResolve()
@MainActor
final class LocationService: NSObject, CLLocationManagerDelegate {
    private let apiService: APIService
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation, Error>?

    init(apiService: APIService) {
        self.apiService = apiService
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    /// Captures GPS coordinates and reverse-geocodes them to a LocationResult.
    /// Requests `whenInUse` permission if not yet granted.
    /// Throws `LocationError.denied` if the user has denied/restricted access.
    func captureAndResolve() async throws -> LocationResult {
        let coordinates = try await captureCoordinates()
        return try await reverseGeocode(lat: coordinates.coordinate.latitude,
                                        lon: coordinates.coordinate.longitude)
    }

    // MARK: - Private

    private func captureCoordinates() async throws -> CLLocation {
        let status = manager.authorizationStatus
        guard status != .denied && status != .restricted else {
            throw LocationError.denied
        }
        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            manager.requestLocation()
        }
    }

    private func reverseGeocode(lat: Double, lon: Double) async throws -> LocationResult {
        struct Body: Encodable { let lat: Double; let lon: Double }
        struct Response: Decodable {
            let address: String
            let displayName: String?
            let lat: Double
            let lon: Double
            let countryCode: String?
        }
        let body = Body(lat: lat, lon: lon)
        let response: Response? = try await apiService.request(method: "POST", path: "/api/geocoding/reverse", body: body)
        guard let response else { throw LocationError.noResult }
        return LocationResult(
            address: response.address,
            displayName: response.displayName,
            lat: response.lat,
            lon: response.lon,
            countryCode: response.countryCode
        )
    }

    // MARK: - CLLocationManagerDelegate

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.first else { return }
        Task { @MainActor in
            continuation?.resume(returning: location)
            continuation = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            continuation?.resume(throwing: error)
            continuation = nil
        }
    }
}

enum LocationError: LocalizedError {
    case denied
    case noResult

    var errorDescription: String? {
        switch self {
        case .denied: return NSLocalizedString("location_permission_denied", comment: "Location permission denied")
        case .noResult: return NSLocalizedString("location_no_result", comment: "Could not resolve location")
        }
    }
}

// MARK: - LocationResult (mirrors protocol codegen output)

struct LocationResult: Codable, Sendable {
    let address: String
    let displayName: String?
    let lat: Double
    let lon: Double
    let countryCode: String?
}
```

> **Note:** `LocationResult` here is a local stub. Once `bun run codegen` generates `LocationResult` from the protocol schema, replace this struct with the generated one and add `import LlamenosProtocol` (or wherever generated types land in the iOS project).

- [ ] **Add "Open in Maps" utility to LocationService.swift** — append:

```swift
// MARK: - Open in Maps

/// Opens the location in Organic Maps if installed, otherwise Apple Maps.
func openInMaps(lat: Double, lon: Double, label: String) {
    let encodedLabel = label.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
    let omURL = URL(string: "om://map?v=1&ll=\(lat),\(lon)&n=\(encodedLabel)")!
    if UIApplication.shared.canOpenURL(omURL) {
        UIApplication.shared.open(omURL)
    } else {
        let appleMapsURL = URL(string: "maps://maps.apple.com/?ll=\(lat),\(lon)&q=\(encodedLabel)")!
        UIApplication.shared.open(appleMapsURL)
    }
}
```

- [ ] **Run iOS build to confirm it compiles** (requires Mac):

```bash
ssh mac "cd ~/projects/llamenos && eval \"\$(/opt/homebrew/bin/brew shellenv)\" && xcodebuild build -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | tail -20"
```
Expected: BUILD SUCCEEDED

- [ ] **Commit**

```bash
git add apps/ios/Sources/Services/LocationService.swift
git commit -m "feat(ios): add LocationService with GPS capture and reverse geocoding"
```

---

## Task 13: Android LocationService

**Files:**
- Create: `apps/android/app/src/main/java/org/llamenos/hotline/service/LocationService.kt`

The Android app is at package `org.llamenos.hotline`. It uses `FusedLocationProviderClient` from `com.google.android.gms:play-services-location`. Check `apps/android/gradle/libs.versions.toml` — if `play-services-location` is not already listed, add it. The app already has other services in `apps/android/app/src/main/java/org/llamenos/hotline/service/`.

- [ ] **Check `libs.versions.toml` for play-services-location**

```bash
grep -i "location\|play-services" apps/android/gradle/libs.versions.toml
```

If missing, add to `libs.versions.toml` and `build.gradle.kts` and sync.

- [ ] **Check `AndroidManifest.xml` for location permissions**

```bash
grep -i "location" apps/android/app/src/main/AndroidManifest.xml
```

If `ACCESS_FINE_LOCATION` is missing, add to the manifest:
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

- [ ] **Create `apps/android/app/src/main/java/org/llamenos/hotline/service/LocationService.kt`**

```kotlin
package org.llamenos.hotline.service

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.Serializable
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

@Serializable
data class LocationResult(
    val address: String,
    val displayName: String? = null,
    val lat: Double,
    val lon: Double,
    val countryCode: String? = null,
)

sealed class LocationError : Exception() {
    data object PermissionDenied : LocationError()
    data object NoResult : LocationError()
}

/**
 * Captures a one-shot GPS location and reverse-geocodes it via the worker API.
 * Injected via Hilt — uses the shared [ApiService] for all HTTP calls.
 */
@Singleton
class LocationService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService,
) {
    private val fusedClient = LocationServices.getFusedLocationProviderClient(context)

    /** Returns true if ACCESS_FINE_LOCATION is currently granted. */
    fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    /**
     * Captures current GPS coordinates and reverse-geocodes to a [LocationResult].
     * Throws [LocationError.PermissionDenied] if permission is not granted.
     * Throws [LocationError.NoResult] if the geocoder returns nothing.
     */
    suspend fun captureAndResolve(): LocationResult {
        if (!hasPermission()) throw LocationError.PermissionDenied

        val location = suspendCancellableCoroutine { cont ->
            fusedClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
                .addOnSuccessListener { loc ->
                    if (loc != null) cont.resume(loc)
                    else cont.resumeWithException(LocationError.NoResult)
                }
                .addOnFailureListener { cont.resumeWithException(it) }
        }

        return reverseGeocode(location.latitude, location.longitude)
    }

    /** Opens the location in OsmAnd (geo: URI — Android OS handles app chooser). */
    fun openInMaps(lat: Double, lon: Double, label: String) {
        val intent = android.content.Intent(
            android.content.Intent.ACTION_VIEW,
            android.net.Uri.parse("geo:$lat,$lon?q=$lat,$lon(${android.net.Uri.encode(label)})")
        )
        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    @Serializable
    private data class ReverseBody(val lat: Double, val lon: Double)

    private suspend fun reverseGeocode(lat: Double, lon: Double): LocationResult =
        apiService.request("POST", "/api/geocoding/reverse", ReverseBody(lat, lon))
}
```

- [ ] **Run Android unit tests and lint**

```bash
cd apps/android && ./gradlew testDebugUnitTest lintDebug 2>&1 | tail -20
```
Expected: BUILD SUCCESSFUL, no new failures

- [ ] **Commit**

```bash
git add apps/android/app/src/main/java/org/llamenos/hotline/service/LocationService.kt
git commit -m "feat(android): add LocationService with GPS capture and reverse geocoding"
```

---

## Task 14: BDD Integration Tests

**Files:**
- Explore existing BDD test structure: `tests/` for Playwright feature files
- Add geocoding settings and autocomplete tests

The backend BDD tests run against a real backend (`bun run dev:server` + `docker compose up`). Check existing feature files in `tests/` for the pattern.

- [ ] **Write BDD test: geocoding settings can be configured**

In the appropriate feature file (or create `tests/features/geocoding-settings.feature`):

```gherkin
Feature: Geocoding settings

  Scenario: Admin configures geocoding provider
    Given I am logged in as an admin
    When I PUT /api/settings/geocoding with body:
      """
      { "provider": "opencage", "apiKey": "test-key", "countries": ["US"], "enabled": true }
      """
    Then the response status is 200
    And the response body contains "provider": "opencage"
    And the response body does not contain "apiKey"

  Scenario: Non-admin cannot update geocoding settings
    Given I am logged in as a volunteer
    When I PUT /api/settings/geocoding with body:
      """
      { "provider": "opencage", "apiKey": "key", "countries": [], "enabled": true }
      """
    Then the response status is 403

  Scenario: Geocoding autocomplete returns empty when not configured
    Given I am logged in as a volunteer
    And geocoding is not configured
    When I POST /api/geocoding/autocomplete with body: {"query": "Main St", "limit": 5}
    Then the response status is 200
    And the response body is []
```

- [ ] **Write BDD test: volunteer can access geocoding routes**

```gherkin
  Scenario: Unauthenticated request to geocoding is rejected
    When I POST /api/geocoding/autocomplete with body: {"query": "Main St"}
    Then the response status is 401
```

- [ ] **Run BDD tests**

```bash
bun run test:backend:bdd
```
Expected: new geocoding tests pass

- [ ] **Commit**

```bash
git add tests/
git commit -m "test(bdd): geocoding settings and route authorization tests"
```

---

## Task 15: Final Verification

- [ ] **Full typecheck**

```bash
bun run typecheck
```
Expected: no errors

- [ ] **Codegen check (CI guard)**

```bash
bun run codegen:check
```
Expected: no diff

- [ ] **Run all worker tests**

```bash
bun vitest run apps/worker/__tests__/
```
Expected: all pass

- [ ] **Run Playwright E2E tests**

```bash
bun run test
```
Expected: all pass

- [ ] **Run Android unit tests**

```bash
cd apps/android && ./gradlew testDebugUnitTest lintDebug compileDebugAndroidTestKotlin
```
Expected: BUILD SUCCESSFUL

- [ ] **Run iOS build** (requires Mac)

```bash
ssh mac "cd ~/projects/llamenos && eval \"\$(/opt/homebrew/bin/brew shellenv)\" && xcodebuild build -scheme Llamenos-Package -destination 'platform=iOS Simulator,name=iPhone 17' 2>&1 | tail -5"
```
Expected: BUILD SUCCEEDED

- [ ] **Final commit if any cleanup needed**

```bash
git add -p
git commit -m "chore(geocoding): final cleanup and verification"
```
