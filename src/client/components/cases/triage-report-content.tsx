import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { decryptMessage } from '@/lib/platform'
import { getReportMessages, type Report, type ReportTypeDefinition } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatRelativeTime } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Lock, Loader2, FileText, Clock, User } from 'lucide-react'
import type { RecipientEnvelope } from '@shared/types'

interface TriageReportContentProps {
  report: Report
  reportType: ReportTypeDefinition | undefined
}

interface DecryptedMessage {
  id: string
  content: string
  authorPubkey: string
  createdAt: string
  hasAttachments: boolean
}

/**
 * Read-only display of an encrypted report's content.
 * Decrypts the first message (initial report body) and displays
 * report metadata (type, category, created time).
 */
export function TriageReportContent({ report, reportType }: TriageReportContentProps) {
  const { t } = useTranslation()
  const { publicKey } = useAuth()
  const [messages, setMessages] = useState<DecryptedMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [decryptError, setDecryptError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setDecryptError(false)

    getReportMessages(report.id, { limit: 50 })
      .then(async ({ messages: rawMsgs }) => {
        if (cancelled) return
        const decrypted: DecryptedMessage[] = []
        for (const msg of rawMsgs) {
          const plaintext = await decryptMessage(
            msg.encryptedContent,
            msg.readerEnvelopes as RecipientEnvelope[],
          )
          decrypted.push({
            id: msg.id,
            content: plaintext ?? t('triage.decryptFailed', { defaultValue: '[Unable to decrypt]' }),
            authorPubkey: msg.authorPubkey ?? '',
            createdAt: msg.createdAt,
            hasAttachments: (msg.attachmentIds?.length ?? 0) > 0,
          })
        }
        if (!cancelled) {
          setMessages(decrypted)
          if (decrypted.length > 0 && decrypted.every(m => m.content.startsWith('['))) {
            setDecryptError(true)
          }
        }
      })
      .catch(() => {
        if (!cancelled) setDecryptError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [report.id, t])

  if (loading) {
    return (
      <div data-testid="triage-report-content" className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div data-testid="triage-report-content" className="space-y-4">
      {/* Report metadata header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {reportType && (
            <Badge
              data-testid="triage-report-type-label"
              variant="secondary"
              className="gap-1.5"
              style={{
                borderColor: reportType.color ?? undefined,
                color: reportType.color ?? undefined,
                backgroundColor: reportType.color ? `${reportType.color}15` : undefined,
              }}
            >
              {reportType.icon && <span>{reportType.icon}</span>}
              {reportType.label}
            </Badge>
          )}
          {report.metadata.reportCategory && (
            <Badge variant="outline" className="text-xs">
              {report.metadata.reportCategory}
            </Badge>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(report.createdAt, t)}
          </span>
        </div>
        {report.metadata.reportTitle && (
          <h3 className="text-lg font-semibold">{report.metadata.reportTitle}</h3>
        )}
      </div>

      {/* Encrypted content notice */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        {t('triage.e2eeNotice', { defaultValue: 'Report content is end-to-end encrypted' })}
      </div>

      {/* Decryption error */}
      {decryptError && (
        <Card className="border-destructive/50">
          <CardContent className="py-3 text-sm text-destructive">
            {t('triage.decryptError', { defaultValue: 'Unable to decrypt report content. You may not have access to the encryption keys.' })}
          </CardContent>
        </Card>
      )}

      {/* Decrypted messages */}
      {messages.length > 0 && (
        <div className="space-y-3">
          {messages.map((msg) => (
            <Card key={msg.id}>
              <CardContent className="py-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span className="font-mono">{msg.authorPubkey.slice(0, 12)}...</span>
                  <span>&middot;</span>
                  <span>{formatRelativeTime(msg.createdAt, t)}</span>
                  {msg.hasAttachments && (
                    <>
                      <span>&middot;</span>
                      <FileText className="h-3 w-3" />
                    </>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* No messages */}
      {messages.length === 0 && !decryptError && (
        <div className="flex flex-col items-center py-8 text-muted-foreground">
          <FileText className="h-8 w-8 mb-2 text-muted-foreground/40" />
          <p className="text-sm">{t('triage.noMessages', { defaultValue: 'No messages in this report.' })}</p>
        </div>
      )}
    </div>
  )
}
