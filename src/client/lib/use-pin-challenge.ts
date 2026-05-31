/**
 * Hook for re-authentication via PIN challenge before sensitive operations.
 *
 * Usage:
 *   const { requirePin, PinChallengeDialog } = usePinChallenge()
 *   const ok = await requirePin()
 *   if (!ok) return // user cancelled or max attempts exceeded
 *
 * Attempt counting and lockout enforcement are handled entirely in Rust CryptoState
 * (unlock_with_pin IPC command). The Rust counter persists across page refreshes
 * because the Tauri process remains alive. The React state only tracks UI display state.
 */

import { useState, useCallback, useRef } from 'react'
import * as keyManager from './key-manager'

interface PinChallengeState {
  isOpen: boolean
  error: boolean
  lockoutMessage: string | null
}

interface PinChallengeReturn {
  /** Call this to require PIN entry. Returns true if verified, false if cancelled/failed. */
  requirePin: () => Promise<boolean>
  /** Whether the dialog is currently open */
  isOpen: boolean
  /** Whether the last attempt was wrong */
  error: boolean
  /** Lockout message from Rust (e.g. "Locked out. Try again in 30 seconds") */
  lockoutMessage: string | null
  /** Handle PIN completion (called by dialog component) */
  handleComplete: (pin: string) => Promise<void>
  /** Handle dialog cancel */
  handleCancel: () => void
}

export function usePinChallenge(): PinChallengeReturn {
  const [state, setState] = useState<PinChallengeState>({
    isOpen: false,
    error: false,
    lockoutMessage: null,
  })

  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const requirePin = useCallback((): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
      setState({ isOpen: true, error: false, lockoutMessage: null })
    })
  }, [])

  const handleComplete = useCallback(async (pin: string) => {
    try {
      const result = await keyManager.unlock(pin)

      if (result) {
        // PIN correct — Rust counter reset
        setState({ isOpen: false, error: false, lockoutMessage: null })
        resolveRef.current?.(true)
        resolveRef.current = null
      } else {
        // Wrong PIN — Rust incremented its counter
        setState(prev => ({ ...prev, error: true, lockoutMessage: null }))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)

      if (msg.includes('wiped') || msg.includes('Wiped')) {
        // Rust wiped keys after too many failures — lock JS state and close dialog
        keyManager.lock()
        setState({ isOpen: false, error: false, lockoutMessage: null })
        resolveRef.current?.(false)
        resolveRef.current = null
      } else if (msg.includes('Locked out') || msg.includes('locked')) {
        // Rust-enforced time-based lockout — display message, keep dialog open
        setState(prev => ({ ...prev, error: false, lockoutMessage: msg }))
      } else {
        // Unexpected error — treat as wrong PIN
        setState(prev => ({ ...prev, error: true, lockoutMessage: null }))
      }
    }
  }, [])

  const handleCancel = useCallback(() => {
    setState({ isOpen: false, error: false, lockoutMessage: null })
    resolveRef.current?.(false)
    resolveRef.current = null
  }, [])

  return {
    requirePin,
    isOpen: state.isOpen,
    error: state.error,
    lockoutMessage: state.lockoutMessage,
    handleComplete,
    handleCancel,
  }
}
