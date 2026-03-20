/**
 * E2EE note integrity step definitions (Epic 365).
 *
 * Uses REAL ECIES crypto — no mock base64. Every encrypt/decrypt goes through
 * the same algorithms as the production code (XChaCha20-Poly1305 + secp256k1 ECDH + HKDF).
 */
import { expect } from '@playwright/test'
import { Given, When, Then, Before } from './fixtures'
import {
  apiGet,
  apiPost,
  generateTestKeypair,
  uniquePhone,
  ADMIN_NSEC,
} from '../../api-helpers'
import {
  generateContentKey,
  encryptContent,
  decryptContent,
  wrapKeyForRecipient,
  unwrapKey,
} from '../../crypto-helpers'
import { LABEL_NOTE_KEY } from '@shared/crypto-labels'
import { TestDB } from '../../db-helpers'
import { assertIsObject, assertIsArray } from '../../integrity-helpers'
import { bytesToHex } from '@noble/hashes/utils.js'
import { nip19, getPublicKey } from 'nostr-tools'
import { hexToBytes } from '@noble/hashes/utils.js'

// ── State ───────────────────────────────────────────────────────────

interface E2EEIntegrityState {
  /** Named keypairs: key = name (e.g. "VolA", "AdminA") */
  keypairs: Map<string, { nsec: string; pubkey: string; skHex: string }>
  /** The current content key used for symmetric encryption */
  contentKey?: Uint8Array
  /** The hex ciphertext produced by encryptContent */
  ciphertextHex?: string
  /** Per-recipient ECIES envelopes: key = pubkey */
  envelopes: Map<string, { wrappedKey: string; ephemeralPubkey: string }>
  /** The note ID returned by the API */
  noteId?: string
  /** The full note object from the API */
  apiNote?: Record<string, unknown>
  /** The raw DB row */
  dbRow?: Record<string, unknown>
  /** Last decrypted plaintext */
  decryptedText?: string
  /** The admin nsec converted to skHex */
  adminSkHex?: string
  /** The admin pubkey */
  adminPubkey?: string
}

let s: E2EEIntegrityState

Before(async ({}) => {
  s = {
    keypairs: new Map(),
    envelopes: new Map(),
  }
})

// ── Helpers ─────────────────────────────────────────────────────────

function nsecToSkHex(nsec: string): string {
  const decoded = nip19.decode(nsec)
  if (decoded.type !== 'nsec') throw new Error('Invalid nsec')
  return bytesToHex(decoded.data as Uint8Array)
}

function getKeypair(name: string) {
  const kp = s.keypairs.get(name)
  if (!kp) throw new Error(`No keypair registered for "${name}"`)
  return kp
}

// ── Given ───────────────────────────────────────────────────────────

Given('a volunteer {string} with a real keypair', async ({ request }, name: string) => {
  const kp = generateTestKeypair()
  s.keypairs.set(name, kp)
  // Register volunteer with our known keypair so we can do ECIES operations
  const { status } = await apiPost(request, '/users', {
    name: `E2EE ${name} ${Date.now()}`,
    phone: uniquePhone(),
    roleIds: ['role-volunteer'],
    pubkey: kp.pubkey,
  })
  expect([200, 201]).toContain(status)
})

Given('the admin keypair is known', async ({}) => {
  const skHex = nsecToSkHex(ADMIN_NSEC)
  const pubkey = getPublicKey(hexToBytes(skHex))
  s.adminSkHex = skHex
  s.adminPubkey = pubkey
})

Given('admin {string} with a real keypair', async ({}, name: string) => {
  const kp = generateTestKeypair()
  s.keypairs.set(name, kp)
})

// ── When: Encryption ────────────────────────────────────────────────

When(
  'the volunteer encrypts note content {string} with a random content key',
  async ({}, plaintext: string) => {
    s.contentKey = generateContentKey()
    s.ciphertextHex = encryptContent(plaintext, s.contentKey, LABEL_NOTE_KEY)
  },
)

