/**
 * Step definitions for Nostr relay event delivery BDD scenarios.
 *
 * Uses RelayCapture to subscribe to the local strfry instance and assert
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
import { verifyEvent } from 'nostr-tools/pure'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hexToBytes } from '@noble/hashes/utils.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { utf8ToBytes } from '@noble/ciphers/utils.js'
import { LABEL_HUB_EVENT } from '@shared/crypto-labels'

const RELAY_URL = process.env.TEST_RELAY_URL || 'ws://localhost:7777'
const BASE_URL = process.env.TEST_HUB_URL || 'http://localhost:3000'
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
  state.relayCapture = await RelayCapture.connect(RELAY_URL)
})

After(async ({ world }) => {
  const state = getScenarioState(world)
  if (state.relayCapture) {
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
  const result = await simulateIncomingCall(request, { callerNumber: caller })
  state.callId = result.callId
})

Given('an incoming call is ringing', async ({ request, world }) => {
  const state = getScenarioState(world)
  const caller = uniqueCallerNumber()
  const result = await simulateIncomingCall(request, { callerNumber: caller })
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
    const tag = rs.lastCapturedEvent!.tags.find((t) => t[0] === tagName && t[1] === tagValue)
    expect(tag).toBeTruthy()
  },
)

Then('the event signature should be valid', async ({ world }) => {
  const rs = getRelayState(world)
  expect(rs.lastCapturedEvent).toBeTruthy()
  // verifyEvent checks id, sig, and pubkey
  const valid = verifyEvent(rs.lastCapturedEvent as Parameters<typeof verifyEvent>[0])
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
  if (rs.serverPubkey) {
    expect(rs.lastCapturedEvent!.pubkey).toBe(rs.serverPubkey)
  }
})

// --- Helpers ---

/**
 * Decrypt event content using the server event key derived from SERVER_NOSTR_SECRET.
 *
 * Format: hex(nonce_24 || ciphertext)
 * Algorithm: XChaCha20-Poly1305
 * Key derivation: HKDF(SHA-256, secret, salt=empty, info="llamenos:hub-event", 32)
 *
 * Falls back to direct JSON parse for unencrypted content (shouldn't happen in prod).
 */
function decryptEventContent(event: CapturedEvent): Record<string, unknown> | null {
  // Try direct JSON parse first (unencrypted fallback)
  try {
    return JSON.parse(event.content) as Record<string, unknown>
  } catch {
    // Content is encrypted — decrypt with server event key
  }

  const secret = process.env.SERVER_NOSTR_SECRET || process.env.DEV_SERVER_SECRET || DEV_SERVER_SECRET
  if (!secret) {
    console.warn('[relay.steps] No SERVER_NOSTR_SECRET — cannot decrypt event content')
    return null
  }

  try {
    const eventKey = hkdf(
      sha256,
      hexToBytes(secret),
      new Uint8Array(0),
      utf8ToBytes(LABEL_HUB_EVENT),
      32,
    )
    const packed = hexToBytes(event.content)
    const nonce = packed.slice(0, 24)
    const ciphertext = packed.slice(24)
    const cipher = xchacha20poly1305(eventKey, nonce)
    const plaintext = cipher.decrypt(ciphertext)
    const text = new TextDecoder().decode(plaintext)
    return JSON.parse(text) as Record<string, unknown>
  } catch (err) {
    console.warn('[relay.steps] Failed to decrypt event content:', err)
    return null
  }
}
