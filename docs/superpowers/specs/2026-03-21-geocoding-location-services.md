# Geocoding & Location Services

**Date:** 2026-03-21
**Status:** Approved for implementation
**Priority:** P1 — required for location-aware case management, triage enrichment, and mobile field reporting

---

## Problem Statement

Location data is central to Llamenos workflows — incident reports reference intersections, sweep observations reference encampment sites, medical encounters reference where patients were found, and ICE rapid-response coordination depends on real-time location sharing. Currently, all location fields are plain `text` or `textarea` with no geocoding support:

- No address autocomplete in any form
- No ability to resolve natural-language location mentions ("corner of 6th and 10th") from inbound messages into structured coordinates
- No GPS-to-address conversion for mobile volunteers sharing their location
- 6 templates store location as unstructured text, losing the ability to map, link, or filter by location
- `eventDetailsSchema` has a hardcoded `location` object that predates the custom field system and is disconnected from any geocoding capability

This spec introduces a `GeocodingAdapter` interface with OpenCage and Geoapify implementations, a new `location` custom field type with autocomplete and GPS capture, template upgrades across 6 templates, and triage enrichment tooling for incoming messages and reports.

---

## Architecture

### GeocodingAdapter (Worker)

Mirrors the existing `TelephonyAdapter` / `MessagingAdapter` pattern. All geocoding goes through the worker — API keys are never exposed to clients, and sensitive queries use POST to prevent coordinates appearing in access logs.

```
apps/worker/geocoding/
  adapter.ts     # GeocodingAdapter interface + LocationResult type
  opencage.ts    # OpenCageAdapter
  geoapify.ts    # GeoapifyAdapter
  null.ts        # NullAdapter (returns [] / null when unconfigured)
  factory.ts     # createGeocodingAdapter(config) → adapter
```

**`GeocodingAdapter` interface:**
```typescript
interface GeocodingAdapter {
  autocomplete(query: string, opts?: { limit?: number }): Promise<LocationResult[]>
  geocode(address: string): Promise<LocationResult | null>
  reverse(lat: number, lon: number): Promise<LocationResult | null>
}

interface LocationResult {
  address: string
  displayName?: string
  lat: number
  lon: number
  countryCode?: string
}
```

**Provider placeholder:** The `provider` enum includes `'llamenos-central'` as a reserved value for a post-launch network of shared, community-operated geocoding nodes (federation model). This is not implemented now — `NullAdapter` is returned for `'llamenos-central'` and for `null`. Setting `provider: null` or `enabled: false` always returns `NullAdapter`, resulting in empty autocomplete results and `null` geocode/reverse responses with no errors.

### Third-Party Provider Selection

Both providers are EU-based, OSM-backed, GDPR-compliant, and explicitly do not retain query data:

- **OpenCage** — country restriction via `countrycode=us,mx` query param
- **Geoapify** — country restriction via `filter=countrycode:us,mx` + `bias=countrycode:us`

Neither provider receives raw message text — only structured address strings passed explicitly by the worker. API keys are server-side only. Provider base URLs are hardcoded in the adapter implementations — they are not user-configurable (preventing SSRF via provider URL injection).

### Settings

New `geocodingConfig` JSONB column on `system_settings` (requires a Drizzle migration: `bun drizzle-kit generate` + `bun drizzle-kit migrate` as part of implementation):

```typescript
// Stored in DB (never sent to client)
interface GeocodingConfigAdmin {
  provider: 'opencage' | 'geoapify' | 'llamenos-central' | null
  apiKey: string
  countries: string[]   // ISO 3166-1 alpha-2 codes e.g. ['US', 'MX', 'DE']
  enabled: boolean
}

// Sent to client (apiKey omitted)
interface GeocodingConfig {
  provider: 'opencage' | 'geoapify' | 'llamenos-central' | null
  countries: string[]
  enabled: boolean
}
```

Country codes map directly to both provider APIs as restriction/bias parameters. Admins configure country-level granularity; no sub-region selection needed for third-party APIs (sub-region was relevant for self-hosted data extracts, which are deferred post-launch).

---

## Protocol Schemas

New file: `packages/protocol/schemas/geocoding.ts`

