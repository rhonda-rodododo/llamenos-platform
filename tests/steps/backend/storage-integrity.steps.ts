/**
 * Storage integrity step definitions (Epic 365).
 *
 * Verifies JSONB round-trip fidelity for all entity types that store
 * structured data. Checks BOTH the API response AND the raw DB row
 * to catch double-serialization bugs.
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before } from './fixtures'
import {
  apiGet,
  apiPost,
  apiPatch,
  generateTestKeypair,
  uniquePhone,
  ADMIN_NSEC,
} from '../../api-helpers'
import {
  generateContentKey,
  encryptContent,
  wrapKeyForRecipient,
} from '../../crypto-helpers'
import { LABEL_NOTE_KEY } from '@shared/crypto-labels'
import { TestDB } from '../../db-helpers'
import { assertIsObject, assertIsArray } from '../../integrity-helpers'
import { bytesToHex } from '@noble/hashes/utils.js'
import { nip19, getPublicKey } from 'nostr-tools'
import { hexToBytes } from '@noble/hashes/utils.js'

// ── State ───────────────────────────────────────────────────────────

interface StorageIntegrityState {
  /** Entity IDs by type */
  entityIds: Map<string, string>
  /** API response data by entity type */
  apiResponses: Map<string, Record<string, unknown>>
  /** DB rows by entity type */
  dbRows: Map<string, Record<string, unknown>>
  /** Submitted envelope data for byte-accuracy checks */
  submittedEnvelopes?: Array<{ pubkey: string; wrappedKey: string; ephemeralPubkey: string }>
  /** Submitted author envelope */
  submittedAuthorEnvelope?: { wrappedKey: string; ephemeralPubkey: string }
  /** Volunteer keypair for note creation */
  volunteerKp?: { nsec: string; pubkey: string; skHex: string }
  /** Admin keypair info */
  adminSkHex?: string
  adminPubkey?: string
}

let s: StorageIntegrityState

Before(async ({}) => {
  s = {
    entityIds: new Map(),
    apiResponses: new Map(),
    dbRows: new Map(),
  }
})

// ── Helpers ─────────────────────────────────────────────────────────

function nsecToSkHex(nsec: string): string {
  const decoded = nip19.decode(nsec)
  if (decoded.type !== 'nsec') throw new Error('Invalid nsec')
  return bytesToHex(decoded.data as Uint8Array)
}

// ── Given: Entity creation ──────────────────────────────────────────

Given('a {string} entity is created via the API with structured JSONB data', async ({ request }, entityType: string) => {
  switch (entityType) {
    case 'note with envelopes': {
      // Create a real volunteer first with a known keypair
      const volKp = generateTestKeypair()
      s.volunteerKp = volKp
      const regResult = await apiPost(request, '/users', {
        name: `StorageVol ${Date.now()}`,
        phone: uniquePhone(),
        roleIds: ['role-volunteer'],
        pubkey: volKp.pubkey,
      })
      expect([200, 201]).toContain(regResult.status)

      const adminSkHex = nsecToSkHex(ADMIN_NSEC)
      const adminPubkey = getPublicKey(hexToBytes(adminSkHex))

      const contentKey = generateContentKey()
      const ciphertextHex = encryptContent('Storage test note', contentKey, LABEL_NOTE_KEY)
      const volEnv = wrapKeyForRecipient(contentKey, volKp.pubkey, volKp.skHex, LABEL_NOTE_KEY)
      const adminEnv = wrapKeyForRecipient(contentKey, adminPubkey, adminSkHex, LABEL_NOTE_KEY)

      const { status, data } = await apiPost<{ note: Record<string, unknown> }>(
        request,
        '/notes',
        {
          encryptedContent: ciphertextHex,
          callId: `storage-note-${Date.now()}`,
          authorEnvelope: volEnv,
          adminEnvelopes: [{ pubkey: adminPubkey, ...adminEnv }],
        },
        volKp.nsec,
      )
      expect([200, 201]).toContain(status)
      s.entityIds.set(entityType, data.note.id as string)
      s.apiResponses.set(entityType, data.note)
      break
    }

    case 'case record': {
      // Create a case record with structured JSONB fields
      const { status, data } = await apiPost<{ record: Record<string, unknown> }>(
        request,
        '/cases',
        {
          entityTypeId: `test-type-${Date.now()}`,
          statusHash: 'open',
          blindIndexes: { searchField: 'hashed-value', category: 'test-cat' },
          summaryEnvelopes: [
            { pubkey: 'a'.repeat(64), wrappedKey: 'b'.repeat(64), ephemeralPubkey: '02' + 'c'.repeat(64) },
          ],
        },
      )
      if (status === 200 || status === 201) {
        const record = (data as Record<string, unknown>).record ?? data
        const id = (record as Record<string, unknown>).id as string
        s.entityIds.set(entityType, id)
        s.apiResponses.set(entityType, record as Record<string, unknown>)
      } else {
        // If cases endpoint needs different structure, try alternate
        expect([200, 201]).toContain(status)
      }
      break
    }

    case 'conversation': {
      // Create a conversation with metadata
      const { simulateIncomingMessage, uniqueCallerNumber } = await import('../../simulation-helpers')
      const sender = uniqueCallerNumber()
      const result = await simulateIncomingMessage(request, {
        senderNumber: sender,
        body: 'Storage test message',
        channel: 'sms',
      })
      s.entityIds.set(entityType, result.conversationId)

      // Fetch it to get the full record
      const { status, data } = await apiGet<Record<string, unknown>>(
        request,
        `/conversations/${result.conversationId}`,
      )
      expect(status).toBe(200)
      s.apiResponses.set(entityType, data)
      break
    }
  }
})

