/**
 * MLS group messaging step definitions.
 * Tests MLS message routing: key packages, commits, welcomes, and fetch-and-clear.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import { setLastResponse, getSharedState } from './shared-state'
import {
  apiGet,
  apiPost,
  createUserViaApi,
  createHubViaApi,
} from '../../api-helpers'
import { bytesToHex } from '@noble/hashes/utils.js'

// ─��� State ────────────────────────────────��──────────────────────────

interface MlsTestState {
  user?: { nsec: string; pubkey: string }
  hubId?: string
  deviceIds: string[]
  pendingMessageCount?: number
}

const STATE_KEY = 'mls_test'

function getS(world: Record<string, unknown>): MlsTestState {
  return getState<MlsTestState>(world, STATE_KEY)
}

Before(async ({ world }) => {
  setState<MlsTestState>(world, STATE_KEY, { deviceIds: [] })
})

// ── Helpers ─────────────────────────────────────────────────────────

function fakePayload(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
}

function randomWakeKey(): string {
  return '02' + bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
}

function randomPushToken(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)))
}

// ── Given ───────────────────────────────────────────────────────────

Given('a test hub exists', async ({ request, world }) => {
  getS(world).hubId = await createHubViaApi(request, `mls-hub-${Date.now()}`)
})

// ── When ────────────────────────────────────────────────────────────

When('the user uploads {int} key packages for {string}', async ({ request, world }, count: number, _label: string) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.hubId).toBeDefined()
  const deviceId = s.deviceIds[s.deviceIds.length - 1]
  expect(deviceId).toBeDefined()
  const keyPackages = Array.from({ length: count }, () => fakePayload())
  setLastResponse(world, await apiPost(request, `/hubs/${s.hubId}/mls/key-packages?deviceId=${deviceId}`, { keyPackages }, s.user!.nsec))
})

When('the user sends an MLS commit to device {string}', async ({ request, world }, targetDeviceId: string) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.hubId).toBeDefined()
  setLastResponse(world, await apiPost(request, `/hubs/${s.hubId}/mls/commit`, {
    recipientDeviceIds: [targetDeviceId], payload: fakePayload(),
  }, s.user!.nsec))
})

When('the user sends an MLS welcome to device {string}', async ({ request, world }, targetDeviceId: string) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.hubId).toBeDefined()
  setLastResponse(world, await apiPost(request, `/hubs/${s.hubId}/mls/welcome`, {
    recipientDeviceId: targetDeviceId, payload: fakePayload(),
  }, s.user!.nsec))
})

Given('an MLS commit was sent to {string}', async ({ request, world }, deviceId: string) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.hubId).toBeDefined()
  const res = await apiPost(request, `/hubs/${s.hubId}/mls/commit`, {
    recipientDeviceIds: [deviceId], payload: fakePayload(),
  }, s.user!.nsec)
  expect(res.status).toBe(204)
})

When('the user fetches MLS messages for {string}', async ({ request, world }, deviceId: string) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.hubId).toBeDefined()
  const res = await apiGet(request, `/hubs/${s.hubId}/mls/messages?deviceId=${deviceId}`, s.user!.nsec)
  setLastResponse(world, res)
  if (res.status === 200) {
    s.pendingMessageCount = (res.data as { messages: unknown[] }).messages.length
  }
})

When('the user fetches MLS messages for {string} again', async ({ request, world }, deviceId: string) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.hubId).toBeDefined()
  const res = await apiGet(request, `/hubs/${s.hubId}/mls/messages?deviceId=${deviceId}`, s.user!.nsec)
  setLastResponse(world, res)
  if (res.status === 200) {
    s.pendingMessageCount = (res.data as { messages: unknown[] }).messages.length
  }
})

When('the user fetches MLS messages without a deviceId', async ({ request, world }) => {
  const s = getS(world)
  expect(s.user).toBeDefined()
  expect(s.hubId).toBeDefined()
  setLastResponse(world, await apiGet(request, `/hubs/${s.hubId}/mls/messages`, s.user!.nsec))
})

// ── Then ─────────────────────���──────────────────────────────────────

Then('{int} MLS message(s) is/are pending', async ({ world }, count: number) => {
  expect(getS(world).pendingMessageCount).toBe(count)
})
