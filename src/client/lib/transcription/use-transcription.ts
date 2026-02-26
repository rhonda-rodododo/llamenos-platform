/**
 * React hook for client-side transcription integration.
 *
 * Usage:
 *   const { startTranscription, stopTranscription, transcript, status } = useTranscription()
 *
 *   // On call answer:
 *   await startTranscription()
 *
 *   // On call end:
 *   const fullText = await stopTranscription()
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import {
  TranscriptionManager,
  type TranscriptionModel,
  type TranscriptionStatus,
  type TranscriptionProgress,
} from './transcription-manager'

export interface TranscriptionSettings {
  enabled: boolean
  model: TranscriptionModel
  language: string
}

const STORAGE_KEY = 'llamenos:client-transcription'

export function getClientTranscriptionSettings(): TranscriptionSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored) as TranscriptionSettings
  } catch { /* ignore */ }
  return { enabled: false, model: 'tiny.en', language: 'en' }
}

export function setClientTranscriptionSettings(settings: Partial<TranscriptionSettings>): TranscriptionSettings {
  const current = getClientTranscriptionSettings()
  const updated = { ...current, ...settings }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}

export function useTranscription() {
  const managerRef = useRef<TranscriptionManager | null>(null)
  const [status, setStatus] = useState<TranscriptionStatus>('idle')
  const [transcript, setTranscript] = useState('')
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState(getClientTranscriptionSettings)

  // Clean up on unmount
  useEffect(() => {
    return () => {
      managerRef.current?.dispose()
    }
  }, [])

  const updateSettings = useCallback((updates: Partial<TranscriptionSettings>) => {
    const updated = setClientTranscriptionSettings(updates)
    setSettings(updated)
  }, [])

  /**
   * Initialize model and start capturing microphone audio.
   * Call when volunteer answers a call.
   */
  const startTranscription = useCallback(async () => {
    if (!TranscriptionManager.isSupported()) {
      setError('Browser does not support client-side transcription')
      return
    }

    const currentSettings = getClientTranscriptionSettings()
    if (!currentSettings.enabled) return

    // Dispose previous instance if any
    if (managerRef.current) {
      await managerRef.current.dispose()
    }

    const manager = new TranscriptionManager({
      model: currentSettings.model,
      language: currentSettings.language,
      onStatusChange: setStatus,
      onProgress: setProgress,
      onSegment: (_index, _text) => {
        // Update running transcript as segments arrive
        setTranscript(manager.getTranscript())
      },
      onError: (err) => setError(err),
    })

    managerRef.current = manager

    try {
      setError(null)
      setTranscript('')
      await manager.initialize()
      await manager.startCapture()
    } catch {
      // Error already handled via onError callback
    }
  }, [])

  /**
   * Stop capturing, finalize transcript, clean up resources.
   * Call when volunteer hangs up. Returns the full transcript text.
   */
  const stopTranscription = useCallback(async (): Promise<string> => {
    const manager = managerRef.current
    if (!manager) return ''

    try {
      const text = await manager.finalize()
      setTranscript(text)
      // Free ~89MB of memory
      await manager.dispose()
      managerRef.current = null
      return text
    } catch {
      return manager.getTranscript()
    }
  }, [])

  /**
   * Cancel transcription without waiting for finalization.
   */
  const cancelTranscription = useCallback(async () => {
    if (managerRef.current) {
      await managerRef.current.dispose()
      managerRef.current = null
    }
    setStatus('idle')
    setTranscript('')
    setProgress(null)
    setError(null)
  }, [])

  return {
    // State
    status,
    transcript,
    progress,
    error,
    settings,
    isSupported: TranscriptionManager.isSupported(),

    // Actions
    startTranscription,
    stopTranscription,
    cancelTranscription,
    updateSettings,
  }
}