Given('the {string} settings are updated via the API with structured data', async ({ request }, settingsType: string) => {
  let body: Record<string, unknown>

  switch (settingsType) {
    case 'spam':
      body = {
        spamSettings: {
          enabled: true,
          maxCallsPerMinute: 5,
          banDurationMinutes: 60,
          whitelist: ['+1555000111'],
        },
      }
      break
    case 'call':
      body = {
        callSettings: {
          ringTimeout: 30,
          maxConcurrentCalls: 10,
          recordingEnabled: false,
          fallbackMessage: 'Please try again later',
        },
      }
      break
    case 'messaging':
      body = {
        messagingConfig: {
          smsEnabled: true,
          whatsappEnabled: false,
          signalEnabled: false,
          autoReply: 'Thank you for your message',
        },
      }
      break
    default:
      throw new Error(`Unknown settings type: ${settingsType}`)
  }

  const { status } = await apiPatch(request, '/settings', body)
  expect([200, 204]).toContain(status)
})

Given('a registered volunteer {string} with a known keypair', async ({ request }, name: string) => {
  const kp = generateTestKeypair()
  s.volunteerKp = kp
  const { status } = await apiPost(request, '/users', {
    name: `StorageEnv ${name} ${Date.now()}`,
    phone: uniquePhone(),
    roleIds: ['role-volunteer'],
    pubkey: kp.pubkey,
  })
  expect([200, 201]).toContain(status)
})

Given('the admin keypair is known for envelope verification', async ({}) => {
  const adminSkHex = nsecToSkHex(ADMIN_NSEC)
  const adminPubkey = getPublicKey(hexToBytes(adminSkHex))
  s.adminSkHex = adminSkHex
  s.adminPubkey = adminPubkey
})

// ── When: Fetch ─────────────────────────────────────────────────────

When('the {string} is fetched via the API', async ({ request }, entityType: string) => {
  const id = s.entityIds.get(entityType)
  expect(id).toBeDefined()

  switch (entityType) {
    case 'note with envelopes': {
      const volKp = s.volunteerKp
      const { status, data } = await apiGet<{ notes: Array<Record<string, unknown>> }>(
        request,
        '/notes',
        volKp?.nsec,
      )
      expect(status).toBe(200)
      const note = data.notes.find(n => n.id === id)
      if (note) s.apiResponses.set(entityType, note)
      break
    }

    case 'case record': {
      const { status, data } = await apiGet<Record<string, unknown>>(
        request,
        `/cases/${id}`,
      )
      expect(status).toBe(200)
      const record = (data as Record<string, unknown>).record ?? data
      s.apiResponses.set(entityType, record as Record<string, unknown>)
      break
    }

    case 'conversation': {
      const { status, data } = await apiGet<Record<string, unknown>>(
        request,
        `/conversations/${id}`,
      )
      expect(status).toBe(200)
      s.apiResponses.set(entityType, data)
      break
    }
  }
})

