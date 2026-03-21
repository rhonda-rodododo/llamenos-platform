/**
 * Backend BDD step definitions for geocoding settings and API authorization.
 * Tests that admin-only settings endpoints are protected and that the
 * autocomplete/geocode routes are accessible to volunteers (with or without config).
 */
import { expect } from '@playwright/test'
import { Given, When, Then, getState, setState } from './fixtures'
import {
  ADMIN_NSEC,
  apiGet,
  apiPost,
  apiPut,
  createVolunteerViaApi,
  uniqueName,
} from '../../api-helpers'

// ── Local geocoding test state ─────────────────────────────────────

interface GeocodingState {
  volunteerNsec?: string
  lastStatus: number
  lastData: unknown
}

const GEOCODING_KEY = 'geocoding'

function getGeocodingState(world: Record<string, unknown>): GeocodingState {
  const existing = getState<Partial<GeocodingState>>(world, GEOCODING_KEY)
  return { lastStatus: 0, lastData: null, ...existing }
}

// ── Setup steps ────────────────────────────────────────────────────

Given('I am logged in as an admin', async ({ world }) => {
  // ADMIN_NSEC is pre-registered in global setup — use directly
  const state = getGeocodingState(world)
  state.volunteerNsec = undefined  // undefined means use admin (ADMIN_NSEC)
  setState(world, GEOCODING_KEY, state)
})

Given('I am logged in as a volunteer', async ({ request, world }) => {
  const vol = await createVolunteerViaApi(request, {
    name: uniqueName('geo-vol'),
  })
  const state = getGeocodingState(world)
  state.volunteerNsec = vol.nsec
  setState(world, GEOCODING_KEY, state)
})

Given('geocoding is configured with provider {string} and enabled', async ({ request }, provider: string) => {
  await apiPut(request, '/settings/geocoding', {
    provider,
    apiKey: 'test-api-key',
    countries: [],
    enabled: true,
  })
})

Given('geocoding is not configured', async ({ request }) => {
  await apiPut(request, '/settings/geocoding', {
    provider: null,
    apiKey: '',
    countries: [],
    enabled: false,
  })
})

// ── When steps ─────────────────────────────────────────────────────

When('I configure the geocoding provider to {string}', async ({ request, world }, provider: string) => {
  const nsec = getGeocodingState(world).volunteerNsec ?? ADMIN_NSEC
  const { status, data } = await apiPut(request, '/settings/geocoding', {
    provider,
    apiKey: 'test-api-key-123',
    countries: [],
    enabled: true,
  }, nsec)
  const state = getGeocodingState(world)
  state.lastStatus = status
  state.lastData = data
  setState(world, GEOCODING_KEY, state)
})

When('I GET the geocoding settings', async ({ request, world }) => {
  const nsec = getGeocodingState(world).volunteerNsec ?? ADMIN_NSEC
  const { status, data } = await apiGet(request, '/settings/geocoding', nsec)
  const state = getGeocodingState(world)
  state.lastStatus = status
  state.lastData = data
  setState(world, GEOCODING_KEY, state)
})

When('I POST geocoding autocomplete with query {string}', async ({ request, world }, query: string) => {
  const nsec = getGeocodingState(world).volunteerNsec ?? ADMIN_NSEC
  const { status, data } = await apiPost(request, '/geocoding/autocomplete', { query, limit: 5 }, nsec)
  const state = getGeocodingState(world)
  state.lastStatus = status
  state.lastData = data
  setState(world, GEOCODING_KEY, state)
})

When('I POST geocoding autocomplete without authentication', async ({ request, world }) => {
  const res = await request.post('/api/geocoding/autocomplete', {
    data: { query: 'Main St', limit: 5 },
    headers: { 'Content-Type': 'application/json' },
  })
  const state = getGeocodingState(world)
  state.lastStatus = res.status()
  state.lastData = null
  setState(world, GEOCODING_KEY, state)
})

When('I GET geocoding settings without authentication', async ({ request, world }) => {
  const res = await request.get('/api/settings/geocoding')
  const state = getGeocodingState(world)
  state.lastStatus = res.status()
  state.lastData = null
  setState(world, GEOCODING_KEY, state)
})

// ── Then steps ─────────────────────────────────────────────────────

Then('the geocoding settings response is {int}', ({ world }, expectedStatus: number) => {
  expect(getGeocodingState(world).lastStatus).toBe(expectedStatus)
})

Then('the geocoding response is {int}', ({ world }, expectedStatus: number) => {
  expect(getGeocodingState(world).lastStatus).toBe(expectedStatus)
})

Then('the geocoding settings do not expose the apiKey', ({ world }) => {
  const data = getGeocodingState(world).lastData
  if (data && typeof data === 'object') {
    expect(Object.keys(data as Record<string, unknown>)).not.toContain('apiKey')
  }
})

Then('the provider is {string}', ({ world }, provider: string) => {
  const data = getGeocodingState(world).lastData as Record<string, unknown> | null
  expect(data).not.toBeNull()
  expect((data as Record<string, unknown>).provider).toBe(provider)
})

Then('geocoding is enabled', ({ world }) => {
  const data = getGeocodingState(world).lastData as Record<string, unknown> | null
  expect(data).not.toBeNull()
  expect((data as Record<string, unknown>).enabled).toBe(true)
})

Then('the autocomplete result is an array', ({ world }) => {
  const data = getGeocodingState(world).lastData
  expect(Array.isArray(data)).toBe(true)
})

Then('the autocomplete result is an empty array', ({ world }) => {
  const data = getGeocodingState(world).lastData
  expect(Array.isArray(data)).toBe(true)
  expect((data as unknown[]).length).toBe(0)
})
