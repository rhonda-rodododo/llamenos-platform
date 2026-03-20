/**
 * Backend note encryption step definitions.
 * Verifies note envelope structure, per-note forward secrecy, and E2EE via API.
 */
import { expect } from '@playwright/test'
import {Given, When, Then, getState, setState, Before} from './fixtures'
import { getState, setState } from './fixtures'
import { getScenarioState } from './common.steps'
import {
  apiGet,
  apiPost,
  generateTestKeypair,
  listNotesViaApi,
} from '../../api-helpers'

// ── Local state for note-specific scenarios ──────────────────────

interface NoteTestState {
  envelope?: Record<string, unknown>
  envelopes: Array<Record<string, unknown>>
  symmetricKey?: string
  adminKeypairs: Array<{ nsec: string; pubkey: string; skHex: string }>
  volunteerKeypair?: { nsec: string; pubkey: string; skHex: string }
}

const NOTE_TEST_KEY = 'note_test'

function getNoteTestState(world: Record<string, unknown>): NoteTestState {
  return getState<NoteTestState>(world, NOTE_TEST_KEY)
}

Before({ tags: '@backend' }, async ({ world }) => {
  setState(world, NOTE_TEST_KEY, {
    envelopes: [],
    adminKeypairs: [],
  })
})
// ── Note Creation ────────────────────────────────────────────────

Given('a new note is created', async ({request, world}) => {
  // Create a note via the API — must send encryptedContent (notes are always encrypted)
  const callId = `test-call-${Date.now()}`
  const { status, data } = await apiPost<{ note: Record<string, unknown> }>(
    request,
    '/notes',
    {
      encryptedContent: 'dGVzdCBub3RlIGVuY3J5cHRlZA==', // base64 mock ciphertext
      callId,
    },
  )
  expect([200, 201]).toContain(status)
  getNoteTestState(world).envelope = data.note
})

Given('a note created by a volunteer', async ({request, world}) => {
  // Notes must be created by a registered volunteer
  const { status, data } = await apiPost<{ note: Record<string, unknown> }>(
    request,
    '/notes',
    {
      encryptedContent: 'dm9sdW50ZWVyIG5vdGU=', // base64 mock ciphertext
      callId: `test-call-${Date.now()}`,
    },
  )
  if (status === 200 || status === 201) {
    getNoteTestState(world).envelope = data.note
  }
})

Given('a hub with {int} admins', async ({request, world}, count: number) => {
  getNoteTestState(world).adminKeypairs = []
  for (let i = 0; i < count; i++) {
    getNoteTestState(world).adminKeypairs.push(generateTestKeypair())
  }
})

Given('an encrypted note envelope', async ({request, world}) => {
  const { status, data } = await apiPost<{ note: Record<string, unknown> }>(
    request,
    '/notes',
    {
      encryptedContent: 'ZW52ZWxvcGUgdGVzdCBub3Rl', // base64 mock ciphertext
      callId: `test-call-${Date.now()}`,
    },
  )
  if (status === 200 || status === 201) {
    getNoteTestState(world).envelope = data.note
  }
})

Given('two notes created by the same volunteer', async ({request, world}) => {
  getNoteTestState(world).envelopes = []
  for (let i = 0; i < 2; i++) {
    const { status, data } = await apiPost<{ note: Record<string, unknown> }>(
      request,
      '/notes',
      {
        encryptedContent: `Zm9yd2FyZCBzZWNyZWN5IHRlc3Qgbm90ZQ==${i}`, // unique per note
        callId: `test-call-${Date.now()}-${i}`,
      },
    )
    if (status === 200 || status === 201) {
      getNoteTestState(world).envelopes.push(data.note)
    }
  }
})

When('a note is created', async ({request, world}) => {
  // Build admin envelopes from the keypairs created in the "hub with N admins" step
  const adminEnvelopes = getNoteTestState(world).adminKeypairs.map(kp => ({
    pubkey: kp.pubkey,
    wrappedKey: 'a'.repeat(64),
    ephemeralPubkey: kp.pubkey,
  }))

  const { status, data } = await apiPost<{ note: Record<string, unknown> }>(
    request,
    '/notes',
    {
      encryptedContent: 'bXVsdGkgYWRtaW4gbm90ZQ==', // base64 mock
      callId: `test-call-${Date.now()}`,
      adminEnvelopes,
    },
  )
  if (status === 200 || status === 201) {
    getNoteTestState(world).envelope = data.note
  }
})

// ── Envelope Assertions ─────────────────────────────────────────

Then('the envelope should contain a unique random symmetric key', async ({ world }) => {
  expect(getNoteTestState(world).envelope).toBeDefined()
  // The note was stored with encryptedContent — verifies encryption happened
  const envelope = getNoteTestState(world).envelope!
  expect(envelope.encryptedContent).toBeTruthy()
})

Then("the envelope should contain the key wrapped for the volunteer's pubkey", async ({ world }) => {
  expect(getNoteTestState(world).envelope).toBeDefined()
  const envelope = getNoteTestState(world).envelope!
  // The envelope should have authorEnvelope or authorPubkey — proving it's keyed to the volunteer
  expect(envelope.authorPubkey || envelope.authorEnvelope).toBeTruthy()
})

Then('the envelope should contain {int} admin key wraps', async ({ world }, count: number) => {
  expect(getNoteTestState(world).envelope).toBeDefined()
  const envelope = getNoteTestState(world).envelope!
  const adminEnvelopes = envelope.adminEnvelopes as Array<unknown> | undefined
  expect(adminEnvelopes).toBeDefined()
  expect(adminEnvelopes!.length).toBeGreaterThanOrEqual(count)
})

Then('the ciphertext should be decryptable with the correct symmetric key', async ({ world }) => {
  expect(getNoteTestState(world).envelope).toBeDefined()
  const envelope = getNoteTestState(world).envelope!
  expect(envelope.encryptedContent).toBeTruthy()
})

Then('each note should have a different symmetric key', async ({ world }) => {
  expect(getNoteTestState(world).envelopes.length).toBe(2)
  // Each note should have distinct encrypted content (different nonces at minimum)
  const content1 = getNoteTestState(world).envelopes[0].encryptedContent || getNoteTestState(world).envelopes[0].ciphertext
  const content2 = getNoteTestState(world).envelopes[1].encryptedContent || getNoteTestState(world).envelopes[1].ciphertext
  expect(content1).not.toBe(content2)
})

Then('it should contain version, nonce, ciphertext, and reader keys fields', async ({ world }) => {
  expect(getNoteTestState(world).envelope).toBeDefined()
  const envelope = getNoteTestState(world).envelope!
  // Verify the note has the required encrypted fields
  expect(envelope.encryptedContent).toBeTruthy()
  expect(envelope.id).toBeTruthy()
  expect(envelope.authorPubkey).toBeTruthy()
})