```typescript
// Shared across all platforms
export const locationPrecisionSchema = z.enum([
  'none', 'city', 'neighborhood', 'block', 'exact',
])
// (moved here from events.ts, re-exported from there for backward compat)

export const locationResultSchema = z.object({
  address: z.string(),
  displayName: z.string().optional(),
  lat: z.number(),
  lon: z.number(),
  countryCode: z.string().optional(),
})

export const geocodingConfigSchema = z.object({
  provider: z.enum(['opencage', 'geoapify', 'llamenos-central']).nullable(),
  countries: z.array(z.string()),
  enabled: z.boolean(),
})

export const geocodingConfigAdminSchema = geocodingConfigSchema.extend({
  apiKey: z.string(),
})

export const geocodingTestResponseSchema = z.object({
  ok: z.boolean(),
  latency: z.number(),   // ms
})
```

`events.ts` re-exports `locationPrecisionSchema` from `geocoding.ts` to avoid duplication.

**Schema registry:** `geocodingConfigSchema`, `geocodingConfigAdminSchema`, `locationResultSchema`, and `geocodingTestResponseSchema` must be added to `packages/protocol/tools/schema-registry.ts` so they are included in Swift/Kotlin codegen output.

---

## Worker Routes

### Geocoding API (`apps/worker/routes/geocoding.ts`)

All three endpoints use **POST** to keep address strings and coordinates out of access logs.

```
POST /api/geocoding/autocomplete   body: { query: string, limit?: number }   → LocationResult[]
POST /api/geocoding/geocode        body: { address: string }                  → LocationResult | null
POST /api/geocoding/reverse        body: { lat: number, lon: number }         → LocationResult | null
```

- Requires `volunteer` role minimum (authenticated)
- Rate-limited: autocomplete 60 req/min/user; geocode and reverse 20 req/min/user (using existing rate-limit infrastructure)
- Country restriction applied by adapter before outbound request
- `NullAdapter` returns `[]` / `null` — no 500s when geocoding is unconfigured
- No geocoding query text or coordinates persisted to the database

### Admin Settings Routes (extend `apps/worker/routes/settings.ts`)

```
GET  /api/settings/geocoding        → geocodingConfigSchema (no apiKey)           (authenticated)
PUT  /api/settings/geocoding        body: geocodingConfigAdminSchema (admin only)
GET  /api/settings/geocoding/test   → geocodingTestResponseSchema                 (admin only)
```

---

## Custom Field Type: `location`

A new `fieldType: 'location'` added to the entity schema system. Usable in any entity type, report type, or event template.

### Field definition extension

`'location'` is added to the `type` enum in `entityFieldDefinitionSchema` (in `entity-schema.ts`) alongside the existing values `'text' | 'number' | 'select' | 'multiselect' | 'checkbox' | 'textarea' | 'date' | 'file'`.

**All three locations where this enum is defined must be updated together:**
1. `entityFieldDefinitionSchema.type` in `packages/protocol/schemas/entity-schema.ts`
2. `customFieldDefinitions.fieldType` column type in `apps/worker/db/schema/settings.ts`
3. Any report-type body schemas that reference the same enum

A new optional `locationOptions` field is added alongside the existing `options` array (which serves select/multiselect):

```typescript
// In entityFieldDefinitionSchema
locationOptions: z.object({
  maxPrecision: locationPrecisionSchema.optional().default('exact'),
  allowGps: z.boolean().optional().default(true),
  allowAutocomplete: z.boolean().optional().default(true),
}).optional()
```

### `maxPrecision` — Client-Side Enforcement

`maxPrecision` is enforced **client-side only**. Because location field values are stored in encrypted payloads (E2EE), the server cannot inspect the value to validate precision at write time. This limitation must be acknowledged: a modified client could bypass `maxPrecision`. The guarantee is a UX safeguard and an expression of the template author's intent, not a cryptographic constraint. Templates like `ice-rapid-response` with `maxPrecision: 'neighborhood'` still offer meaningfully stronger protection than a plain text field.

**Precision capping behaviour in the client:**

| `maxPrecision` | Coordinates stored | Address string | `displayName` stored |
|---|---|---|---|
| `'exact'` | Full lat/lon | Full street address | Yes |
| `'block'` | Rounded to ~100m | Street name + city (no number) | No |
| `'neighborhood'` | Omitted | Neighbourhood + city | No |
| `'city'` | Omitted | City only | No |
| `'none'` | Omitted | Empty string | No |

When GPS capture is used with a precision-limited field, the raw GPS coordinates are used only to call `/api/geocoding/reverse` and then discarded. The resolved address string is then truncated to the appropriate level before storing.

### Stored value shape (in encrypted payload)

