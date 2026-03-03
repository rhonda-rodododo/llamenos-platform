/**
 * Integration tests for IdentityDO — tests real DO logic with in-memory storage.
 *
 * Run with: bun run test:worker:integration
 *
 * Tests cover:
 * - Volunteer registration and lookup
 * - Admin pubkey bootstrap
 * - Session creation and validation
 * - WebAuthn credential storage
 * - Invite code redemption
 * - Volunteer deactivation
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { IdentityDO } from '@worker/durable-objects/identity-do'
import { createDOTestHarness } from './helpers'

describe('IdentityDO integration', () => {
  let doFetch: ReturnType<typeof createDOTestHarness>['doFetch']
  let doJSON: ReturnType<typeof createDOTestHarness>['doJSON']
  let postJSON: ReturnType<typeof createDOTestHarness>['postJSON']
  let patchJSON: ReturnType<typeof createDOTestHarness>['patchJSON']

  beforeEach(() => {
    const harness = createDOTestHarness(IdentityDO)
    doFetch = harness.doFetch
    doJSON = harness.doJSON
    postJSON = harness.postJSON
    patchJSON = harness.patchJSON
  })

  it('creates a new volunteer via registration', async () => {
    const res = await postJSON('/volunteers', {
      pubkey: 'abc123',
      name: 'Test Volunteer',
      phone: '+15551234567',
      encryptedSecretKey: 'encrypted-key-data',
    })

    expect(res.status).toBe(200)
    const data = await res.json() as {
      volunteer: { pubkey: string; name: string; active: boolean; roles: string[]; encryptedSecretKey?: string }
    }
    expect(data.volunteer.pubkey).toBe('abc123')
    expect(data.volunteer.name).toBe('Test Volunteer')
    expect(data.volunteer.active).toBe(true)
    expect(data.volunteer.roles).toEqual(['role-volunteer'])
    // encryptedSecretKey should be stripped from response
    expect(data.volunteer.encryptedSecretKey).toBeUndefined()
  })

  it('looks up volunteer by pubkey', async () => {
    await postJSON('/volunteers', {
      pubkey: 'lookup-test-key',
      name: 'Lookup Test',
      phone: '+15559999999',
      encryptedSecretKey: 'enc-key',
    })

    const data = await doJSON<{ pubkey: string; name: string; phone: string }>('/volunteer/lookup-test-key')
    expect(data.pubkey).toBe('lookup-test-key')
    expect(data.name).toBe('Lookup Test')
    expect(data.phone).toBe('+15559999999')
  })

  it('lists all volunteers', async () => {
    await postJSON('/volunteers', {
      pubkey: 'vol1',
      name: 'Volunteer One',
      phone: '+15551111111',
      encryptedSecretKey: 'key1',
    })
    await postJSON('/volunteers', {
      pubkey: 'vol2',
      name: 'Volunteer Two',
      phone: '+15552222222',
      encryptedSecretKey: 'key2',
    })

    const data = await doJSON<{ volunteers: Array<{ pubkey: string }> }>('/volunteers')
    const pubkeys = data.volunteers.map((v) => v.pubkey)
    expect(pubkeys).toContain('vol1')
    expect(pubkeys).toContain('vol2')
  })

  it('updates volunteer profile', async () => {
    await postJSON('/volunteers', {
      pubkey: 'update-test',
      name: 'Before Update',
      phone: '+15550000000',
      encryptedSecretKey: 'enc',
    })

    const res = await patchJSON('/volunteers/update-test', {
      name: 'After Update',
      spokenLanguages: ['en', 'es', 'fr'],
    })

    expect(res.status).toBe(200)
    const data = await res.json() as { volunteer: { name: string; spokenLanguages: string[] } }
    expect(data.volunteer.name).toBe('After Update')
    expect(data.volunteer.spokenLanguages).toEqual(['en', 'es', 'fr'])
  })

  it('deactivates a volunteer', async () => {
    await postJSON('/volunteers', {
      pubkey: 'deactivate-test',
      name: 'To Deactivate',
      phone: '+15553333333',
      encryptedSecretKey: 'enc',
    })

    // Admin update to deactivate
    const res = await patchJSON('/admin/volunteers/deactivate-test', {
      active: false,
    })

    expect(res.status).toBe(200)
    const data = await res.json() as { volunteer: { active: boolean } }
    expect(data.volunteer.active).toBe(false)

    // Verify persistence
    const check = await doJSON<{ active: boolean }>('/volunteer/deactivate-test')
    expect(check.active).toBe(false)
  })

  it('creates and validates a session token', async () => {
    await postJSON('/volunteers', {
      pubkey: 'session-user',
      name: 'Session User',
      phone: '+15554444444',
      encryptedSecretKey: 'enc',
    })

    const createRes = await postJSON('/sessions/create', { pubkey: 'session-user' })
    expect(createRes.status).toBe(200)
    const session = await createRes.json() as { token: string; pubkey: string; expiresAt: string }
    expect(session.token).toBeDefined()
    expect(session.token.length).toBe(64) // 32 bytes hex
    expect(session.pubkey).toBe('session-user')
    expect(session.expiresAt).toBeDefined()

    // Validate the token
    const validateRes = await doFetch(`/sessions/validate/${session.token}`)
    expect(validateRes.status).toBe(200)
    const validated = await validateRes.json() as { pubkey: string }
    expect(validated.pubkey).toBe('session-user')
  })

  it('rejects invalid session tokens', async () => {
    const res = await doFetch('/sessions/validate/nonexistent-token')
    expect(res.status).toBe(401)
  })

  it('stores WebAuthn credentials', async () => {
    const testPubkey = 'webauthn-user'
    await postJSON('/volunteers', {
      pubkey: testPubkey,
      name: 'WebAuthn User',
      phone: '+15555555555',
      encryptedSecretKey: 'enc',
    })

    const credential = {
      id: 'cred-001',
      publicKey: 'base64urlpublickey',
      counter: 0,
      transports: ['internal'],
      backedUp: false,
      label: 'My Passkey',
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    }

    const addRes = await postJSON('/webauthn/credentials', {
      pubkey: testPubkey,
      credential,
    })
    expect(addRes.status).toBe(200)

    // Retrieve credentials
    const getRes = await doFetch(`/webauthn/credentials?pubkey=${testPubkey}`)
    expect(getRes.status).toBe(200)
    const data = await getRes.json() as { credentials: Array<{ id: string; label: string }> }
    expect(data.credentials).toHaveLength(1)
    expect(data.credentials[0].id).toBe('cred-001')
    expect(data.credentials[0].label).toBe('My Passkey')
  })

  it('creates invite codes', async () => {
    const res = await postJSON('/invites', {
      name: 'New Volunteer',
      phone: '+15556666666',
      roleIds: ['role-volunteer'],
      createdBy: 'admin-pubkey',
    })

    expect(res.status).toBe(200)
    const data = await res.json() as { invite: { code: string; name: string; expiresAt: string } }
    expect(data.invite.code).toBeDefined()
    expect(data.invite.name).toBe('New Volunteer')
    expect(data.invite.expiresAt).toBeDefined()

    // Verify invite appears in list
    const listData = await doJSON<{ invites: Array<{ code: string }> }>('/invites')
    expect(listData.invites.some((i) => i.code === data.invite.code)).toBe(true)
  })

  it('redeems invite codes', async () => {
    // Create an invite
    const createRes = await postJSON('/invites', {
      name: 'Invite Target',
      phone: '+15557777777',
      roleIds: ['role-volunteer'],
      createdBy: 'admin-pubkey',
    })
    const { invite } = await createRes.json() as { invite: { code: string } }

    // Validate before redemption
    const validateRes = await doFetch(`/invites/validate/${invite.code}`)
    const validateData = await validateRes.json() as { valid: boolean; name: string }
    expect(validateData.valid).toBe(true)
    expect(validateData.name).toBe('Invite Target')

    // Redeem the invite
    const redeemRes = await postJSON('/invites/redeem', {
      code: invite.code,
      pubkey: 'new-volunteer-pubkey',
    })
    expect(redeemRes.status).toBe(200)
    const redeemData = await redeemRes.json() as {
      volunteer: { pubkey: string; name: string; roles: string[] }
    }
    expect(redeemData.volunteer.pubkey).toBe('new-volunteer-pubkey')
    expect(redeemData.volunteer.name).toBe('Invite Target')

    // Verify volunteer was created
    const volRes = await doFetch('/volunteer/new-volunteer-pubkey')
    expect(volRes.status).toBe(200)
  })

  it('rejects invalid invite codes', async () => {
    const res = await doFetch('/invites/validate/non-existent-code')
    const data = await res.json() as { valid: boolean; error: string }
    expect(data.valid).toBe(false)
    expect(data.error).toBe('not_found')
  })

  it('prevents duplicate invite redemption', async () => {
    // Create invite
    const createRes = await postJSON('/invites', {
      name: 'One Time',
      phone: '+15558888888',
      roleIds: ['role-volunteer'],
      createdBy: 'admin-pubkey',
    })
    const { invite } = await createRes.json() as { invite: { code: string } }

    // First redemption succeeds
    const first = await postJSON('/invites/redeem', {
      code: invite.code,
      pubkey: 'first-redeemer',
    })
    expect(first.status).toBe(200)

    // Second redemption fails
    const second = await postJSON('/invites/redeem', {
      code: invite.code,
      pubkey: 'second-redeemer',
    })
    expect(second.status).toBe(400)
    const errData = await second.json() as { error: string }
    expect(errData.error).toContain('already used')
  })
})