When('the {string} row is fetched directly from the database', async ({}, entityType: string) => {
  const id = s.entityIds.get(entityType)
  expect(id).toBeDefined()

  let tableName: string
  switch (entityType) {
    case 'note with envelopes':
      tableName = 'notes'
      break
    case 'case record':
      tableName = 'case_records'
      break
    case 'conversation':
      tableName = 'conversations'
      break
    default:
      throw new Error(`Unknown entity type: ${entityType}`)
  }

  const row = await TestDB.getRow(tableName, id!)
  expect(row).not.toBeNull()
  s.dbRows.set(entityType, row!)
})

When('the settings are fetched via the API', async ({ request }) => {
  const { status, data } = await apiGet<Record<string, unknown>>(request, '/settings')
  expect(status).toBe(200)
  s.apiResponses.set('settings', data)
})

When('the system_settings row is fetched directly from the database', async ({}) => {
  // system_settings has integer PK = 1
  const rows = await TestDB.getRow('system_settings', '1')
  // system_settings may use integer id, try alternate fetch
  if (!rows) {
    // Use raw query since ID is integer, not text
    // getRow expects text id but system_settings has integer id
    // Store a placeholder — the jsonb assertion will use assertJsonbField which handles this
  }
  s.dbRows.set('settings', rows ?? {})
})

When('the volunteer creates a note with real ECIES envelopes', async ({ request }) => {
  expect(s.volunteerKp).toBeDefined()
  expect(s.adminPubkey).toBeDefined()

  const contentKey = generateContentKey()
  const ciphertextHex = encryptContent('Envelope accuracy test', contentKey, LABEL_NOTE_KEY)

  const authorEnv = wrapKeyForRecipient(contentKey, s.volunteerKp!.pubkey, s.volunteerKp!.skHex, LABEL_NOTE_KEY)
  const adminEnv = wrapKeyForRecipient(contentKey, s.adminPubkey!, s.adminSkHex!, LABEL_NOTE_KEY)

  s.submittedAuthorEnvelope = authorEnv
  s.submittedEnvelopes = [{ pubkey: s.adminPubkey!, ...adminEnv }]

  const { status, data } = await apiPost<{ note: Record<string, unknown> }>(
    request,
    '/notes',
    {
      encryptedContent: ciphertextHex,
      callId: `envelope-accuracy-${Date.now()}`,
      authorEnvelope: authorEnv,
      adminEnvelopes: s.submittedEnvelopes,
    },
    s.volunteerKp!.nsec,
  )
  expect([200, 201]).toContain(status)
  s.entityIds.set('envelope-note', data.note.id as string)
  s.apiResponses.set('envelope-note', data.note)
})

When('the note is fetched via the API', async ({ request }) => {
  const id = s.entityIds.get('envelope-note')
  expect(id).toBeDefined()

  const { status, data } = await apiGet<{ notes: Array<Record<string, unknown>> }>(
    request,
    '/notes',
    s.volunteerKp?.nsec,
  )
  expect(status).toBe(200)
  const note = data.notes.find(n => n.id === id)
  if (note) s.apiResponses.set('envelope-note', note)
})

When('the envelope note row is fetched directly from the database', async ({}) => {
  const id = s.entityIds.get('envelope-note')
  expect(id).toBeDefined()

  const row = await TestDB.getRow('notes', id!)
  expect(row).not.toBeNull()
  s.dbRows.set('envelope-note', row!)
})

// ── Then: API response assertions ───────────────────────────────────

Then('the API response {word} should be a proper {word}', async ({}, jsonbField: string, expectedType: string) => {
  // Find the latest API response that has the field
  let value: unknown
  for (const resp of s.apiResponses.values()) {
    if (jsonbField in resp) {
      value = resp[jsonbField]
      break
    }
    // Check nested (e.g., conversation wraps in { conversation: {...} })
    for (const v of Object.values(resp)) {
      if (typeof v === 'object' && v !== null && jsonbField in (v as Record<string, unknown>)) {
        value = (v as Record<string, unknown>)[jsonbField]
        break
      }
    }
    if (value !== undefined) break
  }

  if (expectedType === 'array') {
    assertIsArray(value, `API ${jsonbField}`)
  } else if (expectedType === 'object') {
    assertIsObject(value, `API ${jsonbField}`)
  }
})

// ── Then: DB assertions ─────────────────────────────────────────────

