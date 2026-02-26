import { useState, useEffect, useCallback, useRef } from 'react'
import { useNostrSubscription } from './nostr/hooks'
import { useConfig } from './config'
import { startRinging, stopRinging } from './notifications'
import {
  getMyShiftStatus,
  listActiveCalls,
  listConversations,
  answerCall as apiAnswerCall,
  hangupCall as apiHangupCall,
  reportCallSpam as apiReportSpam,
  type ActiveCall,
  type ShiftStatus,
  type Conversation,
} from './api'
import {
  KIND_CALL_RING,
  KIND_CALL_UPDATE,
  KIND_CALL_VOICEMAIL,
  KIND_MESSAGE_NEW,
  KIND_CONVERSATION_ASSIGNED,
  KIND_PRESENCE_UPDATE,
} from '@shared/nostr-events'
import type { LlamenosEvent } from './nostr/types'

/** All call-related Nostr event kinds */
const CALL_KINDS = [KIND_CALL_RING, KIND_CALL_UPDATE, KIND_CALL_VOICEMAIL, KIND_PRESENCE_UPDATE]

/** All conversation-related Nostr event kinds */
const CONVERSATION_KINDS = [KIND_MESSAGE_NEW, KIND_CONVERSATION_ASSIGNED]

/**
 * Hook to manage real-time call state via Nostr relay + REST polling fallback.
 *
 * Real-time updates arrive via Nostr subscription. REST polling (every 15s)
 * acts as a safety net for missed events or relay downtime.
 *
 * Call actions (answer, hangup, spam) are POST requests to REST endpoints.
 * The server is the sole authority for call state mutations.
 */
