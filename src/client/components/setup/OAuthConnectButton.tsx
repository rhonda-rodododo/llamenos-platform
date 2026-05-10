import { useCallback, useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/toast'
import { startOAuth, getOAuthStatus } from '@/lib/api/provider-setup'
import { TELEPHONY_PROVIDER_LABELS } from '@shared/types'
import type { TelephonyProviderType } from '@shared/types'

interface OAuthConnectButtonProps {
  provider: TelephonyProviderType
  hubId?: string
  onConnected: (result: { accountName?: string }) => void
  onError: (error: string) => void
}

type ConnectionStatus = 'idle' | 'loading' | 'connected' | 'error'

export function OAuthConnectButton({ provider, hubId, onConnected, onError }: OAuthConnectButtonProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startPolling = useCallback(
    (stateId: string) => {
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const state = await getOAuthStatus(stateId)
          if (state.status === 'token_exchanged') {
            stopPolling()
            setStatus('connected')
            setAuthUrl(null)
            onConnected({})
          } else if (state.status === 'failed' || state.status === 'expired') {
            stopPolling()
            setStatus('error')
            const errMsg = state.error || t('setup.oauth.failed')
            setError(errMsg)
            onError(errMsg)
          }
        } catch {
          // Continue polling
        }
      }, 3000)
    },
    [stopPolling, onConnected, onError, t],
  )

  const handleConnect = useCallback(async () => {
    setStatus('loading')
    setError(null)
    setAuthUrl(null)

    try {
      const redirectUrl = `${window.location.origin}/oauth/callback`
      const result = await startOAuth(provider, redirectUrl, hubId)
      setAuthUrl(result.authUrl)
      window.open(result.authUrl, '_blank', 'noopener,noreferrer')
      startPolling(result.stateId)
    } catch (err) {
      setStatus('error')
      const errMsg = err instanceof Error ? err.message : t('setup.oauth.connectionFailed')
      setError(errMsg)
      onError(errMsg)
    }
  }, [provider, hubId, startPolling, onError, t])

  const handleCheckStatus = useCallback(async () => {
    if (!authUrl) return
    setStatus('loading')
    try {
      // Extract state from authUrl
      const url = new URL(authUrl)
      const stateId = url.searchParams.get('state')
      if (stateId) {
        const state = await getOAuthStatus(stateId)
        if (state.status === 'token_exchanged') {
          stopPolling()
          setStatus('connected')
          setAuthUrl(null)
          onConnected({})
        } else if (state.status === 'failed' || state.status === 'expired') {
          stopPolling()
          setStatus('error')
          const errMsg = state.error || t('setup.oauth.failed')
          setError(errMsg)
          onError(errMsg)
        } else {
          toast(t('setup.oauth.stillPending'), 'info')
          setStatus('idle')
        }
      }
    } catch (err) {
      setStatus('error')
      const errMsg = err instanceof Error ? err.message : t('setup.oauth.connectionFailed')
      setError(errMsg)
      onError(errMsg)
    }
  }, [authUrl, stopPolling, onConnected, onError, toast, t])

  const providerLabel = TELEPHONY_PROVIDER_LABELS[provider]

  return (
    <div className="space-y-3" data-testid="oauth-connect-button">
      <div className="flex items-center gap-3">
        <Button
          variant={status === 'connected' ? 'outline' : 'default'}
          size="sm"
          onClick={handleConnect}
          disabled={status === 'loading'}
          data-testid="oauth-connect-btn"
        >
          {status === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status === 'connected' ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : status === 'error' ? (
            <XCircle className="h-4 w-4 text-destructive" />
          ) : null}
          {status === 'loading'
            ? t('setup.oauth.connecting', { defaultValue: 'Connecting...' })
            : status === 'connected'
              ? t('setup.oauth.connected', { provider: providerLabel, defaultValue: `${providerLabel} connected` })
              : status === 'error'
                ? t('setup.oauth.retry', { provider: providerLabel, defaultValue: `Retry ${providerLabel}` })
                : t('setup.oauth.connect', { provider: providerLabel, defaultValue: `Connect ${providerLabel}` })}
        </Button>

        {authUrl && status !== 'connected' && (
          <>
            <Button variant="ghost" size="sm" onClick={handleCheckStatus} data-testid="oauth-check-status-btn">
              {t('setup.oauth.checkStatus', { defaultValue: 'Check status' })}
            </Button>
            <a
              href={authUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              {t('setup.oauth.openAuth', { defaultValue: 'Open auth' })}
            </a>
          </>
        )}
      </div>

      {status === 'connected' && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
          <p className="text-xs text-green-700 dark:text-green-400">
            {t('setup.oauth.credentialsValid', { provider: providerLabel, defaultValue: `${providerLabel} connected successfully` })}
          </p>
        </div>
      )}

      {status === 'error' && error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
    </div>
  )
}
