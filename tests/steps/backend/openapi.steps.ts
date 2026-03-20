/**
 * OpenAPI spec step definitions — verifies /api/openapi.json and /api/docs.
 *
 * Uses unique step text to avoid conflicts with shared assertion steps.
 */
import { expect } from '@playwright/test'
import { When, Then, getState, setState } from './fixtures'

const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'

const OPENAPI_KEY = 'openapi'

interface OpenApiState {
  specJson?: Record<string, unknown>
  docsResponse?: { status: number; contentType: string }
}

function getOpenApiState(world: Record<string, unknown>): OpenApiState {
  let s = getState<OpenApiState | undefined>(world, OPENAPI_KEY)
  if (!s) {
    s = {}
    setState(world, OPENAPI_KEY, s)
  }
  return s
}

When('I fetch the OpenAPI spec', async ({ request, world }) => {
  const oa = getOpenApiState(world)
  const res = await request.get(`${BASE_URL}/api/openapi.json`)
  expect(res.status()).toBe(200)
  oa.specJson = await res.json()
})

When('I fetch the Scalar docs page', async ({ request, world }) => {
  const oa = getOpenApiState(world)
  const res = await request.get(`${BASE_URL}/api/docs`)
  const headers: Record<string, string> = {}
  for (const { name, value } of res.headersArray()) {
    headers[name.toLowerCase()] = value
  }
  oa.docsResponse = { status: res.status(), contentType: headers['content-type'] || '' }
})

Then('the OpenAPI spec should be valid', async ({ world }) => {
  const oa = getOpenApiState(world)
  expect(oa.specJson).toBeDefined()
  expect(String(oa.specJson!.openapi)).toMatch(/^3\./)
})

Then('the spec info title should be {string}', async ({ world }, title: string) => {
  const oa = getOpenApiState(world)
  expect(oa.specJson).toBeDefined()
  const info = oa.specJson!.info as Record<string, unknown>
  expect(info.title).toBe(title)
})

Then('the Scalar docs page should be HTML', async ({ world }) => {
  const oa = getOpenApiState(world)
  expect(oa.docsResponse).toBeDefined()
  expect(oa.docsResponse!.status).toBe(200)
  expect(oa.docsResponse!.contentType).toContain('text/html')
})

Then('the spec should include tags:', async ({ world }, table: { hashes: () => Array<{ tag: string }> }) => {
  const oa = getOpenApiState(world)
  expect(oa.specJson).toBeDefined()
  const tagNames = ((oa.specJson!.tags as Array<{ name: string }>) || []).map(t => t.name)
  for (const row of table.hashes()) {
    expect(tagNames, `Missing tag: ${row.tag}`).toContain(row.tag)
  }
})

Then('the spec should define a {string} security scheme of type {string}', async ({ world }, name: string, type: string) => {
  const oa = getOpenApiState(world)
  expect(oa.specJson).toBeDefined()
  const components = oa.specJson!.components as Record<string, unknown>
  const schemes = components?.securitySchemes as Record<string, { type: string }>
  expect(schemes).toBeDefined()
  expect(schemes[name]).toBeDefined()
  expect(schemes[name].type).toBe(type)
})

Then('the spec should document these paths:', async ({ world }, table: { hashes: () => Array<{ method: string; path: string }> }) => {
  const oa = getOpenApiState(world)
  expect(oa.specJson).toBeDefined()
  const paths = oa.specJson!.paths as Record<string, Record<string, unknown>>
  expect(paths).toBeDefined()

  for (const row of table.hashes()) {
    const pathEntry = paths[row.path]
    expect(pathEntry, `Missing path: ${row.path}`).toBeDefined()
    expect(pathEntry[row.method], `Missing ${row.method.toUpperCase()} ${row.path}`).toBeDefined()
  }
})