export function useCalls() {
  const [calls, setCalls] = useState<ActiveCall[]>([])
  const [currentCall, setCurrentCall] = useState<ActiveCall | null>(null)
  const { currentHubId } = useConfig()
  const currentCallRef = useRef(currentCall)
  currentCallRef.current = currentCall

  // --- Nostr subscription for real-time call events ---
  useNostrSubscription(currentHubId, CALL_KINDS, (_event, content: LlamenosEvent) => {
    switch (content.type) {
      case 'call:ring': {
        const call = content as LlamenosEvent & { callId: string; callerLast4?: string; startedAt: string }
        setCalls(prev => {
          if (prev.some(c => c.id === call.callId)) return prev
          return [...prev, {
            id: call.callId,
            callerNumber: '[redacted]',
            callerLast4: call.callerLast4,
            answeredBy: null,
            startedAt: call.startedAt,
            status: 'ringing' as const,
            hasTranscription: false,
            hasVoicemail: false,
          }]
        })
        startRinging('Incoming Call!')
        break
      }
      case 'call:update': {
        const update = content as LlamenosEvent & { callId: string; status: ActiveCall['status']; answeredBy?: string }
        setCalls(prev => {
          if (update.status === 'completed') {
            return prev.filter(c => c.id !== update.callId)
          }
          return prev.map(c =>
            c.id === update.callId
              ? { ...c, status: update.status, answeredBy: update.answeredBy ?? c.answeredBy }
              : c,
          )
        })
        if (update.status === 'in-progress' || update.status === 'completed') {
          stopRinging()
        }
        // Update current call tracking
        if (currentCallRef.current?.id === update.callId) {
          if (update.status === 'completed') {
            setCurrentCall(null)
          } else {
            setCurrentCall(prev => prev ? { ...prev, status: update.status, answeredBy: update.answeredBy ?? prev.answeredBy } : prev)
          }
        }
        break
      }
      case 'voicemail:new': {
        const vm = content as LlamenosEvent & { callId: string }
        setCalls(prev => prev.filter(c => c.id !== vm.callId))
        stopRinging()
        break
      }
    }
  })

  // --- REST polling fallback (every 15s) ---
  useEffect(() => {
    let mounted = true

    const poll = () => {
      listActiveCalls()
        .then(({ calls: polledCalls }) => {
          if (!mounted) return
          setCalls(prev => {
            const prevIds = prev.map(c => `${c.id}:${c.status}`).sort().join(',')
            const newIds = polledCalls.map(c => `${c.id}:${c.status}`).sort().join(',')
            return prevIds === newIds ? prev : polledCalls
          })
          setCurrentCall(prev => {
            if (!prev) return prev
            return polledCalls.some(c => c.id === prev.id) ? prev : null
          })
        })
        .catch(() => {})
    }

    poll() // Seed initial state on mount
    const interval = setInterval(poll, 15_000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  // --- Call actions via REST ---

  const answerCall = useCallback(async (callId: string) => {
    stopRinging()
    const call = calls.find(c => c.id === callId)
    if (call) {
      setCurrentCall({ ...call, status: 'in-progress' })
    }
    try {
      await apiAnswerCall(callId)
    } catch {
      // Revert optimistic update on failure
      setCurrentCall(null)
    }
  }, [calls])

  const hangupCall = useCallback(async (callId: string) => {
    setCurrentCall(null)
    try {
      await apiHangupCall(callId)
    } catch {
      // Call may already be ended — safe to ignore
    }
  }, [])

  const reportSpam = useCallback(async (callId: string) => {
    setCurrentCall(null)
    try {
      await apiReportSpam(callId)
    } catch {
      // Report may fail if call already ended — safe to ignore
    }
  }, [])

  return {
    calls,
    currentCall,
    answerCall,
    hangupCall,
    reportSpam,
    ringingCalls: calls.filter(c => c.status === 'ringing'),
    activeCalls: calls.filter(c => c.status === 'in-progress'),
  }
}

/**
 * Hook to fetch and periodically refresh the current user's shift status.
 */
export function useShiftStatus() {
  const [status, setStatus] = useState<ShiftStatus>({ onShift: false, currentShift: null, nextShift: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    function fetch() {
      getMyShiftStatus()
        .then(s => { if (mounted) { setStatus(s); setLoading(false) } })
        .catch(() => { if (mounted) setLoading(false) })
    }

    fetch()
    const interval = setInterval(fetch, 60_000) // Refresh every 60s
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  return { ...status, loading }
}

/**
 * Hook to manage real-time conversation state via Nostr relay + REST polling.
 *
 * Nostr delivers real-time updates (new messages, assignments, closures).
 * REST polling (every 30s) provides the full conversation list as a fallback.
 */
export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const { currentHubId } = useConfig()

  // --- Nostr subscription for conversation events ---
  useNostrSubscription(currentHubId, CONVERSATION_KINDS, (_event, content: LlamenosEvent) => {
    switch (content.type) {
      case 'conversation:new': {
        const { conversationId } = content as LlamenosEvent & { conversationId: string }
        // We don't have the full conversation object from the event —
        // trigger a re-fetch on the next poll cycle. For now, add a stub
        // that will be replaced by the poll.
        setConversations(prev => {
          if (prev.some(c => c.id === conversationId)) return prev
          // Return unchanged — the poll will pick up the full object
          return prev
        })
        break
      }
      case 'conversation:assigned': {
        const { conversationId, assignedTo } = content as LlamenosEvent & { conversationId: string; assignedTo: string }
        setConversations(prev =>
          prev.map(c => c.id === conversationId ? { ...c, assignedTo, status: 'active' as const } : c),
        )
        break
      }
      case 'conversation:closed': {
        const { conversationId } = content as LlamenosEvent & { conversationId: string }
        setConversations(prev => prev.filter(c => c.id !== conversationId))
        break
      }
      case 'message:new': {
        const { conversationId } = content as LlamenosEvent & { conversationId: string }
        setConversations(prev =>
          prev.map(c => c.id === conversationId
            ? { ...c, lastMessageAt: new Date().toISOString(), messageCount: c.messageCount + 1 }
            : c,
          ),
        )
        break
      }
    }
  })

  // --- REST polling fallback (every 30s) ---
  useEffect(() => {
    let mounted = true
    const poll = () => {
      listConversations()
        .then(({ conversations: polled }) => {
          if (mounted) setConversations(polled)
        })
        .catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 30_000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  const waitingConversations = conversations.filter(c => c.status === 'waiting')
  const activeConversations = conversations.filter(c => c.status === 'active')

  return {
    conversations,
    waitingConversations,
    activeConversations,
  }
}

/**
 * Hook for a call timer.
 */
export function useCallTimer(startedAt: string | null) {
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0)
      return
    }

    const start = new Date(startedAt).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    intervalRef.current = setInterval(tick, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [startedAt])

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  return { elapsed, formatted }
}
