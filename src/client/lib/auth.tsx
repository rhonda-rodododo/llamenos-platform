import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { type KeyPair, keyPairFromNsec, createAuthToken } from './crypto'
import * as keyManager from './key-manager'
import { hasStoredKey } from './key-store'
import { getMe, login, logout as apiLogout, updateMyAvailability, setOnAuthExpired, setOnApiActivity } from './api'
import { permissionGranted } from '@shared/permissions'
import { loginWithPasskey as webauthnLogin } from './webauthn'

interface AuthState {
  isKeyUnlocked: boolean
  publicKey: string | null
  roles: string[]
  permissions: string[]
  primaryRoleName: string | null
  name: string | null
  isLoading: boolean
  error: string | null
  transcriptionEnabled: boolean
  spokenLanguages: string[]
  uiLanguage: string
  profileCompleted: boolean
  onBreak: boolean
  callPreference: 'phone' | 'browser' | 'both'
  sessionExpiring: boolean
  sessionExpired: boolean
}

interface AuthContextValue extends AuthState {
  signIn: (nsec: string) => Promise<void>
  signInWithPasskey: () => Promise<void>
  signOut: () => void
  refreshProfile: () => Promise<void>
  toggleBreak: () => Promise<void>
  renewSession: () => Promise<void>
  unlockWithPin: (pin: string) => Promise<boolean>
  lockKey: () => void
  hasPermission: (permission: string) => boolean
  isAdmin: boolean
  isAuthenticated: boolean
  hasNsec: boolean
  /** @deprecated Use keyManager.getSecretKey() directly instead */
  keyPair: KeyPair | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isKeyUnlocked: false,
    publicKey: null,
    roles: [],
    permissions: [],
    primaryRoleName: null,
    name: null,
    isLoading: true,
    error: null,
    transcriptionEnabled: true,
    spokenLanguages: ['en'],
    uiLanguage: 'en',
    profileCompleted: true,
    onBreak: false,
    callPreference: 'phone',
    sessionExpiring: false,
    sessionExpired: false,
  })

  const lastApiActivity = useRef(Date.now())

  // Track API activity — called after each successful request
  const markActivity = useCallback(() => {
    lastApiActivity.current = Date.now()
    setState(s => s.sessionExpiring ? { ...s, sessionExpiring: false } : s)
  }, [])

  // Listen for key manager lock/unlock events
  useEffect(() => {
    const unsubLock = keyManager.onLock(() => {
      setState(s => ({ ...s, isKeyUnlocked: false }))
    })
    const unsubUnlock = keyManager.onUnlock(() => {
      setState(s => ({
        ...s,
        isKeyUnlocked: true,
        publicKey: keyManager.getPublicKeyHex(),
      }))
    })
    return () => { unsubLock(); unsubUnlock() }
  }, [])

  // Register auth expiry callback — called by api.ts when a 401 is received
  useEffect(() => {
    setOnAuthExpired(() => {
      setState(s => ({
        ...s,
        sessionExpired: true,
        sessionExpiring: false,
        ...(s.isKeyUnlocked ? {} : { roles: [], permissions: [], primaryRoleName: null, name: null }),
      }))
    })
    return () => setOnAuthExpired(null)
  }, [])

  // Register API activity callback
  useEffect(() => {
    setOnApiActivity(markActivity)
    return () => setOnApiActivity(null)
  }, [markActivity])

  // Session expiry warning — check every 30s if idle > 4 min
  useEffect(() => {
    if (!state.isKeyUnlocked && !sessionStorage.getItem('llamenos-session-token')) return
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastApiActivity.current
      const WARN_THRESHOLD = 4 * 60 * 1000 // 4 minutes
      if (elapsed >= WARN_THRESHOLD && !state.sessionExpired) {
        setState(s => ({ ...s, sessionExpiring: true }))
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [state.isKeyUnlocked, state.sessionExpired])

  // Restore session on mount
  useEffect(() => {
    // Try session token (WebAuthn session) — always try this first
    const sessionToken = sessionStorage.getItem('llamenos-session-token')
    if (sessionToken) {
      getMe()
        .then((me) => {
          lastApiActivity.current = Date.now()
          setState({
            isKeyUnlocked: keyManager.isUnlocked(),
            publicKey: me.pubkey,
            roles: me.roles || [],
            permissions: me.permissions || [],
            primaryRoleName: me.primaryRole?.name || null,
            name: me.name,
            isLoading: false,
            error: null,
            transcriptionEnabled: me.transcriptionEnabled,
            spokenLanguages: me.spokenLanguages || ['en'],
            uiLanguage: me.uiLanguage || 'en',
            profileCompleted: me.profileCompleted ?? true,
            onBreak: me.onBreak ?? false,
            callPreference: me.callPreference ?? 'phone',
            sessionExpiring: false,
            sessionExpired: false,
          })
        })
        .catch(() => {
          sessionStorage.removeItem('llamenos-session-token')
          setState(s => ({ ...s, isLoading: false }))
        })
      return
    }
    // If key manager is already unlocked (e.g., still in memory from tab switch),
    // try to authenticate with Schnorr token
    if (keyManager.isUnlocked()) {
      getMe()
        .then((me) => {
          lastApiActivity.current = Date.now()
          setState({
            isKeyUnlocked: true,
            publicKey: me.pubkey,
            roles: me.roles || [],
            permissions: me.permissions || [],
            primaryRoleName: me.primaryRole?.name || null,
            name: me.name,
            isLoading: false,
            error: null,
            transcriptionEnabled: me.transcriptionEnabled,
            spokenLanguages: me.spokenLanguages || ['en'],
            uiLanguage: me.uiLanguage || 'en',
            profileCompleted: me.profileCompleted ?? true,
            onBreak: me.onBreak ?? false,
            callPreference: me.callPreference ?? 'phone',
            sessionExpiring: false,
            sessionExpired: false,
          })
        })
        .catch(() => {
          keyManager.lock()
          setState(s => ({ ...s, isLoading: false }))
        })
      return
    }
    setState(s => ({ ...s, isLoading: false }))
  }, [])

  // Sign in with nsec (import flow — onboarding/recovery only)
  const signIn = useCallback(async (nsec: string) => {
    setState(s => ({ ...s, isLoading: true, error: null }))
    const keyPair = keyPairFromNsec(nsec)
    if (!keyPair) {
      setState(s => ({ ...s, isLoading: false, error: 'Invalid secret key' }))
      return
    }
    try {
      const token = createAuthToken(keyPair.secretKey, Date.now())
      const parsed = JSON.parse(token)
      await login(parsed.pubkey, parsed.timestamp, parsed.token)
      const me = await getMe()
      lastApiActivity.current = Date.now()
      setState({
        isKeyUnlocked: keyManager.isUnlocked(),
        publicKey: keyPair.publicKey,
        roles: me.roles || [],
        permissions: me.permissions || [],
        primaryRoleName: me.primaryRole?.name || null,
        name: me.name,
        isLoading: false,
        error: null,
        transcriptionEnabled: me.transcriptionEnabled,
        spokenLanguages: me.spokenLanguages || ['en'],
        uiLanguage: me.uiLanguage || 'en',
        profileCompleted: me.profileCompleted ?? true,
        onBreak: me.onBreak ?? false,
        callPreference: me.callPreference ?? 'phone',
        sessionExpiring: false,
        sessionExpired: false,
      })
    } catch (err) {
      setState(s => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Login failed',
      }))
    }
  }, [])

  // Unlock with PIN (primary day-to-day auth)
  const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
    const pubkey = await keyManager.unlock(pin)
    if (!pubkey) return false

    try {
      const me = await getMe()
      lastApiActivity.current = Date.now()
      setState({
        isKeyUnlocked: true,
        publicKey: pubkey,
        roles: me.roles || [],
        permissions: me.permissions || [],
        primaryRoleName: me.primaryRole?.name || null,
        name: me.name,
        isLoading: false,
        error: null,
        transcriptionEnabled: me.transcriptionEnabled,
        spokenLanguages: me.spokenLanguages || ['en'],
        uiLanguage: me.uiLanguage || 'en',
        profileCompleted: me.profileCompleted ?? true,
        onBreak: me.onBreak ?? false,
        callPreference: me.callPreference ?? 'phone',
        sessionExpiring: false,
        sessionExpired: false,
      })
      return true
    } catch {
      keyManager.lock()
      return false
    }
  }, [])

  const lockKey = useCallback(() => {
    keyManager.lock()
  }, [])

  const signInWithPasskey = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true, error: null }))
    try {
      const { token, pubkey } = await webauthnLogin()
      // Store session token (not nsec — user doesn't have it)
      sessionStorage.setItem('llamenos-session-token', token)
      const me = await getMe()
      lastApiActivity.current = Date.now()
      setState({
        isKeyUnlocked: false, // No nsec available — crypto locked
        publicKey: pubkey,
        roles: me.roles || [],
        permissions: me.permissions || [],
        primaryRoleName: me.primaryRole?.name || null,
        name: me.name,
        isLoading: false,
        error: null,
        transcriptionEnabled: me.transcriptionEnabled,
        spokenLanguages: me.spokenLanguages || ['en'],
        uiLanguage: me.uiLanguage || 'en',
        profileCompleted: me.profileCompleted ?? true,
        onBreak: me.onBreak ?? false,
        callPreference: me.callPreference ?? 'phone',
        sessionExpiring: false,
        sessionExpired: false,
      })
    } catch (err) {
      setState(s => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Passkey login failed',
      }))
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    try {
      const me = await getMe()
      lastApiActivity.current = Date.now()
      setState(s => ({
        ...s,
        name: me.name,
        roles: me.roles || [],
        permissions: me.permissions || [],
        primaryRoleName: me.primaryRole?.name || null,
        publicKey: me.pubkey,
        transcriptionEnabled: me.transcriptionEnabled,
        spokenLanguages: me.spokenLanguages || ['en'],
        uiLanguage: me.uiLanguage || 'en',
        profileCompleted: me.profileCompleted ?? true,
        onBreak: me.onBreak ?? false,
        callPreference: me.callPreference ?? 'phone',
        sessionExpiring: false,
        sessionExpired: false,
      }))
    } catch {
      // ignore — if the refresh fails the user stays on the current page
    }
  }, [])

  const renewSession = useCallback(async () => {
    try {
      const me = await getMe()
      lastApiActivity.current = Date.now()
      setState(s => ({
        ...s,
        name: me.name,
        roles: me.roles || [],
        permissions: me.permissions || [],
        primaryRoleName: me.primaryRole?.name || null,
        publicKey: me.pubkey,
        transcriptionEnabled: me.transcriptionEnabled,
        spokenLanguages: me.spokenLanguages || ['en'],
        uiLanguage: me.uiLanguage || 'en',
        profileCompleted: me.profileCompleted ?? true,
        onBreak: me.onBreak ?? false,
        callPreference: me.callPreference ?? 'phone',
        sessionExpiring: false,
        sessionExpired: false,
      }))
    } catch {
      // Renewal failed — session truly expired
      setState(s => ({ ...s, sessionExpired: true, sessionExpiring: false }))
    }
  }, [])

  const toggleBreak = useCallback(async () => {
    const newValue = !state.onBreak
    try {
      await updateMyAvailability(newValue)
      setState(s => ({ ...s, onBreak: newValue }))
    } catch {
      // ignore — toast handled by caller
      throw new Error('Failed to update availability')
    }
  }, [state.onBreak])

  const signOut = useCallback(() => {
    // Revoke server-side session token before clearing local state
    apiLogout()
    keyManager.lock()
    sessionStorage.removeItem('llamenos-session-token')
    // Clean up encrypted drafts from localStorage
    const draftKeys = Object.keys(localStorage).filter(k => k.startsWith('llamenos-draft:'))
    draftKeys.forEach(k => localStorage.removeItem(k))
    setState({
      isKeyUnlocked: false,
      publicKey: null,
      roles: [],
      permissions: [],
      primaryRoleName: null,
      name: null,
      isLoading: false,
      error: null,
      transcriptionEnabled: true,
      spokenLanguages: ['en'],
      uiLanguage: 'en',
      profileCompleted: true,
      onBreak: false,
      callPreference: 'phone',
      sessionExpiring: false,
      sessionExpired: false,
    })
  }, [])

  const hasSessionToken = typeof window !== 'undefined' && !!sessionStorage.getItem('llamenos-session-token')

  // Build a backward-compatible keyPair object from the key manager
  // This is deprecated — components should use keyManager.getSecretKey() directly
  let keyPair: KeyPair | null = null
  if (state.isKeyUnlocked) {
    try {
      const sk = keyManager.getSecretKey()
      const pk = keyManager.getPublicKeyHex()
      if (pk) {
        keyPair = {
          secretKey: sk,
          publicKey: pk,
          nsec: '', // Not exposed — recovery only
          npub: '', // Not exposed
        }
      }
    } catch {
      // Key became locked between render cycles
    }
  }

  const value: AuthContextValue = {
    ...state,
    signIn,
    signInWithPasskey,
    signOut,
    refreshProfile,
    toggleBreak,
    renewSession,
    unlockWithPin,
    lockKey,
    hasPermission: (permission: string) => permissionGranted(state.permissions, permission),
    isAdmin: permissionGranted(state.permissions, 'settings:manage'),
    isAuthenticated: (state.isKeyUnlocked || hasSessionToken) && state.roles.length > 0,
    hasNsec: state.isKeyUnlocked,
    keyPair,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
