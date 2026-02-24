import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getCallRecording } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Play, Pause, AlertCircle, Loader2 } from 'lucide-react'

interface RecordingPlayerProps {
  callId: string
}

export function RecordingPlayer({ callId }: RecordingPlayerProps) {
  const { t } = useTranslation()
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Clean up Blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [blobUrl])

  const fetchRecording = useCallback(async () => {
    if (blobUrl) return // Already fetched
    setLoading(true)
    setError(false)
    try {
      const audioData = await getCallRecording(callId)
      const blob = new Blob([audioData], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)
      setBlobUrl(url)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [callId, blobUrl])

  const handlePlayPause = useCallback(async () => {
    if (!blobUrl) {
      await fetchRecording()
      return
    }
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      await audio.play()
      setPlaying(true)
    }
  }, [blobUrl, playing, fetchRecording])

  const handleEnded = useCallback(() => {
    setPlaying(false)
  }, [])

  // Auto-play once blob URL is set after initial fetch
  useEffect(() => {
    if (blobUrl && audioRef.current && !playing && loading === false) {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => {})
    }
  }, [blobUrl])

  if (error) {
    return (
      <div
        data-testid="recording-player"
        className="flex items-center gap-2 text-sm text-destructive"
      >
        <AlertCircle className="h-4 w-4" />
        {t('recording.error')}
      </div>
    )
  }

  return (
    <div data-testid="recording-player" className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handlePlayPause}
        disabled={loading}
        data-testid="recording-play-btn"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {loading
          ? t('recording.loading')
          : playing
            ? t('recording.pause')
            : t('recording.play')}
      </Button>
      {blobUrl && (
        <audio
          ref={audioRef}
          src={blobUrl}
          onEnded={handleEnded}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          className="hidden"
        />
      )}
    </div>
  )
}
