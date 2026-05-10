import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/toast'

interface WebhookUrl {
  label: string
  url: string
}

interface WebhookConfirmationProps {
  urls: WebhookUrl[]
  visible: boolean
  onReconfigure?: () => void
}

export function WebhookConfirmation({ urls, visible, onReconfigure }: WebhookConfirmationProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  if (!visible || urls.length === 0) return null

  function handleCopy(url: string) {
    navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    toast(t('setup.webhookCopied'), 'success')
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  function handleCopyAll() {
    const allUrls = urls.map((u) => `${u.label}: ${u.url}`).join('\n')
    navigator.clipboard.writeText(allUrls)
    toast(t('setup.webhookCopied'), 'success')
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4" data-testid="webhook-confirmation">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{t('setup.webhooks.title', { defaultValue: 'Webhook URLs' })}</h4>
        <div className="flex gap-2">
          {onReconfigure && (
            <Button variant="ghost" size="sm" onClick={onReconfigure} className="text-xs h-7" data-testid="webhook-reconfigure-btn">
              <RefreshCw className="h-3 w-3" />
              {t('setup.webhooks.reconfigure', { defaultValue: 'Reconfigure' })}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleCopyAll} className="text-xs h-7" data-testid="webhook-copy-all-btn">
            <Copy className="h-3 w-3" />
            {t('setup.webhooks.copyAll', { defaultValue: 'Copy All' })}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('setup.webhooks.description', { defaultValue: 'Copy these URLs into your provider dashboard.' })}
      </p>

      <div className="space-y-2">
        {urls.map((webhook) => (
          <div
            key={webhook.url}
            className="flex items-center gap-2 rounded-md border bg-background p-2"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {webhook.label}
              </p>
              <code className="text-xs break-all">{webhook.url}</code>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => handleCopy(webhook.url)}
              aria-label={t('a11y.copyToClipboard')}
              data-testid={`webhook-copy-${webhook.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {copiedUrl === webhook.url ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
