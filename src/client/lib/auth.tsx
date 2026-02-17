import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { type KeyPair, keyPairFromNsec, getStoredSession, storeSession, clearSession, createAuthToken } from './crypto'
import { getMe, login, logout as apiLogout, updateMyAvailability, setOnAuthExpired, setOnApiActivity } from './api'
import { loginWithPasskey as webauthnLogin } from './webauthn'

interface AuthState {
  keyPair: KeyPair | null
  role: 'volunteer' | 'admin' | 'reporter' | null
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
  isAdmin: boolean
  isAuthenticated: boolean
  hasNsec: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    keyPair: null,
    role: null,
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

  // Register auth expiry callback — called by api.ts when a 401 is received
  useEffect(() => {
    setOnAuthExpired(() => {
      // Don't clear nsec from sessionStorage — allow reconnect
      const hasNsec = !!getStoredSession()
      setState(s => ({
        ...s,
        sessionExpired: true,
        sessionExpiring: false,
        // Keep keyPair if nsec is available for reconnect
        ...(hasNsec ? {} : { keyPair: null, role: null, name: null }),
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
    if (!state.keyPair && !sessionStorage.getItem('llamenos-session-token')) return
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastApiActivity.current
      const WARN_THRESHOLD = 4 * 60 * 1000 // 4 minutes
      if (elapsed >= WARN_THRESHOLD && !state.sessionExpired) {
        setState(s => ({ ...s, sessionExpiring: true }))
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [state.keyPair, state.sessionExpired])

  // Restore session on mount
  useEffect(() => {
    // Try nsec first
    const nsec = getStoredSession()
    if (nsec) {
      const keyPair = keyPairFromNsec(nsec)
      if (keyPair) {
        getMe()
          .then((me) => {
            lastApiActivity.current = Date.now()
            setState({
              keyPair,
              role: me.role,
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
            clearSession()
            setState(s => ({ ...s, keyPair: null, isLoading: false }))
          })
        return
      }
    }
    // Try session token (WebAuthn session)
    const sessionToken = sessionStorage.getItem('llamenos-session-token')
    if (sessionToken) {
      getMe()
        .then((me) => {
          lastApiActivity.current = Date.now()
          setState({
            keyPair: null,
            role: me.role,
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
    setState(s => ({ ...s, isLoading: false }))
  }, [])

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
      const result = await login(parsed.pubkey, parsed.token)
      storeSession(nsec)
      const me = await getMe()
      lastApiActivity.current = Date.now()
      setState({
        keyPair,
        role: result.role,
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

  const signInWithPasskey = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true, error: null }))
    try {
      const { token, pubkey } = await webauthnLogin()
      // Store session token (not nsec — user doesn't have it)
      sessionStorage.setItem('llamenos-session-token', token)
      const me = await getMe()
      lastApiActivity.current = Date.now()
      setState({
        keyPair: null, // No nsec available
        role: me.role,
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
        role: me.role,
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
      const nsec = getStoredSession()
      const kp = nsec ? keyPairFromNsec(nsec) : null
      setState(s => ({
        ...s,
        keyPair: kp || s.keyPair,
        name: me.name,
        role: me.role,
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
    clearSession()
    sessionStorage.removeItem('llamenos-session-token')
    // Clean up encrypted drafts from localStorage
    const draftKeys = Object.keys(localStorage).filter(k => k.startsWith('llamenos-draft:'))
    draftKeys.forEach(k => localStorage.removeItem(k))
    setState({
      keyPair: null,
      role: null,
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

  const value: AuthContextValue = {
    ...state,
    signIn,
    signInWithPasskey,
    signOut,
    refreshProfile,
    toggleBreak,
    renewSession,
    isAdmin: state.role === 'admin',
    isAuthenticated: (state.keyPair !== null || hasSessionToken) && state.role !== null,
    hasNsec: state.keyPair !== null,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
