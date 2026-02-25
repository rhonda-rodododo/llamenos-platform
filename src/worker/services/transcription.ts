import type { Env } from '../types'
import type { DurableObjects } from '../lib/do-access'
import { getTelephony } from '../lib/do-access'
import { encryptForPublicKey } from '../lib/crypto'

export async function maybeTranscribe(
  parentCallSid: string,
  recordingSid: string,
  volunteerPubkey: string,
  env: Env,
  dos: DurableObjects,
) {
  // Check if transcription is globally enabled
  const transRes = await dos.settings.fetch(new Request('http://do/settings/transcription'))
  const { globalEnabled } = await transRes.json() as { globalEnabled: boolean }
  if (!globalEnabled) return

  // Check if volunteer has transcription enabled
  const volRes = await dos.identity.fetch(new Request(`http://do/volunteer/${volunteerPubkey}`))
  if (!volRes.ok) return
  const volunteer = await volRes.json() as { transcriptionEnabled: boolean }
  if (!volunteer.transcriptionEnabled) return

  // Get recording audio directly by recording SID
  const adapter = await getTelephony(env, dos)
  if (!adapter) return
  const audio = await adapter.getRecordingAudio(recordingSid)
  if (!audio) return

  try {
    // Transcribe using platform transcription service (CF Workers AI or self-hosted Whisper)
    const result = await env.AI.run('@cf/openai/whisper', {
      audio: [...new Uint8Array(audio)],
    })

    if (result.text) {
      // ECIES: encrypt transcription for the volunteer's public key
      const { encryptedContent, ephemeralPubkey } = encryptForPublicKey(result.text, volunteerPubkey)
      await dos.records.fetch(new Request('http://do/notes', {
        method: 'POST',
        body: JSON.stringify({
          callId: parentCallSid,
          authorPubkey: 'system:transcription',
          encryptedContent,
          ephemeralPubkey,
        }),
      }))

      // Also encrypt for admin so they can read transcriptions independently
      const adminEncrypted = encryptForPublicKey(result.text, env.ADMIN_DECRYPTION_PUBKEY || env.ADMIN_PUBKEY)
      await dos.records.fetch(new Request('http://do/notes', {
        method: 'POST',
        body: JSON.stringify({
          callId: parentCallSid,
          authorPubkey: 'system:transcription:admin',
          encryptedContent: adminEncrypted.encryptedContent,
          ephemeralPubkey: adminEncrypted.ephemeralPubkey,
        }),
      }))

      // Mark call record as having a transcription and persist the recording SID
      await dos.calls.fetch(new Request(`http://do/calls/${parentCallSid}/metadata`, {
        method: 'PATCH',
        body: JSON.stringify({ hasTranscription: true, recordingSid, hasRecording: true }),
      }))
    }
  } catch (err) {
    console.error('[transcription] maybeTranscribe failed:', err)
  }
}

export async function transcribeVoicemail(
  callSid: string,
  env: Env,
  dos: DurableObjects,
) {
  // Check if transcription is globally enabled
  const transRes = await dos.settings.fetch(new Request('http://do/settings/transcription'))
  const { globalEnabled } = await transRes.json() as { globalEnabled: boolean }
  if (!globalEnabled) return

  // Get voicemail recording from telephony provider
  const adapter = await getTelephony(env, dos)
  if (!adapter) return
  const audio = await adapter.getCallRecording(callSid)
  if (!audio) return

  try {
    const result = await env.AI.run('@cf/openai/whisper', {
      audio: [...new Uint8Array(audio)],
    })

    if (result.text) {
      // Voicemails are encrypted only for admin (no volunteer answered)
      const adminEncrypted = encryptForPublicKey(result.text, env.ADMIN_DECRYPTION_PUBKEY || env.ADMIN_PUBKEY)
      await dos.records.fetch(new Request('http://do/notes', {
        method: 'POST',
        body: JSON.stringify({
          callId: callSid,
          authorPubkey: 'system:voicemail',
          encryptedContent: adminEncrypted.encryptedContent,
          ephemeralPubkey: adminEncrypted.ephemeralPubkey,
        }),
      }))

      // Mark call record as having a transcription
      await dos.calls.fetch(new Request(`http://do/calls/${callSid}/metadata`, {
        method: 'PATCH',
        body: JSON.stringify({ hasTranscription: true }),
      }))
    }
  } catch (err) {
    console.error('[transcription] transcribeVoicemail failed:', err)
  }
}