```typescript
interface LocationFieldValue {
  address: string          // human-readable, precision-capped per table above
  displayName?: string     // full formatted name from geocoder — only stored when maxPrecision === 'exact', omitted otherwise (displayName cannot be safely truncated)
  lat?: number             // omitted if maxPrecision < 'block'
  lon?: number             // omitted if maxPrecision < 'block'
}
```

### Desktop UI

- Address autocomplete input (debounced 300ms, calls `POST /api/geocoding/autocomplete`)
- Resolved result shown as human-readable address with "Open in maps" link
- No GPS capture on desktop (Tauri/Linux, no geolocation API)

### Mobile UI (iOS & Android)

Two input modes per field:
- **Autocomplete** — address search, calls `POST /api/geocoding/autocomplete`, select a result
- **"Insert my location"** button — captures GPS → `POST /api/geocoding/reverse` → fills field with precision-capped result; user can edit the resolved address before saving

### "Open in Maps" Deep Links

| Platform | Primary | Fallback |
|---|---|---|
| Android | `geo:lat,lon?q=lat,lon(label)` — OS chooser (OsmAnd, Organic Maps, etc.) | — |
| iOS | `om://map?v=1&ll=lat,lon&n=label` (Organic Maps) if `canOpenURL` succeeds | `maps://maps.apple.com/?ll=lat,lon&q=label` (Apple Maps) |
| Desktop | `https://www.openstreetmap.org/?mlat=lat&mlon=lon&zoom=15` | — |

iOS must check `UIApplication.shared.canOpenURL(omURL)` before attempting to open `om://`. If the check fails (Organic Maps not installed), fall back to Apple Maps. Google Maps is never used.

---

## Mobile GPS Services

### iOS (`apps/ios/Sources/Services/LocationService.swift`)

- Wraps `CLLocationManager` with `requestWhenInUseAuthorization()`
- Checks `CLAuthorizationStatus` before capture; if `.denied` or `.restricted`, surfaces a "Location access required — please enable in Settings" prompt linking to `UIApplication.openSettingsURLString`
- One-shot coordinate capture (no continuous tracking) via `CLLocationManagerDelegate`
- Passes coordinates to `POST /api/geocoding/reverse`
- Returns resolved `LocationResult` to caller

### Android (`apps/android/app/src/main/java/…/service/LocationService.kt`)

- Wraps `FusedLocationProviderClient` with `ACCESS_FINE_LOCATION` permission
- Uses `ActivityResultContracts.RequestPermission` for runtime permission request; if denied with `shouldShowRequestPermissionRationale() == false` (permanently denied), surfaces a Settings deep-link prompt
- One-shot capture via `getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY)`
- Passes coordinates to `POST /api/geocoding/reverse`
- Returns resolved `LocationResult` to caller

Neither platform stores raw coordinates beyond the field value. Location permission is requested at point-of-use (not at app startup).

---

## Triage Enrichment Workflow

When a message or report arrives containing natural-language location information ("ICE spotted on the corner of 6th and 10th"), a triaging user can manually geocode it and attach the resolved location to the relevant entity.

### Location Hint Extraction

Simple regex patterns highlight potential location mentions in message text:
- Intersection patterns: "X and Y St", "corner of X and Y", "X & Y"
- Street addresses: one or more digits followed by a street name
- Extracted text pre-fills the geocoding autocomplete field — the triaging user provides city/region context the system lacks

No ML or automatic geocoding — the human resolves ambiguity. This prevents false positives on common phrases that happen to match address patterns.

### Enrichment UI Action

Available on message view and report view for users with the appropriate role:

1. "Add location" action opens a panel showing:
   - Autocomplete field (pre-filled with extracted hint if any)
   - `LocationResult` selection
   - "Open in maps" link to verify before confirming
