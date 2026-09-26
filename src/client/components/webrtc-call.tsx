import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import {
  initWebRtc,
  destroyWebRtc,
  acceptCall as webrtcAccept,
  hangupCall as webrtcHangup,
  toggleMute,
  onStateChange,
  getState,
  type WebRtcState,
} from '@/lib/webrtc'
import { PhoneCall, PhoneOff, Mic, MicOff, Monitor } from 'lucide-react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

/**
 * WebRTC status indicator shown in the dashboard header.
 * Shows connection state and provides controls for browser-based calling.
 */
export function WebRtcStatus() {
  const { t } = useTranslation()
  const { callPreference } = useAuth()
  const [state, setState] = useState<WebRtcState>(getState)

  useEffect(() => {
    return onStateChange((newState) => setState(newState))
  }, [])

  // Initialize WebRTC when call preference includes browser
  useEffect(() => {
    if (callPreference === 'browser' || callPreference === 'both') {
      initWebRtc()
    }
    return () => {
      if (callPreference !== 'phone') {
        destroyWebRtc()
      }
    }
  }, [callPreference])

  if (callPreference === 'phone') return null

  return (
    <div className="flex items-center gap-2">
      <Monitor className="h-4 w-4 text-muted-foreground" />
      <Badge
        variant="outline"
        data-testid="webrtc-status"
        data-state={state}
        className={
          state === 'ready'
            ? 'border-green-500/50 text-green-700 dark:text-green-400'
            : state === 'connected'
              ? 'border-blue-500/50 text-blue-700 dark:text-blue-400'
              : state === 'error'
                ? 'border-destructive/50 text-destructive'
                : 'border-border text-muted-foreground'
        }
      >
        <span className={`h-1.5 w-1.5 rounded-full ${
          state === 'ready'
            ? 'bg-green-500'
            : state === 'connected'
              ? 'bg-blue-500 animate-pulse'
              : state === 'error'
                ? 'bg-destructive'
                : 'bg-muted-foreground'
        }`} />
        {state === 'ready' && t('settings.callPrefBrowser')}
        {state === 'connected' && t('calls.active')}
        {state === 'initializing' && t('common.loading')}
        {state === 'error' && t('common.error')}
        {state === 'idle' && t('settings.callPrefBrowser')}
        {state === 'unsupported' && t('telephonyProvider.inAppAudioUnsupported')}
        {state === 'ringing' && t('calls.incoming')}
      </Badge>
    </div>
  )
}

/**
 * WebRTC call controls shown when there's an active browser call.
 * Provides mute/unmute and hangup buttons.
 */
export function WebRtcCallControls() {
  const { t } = useTranslation()
  const [state, setState] = useState<WebRtcState>(getState)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    return onStateChange((newState) => setState(newState))
  }, [])

  const handleMute = useCallback(() => {
    const newMuted = toggleMute()
    setMuted(newMuted)
  }, [])

  const handleHangup = useCallback(() => {
    webrtcHangup()
    setMuted(false)
  }, [])

  const handleAccept = useCallback(() => {
    webrtcAccept()
  }, [])

  if (state === 'ringing') {
    return (
      <div className="flex items-center gap-2">
        <Button
          onClick={handleAccept}
          className="animate-pulse bg-green-600 hover:bg-green-700"
          size="sm"
        >
          <PhoneCall className="h-4 w-4" />
          {t('calls.answer')}
        </Button>
      </div>
    )
  }

  if (state !== 'connected') return null

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleMute}
      >
        {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        {muted ? t('calls.unmute') : t('calls.mute')}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        onClick={handleHangup}
      >
        <PhoneOff className="h-4 w-4" />
        {t('calls.hangUp')}
      </Button>
    </div>
  )
}
