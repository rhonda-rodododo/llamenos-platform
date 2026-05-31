/**
 * PUK (Per-User Key) rotation step definitions.
 * Tests PUK envelope distribution and retrieval per device.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import { setLastResponse, getSharedState } from './shared-state'
import {
  apiGet,
  apiPost,
} from '../../api-helpers'
import { bytesToHex } from '@shared/encoding'

// ── State ──────────────��────────────────────────────────────────────

interface PukTestState {
  user?: { deviceKey: string; pubkey: string }
  deviceIds: string[]
}

const STATE_KEY = 'puk_test'

function getS(world: Record<string, unknown>): PukTestState {
  const s = getState<PukTestState>(world, STATE_KEY)
  // Fall back to shared user set by "a registered user with a known keypair" step
  if (!s.user) {
    const sharedUser = getSharedState(world).sharedUser
    if (sharedUser) s.user = sharedUser
  }
  return s
}

Before(async ({ world }) => {
  setState<PukTestState>(world, STATE_KEY, { deviceIds: [] })
})

// ── Helpers ──────────────────��──────────────────────────────────────

function fakeEnvelope(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(64)))
}

async function registerDevice(
  request: import('@playwright/test').APIRequestContext,
  _deviceKey: string,
) {
  const wakeKey = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
  const pushToken = bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
  return apiPost(request, '/devices/register', { platform: 'ios', pushToken, wakeKeyPublic: wakeKey }, nsec)
}

// ── Given ───────────────────────────────────────────────────────────

Given('the user has a registered device {string}', async ({ request, world }, _label: string) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  const regRes = await registerDevice(request, s.user!.deviceKey)
  expect(regRes.status).toBe(204)
  const listRes = await apiGet<{ devices: Array<{ id: string }> }>(request, '/devices', s.user!.deviceKey)
  expect(listRes.status).toBe(200)
  const latestDevice = listRes.data.devices[listRes.data.devices.length - 1]
  expect(latestDevice).toBeDefined()
  s.deviceIds.push(latestDevice.id)
  // Also write to shared state so MLS step namespace can access device IDs
  getSharedState(world).sharedDeviceIds.push(latestDevice.id)
})

Given('PUK envelopes are distributed for generation {int}', async ({ request, world }, generation: number) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.deviceIds.length).toBeGreaterThan(0)
  const envelopes = s.deviceIds.map(deviceId => ({ deviceId, generation, envelope: fakeEnvelope() }))
  const res = await apiPost(request, '/puk/envelopes', { envelopes }, s.user!.deviceKey)
  expect(res.status).toBe(201)
})

// ���─ When ────────────────────────────────────────────────────────────

When('the user distributes PUK envelopes for generation {int}', async ({ request, world }, generation: number) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.deviceIds.length).toBeGreaterThan(0)
  const envelopes = s.deviceIds.map(deviceId => ({ deviceId, generation, envelope: fakeEnvelope() }))
  setLastResponse(world, await apiPost(request, '/puk/envelopes', { envelopes }, s.user!.deviceKey))
})

When('the user distributes PUK envelopes for generation {int} to all devices', async ({ request, world }, generation: number) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.deviceIds.length).toBeGreaterThan(0)
  const envelopes = s.deviceIds.map(deviceId => ({ deviceId, generation, envelope: fakeEnvelope() }))
  setLastResponse(world, await apiPost(request, '/puk/envelopes', { envelopes }, s.user!.deviceKey))
})

When('the user fetches the PUK envelope for {string}', async ({ request, world }, deviceLabel: string) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  const labels = ['device-alpha', 'device-beta']
  const idx = labels.indexOf(deviceLabel)
  const deviceId = idx >= 0 && idx < s.deviceIds.length ? s.deviceIds[idx] : deviceLabel
  setLastResponse(world, await apiGet(request, `/puk/envelopes/${deviceId}`, s.user!.deviceKey))
})

// ── Then ────────────────────────────────────────────────────────────

Then('{int} PUK envelope(s) is/are stored', async ({ world }, count: number) => {
  const resp = getSharedState(world).lastResponse
  expect(resp).toBeDefined()
  const data = resp!.data as { distributed: number }
  expect(data.distributed).toBe(count)
})

Then('the PUK envelope generation is {int}', async ({ world }, generation: number) => {
  const resp = getSharedState(world).lastResponse
  expect(resp).toBeDefined()
  const data = resp!.data as { generation: number }
  expect(data.generation).toBe(generation)
})