2. Confirmed location can be attached to:
   - The conversation/message itself
   - A linked report (populates the report's location field)
   - A linked case/record (populates location in encrypted fields)
   - A linked event (feeds into `eventDetails.location`)

### Mobile Enrichment

Same workflow on iOS and Android — triage users can geocode incoming messages from their phone using the same autocomplete panel and GPS capture button.

---

## Template Upgrades

6 templates have their text-based location fields upgraded to `fieldType: 'location'`. All other location-adjacent fields (`location_type` selects, `travel_route` PII textarea, `access_issues` mixed-content textarea, `court` name field) remain unchanged.

| Template | Field(s) | `maxPrecision` | Rationale |
|---|---|---|---|
| `ice-rapid-response` | `location` on `ice_operation` | `neighborhood` | Enforces existing "no exact addresses" security note programmatically |
| `jail-support` | `arrest_location`, `location` (3× across entity/event types) | `block` | Intersection-level is appropriate for arrest documentation |
| `stop-the-sweeps` | `sweep_location`, `location`, `relocation_destination` | `neighborhood` | Encampment sites need neighborhood precision for safety |
| `street-medic` | `encounter_location` | `exact` | Medical record needs precise location for follow-up |
| `missing-persons` | `last_known_location` | `block` | Block-level balances findability with subject safety |
| `hate-crime-reporting` | `geographic_area` | `neighborhood` | Area-level for cluster analysis |

All 6 get `allowGps: true` and `allowAutocomplete: true` by default.

---

## `eventDetailsSchema` Unification

The existing hardcoded `location` object in `eventDetailsSchema` (events.ts) is aligned with `LocationResult` and the new precision system.

**Before:**
```typescript
location: z.object({
  name: z.string(),
  coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
  area: z.string().optional(),
  jurisdiction: z.string().optional(),
}).optional()
```

**After:**
```typescript
location: z.object({
  address: z.string(),           // replaces 'name' — aligns with LocationResult
  lat: z.number().optional(),    // replaces nested coordinates object
  lon: z.number().optional(),    // 'lon' not 'lng' — aligns with LocationResult
  area: z.string().optional(),
  jurisdiction: z.string().optional(),
}).optional()
```

**Migration note:** This is a field rename inside an E2EE encrypted payload — the server never reads or writes the payload structure, so there is no server-side breakage. However, any BDD test fixtures or integration test helpers that construct `EventDetails` objects directly must be audited and updated as part of implementation. Search for `name:` and `coordinates:` and `lng:` in test files that reference event details payloads.

The existing cleartext `locationApproximate` field and `locationPrecision` field on the event record (outside the encrypted payload) are unchanged — they serve the server-filterable/searchable use case.

`locationPrecisionSchema` is moved to `geocoding.ts` and re-exported from `events.ts`.

---

## Security Considerations

- **API keys** — stored in `system_settings.geocodingConfig` JSONB, never returned to clients, never logged; `GET /api/settings/geocoding` omits the `apiKey` field
- **Query logging** — all geocoding endpoints use POST; Caddy/nginx access logs must not include request bodies — verify this configuration is in place
- **Provider URL hardcoding** — OpenCage and Geoapify base URLs are hardcoded in adapter implementations, not configurable, preventing SSRF via provider URL injection
- **No coordinate persistence** — geocoding query inputs (address strings, coordinates) are not written to the database; only the resolved and precision-capped `LocationFieldValue` is stored as part of an encrypted field value
- **`maxPrecision` enforcement** — client-side only (server cannot inspect E2EE payloads); this is a documented limitation, not a broken guarantee
- **Location permission** — mobile GPS permission requested at point-of-use, not at startup; never used for background tracking

---

## Out of Scope (Post-Launch)

- **Self-hosted geocoder** (Nominatim + Photon) — deferred; requires significant additional infrastructure cost
- **`llamenos-central` federated geocoding network** — placeholder enum value reserved; architecture TBD post-launch
- **Embedded map widget** — showing a map preview in the UI; the "Open in maps" link is the current solution
- **Sub-region granularity in country picker** — relevant for self-hosted data extracts; not needed for third-party APIs
- **Geospatial database queries** — filtering cases/events by bounding box or radius; requires PostGIS and coordinate indexing
- **Address normalization** — libpostal or similar for cleaning up inconsistent address inputs

---

## Codegen Impact

- `packages/protocol/schemas/geocoding.ts` (new file) — `locationResultSchema`, `geocodingConfigSchema`, `geocodingConfigAdminSchema`, `geocodingTestResponseSchema` added to `schema-registry.ts` → Swift/Kotlin types generated via `bun run codegen`
- `entity-schema.ts` — `'location'` added to `fieldType` enum + `locationOptions` field added → `fieldType` union updated in generated Swift/Kotlin
- `settings.ts` DB schema — `'location'` added to `customFieldDefinitions.fieldType` column enum; Drizzle migration required
- `events.ts` — `locationPrecisionSchema` removed (moved to `geocoding.ts`, re-exported); `eventDetailsSchema.location` field renames (`name` → `address`, `lng` → `lon`, flattened coordinates) → Swift/Kotlin codegen updated; audit BDD/test fixtures for references to old field names
- 6 template JSON files updated — no codegen impact (templates loaded at runtime)
