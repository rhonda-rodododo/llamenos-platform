import { describe, it, expect, jest } from 'bun:test'
import { IdentityService } from '../../services/identity'
import { ServiceError } from '../../services/settings'

// ---------------------------------------------------------------------------
// DB row factory
// ---------------------------------------------------------------------------

function makeUserRow(overrides: Partial<{
  pubkey: string
  displayName: string
  phone: string
  roles: string[]
  hubRoles: unknown
  active: boolean
  createdAt: Date
  updatedAt: Date
  encryptedSecretKey: string
  transcriptionEnabled: boolean
  spokenLanguages: string[]
  uiLanguage: string
  profileCompleted: boolean
  onBreak: boolean
  callPreference: string
  supportedMessagingChannels: unknown
  messagingEnabled: boolean
  specializations: string[]
  maxCaseAssignments: number | null
  teamId: string | null
  supervisorPubkey: string | null
}> = {}) {
  return {
    pubkey: 'pk-default',
    displayName: 'Test User',
    phone: '+15551234567',
    roles: ['role-volunteer'],
    hubRoles: [],
    active: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    encryptedSecretKey: 'enc-key',
    transcriptionEnabled: true,
    spokenLanguages: ['en'],
    uiLanguage: 'en',
    profileCompleted: false,
    onBreak: false,
    callPreference: 'phone',
    supportedMessagingChannels: null,
    messagingEnabled: null,
    specializations: [],
    maxCaseAssignments: null,
    teamId: null,
    supervisorPubkey: null,
    ...overrides,
  }
}

function makeInviteRow(overrides: Partial<{
  code: string
  name: string
  phone: string
  roleIds: string[]
  createdBy: string
  createdAt: Date
  expiresAt: Date
  usedAt: Date | null
  usedBy: string | null
}> = {}) {
  return {
    code: 'inv-1',
    name: 'Invited Person',
    phone: '+15559999999',
    roleIds: ['role-volunteer'],
    createdBy: 'admin-pk',
    createdAt: new Date('2026-01-01'),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    usedAt: null,
    usedBy: null,
    ...overrides,
  }
}

function makeSessionRow(overrides: Partial<{
  token: string
  pubkey: string
  createdAt: Date
  expiresAt: Date
}> = {}) {
  return {
    token: 'session-token-abc',
    pubkey: 'pk-1',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8h from now
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Admin Bootstrap
// ---------------------------------------------------------------------------

describe('IdentityService — Admin Bootstrap', () => {
  describe('hasAdmin', () => {
    it('returns false when no super-admin exists', async () => {
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }
      const svc = new IdentityService(db as never)
      const result = await svc.hasAdmin()
      expect(result).toEqual({ hasAdmin: false })
    })

    it('returns true when active super-admin exists', async () => {
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ pubkey: 'admin-pk' }]),
            }),
          }),
        }),
      }
      const svc = new IdentityService(db as never)
      const result = await svc.hasAdmin()
      expect(result).toEqual({ hasAdmin: true })
    })
  })

  describe('bootstrapAdmin', () => {
    it('creates admin when none exists', async () => {
      const insertValues = jest.fn().mockReturnValue({
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
      })

      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: insertValues,
        }),
      }

      const svc = new IdentityService(db as never)
      await svc.bootstrapAdmin('new-admin-pk')

      expect(insertValues).toHaveBeenCalled()
      const vals = insertValues.mock.calls[0][0]
      expect(vals.pubkey).toBe('new-admin-pk')
      expect(vals.roles).toEqual(['role-super-admin'])
      expect(vals.active).toBe(true)
    })

    it('throws 403 when admin already exists', async () => {
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ pubkey: 'existing-admin' }]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      await expect(svc.bootstrapAdmin('new-pk')).rejects.toThrow('Admin already exists')
    })
  })
})

// ---------------------------------------------------------------------------
// User CRUD
// ---------------------------------------------------------------------------