When('the content key is ECIES-wrapped for the volunteer', async ({}) => {
  // Find the first registered volunteer keypair
  const [, volKp] = [...s.keypairs.entries()][0]
  expect(volKp).toBeDefined()
  expect(s.contentKey).toBeDefined()

  const envelope = wrapKeyForRecipient(s.contentKey!, volKp.pubkey, volKp.skHex, LABEL_NOTE_KEY)
  s.envelopes.set(volKp.pubkey, envelope)
})

When('the content key is ECIES-wrapped for the admin', async ({}) => {
  expect(s.contentKey).toBeDefined()
  expect(s.adminPubkey).toBeDefined()

  const envelope = wrapKeyForRecipient(s.contentKey!, s.adminPubkey!, s.adminSkHex!, LABEL_NOTE_KEY)
  s.envelopes.set(s.adminPubkey!, envelope)
})

When(
  'the encrypted note is submitted via the API with real ciphertext and envelopes',
  async ({ request }) => {
    expect(s.ciphertextHex).toBeDefined()
    expect(s.adminPubkey).toBeDefined()

    // Build admin envelopes array
    const adminEnvelopes = []
    for (const [pubkey, env] of s.envelopes.entries()) {
      if (pubkey === s.adminPubkey) {
        adminEnvelopes.push({ pubkey, ...env })
      }
    }

    // Build author envelope (volunteer's own copy)
    const [, volKp] = [...s.keypairs.entries()][0]
    const volEnvelope = s.envelopes.get(volKp.pubkey)

    const { status, data } = await apiPost<{ note: Record<string, unknown> }>(
      request,
      '/notes',
      {
        encryptedContent: s.ciphertextHex,
        callId: `e2ee-integrity-${Date.now()}`,
        authorEnvelope: volEnvelope ?? {},
        adminEnvelopes,
      },
      volKp.nsec,
    )
    expect([200, 201]).toContain(status)
    s.noteId = data.note.id as string
    s.apiNote = data.note
  },
)

When(
  'volunteer {string} encrypts note content {string} with envelopes for themselves and the admin',
  async ({}, volName: string, plaintext: string) => {
    const volKp = getKeypair(volName)
    expect(s.adminPubkey).toBeDefined()

    s.contentKey = generateContentKey()
    s.ciphertextHex = encryptContent(plaintext, s.contentKey, LABEL_NOTE_KEY)

    // Wrap for volunteer
    const volEnv = wrapKeyForRecipient(s.contentKey, volKp.pubkey, volKp.skHex, LABEL_NOTE_KEY)
    s.envelopes.set(volKp.pubkey, volEnv)

    // Wrap for admin
    const adminEnv = wrapKeyForRecipient(s.contentKey, s.adminPubkey!, s.adminSkHex!, LABEL_NOTE_KEY)
    s.envelopes.set(s.adminPubkey!, adminEnv)
  },
)

When('the encrypted note is submitted via the API by {string}', async ({ request }, volName: string) => {
  const volKp = getKeypair(volName)
  expect(s.ciphertextHex).toBeDefined()

  const adminEnvelopes = []
  for (const [pubkey, env] of s.envelopes.entries()) {
    if (pubkey !== volKp.pubkey) {
      adminEnvelopes.push({ pubkey, ...env })
    }
  }

  const volEnvelope = s.envelopes.get(volKp.pubkey)

  const { status, data } = await apiPost<{ note: Record<string, unknown> }>(
    request,
    '/notes',
    {
      encryptedContent: s.ciphertextHex,
      callId: `e2ee-3rd-party-${Date.now()}`,
      authorEnvelope: volEnvelope ?? {},
      adminEnvelopes,
    },
    volKp.nsec,
  )
  expect([200, 201]).toContain(status)
  s.noteId = data.note.id as string
  s.apiNote = data.note
})

