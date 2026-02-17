import { useState, useEffect, useCallback, useRef } from 'react'
import { onMessage, sendMessage } from './ws'
import { startRinging, stopRinging } from './notifications'
import { getMyShiftStatus, listActiveCalls, listConversations, type ActiveCall, type ShiftStatus, type Conversation } from './api'

/**
 * Hook to manage real-time call state via WebSocket.
 */
export function useCalls() {
  const [calls, setCalls] = useState<ActiveCall[]>([])
  const [currentCall, setCurrentCall] = useState<ActiveCall | null>(null)

  useEffect(() => {
    // Sync initial state
    const unsubSync = onMessage('calls:sync', (data) => {
      const { calls: syncCalls } = data as { calls: ActiveCall[] }
      setCalls(syncCalls)
    })

    const unsubIncoming = onMessage('call:incoming', (data) => {
      const call = data as ActiveCall
      setCalls(prev => [...prev, call])
      // Start ringing notification (generic text only — never pass caller PII)
      startRinging('Incoming Call!')
    })

    const unsubUpdate = onMessage('call:update', (data) => {
      const call = data as ActiveCall
      setCalls(prev => {
        if (call.status === 'completed') {
          return prev.filter(c => c.id !== call.id)
        }
        const idx = prev.findIndex(c => c.id === call.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = call
          return next
        }
        return [...prev, call]
      })

      // Stop ringing when call is answered or completed
      if (call.status === 'in-progress' || call.status === 'completed') {
        stopRinging()
      }

      // Update current call if it's the one we're on
      if (currentCall?.id === call.id) {
        if (call.status === 'completed') {
          setCurrentCall(null)
        } else {
          setCurrentCall(call)
        }
      }
    })

    return () => {
      unsubSync()
      unsubIncoming()
      unsubUpdate()
    }
  }, [currentCall])

  // Polling fallback — safety net when WS broadcasts are missed (e.g. DO hibernation)
  useEffect(() => {
    let mounted = true

    const poll = () => {
      listActiveCalls()
        .then(({ calls: polledCalls }) => {
          if (!mounted) return
          setCalls(prev => {
            // Only update if the call list actually changed
            const prevIds = prev.map(c => `${c.id}:${c.status}`).sort().join(',')
            const newIds = polledCalls.map(c => `${c.id}:${c.status}`).sort().join(',')
            return prevIds === newIds ? prev : polledCalls
          })
          // Clear currentCall if it's no longer in active list
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

  const answerCall = useCallback((callId: string) => {
    sendMessage('call:answer', { callId })
    stopRinging()
    const call = calls.find(c => c.id === callId)
    if (call) {
      setCurrentCall({ ...call, status: 'in-progress' })
    }
  }, [calls])

  const hangupCall = useCallback((callId: string) => {
    sendMessage('call:hangup', { callId })
    setCurrentCall(null)
  }, [])

  const reportSpam = useCallback((callId: string) => {
    sendMessage('call:reportSpam', { callId })
    setCurrentCall(null)
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
 * Hook to manage real-time conversation state via WebSocket.
 */
export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([])

  useEffect(() => {
    // Initial sync from WebSocket
    const unsubSync = onMessage('conversations:sync', (data) => {
      const { conversations: syncConvs } = data as { conversations: Conversation[] }
      setConversations(syncConvs)
    })

    // New conversation waiting
    const unsubNew = onMessage('conversation:new', (data) => {
      const conv = data as Conversation
      setConversations(prev => {
        if (prev.some(c => c.id === conv.id)) return prev
        return [...prev, conv]
      })
    })

    // Conversation assigned
    const unsubAssigned = onMessage('conversation:assigned', (data) => {
      const { conversationId, assignedTo } = data as { conversationId: string; assignedTo: string }
      setConversations(prev =>
        prev.map(c => c.id === conversationId ? { ...c, assignedTo, status: 'active' as const } : c)
      )
    })

    // Conversation closed
    const unsubClosed = onMessage('conversation:closed', (data) => {
      const { conversationId } = data as { conversationId: string }
      setConversations(prev => prev.filter(c => c.id !== conversationId))
    })

    // New message in conversation
    const unsubMessage = onMessage('message:new', (data) => {
      const { conversationId } = data as { conversationId: string }
      setConversations(prev =>
        prev.map(c => c.id === conversationId
          ? { ...c, lastMessageAt: new Date().toISOString(), messageCount: c.messageCount + 1 }
          : c
        )
      )
    })

    return () => {
      unsubSync()
      unsubNew()
      unsubAssigned()
      unsubClosed()
      unsubMessage()
    }
  }, [])

  // Polling fallback
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