describe('IdentityService — User CRUD', () => {
  describe('getUsers', () => {
    it('strips encryptedSecretKey from returned users', async () => {
      const row = makeUserRow({ pubkey: 'pk-1', encryptedSecretKey: 'SENSITIVE' })
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockResolvedValue([row]),
        }),
      }

      const svc = new IdentityService(db as never)
      const result = await svc.getUsers()

      expect(result.users).toHaveLength(1)
      expect(result.users[0].encryptedSecretKey).toBeUndefined()
      expect(result.users[0].pubkey).toBe('pk-1')
    })
  })

  describe('getUser', () => {
    it('returns sanitized user', async () => {
      const row = makeUserRow({ pubkey: 'pk-1' })
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([row]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      const result = await svc.getUser('pk-1')
      expect(result.pubkey).toBe('pk-1')
      expect(result.encryptedSecretKey).toBeUndefined()
    })

    it('throws 404 for unknown pubkey', async () => {
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      await expect(svc.getUser('nonexistent')).rejects.toThrow('Not found')
    })
  })

  describe('getUserInternal', () => {
    it('returns full user with encryptedSecretKey', async () => {
      const row = makeUserRow({ pubkey: 'pk-1', encryptedSecretKey: 'SENSITIVE' })
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([row]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      const result = await svc.getUserInternal('pk-1')
      expect(result).not.toBeNull()
      expect(result!.encryptedSecretKey).toBe('SENSITIVE')
    })

    it('returns null for unknown pubkey', async () => {
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      const result = await svc.getUserInternal('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('createUser', () => {
    it('creates user with default role-volunteer', async () => {
      const insertValues = jest.fn()
      const returnedRow = makeUserRow({ pubkey: 'new-pk' })

      const db = {
        insert: jest.fn().mockReturnValue({
          values: insertValues.mockReturnValue({
            returning: jest.fn().mockResolvedValue([returnedRow]),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      const { volunteer } = await svc.createUser({
        pubkey: 'new-pk',
        name: 'New User',
        phone: '+15551111111',
        encryptedSecretKey: 'enc',
      })

      expect(volunteer.pubkey).toBe('new-pk')
      const vals = insertValues.mock.calls[0][0]
      expect(vals.roles).toEqual(['role-volunteer'])
    })

    it('uses provided roleIds', async () => {
      const insertValues = jest.fn()
      const returnedRow = makeUserRow({ pubkey: 'new-pk', roles: ['role-admin'] })

      const db = {
        insert: jest.fn().mockReturnValue({
          values: insertValues.mockReturnValue({
            returning: jest.fn().mockResolvedValue([returnedRow]),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      await svc.createUser({
        pubkey: 'new-pk',
        name: 'Admin User',
        phone: '',
        roleIds: ['role-admin'],
        encryptedSecretKey: 'enc',
      })

      const vals = insertValues.mock.calls[0][0]
      expect(vals.roles).toEqual(['role-admin'])
    })
  })

  describe('updateUser', () => {
    it('non-admin can only update safe fields', async () => {
      const existingRow = makeUserRow({ pubkey: 'pk-1' })
      const updatedRow = makeUserRow({
        pubkey: 'pk-1',
        displayName: 'New Name',
        onBreak: true,
      })

      const updateSet = jest.fn()
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([existingRow]),
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          set: updateSet.mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([updatedRow]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      await svc.updateUser(
        'pk-1',
        { name: 'New Name', onBreak: true, roles: ['role-admin'] } as never,
        false, // NOT admin
      )

      const setVals = updateSet.mock.calls[0][0]
      expect(setVals.displayName).toBe('New Name')
      expect(setVals.onBreak).toBe(true)
      // roles should NOT be in the update for non-admin
      expect(setVals.roles).toBeUndefined()
    })

    it('admin can update restricted fields like roles', async () => {
      const existingRow = makeUserRow({ pubkey: 'pk-1' })
      const updatedRow = makeUserRow({ pubkey: 'pk-1', roles: ['role-admin'] })

      const updateSet = jest.fn()
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([existingRow]),
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          set: updateSet.mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([updatedRow]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      await svc.updateUser(
        'pk-1',
        { roles: ['role-admin'] } as never,
        true, // IS admin
      )

      const setVals = updateSet.mock.calls[0][0]
      expect(setVals.roles).toEqual(['role-admin'])
    })

    it('never allows overwriting pubkey', async () => {
      const existingRow = makeUserRow({ pubkey: 'pk-1' })
      const updateSet = jest.fn()
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([existingRow]),
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          set: updateSet.mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([existingRow]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      await svc.updateUser(
        'pk-1',
        { pubkey: 'evil-pk', name: 'Legit' } as never,
        true,
      )

      const setVals = updateSet.mock.calls[0][0]
      // pubkey should never be in the update set
      expect(setVals.pubkey).toBeUndefined()
      expect(setVals.displayName).toBe('Legit')
    })

    it('throws 404 when user does not exist', async () => {
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      await expect(
        svc.updateUser('nonexistent', { name: 'x' } as never, true),
      ).rejects.toThrow('Not found')
    })
  })
})

// ---------------------------------------------------------------------------
// Invite Codes
// ---------------------------------------------------------------------------

describe('IdentityService — Invites', () => {
  describe('validateInvite', () => {
    it('returns valid for unused, unexpired invite', async () => {
      const invite = makeInviteRow()
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([invite]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      const result = await svc.validateInvite('inv-1')
      expect(result.valid).toBe(true)
      expect(result.name).toBe('Invited Person')
      expect(result.roleIds).toEqual(['role-volunteer'])
    })

    it('returns not_found for unknown code', async () => {
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      const result = await svc.validateInvite('nonexistent')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('not_found')
    })

    it('returns already_used for redeemed invite', async () => {
      const invite = makeInviteRow({ usedAt: new Date() })
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([invite]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      const result = await svc.validateInvite('inv-1')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('already_used')
    })

    it('returns expired for expired invite', async () => {
      const invite = makeInviteRow({
        expiresAt: new Date('2020-01-01'), // in the past
      })
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([invite]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      const result = await svc.validateInvite('inv-expired')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('expired')
    })
  })
})

// ---------------------------------------------------------------------------
// Session Management
// ---------------------------------------------------------------------------

describe('IdentityService — Sessions', () => {
  describe('validateSession', () => {
    it('returns session for valid, fresh token', async () => {
      const session = makeSessionRow()
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([session]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      const result = await svc.validateSession('session-token-abc')
      expect(result.token).toBe('session-token-abc')
      expect(result.pubkey).toBe('pk-1')
    })

    it('throws 401 for unknown token', async () => {
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      await expect(svc.validateSession('bad-token')).rejects.toThrow('Invalid session')
    })

    it('throws 401 and deletes expired session', async () => {
      const expired = makeSessionRow({
        expiresAt: new Date('2020-01-01'),
      })
      const deleteFn = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      })

      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([expired]),
            }),
          }),
        }),
        delete: deleteFn,
      }

      const svc = new IdentityService(db as never)
      await expect(svc.validateSession('expired-token')).rejects.toThrow('Session expired')
      expect(deleteFn).toHaveBeenCalled()
    })

    it('renews session when remaining time < 1 hour', async () => {
      const nearExpiry = makeSessionRow({
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
      })
      const updateSet = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      })

      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([nearExpiry]),
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({ set: updateSet }),
      }

      const svc = new IdentityService(db as never)
      const result = await svc.validateSession('near-expiry-token')

      // Session should be renewed with a new expiry
      expect(updateSet).toHaveBeenCalled()
      const newExpiry = new Date(result.expiresAt)
      // New expiry should be ~8 hours from now (not 30 min)
      expect(newExpiry.getTime()).toBeGreaterThan(Date.now() + 7 * 60 * 60 * 1000)
    })
  })
})

// ---------------------------------------------------------------------------
// WebAuthn Challenges
// ---------------------------------------------------------------------------

describe('IdentityService — WebAuthn Challenges', () => {
  describe('getWebAuthnChallenge', () => {
    it('returns and consumes a valid challenge', async () => {
      const challenge = {
        challengeId: 'ch-1',
        challenge: 'random-challenge-data',
        createdAt: new Date(), // just created
      }
      const deleteFn = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      })

      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([challenge]),
            }),
          }),
        }),
        delete: deleteFn,
      }

      const svc = new IdentityService(db as never)
      const result = await svc.getWebAuthnChallenge('ch-1')

      expect(result.challenge).toBe('random-challenge-data')
      expect(deleteFn).toHaveBeenCalled() // one-time use
    })

    it('throws 404 for unknown challenge', async () => {
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      await expect(svc.getWebAuthnChallenge('unknown')).rejects.toThrow('Challenge not found')
    })

    it('throws 410 for expired challenge (>5 min old)', async () => {
      const expired = {
        challengeId: 'ch-expired',
        challenge: 'old-data',
        createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
      }
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([expired]),
            }),
          }),
        }),
        delete: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }

      const svc = new IdentityService(db as never)
      try {
        await svc.getWebAuthnChallenge('ch-expired')
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceError)
        expect((err as ServiceError).status).toBe(410)
        expect((err as ServiceError).message).toContain('expired')
      }
    })
  })
})

