import { expect } from '@playwright/test'
import { Given, When, Then, getState, setState } from './fixtures'
import { apiGet, apiPost, apiPatch } from '../../api-helpers'

interface ChannelConfigState {
  lastStatus: number
  lastData: unknown
}

const KEY = 'channelConfig'

function getCS(world: Record<string, unknown>): ChannelConfigState {
  const existing = getState<Partial<ChannelConfigState>>(world, KEY)
  return { lastStatus: 0, lastData: null, ...existing }
}

function setCS(world: Record<string, unknown>, updates: Partial<ChannelConfigState>): void {
  setState(world, KEY, { ...getCS(world), ...updates })
}

interface DataTable {
  hashes(): Array<Record<string, string>>
}

When('I PATCH {string} with:', async ({ request, world }, path: string, table: DataTable) => {
  const body: Record<string, unknown> = {}
  for (const row of table.hashes()) {
    const keys = row.field.split('.')
    let current = body
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = current[keys[i]] || {}
      current = current[keys[i]] as Record<string, unknown>
    }
    const value = row.value === 'true' ? true : row.value === 'false' ? false : row.value
    current[keys[keys.length - 1]] = value
  }

  const { status, data } = await apiPatch(request, path, body)
  setCS(world, { lastStatus: status, lastData: data })
})

When('I POST {string} with:', async ({ request, world }, path: string, table: DataTable) => {
  const body: Record<string, unknown> = {}
  for (const row of table.hashes()) {
    body[row.field] = row.value === 'true' ? true : row.value === 'false' ? false : row.value
  }

  const { status, data } = await apiPost(request, path, body)
  setCS(world, { lastStatus: status, lastData: data })
})

When('I GET {string}', async ({ request, world }, path: string) => {
  const { status, data } = await apiGet(request, path)
  setCS(world, { lastStatus: status, lastData: data })
})

Then('the channel config response status is {int}', ({ world }, status: number) => {
  expect(getCS(world).lastStatus).toBe(status)
})

Then('the response status is {int} or {int}', ({ world }, s1: number, s2: number) => {
  expect([s1, s2]).toContain(getCS(world).lastStatus)
})

Then('the response {string} includes {string}', ({ world }, field: string, value: string) => {
  const arr = getNestedField(getCS(world).lastData, field)
  expect(Array.isArray(arr)).toBe(true)
  expect(arr).toContain(value)
})

Then('the response {string} is {string}', ({ world }, field: string, value: string) => {
  expect(getNestedField(getCS(world).lastData, field)).toBe(value)
})

Then('the response has a {string} boolean field', ({ world }, field: string) => {
  expect(typeof getNestedField(getCS(world).lastData, field)).toBe('boolean')
})

Given('the {string} channel is configured', async ({ request }, channel: string) => {
  const config: Record<string, unknown> = {}
  if (channel === 'signal') {
    config.signal = { bridgeUrl: 'http://localhost:8080', bridgeApiKey: 'test', webhookSecret: 'test', registeredNumber: '+1234' }
  }
  await apiPatch(request, '/settings/messaging', config)
})

function getNestedField(obj: unknown, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => (acc as Record<string, unknown>)?.[key], obj)
}
