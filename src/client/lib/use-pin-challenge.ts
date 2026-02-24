/**
 * Hook for re-authentication via PIN challenge before sensitive operations.
 *
 * Usage:
 *   const { requirePin, PinChallengeDialog } = usePinChallenge()
 *   const ok = await requirePin()
 *   if (!ok) return // user cancelled or max attempts exceeded
 */

import { useState, useCallback, useRef } from 'react'
import * as keyManager from './key-manager'

const MAX_ATTEMPTS = 3

interface PinChallengeState {
  isOpen: boolean
  attempts: number
  error: boolean
}

interface PinChallengeReturn {
  /** Call this to require PIN entry. Returns true if verified, false if cancelled/failed. */
  requirePin: () => Promise<boolean>
  /** Whether the dialog is currently open */
  isOpen: boolean
  /** Current PIN attempt count */
  attempts: number
  /** Whether the last attempt was wrong */
  error: boolean
  /** Handle PIN completion (called by dialog component) */
  handleComplete: (pin: string) => Promise<void>
  /** Handle dialog cancel */
  handleCancel: () => void
}

export function usePinChallenge(): PinChallengeReturn {
  const [state, setState] = useState<PinChallengeState>({
    isOpen: false,
    attempts: 0,
    error: false,
  })

  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const requirePin = useCallback((): Promise<boolean> => {
    // If key manager is already unlocked, verify via unlock (re-enter PIN)
    // The key needs to be re-verified even if unlocked
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
      setState({ isOpen: true, attempts: 0, error: false })
    })
  }, [])

  const handleComplete = useCallback(async (pin: string) => {
    // Try to verify the PIN by attempting unlock
    // If already unlocked, we need to verify against stored key
    const result = await keyManager.unlock(pin)

    if (result) {
      // PIN correct
      setState({ isOpen: false, attempts: 0, error: false })
      resolveRef.current?.(true)
      resolveRef.current = null
    } else {
      // Wrong PIN
      setState(prev => {
        const newAttempts = prev.attempts + 1
        if (newAttempts >= MAX_ATTEMPTS) {
          // Max attempts exceeded — close dialog, wipe key
          keyManager.wipeKey()
          resolveRef.current?.(false)
          resolveRef.current = null
          return { isOpen: false, attempts: 0, error: false }
        }
        return { ...prev, attempts: newAttempts, error: true }
      })
    }
  }, [])

  const handleCancel = useCallback(() => {
    setState({ isOpen: false, attempts: 0, error: false })
    resolveRef.current?.(false)
    resolveRef.current = null
  }, [])

  return {
    requirePin,
    isOpen: state.isOpen,
    attempts: state.attempts,
    error: state.error,
    handleComplete,
    handleCancel,
  }
}
