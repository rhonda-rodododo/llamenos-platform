/**
 * OpenAPI spec step definitions — verifies /api/openapi.json and /api/docs.
 *
 * Uses unique step text to avoid conflicts with shared assertion steps.
 */
import { expect } from '@playwright/test'
import { When, Then } from './fixtures'

const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'

let specJson: Record<string, unknown> | undefined
let docsResponse: { status: number; contentType: string } | undefined

When('I fetch the OpenAPI spec', async ({ request }) => {
  const res = await request.get(`${BASE_URL}/api/openapi.json`)
  expect(res.status()).toBe(200)
  specJson = await res.json()
})

When('I fetch the Scalar docs page', async ({ request }) => {
  const res = await request.get(`${BASE_URL}/api/docs`)
  const headers: Record<string, string> = {}
  for (const { name, value } of res.headersArray()) {
    headers[name.toLowerCase()] = value
  }
  docsResponse = { status: res.status(), contentType: headers['content-type'] || '' }
})

Then('the OpenAPI spec should be valid', async () => {
  expect(specJson).toBeDefined()
  expect(String(specJson!.openapi)).toMatch(/^3\./)
})

Then('the spec info title should be {string}', async ({}, title: string) => {
  expect(specJson).toBeDefined()
  const info = specJson!.info as Record<string, unknown>
  expect(info.title).toBe(title)
})

Then('the Scalar docs page should be HTML', async () => {
  expect(docsResponse).toBeDefined()
  expect(docsResponse!.status).toBe(200)
  expect(docsResponse!.contentType).toContain('text/html')
})

Then('the spec should include tags:', async ({}, table: { hashes: () => Array<{ tag: string }> }) => {
  expect(specJson).toBeDefined()
  const tagNames = ((specJson!.tags as Array<{ name: string }>) || []).map(t => t.name)
  for (const row of table.hashes()) {
    expect(tagNames, `Missing tag: ${row.tag}`).toContain(row.tag)
  }
})

Then('the spec should define a {string} security scheme of type {string}', async ({}, name: string, type: string) => {
  expect(specJson).toBeDefined()
  const components = specJson!.components as Record<string, unknown>
  const schemes = components?.securitySchemes as Record<string, { type: string }>
  expect(schemes).toBeDefined()
  expect(schemes[name]).toBeDefined()
  expect(schemes[name].type).toBe(type)
})

Then('the spec should document these paths:', async ({}, table: { hashes: () => Array<{ method: string; path: string }> }) => {
  expect(specJson).toBeDefined()
  const paths = specJson!.paths as Record<string, Record<string, unknown>>
  expect(paths).toBeDefined()

  for (const row of table.hashes()) {
    const pathEntry = paths[row.path]
    expect(pathEntry, `Missing path: ${row.path}`).toBeDefined()
    expect(pathEntry[row.method], `Missing ${row.method.toUpperCase()} ${row.path}`).toBeDefined()
  }
})