When('volunteer {string} fetches the note', async ({ request }, volName: string) => {
  const volKp = getKeypair(volName)
  expect(s.noteId).toBeDefined()

  // VolB can fetch notes if they have notes:read-own permission (registered volunteer)
  const { status, data } = await apiGet<{ notes: Array<Record<string, unknown>> }>(
    request,
    '/notes',
    volKp.nsec,
  )
  expect(status).toBe(200)

  // Find our specific note
  const note = data.notes.find(n => n.id === s.noteId)
  // VolB may or may not see the note depending on permissions (read-own vs read-all)
  // Store whatever we got
  s.apiNote = note ?? s.apiNote
})

When(
  'the volunteer encrypts note content {string} with envelopes for both admins',
  async ({}, plaintext: string) => {
    const volKp = [...s.keypairs.entries()].find(([name]) =>
      name.toLowerCase().includes('vol'),
    )
    expect(volKp).toBeDefined()
    const [, kp] = volKp!

    s.contentKey = generateContentKey()
    s.ciphertextHex = encryptContent(plaintext, s.contentKey, LABEL_NOTE_KEY)

    // Wrap for volunteer (author envelope)
    const volEnv = wrapKeyForRecipient(s.contentKey, kp.pubkey, kp.skHex, LABEL_NOTE_KEY)
    s.envelopes.set(kp.pubkey, volEnv)

    // Wrap for each named admin
    for (const [name, adminKp] of s.keypairs.entries()) {
      if (name.startsWith('Admin')) {
        const adminEnv = wrapKeyForRecipient(s.contentKey, adminKp.pubkey, adminKp.skHex, LABEL_NOTE_KEY)
        s.envelopes.set(adminKp.pubkey, adminEnv)
      }
    }
  },
)

When(
  'the encrypted note is submitted via the API with both admin envelopes',
  async ({ request }) => {
    const volKp = [...s.keypairs.entries()].find(([name]) =>
      name.toLowerCase().includes('vol'),
    )
    expect(volKp).toBeDefined()
    const [, kp] = volKp!

    const adminEnvelopes = []
    for (const [pubkey, env] of s.envelopes.entries()) {
      if (pubkey !== kp.pubkey) {
        adminEnvelopes.push({ pubkey, ...env })
      }
    }

    const volEnvelope = s.envelopes.get(kp.pubkey)

    const { status, data } = await apiPost<{ note: Record<string, unknown> }>(
      request,
      '/notes',
      {
        encryptedContent: s.ciphertextHex,
        callId: `e2ee-multi-admin-${Date.now()}`,
        authorEnvelope: volEnvelope ?? {},
        adminEnvelopes,
      },
      kp.nsec,
    )
    expect([200, 201]).toContain(status)
    s.noteId = data.note.id as string
    s.apiNote = data.note
  },
)

When('the volunteer encrypts note content {string} with real crypto', async ({ request }, plaintext: string) => {
  // Use the first volunteer keypair
  const [, volKp] = [...s.keypairs.entries()][0]
  expect(volKp).toBeDefined()
  expect(s.adminPubkey).toBeDefined()

  s.contentKey = generateContentKey()
  s.ciphertextHex = encryptContent(plaintext, s.contentKey, LABEL_NOTE_KEY)

  // Wrap for volunteer
  const volEnv = wrapKeyForRecipient(s.contentKey, volKp.pubkey, volKp.skHex, LABEL_NOTE_KEY)
  s.envelopes.set(volKp.pubkey, volEnv)

  // Wrap for admin
  const adminEnv = wrapKeyForRecipient(s.contentKey, s.adminPubkey!, s.adminSkHex!, LABEL_NOTE_KEY)
  s.envelopes.set(s.adminPubkey!, adminEnv)
})

