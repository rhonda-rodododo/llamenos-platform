/**
 * Step definitions for WebSocket relay event delivery BDD scenarios.
 *
 * Uses RelayCapture to subscribe to the in-process WebSocket relay and assert
 * that server-published events arrive within the expected timeframe.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, After, getState, setState } from './fixtures'
import { getScenarioState } from './common.steps'
import { RelayCapture, type CapturedEvent } from '../../helpers/relay-capture'
import {
  simulateIncomingCall,
  simulateAnswerCall,
  simulateEndCall,
  simulateVoicemail,
  simulateIncomingMessage,
  uniqueCallerNumber,
} from '../../simulation-helpers'
import { ed25519Verify } from '@llamenos/crypto/ffi'
import { hexToBytes, utf8ToBytes } from '@shared/encoding'
import { deriveServerEventKey, decryptHubEvent } from '../../helpers/relay-crypto'
import { WS_PROTOCOL_VERSION } from '@protocol/schemas/ws-messages'
import { ADMIN_SEED } from '../../api-helpers'

const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'
const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/ws'
// Default dev secret from scripts/dev-node.sh — used for event decryption in tests
const DEV_SERVER_SECRET = '0000000000000000000000000000000000000000000000000000000000000001'

const RELAY_KEY = 'relay'

interface RelayStepState {
  lastCapturedEvent?: CapturedEvent
  serverPubkey?: string
}

function getRelayState(world: Record<string, unknown>): RelayStepState {
  let s = getState<RelayStepState | undefined>(world, RELAY_KEY)
  if (!s) {
    s = {}
    setState(world, RELAY_KEY, s)
  }
  return s
}

// --- Relay Setup ---

Given('the test relay is connected and capturing events', async ({ world }) => {
  const state = getScenarioState(world)
  if (state.relayCapture) {
    state.relayCapture.close()
  }
  // Use the admin seed for WS authentication — admin is always registered and
  // has membership in all hubs. The hubId scopes the subscription to prevent
  // cross-scenario event contamination under parallel test workers.
  state.relayCapture = await RelayCapture.connect(
    WS_URL,
    state.hubId ?? undefined,
    ADMIN_SEED,
  )
})

After(async ({ world }) => {
  const state = getScenarioState(world)
  if (state?.relayCapture) {
    state.relayCapture.close()
    state.relayCapture = undefined
  }
  const rs = getRelayState(world)
  rs.lastCapturedEvent = undefined
})

// --- Call Triggers ---

When('an incoming call arrives from a unique number', async ({ request, world }) => {
  const state = getScenarioState(world)
  const caller = uniqueCallerNumber()
  const result = await simulateIncomingCall(request, { callerNumber: caller, hubId: state.hubId })
  state.callId = result.callId
})

Given('an incoming call is ringing', async ({ request, world }) => {
  const state = getScenarioState(world)
  const caller = uniqueCallerNumber()
  const result = await simulateIncomingCall(request, { callerNumber: caller, hubId: state.hubId })
  state.callId = result.callId
})

When('the first volunteer answers the call', async ({ request, world }) => {
  const state = getScenarioState(world)
  expect(state.callId).toBeTruthy()
  expect(state.volunteers.length).toBeGreaterThan(0)
  await simulateAnswerCall(request, state.callId!, state.volunteers[0].pubkey)
})

When('the active call is ended', async ({ request, world }) => {
  const state = getScenarioState(world)
  expect(state.callId).toBeTruthy()
  await simulateEndCall(request, state.callId!)
})

// 'the call goes to voicemail' defined in call-routing.steps.ts

// --- Messaging Triggers ---

When('an inbound SMS message arrives from a unique number', async ({ request, world }) => {
  const state = getScenarioState(world)
  const sender = uniqueCallerNumber()
  const result = await simulateIncomingMessage(request, {
    senderNumber: sender,
    body: 'BDD test message',
    channel: 'sms',
  })
  state.conversationId = result.conversationId
  state.messageId = result.messageId
})

// --- Relay Capture Utilities ---

Given('the relay captured events are cleared', async ({ world }) => {
  const state = getScenarioState(world)
  expect(state.relayCapture).toBeTruthy()
  // Wait for in-flight events to settle (publishing is fire-and-forget async)
  await new Promise(resolve => setTimeout(resolve, 1000))
  state.relayCapture!.clear()
})

// --- Event Assertions ---

Then(
  'the relay should receive a kind {int} event within {int} seconds',
  async ({ world }, kind: number, seconds: number) => {
    const state = getScenarioState(world)
    const rs = getRelayState(world)
    expect(state.relayCapture).toBeTruthy()
    const events = await state.relayCapture!.waitForEvents({
      kind,
      count: 1,
      timeoutMs: seconds * 1000,
    })
    expect(events.length).toBeGreaterThanOrEqual(1)
    rs.lastCapturedEvent = events[0]
  },
)

Then('the decrypted event content type should be {string}', async ({ world }, expectedType: string) => {
  const rs = getRelayState(world)
  expect(rs.lastCapturedEvent).toBeTruthy()
  const content = decryptEventContent(rs.lastCapturedEvent!)
  expect(content).toBeTruthy()
  expect(content!.type).toBe(expectedType)
})

Then('the event should contain a {string} field', async ({ world }, fieldName: string) => {
  const rs = getRelayState(world)
  expect(rs.lastCapturedEvent).toBeTruthy()
  const content = decryptEventContent(rs.lastCapturedEvent!)
  expect(content).toBeTruthy()
  expect(content![fieldName]).toBeDefined()
})

Then(
  'the event content {string} should be {string}',
  async ({ world }, fieldName: string, expectedValue: string) => {
    const rs = getRelayState(world)
    expect(rs.lastCapturedEvent).toBeTruthy()
    const content = decryptEventContent(rs.lastCapturedEvent!)
    expect(content).toBeTruthy()
    expect(content![fieldName]).toBe(expectedValue)
  },
)

Then('the raw event content should NOT be valid JSON', async ({ world }) => {
  const rs = getRelayState(world)
  expect(rs.lastCapturedEvent).toBeTruthy()
  // In the WS relay, encrypted content is hex-encoded ciphertext, not JSON
  let isJson = false
  try {
    JSON.parse(rs.lastCapturedEvent!.content)
    isJson = true
  } catch {
    isJson = false
  }
  expect(isJson).toBe(false)
})

Then('the decrypted event content should be valid JSON', async ({ world }) => {
  const rs = getRelayState(world)
  expect(rs.lastCapturedEvent).toBeTruthy()
  const content = decryptEventContent(rs.lastCapturedEvent!)
  expect(content).toBeTruthy()
})

Then(
  'the event should have tag {string} with value {string}',
  async ({ world }, tagName: string, tagValue: string) => {
    const rs = getRelayState(world)
    expect(rs.lastCapturedEvent).toBeTruthy()
    // Tags are synthesized from WS event fields for backward compatibility:
    // ['t', 'llamenos:event'] — all relay events
    // ['d', hubId] — hub scope
    const tag = rs.lastCapturedEvent!.tags.find((t) => t[0] === tagName && t[1] === tagValue)
    expect(tag).toBeTruthy()
  },
)

Then('the event signature should be valid', async ({ request, world }) => {
  const rs = getRelayState(world)
  expect(rs.lastCapturedEvent).toBeTruthy()
  const event = rs.lastCapturedEvent!

  // Fetch server pubkey if we don't have it yet
  if (!rs.serverPubkey) {
    const res = await request.get(`${BASE_URL}/api/config`)
    const config = (await res.json()) as { serverPubkey?: string }
    rs.serverPubkey = config.serverPubkey
  }
  expect(rs.serverPubkey).toBeTruthy()

  // Reconstruct the signed message: "${v}:${hubId}:${kind}:${epoch}:${payload}:${ts}"
  const sigMessage = `${event.v}:${event.hubId}:${event.kind}:${event.epoch}:${event.payload}:${event.ts}`
  const valid = ed25519Verify(
    hexToBytes(rs.serverPubkey!),
    utf8ToBytes(sigMessage),
    hexToBytes(event.sig),
  )
  expect(valid).toBe(true)
})

Then("the event pubkey should match the server's configured pubkey", async ({ request, world }) => {
  const rs = getRelayState(world)
  expect(rs.lastCapturedEvent).toBeTruthy()
  if (!rs.serverPubkey) {
    const res = await request.get(`${BASE_URL}/api/config`)
    const config = (await res.json()) as { serverPubkey?: string }
    rs.serverPubkey = config.serverPubkey
  }
  // In the WS relay, the server signs events with its Ed25519 key.
  // We verify the signature against the server pubkey (done in "signature should be valid").
  // This step confirms the server pubkey is configured and matches expectations.
  expect(rs.serverPubkey).toBeTruthy()

  // Verify the signature was made with this pubkey
  const event = rs.lastCapturedEvent!
  const sigMessage = `${event.v}:${event.hubId}:${event.kind}:${event.epoch}:${event.payload}:${event.ts}`
  const valid = ed25519Verify(
    hexToBytes(rs.serverPubkey!),
    utf8ToBytes(sigMessage),
    hexToBytes(event.sig),
  )
  expect(valid).toBe(true)
})

// --- Helpers ---

/**
 * Decrypt event content using the server event key derived from SERVER_SECRET.
 *
 * Format: hex(nonce_12 || ciphertext || tag_16)
 * Algorithm: AES-256-GCM with padded plaintext
 * Key derivation: HKDF(SHA-256, secret, salt=LABEL_SERVER_EVENT_ENCRYPTION_KEY,
 *                       info="llamenos:hub-event-epoch:{epoch}", 32)
 *
 * Falls back to direct JSON parse for unencrypted content.
 */
function decryptEventContent(event: CapturedEvent): Record<string, unknown> | null {
  // Try direct JSON parse first (unencrypted fallback)
  try {
    return JSON.parse(event.content) as Record<string, unknown>
  } catch {
    // Content is encrypted — decrypt with server event key
  }

  const secret = process.env.SERVER_SECRET || process.env.DEV_SERVER_SECRET || DEV_SERVER_SECRET
  if (!secret) {
    console.warn('[relay.steps] No SERVER_SECRET — cannot decrypt event content')
    return null
  }

  try {
    const epoch = event.epoch
    const eventKey = deriveServerEventKey(secret, undefined, epoch)
    return decryptHubEvent(event.content, eventKey, epoch)
  } catch (err) {
    console.warn('[relay.steps] Failed to decrypt event content:', err)
    return null
  }
}