Then(
  'the DB {word} should have jsonb_typeof equal to {string}',
  async ({}, dbColumn: string, expectedPgType: string) => {
    // Find the entity type that has this column
    for (const [entityType] of s.entityIds.entries()) {
      const id = s.entityIds.get(entityType)
      if (!id) continue

      let tableName: string
      let idColumn = 'id'
      switch (entityType) {
        case 'note with envelopes':
          tableName = 'notes'
          break
        case 'case record':
          tableName = 'case_records'
          break
        case 'conversation':
          tableName = 'conversations'
          break
        default:
          continue
      }

      try {
        const result = await TestDB.assertJsonbField(tableName, idColumn, id, dbColumn)
        expect(result.pgType).toBe(expectedPgType)
        return
      } catch {
        // Column might not exist in this table — try next entity
        continue
      }
    }

    // For settings, check system_settings table
    try {
      const result = await TestDB.assertJsonbField('system_settings', 'id', '1', dbColumn)
      expect(result.pgType).toBe(expectedPgType)
    } catch (e) {
      throw new Error(`Could not find JSONB column ${dbColumn} in any known table: ${e}`)
    }
  },
)

Then('the DB {word} should not be double-serialized', async ({}, dbColumn: string) => {
  // Find the entity type that has this column
  for (const [entityType] of s.entityIds.entries()) {
    const id = s.entityIds.get(entityType)
    if (!id) continue

    let tableName: string
    switch (entityType) {
      case 'note with envelopes':
        tableName = 'notes'
        break
      case 'case record':
        tableName = 'case_records'
        break
      case 'conversation':
        tableName = 'conversations'
        break
      default:
        continue
    }

    try {
      const result = await TestDB.assertJsonbField(tableName, 'id', id, dbColumn)
      expect(result.isDoubleStringified).toBe(false)
      return
    } catch {
      continue
    }
  }

  // For settings
  try {
    const result = await TestDB.assertJsonbField('system_settings', 'id', '1', dbColumn)
    expect(result.isDoubleStringified).toBe(false)
  } catch (e) {
    throw new Error(`Could not find JSONB column ${dbColumn} in any known table: ${e}`)
  }
})

// ── Then: Envelope byte-accuracy assertions ─────────────────────────

Then('the API envelope wrappedKey should match the submitted wrappedKey exactly', async ({}) => {
  const apiNote = s.apiResponses.get('envelope-note')
  expect(apiNote).toBeDefined()
  expect(s.submittedEnvelopes).toBeDefined()

  const apiAdminEnvelopes = apiNote!.adminEnvelopes as Array<{ wrappedKey: string }> | undefined
  expect(apiAdminEnvelopes).toBeDefined()
  expect(apiAdminEnvelopes!.length).toBeGreaterThan(0)
  expect(apiAdminEnvelopes![0].wrappedKey).toBe(s.submittedEnvelopes![0].wrappedKey)
})

Then('the API envelope ephemeralPubkey should match the submitted ephemeralPubkey exactly', async ({}) => {
  const apiNote = s.apiResponses.get('envelope-note')
  expect(apiNote).toBeDefined()
  expect(s.submittedEnvelopes).toBeDefined()

  const apiAdminEnvelopes = apiNote!.adminEnvelopes as Array<{ ephemeralPubkey: string }> | undefined
  expect(apiAdminEnvelopes).toBeDefined()
  expect(apiAdminEnvelopes![0].ephemeralPubkey).toBe(s.submittedEnvelopes![0].ephemeralPubkey)
})

Then('the DB admin_envelopes wrappedKey should match the submitted wrappedKey exactly', async ({}) => {
  const dbRow = s.dbRows.get('envelope-note')
  expect(dbRow).toBeDefined()
  expect(s.submittedEnvelopes).toBeDefined()

  const dbAdminEnvelopes = dbRow!.admin_envelopes as Array<{ wrappedKey: string }>
  assertIsArray(dbAdminEnvelopes, 'DB admin_envelopes')
  expect(dbAdminEnvelopes.length).toBeGreaterThan(0)
  expect(dbAdminEnvelopes[0].wrappedKey).toBe(s.submittedEnvelopes![0].wrappedKey)
})

Then('the DB admin_envelopes ephemeralPubkey should match the submitted ephemeralPubkey exactly', async ({}) => {
  const dbRow = s.dbRows.get('envelope-note')
  expect(dbRow).toBeDefined()
  expect(s.submittedEnvelopes).toBeDefined()

  const dbAdminEnvelopes = dbRow!.admin_envelopes as Array<{ ephemeralPubkey: string }>
  assertIsArray(dbAdminEnvelopes, 'DB admin_envelopes')
  expect(dbAdminEnvelopes[0].ephemeralPubkey).toBe(s.submittedEnvelopes![0].ephemeralPubkey)
})
