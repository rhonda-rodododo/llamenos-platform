import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Lock, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MessageComposerProps {
  onSend: (plaintext: string) => void
  disabled?: boolean
  channelType: string
}

export function MessageComposer({ onSend, disabled = false, channelType }: MessageComposerProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [text, adjustHeight])

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return

    onSend(trimmed)

    setText('')
    // Reset textarea height after clearing
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const isMac = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac')
  const modKey = isMac ? '\u2318' : 'Ctrl'
  const canSend = text.trim().length > 0 && !disabled

  return (
    <div className="border-t border-border bg-background px-4 py-3">
      <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        <span>{t('notes.encryptionNote')}</span>
        <span className="mx-1">·</span>
        <span className="capitalize">{channelType}</span>
      </div>

      <div className="flex items-end gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={t('common.add')}
          className="shrink-0 text-muted-foreground"
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('notes.notePlaceholder')}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />

        <Button
          size="icon-sm"
          disabled={!canSend}
          onClick={handleSend}
          aria-label={t('common.submit')}
          className="shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      <p className="mt-1.5 text-[11px] text-muted-foreground text-right">
        {modKey}+Enter
      </p>
    </div>
  )
}
