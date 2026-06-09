/**
 * Backend webhook security step definitions.
 *
 * Tests that telephony/messaging webhooks enforce Content-Type validation
 * and IP allowlisting. These tests hit the telephony webhook routes
 * directly with crafted headers — no real telephony provider is needed.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before, getState, setState } from './fixtures'
import { getSharedState, setLastResponse } from './shared-state'

const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'

// ── Local state ─────────────────────────────────────────────────

interface WebhookSecurityState {
  /** Content-Type header to send */
  contentType?: string
  /** Simulated source IP (via X-Forwarded-For or CF-Connecting-IP) */
  sourceIp?: string
  /** Provider name for IP allowlist tests */
  provider?: string
  /** Whether the provider expects form-encoded content */
  expectsFormEncoded?: boolean
  /** Payload body for replay tests */
  replayPayload?: string
  /** Response from the second (replayed) delivery */
  secondResponse?: { status: number; data: unknown }
}

const STATE_KEY = 'webhook_security'

function getWebhookState(world: Record<string, unknown>): WebhookSecurityState {
  return getState<WebhookSecurityState>(world, STATE_KEY)
}

Before({ tags: '@backend' }, async ({ world }) => {
  setState(world, STATE_KEY, {})
})

// ── Given steps ─────────────────────────────────────────────────

Given('a configured telephony provider expecting form-encoded content', async ({ world }) => {
  // Twilio sends webhooks as application/x-www-form-urlencoded
  getWebhookState(world).expectsFormEncoded = true
  getWebhookState(world).provider = 'TWILIO'
})

Given('a webhook with Content-Type {string}', async ({ world }, contentType: string) => {
  getWebhookState(world).contentType = contentType
})

Given('IP allowlisting is enabled for provider {string}', async ({ world }, provider: string) => {
  getWebhookState(world).provider = provider
})

Given('the request comes from IP {string}', async ({ world }, ip: string) => {
  getWebhookState(world).sourceIp = ip
})

Given('a webhook payload {string}', async ({ world }, payload: string) => {
  getWebhookState(world).replayPayload = payload
})

// ── When steps ──────────────────────────────────────────────────

When('the webhook is delivered', async ({ request, world }) => {
  const state = getWebhookState(world)

  // Target the telephony incoming webhook endpoint.
  // In the real app this is POST /api/telephony/incoming — the middleware
  // validates the webhook signature and rejects invalid requests with 403.
  // Without a configured adapter it returns 404.
  //
  // For Content-Type mismatch tests: the telephony adapter validates the
  // webhook signature, which requires the correct Content-Type. If the
  // Content-Type is wrong, the adapter's parseIncomingWebhook or
  // validateWebhook will fail.
  //
  // For IP allowlist tests: the middleware checks CF-Connecting-IP against
  // the provider's known IP ranges.
  const webhookPath = `${BASE_URL}/api/telephony/incoming`

  const headers: Record<string, string> = {}

  // Set Content-Type (wrong one for the mismatch test)
  if (state.contentType) {
    headers['Content-Type'] = state.contentType
  }

  // Simulate source IP via CF-Connecting-IP (the header the server trusts)
  if (state.sourceIp) {
    headers['CF-Connecting-IP'] = state.sourceIp
  }

  // Send a minimal POST body — the webhook will fail validation regardless
  // since we have no valid provider signature, but we check the specific
  // rejection reason (Content-Type vs IP vs signature).
  const res = await request.post(webhookPath, {
    headers,
    data: state.contentType === 'application/json'
      ? JSON.stringify({ CallSid: 'test', From: '+15551234567', To: '+15559876543' })
      : 'CallSid=test&From=%2B15551234567&To=%2B15559876543',
  })

  const contentTypeHeader = res.headers()['content-type'] ?? ''
  let data: unknown = null
  if (contentTypeHeader.includes('application/json')) {
    try { data = await res.json() } catch { data = null }
  } else {
    data = await res.text()
  }

  setLastResponse(world, { status: res.status(), data })
})

When('the webhook is delivered twice with the same payload', async ({ request, world }) => {
  const state = getWebhookState(world)
  const webhookPath = `${BASE_URL}/api/telephony/incoming`
  const body = state.replayPayload ?? 'CallSid=replay&From=%2B15551234567'

  // First delivery — nonce is recorded; will likely fail signature validation (403)
  const res1 = await request.post(webhookPath, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: body,
  })
  const data1 = await res1.text()
  setLastResponse(world, { status: res1.status(), data: data1 })

  // Second delivery — same payload, replay protection returns idempotent 200
  const res2 = await request.post(webhookPath, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: body,
  })
  const data2 = await res2.text()
  state.secondResponse = { status: res2.status(), data: data2 }
})

Then('the second response status should be {int}', async ({ world }, expectedStatus: number) => {
  const state = getWebhookState(world)
  expect(state.secondResponse).toBeDefined()
  expect(state.secondResponse!.status).toBe(expectedStatus)
})