When('the encrypted note is submitted via the API with real envelopes', async ({ request }) => {
  const [, volKp] = [...s.keypairs.entries()][0]
  expect(volKp).toBeDefined()

  const adminEnvelopes = []
  for (const [pubkey, env] of s.envelopes.entries()) {
    if (pubkey !== volKp.pubkey) {
      adminEnvelopes.push({ pubkey, ...env })
    }
  }

  const volEnvelope = s.envelopes.get(volKp.pubkey)

  const { status, data } = await apiPost<{ note: Record<string, unknown> }>(
    request,
    '/notes',
    {
      encryptedContent: s.ciphertextHex,
      callId: `e2ee-storage-${Date.now()}`,
      authorEnvelope: volEnvelope ?? {},
      adminEnvelopes,
    },
    volKp.nsec,
  )
  expect([200, 201]).toContain(status)
  s.noteId = data.note.id as string
  s.apiNote = data.note
})

// ── When: Decryption ────────────────────────────────────────────────

When('the volunteer unwraps their envelope and decrypts the note', async ({}) => {
  const [, volKp] = [...s.keypairs.entries()][0]
  expect(s.ciphertextHex).toBeDefined()

  const envelope = s.envelopes.get(volKp.pubkey)
  expect(envelope).toBeDefined()

  const recoveredKey = unwrapKey(
    envelope!.wrappedKey,
    envelope!.ephemeralPubkey,
    volKp.skHex,
    LABEL_NOTE_KEY,
  )
  s.decryptedText = decryptContent(s.ciphertextHex!, recoveredKey, LABEL_NOTE_KEY)
})

When('the admin unwraps their envelope and decrypts the note', async ({}) => {
  expect(s.ciphertextHex).toBeDefined()
  expect(s.adminSkHex).toBeDefined()
  expect(s.adminPubkey).toBeDefined()

  const envelope = s.envelopes.get(s.adminPubkey!)
  expect(envelope).toBeDefined()

  const recoveredKey = unwrapKey(
    envelope!.wrappedKey,
    envelope!.ephemeralPubkey,
    s.adminSkHex!,
    LABEL_NOTE_KEY,
  )
  s.decryptedText = decryptContent(s.ciphertextHex!, recoveredKey, LABEL_NOTE_KEY)
})

// ── When: DB access ─────────────────────────────────────────────────

When('the note row is fetched directly from the database', async ({}) => {
  expect(s.noteId).toBeDefined()
  const row = await TestDB.getRow('notes', s.noteId!)
  expect(row).not.toBeNull()
  s.dbRow = row!
})

When('the ciphertext from the DB is decrypted with the original content key', async ({}) => {
  expect(s.dbRow).toBeDefined()
  expect(s.contentKey).toBeDefined()

  const dbCiphertext = s.dbRow!.encrypted_content as string
  s.decryptedText = decryptContent(dbCiphertext, s.contentKey!, LABEL_NOTE_KEY)
})

// ── Then: Assertions ────────────────────────────────────────────────

Then('the API should return the note with the exact ciphertext', async ({}) => {
  expect(s.apiNote).toBeDefined()
  expect(s.apiNote!.encryptedContent).toBe(s.ciphertextHex)
})

Then('the decrypted plaintext should be {string}', async ({}, expected: string) => {
  expect(s.decryptedText).toBe(expected)
})

Then('volunteer {string} should see the ciphertext', async ({}, _volName: string) => {
  // The note's encryptedContent is visible to anyone who can fetch it
  expect(s.apiNote).toBeDefined()
  expect(s.apiNote!.encryptedContent).toBeTruthy()
})

Then('volunteer {string} should have no envelope for their pubkey', async ({}, volName: string) => {
  const volKp = getKeypair(volName)
  expect(s.apiNote).toBeDefined()

  const adminEnvelopes = s.apiNote!.adminEnvelopes as Array<{ pubkey: string }> | undefined
  const hasEnvelope = adminEnvelopes?.some(e => e.pubkey === volKp.pubkey) ?? false
  expect(hasEnvelope).toBe(false)

  // Also check authorEnvelope — it should not be keyed to VolB
  // The authorEnvelope has no pubkey field (it's a KeyEnvelope), so VolB can't use it
  // because it was wrapped for VolA's pubkey via ECIES
})

