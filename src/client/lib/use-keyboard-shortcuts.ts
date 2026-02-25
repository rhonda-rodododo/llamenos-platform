import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from './auth'
import { useNoteSheet } from './note-sheet-context'
import { getRingingCallIds, getCurrentCallId } from './call-state'
import { answerCall, hangupCall } from './api'
import { stopRinging } from './notifications'

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const { isAuthenticated, onBreak, toggleBreak } = useAuth()
  const noteSheet = useNoteSheet()

  useEffect(() => {
    if (!isAuthenticated) return

    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey

      // Escape — close sheet (always works)
      if (e.key === 'Escape' && noteSheet.isOpen) {
        e.preventDefault()
        noteSheet.close()
        return
      }

      // Skip shortcuts when focused on inputs (except Escape above)
      if (isInputFocused()) return

      // Alt+N — New note
      if (e.altKey && e.key === 'n' && !mod && !e.shiftKey) {
        e.preventDefault()
        noteSheet.openNewNote()
        return
      }

      // Ctrl/Cmd+Shift+F — Search notes
      if (mod && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        navigate({ to: '/notes', search: { page: 1, callId: '', search: '' } })
        // Focus the search input after navigation
        setTimeout(() => {
          const input = document.querySelector('[data-slot="sheet-content"] input, .pl-9') as HTMLInputElement | null
          input?.focus()
        }, 100)
        return
      }

      // Ctrl/Cmd+Shift+A — Answer call
      if (mod && e.shiftKey && e.key === 'A') {
        const ringing = getRingingCallIds()
        if (ringing.length > 0) {
          e.preventDefault()
          answerCall(ringing[0]).catch(() => {})
          stopRinging()
        }
        return
      }

      // Ctrl/Cmd+Shift+H — Hang up
      if (mod && e.shiftKey && e.key === 'H') {
        const currentId = getCurrentCallId()
        if (currentId) {
          e.preventDefault()
          hangupCall(currentId).catch(() => {})
        }
        return
      }

      // Ctrl/Cmd+Shift+B — Toggle break
      if (mod && e.shiftKey && e.key === 'B') {
        e.preventDefault()
        toggleBreak().catch(() => {})
        return
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isAuthenticated, onBreak, toggleBreak, noteSheet, navigate])
}
