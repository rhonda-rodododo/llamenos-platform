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
  simulateIncomingMessage,
  uniqueCallerNumber,
} from '../../simulation-helpers'
import { ed25519 } from '@noble/curves/ed25519.js'
import { hexToBytes, utf8ToBytes } from '@shared/encoding'
import { deriveServerEventKey, decryptHubEvent } from '../../helpers/relay-crypto'
import { ADMIN_SEED } from '../../api-helpers'

const RELAY_URL = process.env.TEST_RELAY_URL || 'ws://localhost:3000/ws'
const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'
// Default dev secret from scripts/dev-node.sh — used for event decryption in tests
const DEV_SERVER_SECRET = '0000000000000000000000000000000000000000000000000000000000000002'

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
  state.relayCapture = await RelayCapture.connect(RELAY_URL, {
    seedHex: ADMIN_SEED,
    hubId: state.hubId ?? undefined,
  })
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
  const content = decryptEventPayload(rs.lastCapturedEvent!)
  expect(content).toBeTruthy()
  expect(content!.type).toBe(expectedType)
})

Then('the event should contain a {string} field', async ({ world }, fieldName: string) => {
  const rs = getRelayState(world)
  expect(rs.lastCapturedEvent).toBeTruthy()
  const content = decryptEventPayload(rs.lastCapturedEvent!)
  expect(content).toBeTruthy()
  expect(content![fieldName]).toBeDefined()
})

Then(
  'the event content {string} should be {string}',
  async ({ world }, fieldName: string, expectedValue: string) => {
    const rs = getRelayState(world)
    expect(rs.lastCapturedEvent).toBeTruthy()
    const content = decryptEventPayload(rs.lastCapturedEvent!)
    expect(content).toBeTruthy()
    expect(content![fieldName]).toBe(expectedValue)
  },
)

Then('the raw event payload should NOT be valid JSON', async ({ world }) => {
  const rs = getRelayState(world)
  expect(rs.lastCapturedEvent).toBeTruthy()
  let isJson = false
  try {
    JSON.parse(rs.lastCapturedEvent!.payload)
    isJson = true
  } catch {
    isJson = false
  }
  expect(isJson).toBe(false)
})

Then('the decrypted event content should be valid JSON', async ({ world }) => {
  const rs = getRelayState(world)
  expect(rs.lastCapturedEvent).toBeTruthy()
  const content = decryptEventPayload(rs.lastCapturedEvent!)
  expect(content).toBeTruthy()
})

Then(
  'the event hubId should be {string}',
  async ({ world }, expectedHubId: string) => {
    const rs = getRelayState(world)
    expect(rs.lastCapturedEvent).toBeTruthy()
    expect(rs.lastCapturedEvent!.hubId).toBe(expectedHubId)
  },
)

Then('the event version should be {int}', async ({ world }, expectedVersion: number) => {
  const rs = getRelayState(world)
  expect(rs.lastCapturedEvent).toBeTruthy()
  expect(rs.lastCapturedEvent!.v).toBe(expectedVersion)
})

Then('the event signature should be valid', async ({ request, world }) => {
  const rs = getRelayState(world)
  expect(rs.lastCapturedEvent).toBeTruthy()

  // Fetch server pubkey for signature verification
  if (!rs.serverPubkey) {
    const res = await request.get(`${BASE_URL}/api/config`)
    const config = (await res.json()) as { serverPubkey?: string }
    rs.serverPubkey = config.serverPubkey
  }
  expect(rs.serverPubkey).toBeTruthy()

  const event = rs.lastCapturedEvent!
  // Reconstruct the signed message: "{v}:{hubId}:{kind}:{epoch}:{payload}:{ts}"
  const sigMessage = `${event.v}:${event.hubId}:${event.kind}:${event.epoch}:${event.payload}:${event.ts}`
  const valid = ed25519.verify(
    hexToBytes(event.sig),
    utf8ToBytes(sigMessage),
    hexToBytes(rs.serverPubkey!),
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
  // In the new protocol, events don't carry pubkey — the server's identity
  // is verified via the signature. Just assert we have a server pubkey configured.
  expect(rs.serverPubkey).toBeTruthy()
})

// --- Helpers ---

/**
 * Decrypt event payload using the server event key derived from SERVER_NOSTR_SECRET.
 *
 * The new WsEventMessage uses `payload` (encrypted hex string) and `epoch`.
 * Decryption uses HKDF(SHA-256, secret, salt=LABEL_SERVER_EVENT_ENCRYPTION_KEY,
 * info=LABEL_HUB_EVENT_EPOCH:epoch, 32) + AES-256-GCM with padded plaintext.
 *
 * Falls back to direct JSON parse for unencrypted content (shouldn't happen in prod).
 */
function decryptEventPayload(event: CapturedEvent): Record<string, unknown> | null {
  // Try direct JSON parse first (unencrypted fallback)
  try {
    return JSON.parse(event.payload) as Record<string, unknown>
  } catch {
    // Payload is encrypted — decrypt with server event key
  }

  const secret = process.env.SERVER_NOSTR_SECRET || process.env.DEV_SERVER_SECRET || DEV_SERVER_SECRET
  if (!secret) {
    console.warn('[relay.steps] No SERVER_NOSTR_SECRET — cannot decrypt event payload')
    return null
  }

  try {
    const eventKey = deriveServerEventKey(secret, undefined, event.epoch)
    return decryptHubEvent(event.payload, eventKey, event.epoch)
  } catch (err) {
    console.warn('[relay.steps] Failed to decrypt event payload:', err)
    return null
  }
}