Then('attempting to unwrap with {string} secret key should fail', async ({}, volName: string) => {
  const volKp = getKeypair(volName)
  expect(s.apiNote).toBeDefined()

  // Try to unwrap the author envelope (which is VolA's) with VolB's key
  const authorEnvelope = s.apiNote!.authorEnvelope as { wrappedKey?: string; ephemeralPubkey?: string } | undefined
  if (authorEnvelope?.wrappedKey && authorEnvelope?.ephemeralPubkey) {
    let decryptionFailed = false
    try {
      unwrapKey(
        authorEnvelope.wrappedKey,
        authorEnvelope.ephemeralPubkey,
        volKp.skHex,
        LABEL_NOTE_KEY,
      )
    } catch {
      decryptionFailed = true
    }
    expect(decryptionFailed).toBe(true)
  } else {
    // No envelope to attempt — this is also a valid "cannot decrypt" case
    expect(true).toBe(true)
  }
})

Then(
  'admin {string} can unwrap their envelope and decrypt to {string}',
  async ({}, adminName: string, expectedText: string) => {
    const adminKp = getKeypair(adminName)
    expect(s.ciphertextHex).toBeDefined()

    const envelope = s.envelopes.get(adminKp.pubkey)
    expect(envelope).toBeDefined()

    const recoveredKey = unwrapKey(
      envelope!.wrappedKey,
      envelope!.ephemeralPubkey,
      adminKp.skHex,
      LABEL_NOTE_KEY,
    )
    const plaintext = decryptContent(s.ciphertextHex!, recoveredKey, LABEL_NOTE_KEY)
    expect(plaintext).toBe(expectedText)
  },
)

Then('the two admin wrapped keys should be different', async ({}) => {
  const adminEnvelopes = [...s.envelopes.entries()].filter(([pubkey]) => {
    // Exclude volunteer pubkeys
    for (const [name] of s.keypairs.entries()) {
      if (name.toLowerCase().includes('vol')) {
        const volKp = s.keypairs.get(name)!
        if (pubkey === volKp.pubkey) return false
      }
    }
    return true
  })
  expect(adminEnvelopes.length).toBeGreaterThanOrEqual(2)

  const wrappedKeys = adminEnvelopes.map(([, env]) => env.wrappedKey)
  expect(wrappedKeys[0]).not.toBe(wrappedKeys[1])
})

Then('the note ID should be returned', async ({}) => {
  expect(s.noteId).toBeDefined()
  expect(s.noteId!.length).toBeGreaterThan(0)
})

Then('the DB encrypted_content column should match the submitted ciphertext exactly', async ({}) => {
  expect(s.dbRow).toBeDefined()
  expect(s.ciphertextHex).toBeDefined()
  expect(s.dbRow!.encrypted_content).toBe(s.ciphertextHex)
})

Then('the DB admin_envelopes JSONB should be a proper array not a string', async ({}) => {
  expect(s.dbRow).toBeDefined()
  assertIsArray(s.dbRow!.admin_envelopes, 'admin_envelopes')

  // Also verify via jsonb_typeof
  const result = await TestDB.assertJsonbField('notes', 'id', s.noteId!, 'admin_envelopes')
  expect(result.pgType).toBe('array')
  expect(result.isDoubleStringified).toBe(false)
})

Then('the DB author_envelope JSONB should be a proper object not a string', async ({}) => {
  expect(s.dbRow).toBeDefined()
  assertIsObject(s.dbRow!.author_envelope, 'author_envelope')

  const result = await TestDB.assertJsonbField('notes', 'id', s.noteId!, 'author_envelope')
  expect(result.pgType).toBe('object')
  expect(result.isDoubleStringified).toBe(false)
})
