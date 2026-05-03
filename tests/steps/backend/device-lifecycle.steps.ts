/**
 * Device lifecycle step definitions.
 * Tests device registration, listing, deregistration, and Phase 6 crypto keys.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import { setLastResponse, getSharedState } from './shared-state'
import {
  apiGet,
  apiPost,
  apiDelete,
  createUserViaApi,
} from '../../api-helpers'
import { bytesToHex } from '@noble/hashes/utils.js'

// ── State ───��────────────────────────────��──────────────────────────

interface DeviceTestState {
  user?: { nsec: string; pubkey: string }
  devices: Array<{ id: string; platform: string }>
  ed25519Pubkey?: string
}

const STATE_KEY = 'device_lifecycle_test'

function getS(world: Record<string, unknown>): DeviceTestState {
  return getState<DeviceTestState>(world, STATE_KEY)
}

Before(async ({ world }) => {
  setState<DeviceTestState>(world, STATE_KEY, { devices: [] })
})

// ── Helpers ─────────────────────────────────────────────────────────

function randomWakeKey(): string {
  return '02' + bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
}

function randomPushToken(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
}

// ── Given/When ──────────────────────────────────────────────────────

Given('the user registers a device with platform {string}', async ({ request, world }, platform: string) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  const res = await apiPost(request, '/devices/register', {
    platform, pushToken: randomPushToken(), wakeKeyPublic: randomWakeKey(),
  }, s.user!.nsec)
  setLastResponse(world, res)
})

When('the user lists their devices', async ({ request, world }) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  const res = await apiGet<{ devices: Array<{ id: string; platform: string }> }>(request, '/devices', s.user!.nsec)
  setLastResponse(world, res)
  if (res.status === 200) { s.devices = res.data.devices }
})

When('the user deregisters the first device', async ({ request, world }) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.devices.length).toBeGreaterThan(0)
  setLastResponse(world, await apiDelete(request, `/devices/${s.devices[0].id}`, s.user!.nsec))
})

When('the user deregisters device {string}', async ({ request, world }, deviceId: string) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  setLastResponse(world, await apiDelete(request, `/devices/${deviceId}`, s.user!.nsec))
})

When('the user deletes all their devices', async ({ request, world }) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  setLastResponse(world, await apiDelete(request, '/devices', s.user!.nsec))
})

When('the user registers a device with Ed25519 and X25519 keys', async ({ request, world }) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  const ed25519Pubkey = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
  const x25519Pubkey = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
  s.ed25519Pubkey = ed25519Pubkey
  setLastResponse(world, await apiPost(request, '/devices/register', {
    platform: 'ios', pushToken: randomPushToken(), wakeKeyPublic: randomWakeKey(), ed25519Pubkey, x25519Pubkey,
  }, s.user!.nsec))
})

When('the user registers a VoIP token', async ({ request, world }) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  setLastResponse(world, await apiPost(request, '/devices/voip-token', {
    platform: 'ios', voipToken: randomPushToken(),
  }, s.user!.nsec))
})

// ── Then ────────────────────────────────────────────────────────────

Then('{int} devices are listed', async ({ world }, count: number) => {
  const resp = getSharedState(world).lastResponse
  expect(resp).toBeDefined()
  const data = resp!.data as { devices: unknown[] }
  expect(data.devices).toHaveLength(count)
})

Then('one device has platform {string}', async ({ world }, platform: string) => {
  const resp = getSharedState(world).lastResponse
  expect(resp).toBeDefined()
  const data = resp!.data as { devices: Array<{ platform: string }> }
  expect(data.devices.some(d => d.platform === platform)).toBe(true)
})

Then('the user has {int} devices', async ({ request, world }, count: number) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  const res = await apiGet<{ devices: unknown[] }>(request, '/devices', s.user!.nsec)
  expect(res.status).toBe(200)
  expect(res.data.devices).toHaveLength(count)
})

Then('the device lists show the Ed25519 public key', async ({ request, world }) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.ed25519Pubkey).toBeDefined()
  const res = await apiGet<{ devices: Array<{ ed25519Pubkey: string | null }> }>(request, '/devices', s.user!.nsec)
  expect(res.status).toBe(200)
  expect(res.data.devices.some(d => d.ed25519Pubkey === s.ed25519Pubkey)).toBe(true)
})
