import { describe, it, expect, vi } from 'vitest'

const { mockGetTelephonyFromService } = vi.hoisted(() => ({
  mockGetTelephonyFromService: vi.fn(),
}))
vi.mock('@worker/lib/service-factories', () => ({
  getTelephonyFromService: mockGetTelephonyFromService,
}))

vi.mock('@worker/lib/crypto', () => ({
  encryptMessageForStorage: vi.fn().mockReturnValue({
    encryptedContent: 'enc',
    readerEnvelopes: [],
  }),
}))

import { maybeTranscribe, transcribeVoicemail } from '@worker/services/transcription'

describe('transcription', () => {
  function setup() {
    const env = {
      AI: { run: vi.fn() },
      ADMIN_DECRYPTION_PUBKEY: 'a'.repeat(64),
      ADMIN_PUBKEY: 'a'.repeat(64),
    } as any

    const services = {
      settings: {
        getTranscriptionSettings: vi.fn().mockResolvedValue({ globalEnabled: true }),
      },
      identity: {
        getUser: vi.fn().mockResolvedValue({ transcriptionEnabled: true }),
      },
      records: {
        createNote: vi.fn().mockResolvedValue({}),
      },
      calls: {
        updateMetadata: vi.fn().mockResolvedValue({}),
      },
    } as any

    mockGetTelephonyFromService.mockReset()

    return { env, services }
  }

  describe('maybeTranscribe', () => {
    it('transcribes and creates note when enabled', async () => {
      const { env, services } = setup()
      env.AI.run.mockResolvedValue({ text: 'Hello world' })
      mockGetTelephonyFromService.mockResolvedValue({
        getRecordingAudio: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      })

      await maybeTranscribe('call-1', 'rec-1', 'b'.repeat(64), env, services)
      expect(services.records.createNote).toHaveBeenCalled()
    })

    it('returns early when transcription disabled globally', async () => {
      const { env, services } = setup()
      services.settings.getTranscriptionSettings.mockResolvedValue({ globalEnabled: false })

      await maybeTranscribe('call-1', 'rec-1', 'b'.repeat(64), env, services)
      expect(env.AI.run).not.toHaveBeenCalled()
    })

    it('returns early when user disabled transcription', async () => {
      const { env, services } = setup()
      services.identity.getUser.mockResolvedValue({ transcriptionEnabled: false })

      await maybeTranscribe('call-1', 'rec-1', 'b'.repeat(64), env, services)
      expect(env.AI.run).not.toHaveBeenCalled()
    })

    it('returns early when no adapter', async () => {
      const { env, services } = setup()
      mockGetTelephonyFromService.mockResolvedValue(null)

      await maybeTranscribe('call-1', 'rec-1', 'b'.repeat(64), env, services)
      expect(env.AI.run).not.toHaveBeenCalled()
    })

    it('returns early when no audio', async () => {
      const { env, services } = setup()
      mockGetTelephonyFromService.mockResolvedValue({
        getRecordingAudio: vi.fn().mockResolvedValue(null),
      })

      await maybeTranscribe('call-1', 'rec-1', 'b'.repeat(64), env, services)
      expect(env.AI.run).not.toHaveBeenCalled()
    })
  })

  describe('transcribeVoicemail', () => {
    it('transcribes voicemail for admin only', async () => {
      const { env, services } = setup()
      env.AI.run.mockResolvedValue({ text: 'Voicemail message' })
      mockGetTelephonyFromService.mockResolvedValue({
        getCallRecording: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      })

      await transcribeVoicemail('call-1', env, services)
      expect(services.records.createNote).toHaveBeenCalled()
    })

    it('returns early when transcription disabled globally', async () => {
      const { env, services } = setup()
      services.settings.getTranscriptionSettings.mockResolvedValue({ globalEnabled: false })

      await transcribeVoicemail('call-1', env, services)
      expect(env.AI.run).not.toHaveBeenCalled()
    })
  })
})
