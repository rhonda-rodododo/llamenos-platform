/**
 * Self-hosted Whisper transcription client.
 * Sends audio to a faster-whisper container via OpenAI-compatible API.
 * Implements the TranscriptionService interface.
 */
import type { TranscriptionService } from '../types'

export function createTranscriptionService(opts?: {
  whisperUrl?: string
}): TranscriptionService {
  const whisperUrl = opts?.whisperUrl || process.env.WHISPER_URL || 'http://localhost:8080/v1/audio/transcriptions'

  return {
    async run(_model: string, input: { audio: number[] }): Promise<{ text: string }> {
      // Convert number array back to Uint8Array
      const audioBytes = new Uint8Array(input.audio)

      // Build multipart form data
      const formData = new FormData()
      const blob = new Blob([audioBytes], { type: 'audio/wav' })
      formData.append('file', blob, 'audio.wav')
      formData.append('model', 'Systran/faster-whisper-base')
      formData.append('response_format', 'json')

      const response = await fetch(whisperUrl, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Whisper transcription failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json() as { text: string }
      return { text: result.text || '' }
    },
  }
}
