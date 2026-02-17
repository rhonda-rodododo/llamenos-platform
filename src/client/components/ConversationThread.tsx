import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { decryptTranscription, getStoredSession, keyPairFromNsec } from '@/lib/crypto'
import type { ConversationMessage } from '@/lib/api'
import { Lock, ArrowDown, ArrowUp, Loader2 } from 'lucide-react'

interface ConversationThreadProps {
  conversationId: string
  messages: ConversationMessage[]
  isLoading: boolean
}

export function ConversationThread({ conversationId, messages, isLoading }: ConversationThreadProps) {
  const { t } = useTranslation()
  const { keyPair, isAdmin } = useAuth()
  const [decryptedContent, setDecryptedContent] = useState<Map<string, string>>(new Map())
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollDown, setShowScrollDown] = useState(false)

  // Decrypt messages when they change
  useEffect(() => {
    if (messages.length === 0) return

    const secretKey = resolveSecretKey()
    if (!secretKey) return

    const newDecrypted = new Map<string, string>()

    for (const msg of messages) {
      // Try volunteer copy first, then admin copy
      const encrypted = isAdmin ? msg.encryptedContentAdmin : msg.encryptedContent
      const ephemeralPubkey = isAdmin ? msg.ephemeralPubkeyAdmin : msg.ephemeralPubkey

      if (encrypted && ephemeralPubkey) {
        const plaintext = decryptTranscription(encrypted, ephemeralPubkey, secretKey)
        if (plaintext !== null) {
          newDecrypted.set(msg.id, plaintext)
        } else {
          // Try the other copy as fallback
          const fallbackEncrypted = isAdmin ? msg.encryptedContent : msg.encryptedContentAdmin
          const fallbackEphemeral = isAdmin ? msg.ephemeralPubkey : msg.ephemeralPubkeyAdmin
          if (fallbackEncrypted && fallbackEphemeral) {
            const fallback = decryptTranscription(fallbackEncrypted, fallbackEphemeral, secretKey)
            if (fallback !== null) {
              newDecrypted.set(msg.id, fallback)
            }
          }
        }
      }
    }

    setDecryptedContent(newDecrypted)
  }, [messages, keyPair, isAdmin])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  // Track scroll position to show/hide scroll-down button
  function handleScroll() {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 100)
  }

  function scrollToBottom() {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }

  function resolveSecretKey(): Uint8Array | null {
    if (keyPair) return keyPair.secretKey
    const nsec = getStoredSession()
    if (!nsec) return null
    const kp = keyPairFromNsec(nsec)
    return kp?.secretKey ?? null
  }

  function formatTimestamp(iso: string): string {
    const date = new Date(iso)
    const now = new Date()
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()

    if (isToday) {
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        {t('conversations.noMessages', 'No messages yet')}
      </div>
    )
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {messages.map((msg) => {
          const isInbound = msg.direction === 'inbound'
          const text = decryptedContent.get(msg.id)
          const isEncrypted = text === undefined

          return (
            <div
              key={msg.id}
              className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  isInbound
                    ? 'bg-muted text-foreground rounded-bl-md'
                    : 'bg-primary text-primary-foreground rounded-br-md'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words">
                  {isEncrypted ? (
                    <span className="italic text-muted-foreground">{t('conversations.encrypted', '[Encrypted]')}</span>
                  ) : (
                    text
                  )}
                </p>
                <div
                  className={`mt-1 flex items-center gap-1.5 text-xs ${
                    isInbound ? 'text-muted-foreground' : 'text-primary-foreground/70'
                  }`}
                >
                  <Lock className="h-3 w-3" />
                  <span>{formatTimestamp(msg.createdAt)}</span>
                  {isInbound ? (
                    <ArrowDown className="h-3 w-3" />
                  ) : (
                    <ArrowUp className="h-3 w-3" />
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Scroll to bottom button */}
      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-background border border-border shadow-md p-2 hover:bg-muted transition-colors"
          aria-label={t('conversations.scrollToBottom', 'Scroll to bottom')}
        >
          <ArrowDown className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </div>
  )
}
