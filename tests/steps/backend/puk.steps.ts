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
  createUserViaApi,
} from '../../api-helpers'
import { bytesToHex } from '@noble/hashes/utils.js'

// ── State ──────────────��────────────────────────────────────────────

interface PukTestState {
  user?: { nsec: string; pubkey: string }
  deviceIds: string[]
}

const STATE_KEY = 'puk_test'

function getS(world: Record<string, unknown>): PukTestState {
  return getState<PukTestState>(world, STATE_KEY)
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
  nsec: string,
) {
  const wakeKey = '02' + bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
  const pushToken = bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
  await apiPost(request, '/devices/register', { platform: 'ios', pushToken, wakeKeyPublic: wakeKey }, nsec)
}

// ── Given ───────────────────────────────────────────────────────────

Given('the user has a registered device {string}', async ({ request, world }, _label: string) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  await registerDevice(request, s.user!.nsec)
  const listRes = await apiGet<{ devices: Array<{ id: string }> }>(request, '/devices', s.user!.nsec)
  expect(listRes.status).toBe(200)
  const latestDevice = listRes.data.devices[listRes.data.devices.length - 1]
  s.deviceIds.push(latestDevice.id)
})

Given('PUK envelopes are distributed for generation {int}', async ({ request, world }, generation: number) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.deviceIds.length).toBeGreaterThan(0)
  const envelopes = s.deviceIds.map(deviceId => ({ deviceId, generation, envelope: fakeEnvelope() }))
  const res = await apiPost(request, '/puk/envelopes', { envelopes }, s.user!.nsec)
  expect(res.status).toBe(201)
})

// ���─ When ────────────────────────────────────────────────────────────

When('the user distributes PUK envelopes for generation {int}', async ({ request, world }, generation: number) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.deviceIds.length).toBeGreaterThan(0)
  const envelopes = s.deviceIds.map(deviceId => ({ deviceId, generation, envelope: fakeEnvelope() }))
  setLastResponse(world, await apiPost(request, '/puk/envelopes', { envelopes }, s.user!.nsec))
})

When('the user distributes PUK envelopes for generation {int} to all devices', async ({ request, world }, generation: number) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.deviceIds.length).toBeGreaterThan(0)
  const envelopes = s.deviceIds.map(deviceId => ({ deviceId, generation, envelope: fakeEnvelope() }))
  setLastResponse(world, await apiPost(request, '/puk/envelopes', { envelopes }, s.user!.nsec))
})

When('the user fetches the PUK envelope for {string}', async ({ request, world }, deviceLabel: string) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  const labels = ['device-alpha', 'device-beta']
  const idx = labels.indexOf(deviceLabel)
  const deviceId = idx >= 0 && idx < s.deviceIds.length ? s.deviceIds[idx] : deviceLabel
  setLastResponse(world, await apiGet(request, `/puk/envelopes/${deviceId}`, s.user!.nsec))
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