// ---------------------------------------------------------------------------
// Provisioning Rooms
// ---------------------------------------------------------------------------

describe('IdentityService — Provisioning Rooms', () => {
  describe('getProvisionRoom', () => {
    it('throws 403 for invalid token', async () => {
      const room = {
        roomId: 'room-1',
        token: 'correct-token',
        ephemeralPubkey: 'eph-pk',
        expiresAt: new Date(Date.now() + 60 * 1000),
        encryptedNsec: null,
        primaryPubkey: null,
      }
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([room]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      await expect(
        svc.getProvisionRoom('room-1', 'wrong-token'),
      ).rejects.toThrow('Invalid token')
    })

    it('returns expired status for expired room', async () => {
      const room = {
        roomId: 'room-1',
        token: 'correct-token',
        ephemeralPubkey: 'eph-pk',
        expiresAt: new Date('2020-01-01'), // expired
        encryptedNsec: null,
        primaryPubkey: null,
      }
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([room]),
            }),
          }),
        }),
        delete: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }

      const svc = new IdentityService(db as never)
      const result = await svc.getProvisionRoom('room-1', 'correct-token')
      expect(result.status).toBe('expired')
    })

    it('returns ready status and consumes room with payload', async () => {
      const room = {
        roomId: 'room-1',
        token: 'correct-token',
        ephemeralPubkey: 'eph-pk',
        expiresAt: new Date(Date.now() + 60 * 1000),
        encryptedNsec: 'enc-nsec-data',
        primaryPubkey: 'primary-pk',
      }
      const deleteFn = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      })
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([room]),
            }),
          }),
        }),
        delete: deleteFn,
      }

      const svc = new IdentityService(db as never)
      const result = await svc.getProvisionRoom('room-1', 'correct-token')

      expect(result.status).toBe('ready')
      expect(result.encryptedNsec).toBe('enc-nsec-data')
      expect(result.primaryPubkey).toBe('primary-pk')
      expect(deleteFn).toHaveBeenCalled() // consumed
    })

    it('returns waiting status when no payload yet', async () => {
      const room = {
        roomId: 'room-1',
        token: 'correct-token',
        ephemeralPubkey: 'eph-pk',
        expiresAt: new Date(Date.now() + 60 * 1000),
        encryptedNsec: null,
        primaryPubkey: null,
      }
      const db = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([room]),
            }),
          }),
        }),
      }

      const svc = new IdentityService(db as never)
      const result = await svc.getProvisionRoom('room-1', 'correct-token')
      expect(result.status).toBe('waiting')
      expect(result.ephemeralPubkey).toBe('eph-pk')
    })
  })
})

// ---------------------------------------------------------------------------
// Reset safety
// ---------------------------------------------------------------------------

describe('IdentityService — Reset', () => {
  it('throws 403 outside demo/development mode', async () => {
    const svc = new IdentityService({} as never)
    await expect(
      svc.reset(false, 'production'),
    ).rejects.toThrow('Reset not allowed')
  })

  it('allows reset in development mode', async () => {
    const txFn = jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        delete: jest.fn().mockReturnValue(Promise.resolve()),
      }
      return fn(tx)
    })
    const db = { transaction: txFn }
    const svc = new IdentityService(db as never)

    await svc.reset(false, 'development')
    expect(txFn).toHaveBeenCalled()
  })

  it('allows reset in demo mode regardless of environment', async () => {
    const txFn = jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        delete: jest.fn().mockReturnValue(Promise.resolve()),
      }
      return fn(tx)
    })
    const db = { transaction: txFn }
    const svc = new IdentityService(db as never)

    await svc.reset(true, 'production')
    expect(txFn).toHaveBeenCalled()
  })
})
