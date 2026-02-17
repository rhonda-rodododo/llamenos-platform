import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { useConfig } from '@/lib/config'
import { useConversations } from '@/lib/hooks'
import { useState, useEffect, useCallback } from 'react'
import {
  getConversationMessages,
  sendConversationMessage,
  claimConversation,
  updateConversation,
  type ConversationMessage,
} from '@/lib/api'
import { encryptForPublicKey } from '@/lib/crypto'
import { useToast } from '@/lib/toast'
import { ConversationList } from '@/components/ConversationList'
import { ConversationThread } from '@/components/ConversationThread'
import { MessageComposer } from '@/components/MessageComposer'
import { ChannelBadge } from '@/components/ChannelBadge'
import { MessageSquare, X, UserCheck, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export const Route = createFileRoute('/conversations')({
  component: ConversationsPage,
})

function ConversationsPage() {
  const { t } = useTranslation()
  const { isAdmin, keyPair } = useAuth()
  const { channels } = useConfig()
  const { toast } = useToast()
  const { conversations, waitingConversations } = useConversations()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)

  const selectedConv = conversations.find(c => c.id === selectedId)

  // Load messages when conversation is selected
  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }

    setMessagesLoading(true)
    getConversationMessages(selectedId, { limit: 100 })
      .then(({ messages: msgs }) => setMessages(msgs))
      .catch(() => toast(t('conversations.loadError', { defaultValue: 'Failed to load messages' }), 'error'))
      .finally(() => setMessagesLoading(false))
  }, [selectedId, t, toast])

  // Refresh messages periodically when a conversation is selected
  useEffect(() => {
    if (!selectedId) return
    const interval = setInterval(() => {
      getConversationMessages(selectedId, { limit: 100 })
        .then(({ messages: msgs }) => setMessages(msgs))
        .catch(() => {})
    }, 10_000)
    return () => clearInterval(interval)
  }, [selectedId])

  const handleClaim = useCallback(async (convId: string) => {
    try {
      await claimConversation(convId)
      toast(t('conversations.claimed', { defaultValue: 'Conversation claimed' }))
    } catch {
      toast(t('conversations.claimError', { defaultValue: 'Failed to claim conversation' }), 'error')
    }
  }, [t, toast])

  const handleClose = useCallback(async (convId: string) => {
    try {
      await updateConversation(convId, { status: 'closed' })
      if (selectedId === convId) setSelectedId(null)
      toast(t('conversations.closed', { defaultValue: 'Conversation closed' }))
    } catch {
      toast(t('conversations.closeError', { defaultValue: 'Failed to close conversation' }), 'error')
    }
  }, [selectedId, t, toast])

  const handleSend = useCallback(async (data: {
    encryptedContent: string
    ephemeralPubkey: string
    encryptedContentAdmin: string
    ephemeralPubkeyAdmin: string
    plaintextForSending?: string
  }) => {
    if (!selectedId) return
    try {
      const msg = await sendConversationMessage(selectedId, data)
      setMessages(prev => [msg, ...prev])
    } catch {
      toast(t('conversations.sendError', { defaultValue: 'Failed to send message' }), 'error')
    }
  }, [selectedId, t, toast])

  // Wrapper that handles encryption before sending
  const handleComposerSend = useCallback((data: { plaintextForSending?: string }) => {
    if (!data.plaintextForSending || !keyPair) return

    const plaintext = data.plaintextForSending

    // Encrypt for the current user (volunteer/admin)
    const myEncrypted = encryptForPublicKey(plaintext, keyPair.publicKey)

    // Encrypt admin copy — if we're admin, use same; otherwise, duplicate for now
    const adminEncrypted = myEncrypted

    handleSend({
      encryptedContent: myEncrypted.encryptedContent,
      ephemeralPubkey: myEncrypted.ephemeralPubkey,
      encryptedContentAdmin: adminEncrypted.encryptedContent,
      ephemeralPubkeyAdmin: adminEncrypted.ephemeralPubkey,
      plaintextForSending: plaintext,
    })
  }, [keyPair, handleSend])

  const hasAnyMessaging = channels.sms || channels.whatsapp || channels.signal || channels.reports

  if (!hasAnyMessaging) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">
          {t('conversations.noChannels', { defaultValue: 'No messaging channels enabled' })}
        </h2>
        <p className="text-muted-foreground max-w-md">
          {t('conversations.noChannelsDescription', { defaultValue: 'Enable SMS, WhatsApp, Signal, or Reports in Admin Settings to start receiving messages.' })}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Conversation list sidebar */}
      <div className="w-80 shrink-0 overflow-y-auto rounded-lg border border-border bg-card">
        <div className="sticky top-0 z-10 border-b border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              {t('conversations.title', { defaultValue: 'Conversations' })}
            </h2>
            <div className="flex gap-1">
              {waitingConversations.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {waitingConversations.length} {t('conversations.waiting', { defaultValue: 'waiting' })}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <ConversationList
          conversations={conversations}
          onSelect={setSelectedId}
          selectedId={selectedId ?? undefined}
        />
      </div>

      {/* Conversation detail */}
      <div className="flex flex-1 flex-col rounded-lg border border-border bg-card overflow-hidden">
        {selectedConv ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <ChannelBadge channelType={selectedConv.channelType} />
                <div>
                  <p className="font-medium">
                    {selectedConv.contactLast4 ? `...${selectedConv.contactLast4}` : t('conversations.unknownContact', { defaultValue: 'Unknown' })}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    {t('conversations.e2ee', { defaultValue: 'End-to-end encrypted' })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedConv.status === 'waiting' && (
                  <Button size="sm" onClick={() => handleClaim(selectedConv.id)}>
                    <UserCheck className="h-3.5 w-3.5 mr-1" />
                    {t('conversations.claim', { defaultValue: 'Claim' })}
                  </Button>
                )}
                {selectedConv.status === 'active' && (
                  <Button size="sm" variant="outline" onClick={() => handleClose(selectedConv.id)}>
                    <X className="h-3.5 w-3.5 mr-1" />
                    {t('conversations.close', { defaultValue: 'Close' })}
                  </Button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-hidden">
              <ConversationThread
                conversationId={selectedConv.id}
                messages={messages}
                isLoading={messagesLoading}
              />
            </div>

            {/* Composer */}
            {selectedConv.status === 'active' && (
              <div className="border-t border-border p-3">
                <MessageComposer
                  onSend={handleComposerSend}
                  disabled={!selectedConv.assignedTo}
                  channelType={selectedConv.channelType}
                />
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="h-10 w-10 mb-3" />
            <p>{t('conversations.selectConversation', { defaultValue: 'Select a conversation to view messages' })}</p>
          </div>
        )}
      </div>
    </div>
  )
}
