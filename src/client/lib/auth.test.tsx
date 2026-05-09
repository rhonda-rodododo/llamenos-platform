import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './auth'
import * as keyManager from './key-manager'

vi.mock('./platform', () => ({
  deviceImportAndLoad: vi.fn(async () => ({
    state: {
      signingPubkeyHex: 'mock-pubkey',
      encryptionPubkeyHex: 'mock-enc-pubkey',
      deviceId: 'mock-device',
    }
  })),
  isValidSeedHex: vi.fn((hex: string) => /^[0-9a-f]{64}$/i.test(hex)),
  persistAndUnlockDeviceKeys: vi.fn(),
  lockCrypto: vi.fn(async () => {}),
  createAuthToken: vi.fn(async () => JSON.stringify({ timestamp: Date.now(), token: 'mock-token' })),
  hasStoredKey: vi.fn(() => false),
}))

vi.mock('./api', () => ({
  getMe: vi.fn(async () => ({
    pubkey: 'mock-pubkey',
    roles: ['volunteer'],
    permissions: ['notes:read', 'notes:write'],
    primaryRole: { name: 'Volunteer' },
    name: 'Test User',
    transcriptionEnabled: true,
    spokenLanguages: ['en'],
    uiLanguage: 'en',
    profileCompleted: true,
    onBreak: false,
    callPreference: 'phone',
    adminDecryptionPubkey: 'admin-pubkey',
    serverEventKeyHex: null,
    serverEventKeyPrevHex: null,
    eventKeyEpoch: undefined,
    eventKeyEpochDuration: undefined,
  })),
  login: vi.fn(),
  logout: vi.fn(),
  updateMyAvailability: vi.fn(),
  setOnAuthExpired: vi.fn(),
  setOnApiActivity: vi.fn(),
}))

vi.mock('./webauthn', () => ({
  loginWithPasskey: vi.fn(async () => ({ token: 'passkey-token', pubkey: 'passkey-pubkey' })),
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

beforeEach(() => {
  keyManager.lock()
  sessionStorage.clear()
  localStorage.clear()
})

describe('useAuth initial state', () => {
  it('starts with loading state', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.isKeyUnlocked).toBe(false)
  })

  it('has empty roles and permissions initially', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.roles).toEqual([])
    expect(result.current.permissions).toEqual([])
  })

  it('has default preferences', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.callPreference).toBe('phone')
    expect(result.current.onBreak).toBe(false)
    expect(result.current.transcriptionEnabled).toBe(true)
  })
})

describe('useAuth hasPermission', () => {
  it('returns false for unknown permission', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.hasPermission('admin:all')).toBe(false)
  })

  it('returns true for matching permission', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.signIn('a'.repeat(64), '12345678')
    })

    await act(async () => {})
    await act(async () => {})
    expect(result.current.hasPermission('notes:read')).toBe(true)
  })
})

describe('useAuth isAdmin', () => {
  it('returns false for non-admin', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.isAdmin).toBe(false)
  })
})

describe('useAuth signOut', () => {
  it('clears all state on signOut', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.signIn('a'.repeat(64), '12345678')
    })

    await act(async () => {})

    act(() => {
      result.current.signOut()
    })

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.isKeyUnlocked).toBe(false)
    expect(result.current.publicKey).toBeNull()
    expect(result.current.roles).toEqual([])
    expect(result.current.permissions).toEqual([])
    expect(result.current.sessionExpired).toBe(false)
    expect(result.current.sessionExpiring).toBe(false)
  })

  it('removes session token on signOut', async () => {
    sessionStorage.setItem('llamenos-session-token', 'test-token')

    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => {
      result.current.signOut()
    })

    expect(sessionStorage.getItem('llamenos-session-token')).toBeNull()
  })

  it('removes draft keys on signOut', async () => {
    localStorage.setItem('llamenos-draft:1', 'draft1')
    localStorage.setItem('llamenos-draft:2', 'draft2')
    localStorage.setItem('llamenos-other', 'other')

    const { result } = renderHook(() => useAuth(), { wrapper })

    act(() => {
      result.current.signOut()
    })

    expect(localStorage.getItem('llamenos-draft:1')).toBeNull()
    expect(localStorage.getItem('llamenos-draft:2')).toBeNull()
    expect(localStorage.getItem('llamenos-other')).toBe('other')
  })
})

describe('useAuth lockKey', () => {
  it('locks key but keeps session', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.signIn('a'.repeat(64), '12345678')
    })

    await act(async () => {})

    act(() => {
      result.current.lockKey()
    })

    expect(result.current.isKeyUnlocked).toBe(false)
    expect(result.current.hasNsec).toBe(false)
  })
})

describe('useAuth session expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('tracks session expiry state', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.signIn('a'.repeat(64), '12345678')
    })

    expect(result.current.sessionExpired).toBe(false)
    expect(result.current.sessionExpiring).toBe(false)
  })
})

describe('useAuth toggleBreak', () => {
  it('toggles break state', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.signIn('a'.repeat(64), '12345678')
    })

    expect(result.current.onBreak).toBe(false)

    await act(async () => {
      await result.current.toggleBreak()
    })

    expect(result.current.onBreak).toBe(true)
  })
})

describe('useAuth error handling', () => {
  it('sets error on invalid seed', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.signIn('invalid', '12345678')
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Invalid secret key')
    })
    expect(result.current.isLoading).toBe(false)
  })

  it('clears error on successful signIn after failure', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.signIn('invalid', '12345678')
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Invalid secret key')
    })

    await act(async () => {
      await result.current.signIn('a'.repeat(64), '12345678')
    })

    await waitFor(() => {
      expect(result.current.error).toBeNull()
    })
  })
})
