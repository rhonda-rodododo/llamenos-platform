/**
 * Self-hosted Whisper transcription client.
 * Sends audio to a faster-whisper container via OpenAI-compatible API.
 * Implements the TranscriptionService interface.
 */
import type { TranscriptionService } from '../types'

/**
 * Validate that the Whisper URL points to a trusted internal host.
 * Prevents SSRF by restricting to localhost, Docker service names, and private IPs.
 */
function validateWhisperUrl(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Unsupported protocol: ${parsed.protocol}`)
    }
    const host = parsed.hostname
    // Allow localhost, Docker Compose service names (single word), and private IPs
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1'
    const isDockerService = /^[a-z][a-z0-9_-]*$/.test(host)
    const isPrivateIP = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host)
    if (!isLocalhost && !isDockerService && !isPrivateIP) {
      throw new Error(`Whisper URL must point to a trusted internal host, got: ${host}`)
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`Invalid Whisper URL: ${url}`)
    }
    throw err
  }
}

export function createTranscriptionService(opts?: {
  whisperUrl?: string
}): TranscriptionService {
  const whisperUrl = opts?.whisperUrl || process.env.WHISPER_URL || 'http://localhost:8080/v1/audio/transcriptions'
  validateWhisperUrl(whisperUrl)

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
